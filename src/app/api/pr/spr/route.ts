/**
 * POST /api/pr/spr
 *
 * Accepts multipart/form-data:
 *   - data: JSON string of SPR fields
 *   - quotation: File (mandatory)
 *   - scope_doc: File (optional)
 *
 * Steps:
 *   1. Upload quotation (+ optional scope doc) to Google Drive → ROOT/PR/<SPR_ID>/
 *   2. Write SPR row to Google Sheets
 *   3. Return spr_id + drive links
 *
 * GET /api/pr/spr — list SPRs
 */

import { NextRequest, NextResponse } from "next/server";
import { readSheet, appendRowByFields, getNextSeq, generateId, writeAuditLog } from "@/lib/sheets";
import { uploadFileToDrive } from "@/lib/drive";

// BUG-SPR-003: XSS sanitization helper (mirrors mpr/route.ts)
function sanitize(input: unknown): string {
  return String(input ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

export async function GET() {
  const rows = await readSheet("SPR");
  return NextResponse.json({ sprs: rows });
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    const dataRaw = formData.get("data") as string;
    if (!dataRaw) {
      return NextResponse.json({ error: "Missing 'data' field" }, { status: 400 });
    }
    const body = JSON.parse(dataRaw);

    const {
      requestor_user_id,
      service_category,
      service_subcategory = "",
      service_description,
      service_purpose = "",
      vendor_id = "",
      vendor_name = "",
      payment_terms = "Standard",
      contract_start_date = "",
      contract_end_date = "",
      amc_value = 0,
      amc_scope = "",
      project_code = "",
      milestone_tags = "",
      payment_linked_to_milestones = "N",
      consultant_name = "",
      engagement_type = "",
      sac_code = "",
      tds_applicable = "N",
      tds_section = "",
      quantity = 1,
      rate,
      gst_percent = 18,
      draft = false,
      // BUG-SPR-005: financial/contractual fields previously ignored
      advance_percent,
      credit_period_days,
      retention_amount,
      payment_schedule_type,
      amc_billing_frequency,
    } = body;

    if (!requestor_user_id) {
      return NextResponse.json(
        { error: "requestor_user_id is required" },
        { status: 400 }
      );
    }

    if (!draft && (!service_category || !service_description || !rate)) {
      return NextResponse.json(
        { error: "requestor_user_id, service_category, service_description, and rate are required" },
        { status: 400 }
      );
    }

    // BUG-SPR-004: Validate requestor exists; auto-populate name/site from USERS
    const allUsers = await readSheet("USERS");
    const validUser = allUsers.find((u: any) => u.USER_ID === requestor_user_id);
    if (!validUser) {
      return NextResponse.json(
        { error: `requestor_user_id '${requestor_user_id}' not found in USERS` },
        { status: 400 }
      );
    }
    const safeRequestorName = sanitize(validUser.FULL_NAME ?? "");
    const safeRequestorSite = sanitize(validUser.SITE ?? "");

    // BUG-SPR-002: Numeric validation for rate and quantity
    const parsedRate = parseFloat(String(rate));
    const parsedQty  = parseFloat(String(quantity ?? "1"));

    if (!draft && (isNaN(parsedRate) || parsedRate <= 0)) {
      return NextResponse.json(
        { error: "rate must be a positive number" },
        { status: 400 }
      );
    }
    if (isNaN(parsedQty) || parsedQty <= 0) {
      return NextResponse.json(
        { error: "quantity must be a positive number" },
        { status: 400 }
      );
    }

    const quotationFile = formData.get("quotation") as File | null;
    if (!draft && !quotationFile) {
      return NextResponse.json(
        { error: "Vendor Quotation is mandatory (SOP §5.2)" },
        { status: 400 }
      );
    }

    const scopeDocFile = formData.get("scope_doc") as File | null;

    // BUG-SPR-003: Sanitize all free-text fields before storage
    const safeServiceDescription = sanitize(service_description ?? "");
    const safeServicePurpose      = sanitize(service_purpose ?? "");
    const safeAmcScope            = sanitize(amc_scope ?? "");
    const safeConsultantName      = sanitize(consultant_name ?? "");
    const safeMilestoneTags       = sanitize(milestone_tags ?? "");
    const safeProjectCode         = sanitize(project_code ?? "");
    const safeVendorName          = sanitize(vendor_name ?? "");

    // Generate SPR ID first — needed for Drive folder name
    let seq = await getNextSeq("SPR");
    let sprId = generateId("SPR", seq);
    const existingSPR = await readSheet("SPR");
    if (existingSPR.some((r: any) => r.SPR_ID === sprId)) {
      sprId = generateId("SPR", await getNextSeq("SPR"));
    }
    const now = new Date().toISOString();

    // ── Upload files to Drive: ROOT/PR/<SPR_ID>/ ─────────────────────────────
    let quotationUrl = "";
    let scopeDocUrl = "";

    if (quotationFile) {
      const up = await uploadFileToDrive(quotationFile, "PR", sprId, "quotation.pdf");
      quotationUrl = up.web_view_link;
    }
    if (scopeDocFile) {
      const scopeUp = await uploadFileToDrive(scopeDocFile, "PR", sprId, "scope_of_work.pdf");
      scopeDocUrl = scopeUp.web_view_link;
    }

    // ── Calculate totals (BUG-SPR-002: use validated parsedRate/parsedQty) ───
    const gst            = parseFloat(String(gst_percent));
    const totalBeforeGst = parsedQty * parsedRate;
    const totalGst       = (totalBeforeGst * gst) / 100;
    const totalWithGst   = totalBeforeGst + totalGst;

    // ── Write SPR row to Sheets ───────────────────────────────────────────────
    await appendRowByFields("SPR", {
      SPR_ID:                       sprId,
      SPR_DATE:                     now.slice(0, 10),
      SPR_VERSION:                  "1",                         // BUG-SPR-001: was PR_VERSION (wrong key)
      REQUESTOR_USER_ID:            requestor_user_id,
      REQUESTOR_NAME:               safeRequestorName,           // BUG-SPR-004
      REQUESTOR_SITE:               safeRequestorSite,           // BUG-SPR-004
      SERVICE_CATEGORY:             service_category,
      SERVICE_SUBCATEGORY:          service_subcategory,
      SERVICE_DESCRIPTION:          safeServiceDescription,      // BUG-SPR-003
      SERVICE_PURPOSE:              safeServicePurpose,          // BUG-SPR-003
      VENDOR_ID:                    vendor_id,
      VENDOR_NAME:                  safeVendorName,              // BUG-SPR-003
      PAYMENT_TERMS:                payment_terms,
      ADVANCE_PERCENT:              advance_percent              ?? "",  // BUG-SPR-005
      CREDIT_PERIOD_DAYS:           credit_period_days           ?? "",  // BUG-SPR-005
      RETENTION_AMOUNT:             retention_amount             ?? "",  // BUG-SPR-005
      PAYMENT_SCHEDULE_TYPE:        payment_schedule_type        ?? "",  // BUG-SPR-005
      AMC_BILLING_FREQUENCY:        amc_billing_frequency        ?? "",  // BUG-SPR-005
      CONTRACT_START_DATE:          contract_start_date,
      CONTRACT_END_DATE:            contract_end_date,
      AMC_VALUE:                    amc_value,
      AMC_SCOPE:                    safeAmcScope,                // BUG-SPR-003
      RENEWAL_ALERT_SENT:           "N",
      PROJECT_CODE:                 safeProjectCode,             // BUG-SPR-003
      MILESTONE_TAGS:               safeMilestoneTags,           // BUG-SPR-003
      PAYMENT_LINKED_TO_MILESTONES: payment_linked_to_milestones,
      CONSULTANT_NAME:              safeConsultantName,          // BUG-SPR-003
      ENGAGEMENT_TYPE:              engagement_type,
      SAC_CODE:                     sac_code,
      TDS_APPLICABLE:               tds_applicable,
      TDS_SECTION:                  tds_section,
      QUANTITY:                     parsedQty,                   // BUG-SPR-002
      RATE:                         parsedRate,                  // BUG-SPR-002
      GST_PERCENT:                  gst_percent,
      TOTAL_AMOUNT_BEFORE_GST:      totalBeforeGst,
      TOTAL_GST_AMOUNT:             totalGst,
      TOTAL_AMOUNT_WITH_GST:        totalWithGst,
      QUOTATION_URL:                quotationUrl,
      PROFORMA_INVOICE_URL:         "",
      SCOPE_DOC_URL:                scopeDocUrl,
      STATUS:                       draft ? "DRAFT" : "SUBMITTED",
      ASSIGNED_APPROVER_ID:         "",
      ASSIGNED_APPROVER_NAME:       "",
      APPROVER_ACTION_DATE:         "",
      APPROVER_REMARKS:             "",
      SUBMITTED_DATE:               now,
      LAST_UPDATED_BY:              requestor_user_id,
      LAST_UPDATED_DATE:            now,
    });

    await writeAuditLog({ userId: requestor_user_id, module: "SPR", recordId: sprId, action: draft ? "SPR_DRAFT" : "SPR_SUBMIT" });

    return NextResponse.json({
      success: true,
      spr_id: sprId,
      drive_links: {
        quotation: quotationUrl,
        scope_doc: scopeDocUrl,
      },
    }, { status: 201 });

  } catch (err) {
    console.error("[pr/spr POST]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
