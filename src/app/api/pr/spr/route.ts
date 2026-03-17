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
      requestor_name,
      requestor_site,
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

    const quotationFile = formData.get("quotation") as File | null;
    if (!draft && !quotationFile) {
      return NextResponse.json(
        { error: "Vendor Quotation is mandatory (SOP §5.2)" },
        { status: 400 }
      );
    }

    const scopeDocFile = formData.get("scope_doc") as File | null;

    // Generate SPR ID first — needed for Drive folder name
    const seq = await getNextSeq("SPR");
    const sprId = generateId("SPR", seq);
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

    // ── Calculate totals ──────────────────────────────────────────────────────
    const qty = parseFloat(String(quantity));
    const rt = parseFloat(String(rate));
    const gst = parseFloat(String(gst_percent));
    const totalBeforeGst = qty * rt;
    const totalGst = (totalBeforeGst * gst) / 100;
    const totalWithGst = totalBeforeGst + totalGst;

    // ── Write SPR row to Sheets ───────────────────────────────────────────────
    await appendRowByFields("SPR", {
      SPR_ID:                       sprId,
      SPR_DATE:                     now.slice(0, 10),
      PR_VERSION:                   "1",
      REQUESTOR_USER_ID:            requestor_user_id,
      REQUESTOR_NAME:               requestor_name,
      REQUESTOR_SITE:               requestor_site,
      SERVICE_CATEGORY:             service_category,
      SERVICE_SUBCATEGORY:          service_subcategory,
      SERVICE_DESCRIPTION:          service_description,
      SERVICE_PURPOSE:              service_purpose,
      VENDOR_ID:                    vendor_id,
      VENDOR_NAME:                  vendor_name,
      PAYMENT_TERMS:                payment_terms,
      CONTRACT_START_DATE:          contract_start_date,
      CONTRACT_END_DATE:            contract_end_date,
      AMC_VALUE:                    amc_value,
      AMC_SCOPE:                    amc_scope,
      RENEWAL_ALERT_SENT:           "N",
      PROJECT_CODE:                 project_code,
      MILESTONE_TAGS:               milestone_tags,
      PAYMENT_LINKED_TO_MILESTONES: payment_linked_to_milestones,
      CONSULTANT_NAME:              consultant_name,
      ENGAGEMENT_TYPE:              engagement_type,
      SAC_CODE:                     sac_code,
      TDS_APPLICABLE:               tds_applicable,
      TDS_SECTION:                  tds_section,
      QUANTITY:                     quantity,
      RATE:                         rate,
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
