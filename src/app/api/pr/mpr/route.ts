/**
 * POST /api/pr/mpr
 *
 * Accepts multipart/form-data:
 *   - data: JSON string of PR fields + lines
 *   - quotation: File (mandatory)
 *   - proforma: File (mandatory)
 *   - supporting: File (optional)
 *
 * Steps:
 *   1. Upload files to Google Drive → ROOT/PR/<PR_ID>/
 *   2. Write MPR header + lines to Google Sheets
 *   3. Return pr_id + drive links
 *
 * GET /api/pr/mpr — list MPRs
 */

import { NextRequest, NextResponse } from "next/server";
import { readSheet, appendRowByFields, getNextSeq, generateId, writeAuditLog } from "@/lib/sheets";
import { uploadFileToDrive } from "@/lib/drive";

export async function GET() {
  const rows = await readSheet("MPR");
  return NextResponse.json({ mprs: rows });
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
      category,
      purpose,
      procurement_type = "Standard",
      delivery_location,
      expected_delivery_date,
      preferred_vendor_id = "",
      preferred_vendor_name = "",
      payment_terms = "Standard",
      advance_percent = 0,
      credit_period_days = 30,
      retention_amount = 0,
      lines = [],
      draft = false,
      ai_extracted = false,
    } = body;

    if (!requestor_user_id) {
      return NextResponse.json(
        { error: "requestor_user_id is required" },
        { status: 400 }
      );
    }

    if (!draft && (!category || !lines.length)) {
      return NextResponse.json(
        { error: "requestor_user_id, category, and at least one line are required" },
        { status: 400 }
      );
    }

    const quotationFile  = formData.get("quotation")  as File | null;
    const proformaFile   = formData.get("proforma")   as File | null;
    const supportingFile = formData.get("supporting") as File | null;

    if (!draft && (!quotationFile || !proformaFile)) {
      return NextResponse.json(
        { error: "Vendor Quotation and Proforma Invoice are mandatory (SOP §5.1)" },
        { status: 400 }
      );
    }

    // Generate PR ID first — needed for Drive folder name
    const seq = await getNextSeq("MPR");
    const prId = generateId("PR", seq);
    const now = new Date().toISOString();

    // ── Upload files to Drive: ROOT/PR/<PR_ID>/ ──────────────────────────────
    let quotationUrl = "";
    let proformaUrl = "";
    let supportingUrl = "";

    if (quotationFile) {
      const up = await uploadFileToDrive(quotationFile, "PR", prId, "quotation.pdf");
      quotationUrl = up.web_view_link;
    }
    if (proformaFile) {
      const up = await uploadFileToDrive(proformaFile, "PR", prId, "proforma_invoice.pdf");
      proformaUrl = up.web_view_link;
    }
    if (supportingFile) {
      const sup = await uploadFileToDrive(supportingFile, "PR", prId, "supporting_doc.pdf");
      supportingUrl = sup.web_view_link;
    }

    // ── Calculate totals ─────────────────────────────────────────────────────
    const totalBeforeGst = lines.reduce(
      (s: number, l: any) => s + parseFloat(l.qty) * parseFloat(l.rate),
      0
    );
    const totalGst = lines.reduce(
      (s: number, l: any) =>
        s + (parseFloat(l.qty) * parseFloat(l.rate) * parseFloat(l.gst_percent)) / 100,
      0
    );
    const totalWithGst = totalBeforeGst + totalGst;

    // ── Write MPR header to Sheets ────────────────────────────────────────────
    await appendRowByFields("MPR", {
      PR_ID:                    prId,
      PR_DATE:                  now.slice(0, 10),
      PR_VERSION:               "1",
      REQUESTOR_USER_ID:        requestor_user_id,
      REQUESTOR_NAME:           requestor_name,
      REQUESTOR_SITE:           requestor_site,
      CATEGORY:                 category,
      PURPOSE:                  purpose,
      PROCUREMENT_TYPE:         procurement_type,
      DELIVERY_LOCATION:        delivery_location,
      EXPECTED_DELIVERY_DATE:   expected_delivery_date,
      PREFERRED_VENDOR_ID:      preferred_vendor_id,
      PREFERRED_VENDOR_NAME:    preferred_vendor_name,
      PAYMENT_TERMS:            payment_terms,
      ADVANCE_PERCENT:          advance_percent,
      CREDIT_PERIOD_DAYS:       credit_period_days,
      RETENTION_AMOUNT:         retention_amount,
      PAYMENT_LINKED_TO_MILESTONE: "",
      LATE_DELIVERY_LD_PCT:     "",
      LATE_DELIVERY_LD_MAX_PCT: "",
      QUALITY_STANDARD:         "",
      WARRANTY_MONTHS:          "12",
      TEST_CERT_REQUIRED:       "N",
      SPECIAL_COMMERCIAL_TERMS: "",
      QUOTATION_URL:            quotationUrl,
      PROFORMA_INVOICE_URL:     proformaUrl,
      SUPPORTING_DOC_URL:       supportingUrl,
      AI_EXTRACTED:             ai_extracted ? "Y" : "N",
      TOTAL_AMOUNT_BEFORE_GST:  totalBeforeGst,
      TOTAL_GST_AMOUNT:         totalGst,
      TOTAL_AMOUNT_WITH_GST:    totalWithGst,
      PRICE_DEVIATION_FLAG:     "N",
      STATUS:                   draft ? "DRAFT" : "SUBMITTED",
      ASSIGNED_APPROVER_ID:     "",
      ASSIGNED_APPROVER_NAME:   "",
      APPROVER_ACTION_DATE:     "",
      APPROVER_REMARKS:         "",
      SUBMITTED_DATE:           now,
      LAST_UPDATED_BY:          requestor_user_id,
      LAST_UPDATED_DATE:        now,
    });

    // ── Write line items ──────────────────────────────────────────────────────
    // Columns: LINE_ID | PR_ID | LINE_NUMBER | ITEM_NAME | ITEM_DESCRIPTION |
    //   UNIT_OF_MEASURE | QUANTITY | RATE | GST_PERCENT | HSN_CODE |
    //   LINE_AMOUNT_BEFORE_GST | GST_AMOUNT | LINE_TOTAL | ITEM_PURPOSE |
    //   LAST_PURCHASE_PRICE | PRICE_DEVIATION_PCT | PRICE_DEVIATION_FLAG | REMARKS
    for (const [i, line] of lines.entries()) {
      const lineSeq      = await getNextSeq("MPR_LINES");
      const qty          = parseFloat(line.qty)  || 0;
      const rate         = parseFloat(line.rate) || 0;
      const gstPct       = parseFloat(line.gst_percent) || 0;
      const lineBeforeGst = qty * rate;
      const gstAmount    = (lineBeforeGst * gstPct) / 100;
      const lineTotal    = lineBeforeGst + gstAmount;
      const lastPrice    = parseFloat(line.last_purchase_price) || 0;
      const deviationPct = lastPrice > 0
        ? (((rate - lastPrice) / lastPrice) * 100).toFixed(2)
        : "0";
      const deviationFlag = lastPrice > 0 && rate > lastPrice * 1.15 ? "Y" : "N";

      await appendRowByFields("MPR_LINES", {
        LINE_ID:                generateId("MPRL", lineSeq),
        PR_ID:                  prId,
        LINE_NUMBER:            i + 1,
        ITEM_NAME:              line.item_description,
        ITEM_DESCRIPTION:       line.item_description,
        UNIT_OF_MEASURE:        line.uom,
        QUANTITY:               qty,
        RATE:                   rate,
        GST_PERCENT:            gstPct,
        HSN_CODE:               line.hsn_code ?? "",
        LINE_AMOUNT_BEFORE_GST: lineBeforeGst,
        GST_AMOUNT:             gstAmount,
        LINE_TOTAL:             lineTotal,
        ITEM_PURPOSE:           line.item_purpose ?? "",
        LAST_PURCHASE_PRICE:    lastPrice,
        PRICE_DEVIATION_PCT:    deviationPct,
        PRICE_DEVIATION_FLAG:   deviationFlag,
        REMARKS:                "",
      });
    }

    await writeAuditLog({ userId: requestor_user_id, module: "MPR", recordId: prId, action: draft ? "MPR_DRAFT" : "MPR_SUBMIT" });

    return NextResponse.json({
      success: true,
      pr_id: prId,
      drive_links: {
        quotation:  quotationUrl,
        proforma:   proformaUrl,
        supporting: supportingUrl,
      },
    }, { status: 201 });

  } catch (err) {
    console.error("[pr/mpr POST]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
