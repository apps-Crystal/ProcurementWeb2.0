/**
 * POST /api/vendors
 *
 * Accepts multipart/form-data:
 *   data              — JSON string of all vendor fields
 *   cancelled_cheque  — File (mandatory)
 *   gst_cert          — File (mandatory)
 *   pan_copy          — File (mandatory)
 *   msme_cert         — File (optional — required when IS_MSME=Y)
 *
 * Flow:
 *   1. Generate VEN_ID
 *   2. Upload KYC docs to Drive: ROOT/VENDORS/<VEN_ID>/
 *   3. Write VENDORS row to Sheets with Drive links
 *   4. Write audit log
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
      gstin,
      pan,
      is_msme = "N",
      udyam_reg_number = "",
      tds_category = "Not Applicable",
      bank_name,
      account_number,
      ifsc_code,
      account_type = "Current",
      years_in_business = "",
      key_client_1 = "",
      key_client_2 = "",
      work_experience_notes = "",
      capacity_scale = "",
      registered_by,
    } = body;

    // Mandatory field check
    if (!company_name || !vendor_type || !gstin || !pan || !bank_name || !account_number || !ifsc_code) {
      return NextResponse.json(
        { error: "company_name, vendor_type, gstin, pan, bank_name, account_number, ifsc_code are required" },
        { status: 400 }
      );
    }

    // Mandatory KYC docs
    const cancelledCheque = formData.get("cancelled_cheque") as File | null;
    const gstCert         = formData.get("gst_cert")         as File | null;
    const panCopy         = formData.get("pan_copy")         as File | null;
    const msmeCert        = formData.get("msme_cert")        as File | null;

    if (!cancelledCheque) return NextResponse.json({ error: "Cancelled Cheque is mandatory" }, { status: 400 });
    if (!gstCert)         return NextResponse.json({ error: "GST Registration Certificate is mandatory" }, { status: 400 });
    if (!panCopy)         return NextResponse.json({ error: "PAN Card copy is mandatory" }, { status: 400 });
    if (is_msme === "Y" && !msmeCert)
      return NextResponse.json({ error: "MSME Certificate is required for MSME vendors" }, { status: 400 });

    // Generate vendor ID
    const seq   = await getNextSeq("VENDORS");
    const venId = generateId("VEN", seq);
    const now   = new Date().toISOString();

    // Upload KYC docs to Drive: ROOT/VENDORS/<VEN_ID>/
    const [chequeUpload, gstUpload, panUpload] = await Promise.all([
      uploadFileToDrive(cancelledCheque, "VENDORS", venId, "cancelled_cheque.pdf"),
      uploadFileToDrive(gstCert,         "VENDORS", venId, "gst_registration.pdf"),
      uploadFileToDrive(panCopy,         "VENDORS", venId, "pan_card.pdf"),
    ]);

    let msmeCertUrl = "";
    if (msmeCert) {
      const msmeUpload = await uploadFileToDrive(msmeCert, "VENDORS", venId, "msme_certificate.pdf");
      msmeCertUrl = msmeUpload.web_view_link;
    }

    // Write VENDORS row
    // Columns (per schema): VENDOR_ID | COMPANY_NAME | VENDOR_TYPE | CONTACT_PERSON | EMAIL | PHONE |
    // ADDRESS | CITY | STATE | GSTIN | PAN | IS_MSME | UDYAM_REG_NUMBER | TDS_CATEGORY |
    // BANK_NAME | ACCOUNT_NUMBER | IFSC_CODE | ACCOUNT_TYPE |
    // KYC_GST_CERT_URL | KYC_PAN_COPY_URL | KYC_CANCELLED_CHEQUE_URL | KYC_MSME_CERT_URL |
    // YEARS_IN_BUSINESS | KEY_CLIENT_1 | KEY_CLIENT_2 | WORK_EXPERIENCE_NOTES | CAPACITY_SCALE |
    // REFERENCE_VERIFIED | STATUS | DEACTIVATION_REASON | REGISTERED_BY | REGISTERED_DATE |
    // APPROVED_BY | APPROVED_DATE | LAST_UPDATED_BY | LAST_UPDATED_DATE | REMARKS
    await appendRowByFields("VENDORS", {
      VENDOR_ID:               venId,
      COMPANY_NAME:            company_name,
      VENDOR_TYPE:             vendor_type,
      CONTACT_PERSON:          contact_person,
      EMAIL:                   email,
      PHONE:                   phone,
      ADDRESS:                 `${address}, ${city}, ${state} - ${pin_code}`.trim(),
      CITY:                    city,
      STATE:                   state,
      GSTIN:                   gstin,
      PAN:                     pan,
      IS_MSME:                 is_msme,
      UDYAM_REG_NUMBER:        udyam_reg_number,
      TDS_CATEGORY:            tds_category,
      BANK_NAME:               bank_name,
      ACCOUNT_NUMBER:          account_number,
      IFSC_CODE:               ifsc_code,
      ACCOUNT_TYPE:            account_type,
      KYC_GST_CERT_URL:        gstUpload.web_view_link,
      KYC_PAN_COPY_URL:        panUpload.web_view_link,
      KYC_CANCELLED_CHEQUE_URL: chequeUpload.web_view_link,
      KYC_MSME_CERT_URL:       msmeCertUrl,
      YEARS_IN_BUSINESS:       years_in_business,
      KEY_CLIENT_1:            key_client_1,
      KEY_CLIENT_2:            key_client_2,
      WORK_EXPERIENCE_NOTES:   work_experience_notes,
      CAPACITY_SCALE:          capacity_scale,
      REFERENCE_VERIFIED:      "N",
      STATUS:                  "PENDING_KYC",
      DEACTIVATION_REASON:     "",
      REGISTERED_BY:           registered_by ?? "SYSTEM",
      REGISTERED_DATE:         now,
      APPROVED_BY:             "",
      APPROVED_DATE:           "",
      LAST_UPDATED_BY:         registered_by ?? "SYSTEM",
      LAST_UPDATED_DATE:       now,
      REMARKS:                 `Entity: ${entity_type}; Trade name: ${trade_name}`,
    });

    await writeAuditLog({ userId: registered_by ?? "SYSTEM", module: "VENDORS", recordId: venId, action: "VENDOR_REGISTER" });

    return NextResponse.json({
      success: true,
      ven_id: venId,
      status: "PENDING_KYC",
      drive_links: {
        cancelled_cheque: chequeUpload.web_view_link,
        gst_cert:         gstUpload.web_view_link,
        pan_copy:         panUpload.web_view_link,
        msme_cert:        msmeCertUrl,
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
