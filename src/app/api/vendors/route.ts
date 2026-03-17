/**
 * POST /api/vendors
 *
 * Accepts multipart/form-data:
 *   data              — JSON string of all vendor fields
 *   pan_copy          — File (mandatory)
 *   msme_cert         — File (optional — required when IS_MSME=Y)
 *   cancelled_cheque  — File (mandatory — for primary sub-profile)
 *   gst_cert          — File (mandatory — for primary sub-profile)
 *
 * Flow:
 *   1. Generate VEN_ID
 *   2. Upload KYC docs to Drive: ROOT/VENDORS/<VEN_ID>/
 *   3. Write VENDORS row (core fields only — no bank/GST)
 *   4. Write VENDOR_SUB_PROFILES row (primary sub-profile with bank + GST)
 *   5. Write audit log
 *
 * GET /api/vendors — list all vendors (optional ?status= filter)
 */

import { NextRequest, NextResponse } from "next/server";
import { readSheet, appendRowByFields, getNextSeq, generateId, writeAuditLog } from "@/lib/sheets";
import { uploadFileToDrive } from "@/lib/drive";

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status");
  const rows   = await readSheet("VENDORS");
  const result = status ? rows.filter((r) => r.STATUS === status) : rows;
  return NextResponse.json({ vendors: result });
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    const dataRaw = formData.get("data") as string;
    if (!dataRaw) return NextResponse.json({ error: "Missing 'data' field" }, { status: 400 });
    const body = JSON.parse(dataRaw);

    const {
      company_name,
      trade_name = "",
      vendor_type,
      entity_type = "",
      contact_person,
      email,
      phone,
      address,
      city,
      state,
      pin_code = "",
      pan,
      is_msme = "N",
      udyam_reg_number = "",
      tds_category = "Not Applicable",
      // Sub-profile fields
      sub_profile_label = "Primary",
      gstin,
      billing_address = "",
      billing_state = "",
      bank_name,
      account_number,
      ifsc_code,
      account_type = "Current",
      // Other
      years_in_business = "",
      key_client_1 = "",
      key_client_2 = "",
      work_experience_notes = "",
      capacity_scale = "",
      registered_by,
    } = body;

    // Mandatory field check
    if (!company_name || !vendor_type || !pan || !gstin || !bank_name || !account_number || !ifsc_code) {
      return NextResponse.json(
        { error: "company_name, vendor_type, pan, gstin, bank_name, account_number, ifsc_code are required" },
        { status: 400 }
      );
    }

    // KYC docs
    const panCopy        = formData.get("pan_copy")         as File | null;
    const msmeCert       = formData.get("msme_cert")        as File | null;
    const cancelledCheque = formData.get("cancelled_cheque") as File | null;
    const gstCert        = formData.get("gst_cert")         as File | null;

    if (!panCopy)          return NextResponse.json({ error: "PAN Card copy is mandatory" }, { status: 400 });
    if (!cancelledCheque)  return NextResponse.json({ error: "Cancelled Cheque is mandatory" }, { status: 400 });
    if (!gstCert)          return NextResponse.json({ error: "GST Registration Certificate is mandatory" }, { status: 400 });
    if (is_msme === "Y" && !msmeCert)
      return NextResponse.json({ error: "MSME Certificate is required for MSME vendors" }, { status: 400 });

    // Duplicate PAN + Company Name check
    const existingVendors = await readSheet("VENDORS");
    const dup = existingVendors.find(
      (r) =>
        r.PAN?.toUpperCase() === pan.toUpperCase() &&
        r.COMPANY_NAME?.toLowerCase().trim() === company_name.toLowerCase().trim()
    );
    if (dup) {
      return NextResponse.json(
        {
          error: `A vendor with the same PAN (${pan.toUpperCase()}) and company name is already registered.`,
          duplicate: {
            vendor_id: dup.VENDOR_ID,
            company_name: dup.COMPANY_NAME,
            status: dup.STATUS,
          },
        },
        { status: 409 }
      );
    }

    // Generate IDs
    const seq    = await getNextSeq("VENDORS");
    const venId  = generateId("VEN", seq);
    const subSeq = await getNextSeq("VENDOR_SUB_PROFILES");
    const subId  = generateId("SUB", subSeq);
    const now    = new Date().toISOString();

    // Upload vendor-level KYC docs to Drive: ROOT/VENDORS/<VEN_ID>/
    const [panUpload, chequeUpload, gstUpload] = await Promise.all([
      uploadFileToDrive(panCopy,         "VENDORS", venId, "pan_card.pdf"),
      uploadFileToDrive(cancelledCheque, "VENDORS", venId, `${subId}_cancelled_cheque.pdf`),
      uploadFileToDrive(gstCert,         "VENDORS", venId, `${subId}_gst_certificate.pdf`),
    ]);

    let msmeCertUrl = "";
    if (msmeCert) {
      const msmeUpload = await uploadFileToDrive(msmeCert, "VENDORS", venId, "msme_certificate.pdf");
      msmeCertUrl = msmeUpload.web_view_link;
    }

    // Write VENDORS row (core fields — bank/GST details live in VENDOR_SUB_PROFILES)
    await appendRowByFields("VENDORS", {
      VENDOR_ID:             venId,
      COMPANY_NAME:          company_name,
      VENDOR_TYPE:           vendor_type,
      CONTACT_PERSON:        contact_person,
      EMAIL:                 email,
      PHONE:                 phone,
      ADDRESS:               `${address}, ${city}, ${state} - ${pin_code}`.trim(),
      CITY:                  city,
      STATE:                 state,
      PAN:                   pan.toUpperCase(),
      IS_MSME:               is_msme,
      UDYAM_REG_NUMBER:      udyam_reg_number,
      TDS_CATEGORY:          tds_category,
      KYC_PAN_COPY_URL:      panUpload.web_view_link,
      KYC_MSME_CERT_URL:     msmeCertUrl,
      YEARS_IN_BUSINESS:     years_in_business,
      KEY_CLIENT_1:          key_client_1,
      KEY_CLIENT_2:          key_client_2,
      WORK_EXPERIENCE_NOTES: work_experience_notes,
      CAPACITY_SCALE:        capacity_scale,
      REFERENCE_VERIFIED:    "N",
      STATUS:                "PENDING_KYC",
      DEACTIVATION_REASON:   "",
      REGISTERED_BY:         registered_by ?? "SYSTEM",
      REGISTERED_DATE:       now,
      APPROVED_BY:           "",
      APPROVED_DATE:         "",
      LAST_UPDATED_BY:       registered_by ?? "SYSTEM",
      LAST_UPDATED_DATE:     now,
      REMARKS:               `Entity: ${entity_type}; Trade name: ${trade_name}`,
    });

    // Write primary VENDOR_SUB_PROFILES row
    await appendRowByFields("VENDOR_SUB_PROFILES", {
      SUB_PROFILE_ID:          subId,
      VENDOR_ID:               venId,
      SUB_PROFILE_LABEL:       sub_profile_label,
      GSTIN:                   gstin.toUpperCase(),
      BILLING_ADDRESS:         billing_address || `${address}, ${city}, ${state} - ${pin_code}`.trim(),
      BILLING_STATE:           billing_state || state,
      BANK_NAME:               bank_name,
      ACCOUNT_NUMBER:          account_number,
      IFSC_CODE:               ifsc_code.toUpperCase(),
      ACCOUNT_TYPE:            account_type,
      KYC_GST_CERT_URL:        gstUpload.web_view_link,
      KYC_CANCELLED_CHEQUE_URL: chequeUpload.web_view_link,
      IS_PRIMARY:              "Y",
      STATUS:                  "PENDING_KYC",
      DEACTIVATION_REASON:     "",
      CREATED_BY:              registered_by ?? "SYSTEM",
      CREATED_DATE:            now,
      VERIFIED_BY:             "",
      VERIFIED_DATE:           "",
      LAST_UPDATED_BY:         registered_by ?? "SYSTEM",
      LAST_UPDATED_DATE:       now,
      REMARKS:                 "",
    });

    await writeAuditLog({ userId: registered_by ?? "SYSTEM", module: "VENDORS", recordId: venId, action: "VENDOR_REGISTER" });

    return NextResponse.json({
      success:    true,
      ven_id:     venId,
      sub_id:     subId,
      status:     "PENDING_KYC",
      drive_links: {
        pan_copy:         panUpload.web_view_link,
        msme_cert:        msmeCertUrl,
        gst_cert:         gstUpload.web_view_link,
        cancelled_cheque: chequeUpload.web_view_link,
      },
    }, { status: 201 });

  } catch (err) {
    console.error("[vendors POST]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
