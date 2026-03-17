/**
 * PATCH /api/pr/[id]/update
 *
 * Updates an existing DRAFT PR (header fields + line items).
 * Accepts multipart/form-data identical to the POST create endpoint,
 * plus an optional `submit: true` flag to transition to SUBMITTED.
 *
 * For MPR: deletes existing line items and re-appends updated ones.
 * For SPR: updates the single SPR row.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  readSheet,
  updateRowWhere,
  deleteRowsWhere,
  appendRowByFields,
  getNextSeq,
  generateId,
  writeAuditLog,
} from "@/lib/sheets";
import { uploadFileToDrive } from "@/lib/drive";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const isSpr   = id.startsWith("SPR-");
  const sheet   = isSpr ? "SPR"    : "MPR";
  const idField = isSpr ? "SPR_ID" : "PR_ID";

  try {
    const formData = await req.formData();
    const dataRaw  = formData.get("data") as string;
    if (!dataRaw) return NextResponse.json({ error: "Missing 'data' field" }, { status: 400 });

    const body = JSON.parse(dataRaw);
    const { submit = false, requestor_user_id } = body;

    // Verify PR exists and is a draft
    const rows = await readSheet(sheet);
    const pr   = rows.find((r) => r[idField] === id);
    if (!pr) return NextResponse.json({ error: "PR not found" }, { status: 404 });
    if (pr.STATUS !== "DRAFT")
      return NextResponse.json({ error: "Only DRAFT PRs can be updated" }, { status: 400 });

    const now    = new Date().toISOString();
    const status = submit ? "SUBMITTED" : "DRAFT";

    // ── Handle optional file uploads ─────────────────────────────────────────
    const quotationFile  = formData.get("quotation")  as File | null;
    const proformaFile   = formData.get("proforma")   as File | null;
    const supportingFile = formData.get("supporting") as File | null;
    const scopeDocFile   = formData.get("scope_doc")  as File | null;

    let quotationUrl  = pr.QUOTATION_URL     ?? "";
    let proformaUrl   = pr.PROFORMA_INVOICE_URL ?? "";
    let supportingUrl = pr.SUPPORTING_DOC_URL   ?? "";
    let scopeDocUrl   = pr.SCOPE_DOC_URL        ?? "";

    if (quotationFile)  {
      const up = await uploadFileToDrive(quotationFile,  isSpr ? "PR" : "PR", id, "quotation.pdf");
      quotationUrl = up.web_view_link;
    }
    if (proformaFile) {
      const up = await uploadFileToDrive(proformaFile, "PR", id, "proforma_invoice.pdf");
      proformaUrl = up.web_view_link;
    }
    if (supportingFile) {
      const up = await uploadFileToDrive(supportingFile, "PR", id, "supporting_doc.pdf");
      supportingUrl = up.web_view_link;
    }
    if (scopeDocFile) {
      const up = await uploadFileToDrive(scopeDocFile, "PR", id, "scope_of_work.pdf");
      scopeDocUrl = up.web_view_link;
    }

    if (!isSpr) {
      // ── MPR update ──────────────────────────────────────────────────────────
      const {
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
      } = body;

      if (submit && (!category || !purpose || !expected_delivery_date)) {
        return NextResponse.json(
          { error: "Category, Purpose, and Delivery Date are required to submit." },
          { status: 400 }
        );
      }
      if (submit && !quotationUrl)
        return NextResponse.json({ error: "Vendor Quotation is required to submit." }, { status: 400 });
      if (submit && !proformaUrl)
        return NextResponse.json({ error: "Proforma Invoice is required to submit." }, { status: 400 });

      // Calculate totals
      const totalBeforeGst = lines.reduce((s: number, l: any) => s + parseFloat(l.qty) * parseFloat(l.rate), 0);
      const totalGst       = lines.reduce((s: number, l: any) => s + (parseFloat(l.qty) * parseFloat(l.rate) * parseFloat(l.gst_percent)) / 100, 0);
      const totalWithGst   = totalBeforeGst + totalGst;

      await updateRowWhere("MPR", "PR_ID", id, {
        CATEGORY:                 category ?? pr.CATEGORY ?? "",
        PURPOSE:                  purpose ?? pr.PURPOSE ?? "",
        PROCUREMENT_TYPE:         procurement_type,
        DELIVERY_LOCATION:        delivery_location ?? "",
        EXPECTED_DELIVERY_DATE:   expected_delivery_date ?? "",
        PREFERRED_VENDOR_ID:      preferred_vendor_id,
        PREFERRED_VENDOR_NAME:    preferred_vendor_name,
        PAYMENT_TERMS:            payment_terms,
        ADVANCE_PERCENT:          advance_percent,
        CREDIT_PERIOD_DAYS:       credit_period_days,
        RETENTION_AMOUNT:         retention_amount,
        QUOTATION_URL:            quotationUrl,
        PROFORMA_INVOICE_URL:     proformaUrl,
        SUPPORTING_DOC_URL:       supportingUrl,
        TOTAL_AMOUNT_BEFORE_GST:  totalBeforeGst,
        TOTAL_GST_AMOUNT:         totalGst,
        TOTAL_AMOUNT_WITH_GST:    totalWithGst,
        STATUS:                   status,
        SUBMITTED_DATE:           submit ? now : (pr.SUBMITTED_DATE ?? ""),
        LAST_UPDATED_BY:          requestor_user_id ?? "",
        LAST_UPDATED_DATE:        now,
      });

      // Replace line items
      if (lines.length > 0) {
        await deleteRowsWhere("MPR_LINES", "PR_ID", id);
        for (const [i, line] of lines.entries()) {
          const lineSeq        = await getNextSeq("MPR_LINES");
          const qty            = parseFloat(line.qty)  || 0;
          const rate           = parseFloat(line.rate) || 0;
          const gstPct         = parseFloat(line.gst_percent) || 0;
          const lineBeforeGst  = qty * rate;
          const gstAmount      = (lineBeforeGst * gstPct) / 100;
          const lineTotal      = lineBeforeGst + gstAmount;
          const lastPrice      = parseFloat(line.last_purchase_price) || 0;
          const deviationPct   = lastPrice > 0 ? (((rate - lastPrice) / lastPrice) * 100).toFixed(2) : "0";
          const deviationFlag  = lastPrice > 0 && rate > lastPrice * 1.15 ? "Y" : "N";

          await appendRowByFields("MPR_LINES", {
            LINE_ID:                generateId("MPRL", lineSeq),
            PR_ID:                  id,
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
      }

    } else {
      // ── SPR update ──────────────────────────────────────────────────────────
      const {
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
        delivery_location = "",
        quantity = 1,
        rate,
        gst_percent = 18,
      } = body;

      if (submit && (!service_category || !service_description || !rate))
        return NextResponse.json(
          { error: "Service Category, Description, and Rate are required to submit." },
          { status: 400 }
        );
      if (submit && !quotationUrl)
        return NextResponse.json({ error: "Vendor Quotation is required to submit." }, { status: 400 });

      const qty          = parseFloat(String(quantity));
      const rt           = parseFloat(String(rate || pr.RATE || "0"));
      const gst          = parseFloat(String(gst_percent));
      const totalBeforeGst = qty * rt;
      const totalGst       = (totalBeforeGst * gst) / 100;
      const totalWithGst   = totalBeforeGst + totalGst;

      await updateRowWhere("SPR", "SPR_ID", id, {
        SERVICE_CATEGORY:             service_category ?? pr.SERVICE_CATEGORY ?? "",
        SERVICE_SUBCATEGORY:          service_subcategory,
        SERVICE_DESCRIPTION:          service_description ?? pr.SERVICE_DESCRIPTION ?? "",
        SERVICE_PURPOSE:              service_purpose,
        VENDOR_ID:                    vendor_id,
        VENDOR_NAME:                  vendor_name,
        PAYMENT_TERMS:                payment_terms,
        CONTRACT_START_DATE:          contract_start_date,
        CONTRACT_END_DATE:            contract_end_date,
        AMC_VALUE:                    amc_value,
        AMC_SCOPE:                    amc_scope,
        PROJECT_CODE:                 project_code,
        MILESTONE_TAGS:               milestone_tags,
        PAYMENT_LINKED_TO_MILESTONES: payment_linked_to_milestones,
        CONSULTANT_NAME:              consultant_name,
        ENGAGEMENT_TYPE:              engagement_type,
        SAC_CODE:                     sac_code,
        TDS_APPLICABLE:               tds_applicable,
        TDS_SECTION:                  tds_section,
        DELIVERY_LOCATION:            delivery_location,
        QUANTITY:                     quantity,
        RATE:                         rate ?? pr.RATE ?? "",
        GST_PERCENT:                  gst_percent,
        TOTAL_AMOUNT_BEFORE_GST:      totalBeforeGst,
        TOTAL_GST_AMOUNT:             totalGst,
        TOTAL_AMOUNT_WITH_GST:        totalWithGst,
        QUOTATION_URL:                quotationUrl,
        SCOPE_DOC_URL:                scopeDocUrl,
        STATUS:                       status,
        SUBMITTED_DATE:               submit ? now : (pr.SUBMITTED_DATE ?? ""),
        LAST_UPDATED_BY:              requestor_user_id ?? "",
        LAST_UPDATED_DATE:            now,
      });
    }

    await writeAuditLog({ userId: requestor_user_id ?? "", module: sheet, recordId: id, action: submit ? (isSpr ? "SPR_SUBMIT" : "MPR_SUBMIT") : (isSpr ? "SPR_DRAFT" : "MPR_DRAFT") });

    return NextResponse.json({ success: true, pr_id: id });

  } catch (err) {
    console.error("[pr/[id]/update PATCH]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
