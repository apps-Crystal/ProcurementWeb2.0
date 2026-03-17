/**
 * POST /api/invoices/upload
 *
 * Accepts a multipart form with:
 *   - file: PDF / JPG / PNG (vendor invoice)
 *   - grn_id: linked GRN or SRN reference
 *   - po_id: linked PO
 *   - uploaded_by: user ID
 *
 * Steps:
 *   1. Read file → base64
 *   2. Call Gemini via OpenRouter to extract invoice data
 *   3. Write INVOICES row + INVOICE_LINES rows to Google Sheets
 *   4. Return extracted data to frontend for split-view verification
 */

import { NextRequest, NextResponse } from "next/server";
import { extractInvoice } from "@/lib/ai";
import { appendRowByFields, getNextSeq, generateId, writeAuditLog } from "@/lib/sheets";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    const file = formData.get("file") as File | null;
    const grnId = (formData.get("grn_id") as string) ?? "";
    const poId = (formData.get("po_id") as string) ?? "";
    const uploadedBy = (formData.get("uploaded_by") as string) ?? "SYSTEM";

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate mime type
    const allowedTypes = ["application/pdf", "image/jpeg", "image/png"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Only PDF, JPG, PNG files are accepted" },
        { status: 400 }
      );
    }

    // Convert file to base64
    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");

    // Call Gemini via OpenRouter
    const extracted = await extractInvoice(
      base64,
      file.type as "application/pdf" | "image/jpeg" | "image/png"
    );

    // Generate invoice ID
    const seq = await getNextSeq("INVOICES");
    const invId = generateId("INV", seq);

    const now = new Date().toISOString();

    // Write to INVOICES sheet
    await appendRowByFields("INVOICES", {
      INV_ID:               invId,
      INV_DATE:             now.slice(0, 10),
      INVOICE_NUMBER:       extracted.invoice_number,
      INVOICE_DATE:         extracted.invoice_date,
      VENDOR_NAME:          extracted.vendor_name,
      VENDOR_GSTIN:         extracted.vendor_gstin,
      PO_REF:               poId,
      GRN_REF:              grnId,
      TAXABLE_AMOUNT:       extracted.taxable_amount,
      TOTAL_GST:            extracted.total_gst,
      TOTAL_PAYABLE:        extracted.total_payable,
      AI_CONFIDENCE_SCORE:  extracted.confidence_score,
      AI_EXTRACTED:         "Y",
      INVOICE_PDF_URL:      "",
      STATUS:               "RECEIVED",
      UPLOADED_BY:          uploadedBy,
      CREATED_AT:           now,
    });

    for (const [i, line] of extracted.lines.entries()) {
      const lineSeq = await getNextSeq("INVOICE_LINES");
      await appendRowByFields("INVOICE_LINES", {
        LINE_ID:              generateId("INVL", lineSeq),
        INV_ID:               invId,
        LINE_NUMBER:          i + 1,
        DESCRIPTION:          line.description,
        HSN_SAC:              line.hsn_sac,
        QTY:                  line.qty,
        UNIT:                 line.unit,
        RATE:                 line.rate,
        GST_PERCENT:          line.gst_percent,
        LINE_AMOUNT:          line.line_amount,
        MATCHED_TO_PO_LINE_ID: "",
      });
    }

    // Audit log
    await writeAuditLog({ userId: uploadedBy, module: "INVOICES", recordId: invId, action: "INVOICE_UPLOAD", remarks: `AI confidence: ${extracted.confidence_score}%` });

    return NextResponse.json({
      success: true,
      inv_id: invId,
      extracted,
    });
  } catch (err) {
    console.error("[invoices/upload]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
