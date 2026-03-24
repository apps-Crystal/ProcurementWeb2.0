/**
 * GET  /api/vendors/[id]/sub-profiles — list all sub-profiles for a vendor
 * POST /api/vendors/[id]/sub-profiles — add a new sub-profile (bank account / GST registration)
 *
 * POST accepts multipart/form-data:
 *   data             — JSON: { sub_profile_label, gstin, billing_address, billing_state,
 *                               bank_name, account_number, ifsc_code, account_type }
 *
 * Caller identity is read from JWT middleware headers (x-user-id, x-user-role).
 *   gst_cert         — File (mandatory)
 *   cancelled_cheque — File (mandatory)
 */

import { NextRequest, NextResponse } from "next/server";
import { readSheet, appendRowByFields, getNextSeq, generateId, writeAuditLog } from "@/lib/sheets";
import { uploadFileToDrive } from "@/lib/drive";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const rows = await readSheet("VENDOR_SUB_PROFILES");
    return NextResponse.json({ subProfiles: rows.filter((r) => r.VENDOR_ID === id) });
  } catch (err) {
    console.error("[GET /api/vendors/[id]/sub-profiles]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: vendorId } = await params;

    // BUG-VND-005: Read caller identity from JWT headers, not form body
    const callerId   = req.headers.get("x-user-id")   ?? "SYSTEM";
    const callerRole = req.headers.get("x-user-role")  ?? "";

    // BUG-VND-006: Role enforcement — only Procurement_Team or System_Admin may add sub-profiles
    const SUB_PROFILE_ALLOWED_ROLES = ["Procurement_Team", "System_Admin"];
    if (!SUB_PROFILE_ALLOWED_ROLES.includes(callerRole)) {
      return NextResponse.json(
        { error: "Forbidden: only Procurement_Team or System_Admin may add vendor sub-profiles (SOP §11.3)." },
        { status: 403 }
      );
    }

    // Verify vendor exists
    const vendors = await readSheet("VENDORS");
    const vendor  = vendors.find((r) => r.VENDOR_ID === vendorId);
    if (!vendor) {
      return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
    }

    const formData = await req.formData();
    const dataRaw  = formData.get("data") as string;
    if (!dataRaw) return NextResponse.json({ error: "Missing 'data' field" }, { status: 400 });

    const {
      sub_profile_label = "",
      gstin,
      billing_address = "",
      billing_state   = "",
      bank_name,
      account_number,
      ifsc_code,
      account_type = "Current",
    } = JSON.parse(dataRaw);

    if (!sub_profile_label.trim()) return NextResponse.json({ error: "Sub-Profile Label is required" }, { status: 400 });
    if (!gstin?.trim())            return NextResponse.json({ error: "GSTIN is required" }, { status: 400 });
    if (!bank_name?.trim())        return NextResponse.json({ error: "Bank Name is required" }, { status: 400 });
    if (!account_number?.trim())   return NextResponse.json({ error: "Account Number is required" }, { status: 400 });
    if (!ifsc_code?.trim())        return NextResponse.json({ error: "IFSC Code is required" }, { status: 400 });

    const gstCert         = formData.get("gst_cert")         as File | null;
    const cancelledCheque = formData.get("cancelled_cheque") as File | null;
    if (!gstCert)         return NextResponse.json({ error: "GST Certificate is mandatory" }, { status: 400 });
    if (!cancelledCheque) return NextResponse.json({ error: "Cancelled Cheque is mandatory" }, { status: 400 });

    const subSeq = await getNextSeq("VENDOR_SUB_PROFILES");
    const subId  = generateId("SUB", subSeq);
    const now    = new Date().toISOString();

    // Upload docs to vendor's Drive folder: ROOT/VENDORS/<VEN_ID>/
    const [gstUpload, chequeUpload] = await Promise.all([
      uploadFileToDrive(gstCert,         "VENDORS", vendorId, `${subId}_gst_certificate.pdf`),
      uploadFileToDrive(cancelledCheque, "VENDORS", vendorId, `${subId}_cancelled_cheque.pdf`),
    ]);

    await appendRowByFields("VENDOR_SUB_PROFILES", {
      SUB_PROFILE_ID:          subId,
      VENDOR_ID:               vendorId,
      SUB_PROFILE_LABEL:       sub_profile_label,
      GSTIN:                   gstin.toUpperCase(),
      BILLING_ADDRESS:         billing_address,
      BILLING_STATE:           billing_state,
      BANK_NAME:               bank_name,
      ACCOUNT_NUMBER:          account_number,
      IFSC_CODE:               ifsc_code.toUpperCase(),
      ACCOUNT_TYPE:            account_type,
      KYC_GST_CERT_URL:        gstUpload.web_view_link,
      KYC_CANCELLED_CHEQUE_URL: chequeUpload.web_view_link,
      IS_PRIMARY:              "N",
      STATUS:                  "ACTIVE",
      DEACTIVATION_REASON:     "",
      CREATED_BY:              callerId,
      CREATED_DATE:            now,
      VERIFIED_BY:             "",
      VERIFIED_DATE:           "",
      LAST_UPDATED_BY:         callerId,
      LAST_UPDATED_DATE:       now,
      REMARKS:                 "",
    });

    await writeAuditLog({
      userId:   callerId,
      module:   "VENDORS",
      recordId: vendorId,
      action:   "SUB_PROFILE_ADDED",
      newValue: subId,
    });

    return NextResponse.json({ success: true, sub_id: subId }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/vendors/[id]/sub-profiles]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
