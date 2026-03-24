/**
 * POST /api/invoices/upload
 *
 * Accepts a multipart form with:
 *   - file: PDF / JPG / PNG (vendor invoice)
 *   - grn_id: linked GRN or SRN reference
 *   - po_id: linked PO
 *
 * Caller identity is read from JWT middleware headers (x-user-id, x-user-role).
 * Steps:
 *   1. Read file → base64
 *   2. Call Gemini via OpenRouter to extract invoice data
 *   3. Write INVOICES row + INVOICE_LINES rows to Google Sheets
 *   4. Return extracted data to frontend for split-view verification
 */

import { NextRequest, NextResponse } from "next/server";
import { extractInvoice } from "@/lib/ai";
import { appendRowByFields, getNextSeq, generateId, writeAuditLog, readSheet } from "@/lib/sheets";

export async function GET() {
  const rows = await readSheet("INVOICES");
  return NextResponse.json({ invoices: rows });
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    // BUG-INV-001: Read caller identity from JWT headers, not form body
    const uploadedBy = req.headers.get("x-user-id") ?? "SYSTEM";
    const callerRole = req.headers.get("x-user-role") ?? "";

    // BUG-INV-002: Role enforcement — only Procurement_Team or System_Admin may upload invoices
    const UPLOAD_ALLOWED_ROLES = ["Procurement_Team", "System_Admin"];
    if (!UPLOAD_ALLOWED_ROLES.includes(callerRole)) {
      return NextResponse.json(
        { error: "Forbidden: only Procurement_Team or System_Admin may upload invoices (SOP §8.1)." },
        { status: 403 }
      );
    }

    const file  = formData.get("file") as File | null;
    const grnId = (formData.get("grn_id") as string) ?? "";
    const poId  = (formData.get("po_id")  as string) ?? "";

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

    // BUG-INV-003: If a GRN/SRN is linked, validate against both sheets
    if (grnId) {
      const [grns, srns] = await Promise.all([readSheet("GRN"), readSheet("SRN")]);
      const grn = grns.find((g) => g.GRN_ID === grnId);
      const srn = srns.find((s) => s.SRN_ID === grnId);

      if (!grn && !srn) {
        return NextResponse.json({ error: `GRN/SRN ${grnId} not found.` }, { status: 404 });
      }

      const record   = grn ?? srn!;
      const verified = grn ? "GRN_VERIFIED" : "SUBMITTED";
      if (record.STATUS !== verified) {
        return NextResponse.json(
          { error: `${grnId} has not been verified yet (status: ${record.STATUS}). Invoice cannot be uploaded until it is approved.` },
          { status: 422 }
        );
      }
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
    let seq = await getNextSeq("INVOICES");
    let invId = generateId("INV", seq);
    const existingInv = await readSheet("INVOICES");
    if (existingInv.some((r: any) => r.INV_ID === invId)) {
      invId = generateId("INV", await getNextSeq("INVOICES"));
    }

    const now = new Date().toISOString();

    // Write to INVOICES sheet
    await appendRowByFields("INVOICES", {
      INV_ID:                invId,
      INVOICE_DATE:          extracted.invoice_date,
      VENDOR_INVOICE_NUMBER: extracted.invoice_number,
      VENDOR_NAME:           extracted.vendor_name,
      VENDOR_GSTIN:          extracted.vendor_gstin,
      PO_ID:                 poId,
      GRN_ID:                grnId,
      TAXABLE_AMOUNT:        extracted.taxable_amount,
      GST_AMOUNT:            extracted.total_gst,
      TOTAL_PAYABLE:         extracted.total_payable,
      AI_CONFIDENCE_SCORE:   extracted.confidence_score,
      AI_EXTRACTED:          "Y",
      INVOICE_PDF_URL:       "",
      STATUS:                "RECEIVED",
      UPLOADED_BY:           uploadedBy,
      UPLOADED_DATE:         now,
    });

    for (const [i, line] of extracted.lines.entries()) {
      const lineSeq = await getNextSeq("INVOICE_LINES");
      await appendRowByFields("INVOICE_LINES", {
        INVOICE_LINE_ID: generateId("INVL", lineSeq),
        INV_ID:          invId,
        LINE_NUMBER:     i + 1,
        DESCRIPTION:     line.description,
        HSN_SAC_CODE:    line.hsn_sac,
        QTY:             line.qty,
        RATE:            line.rate,
        GST_PERCENT:     line.gst_percent,
        LINE_TOTAL:      line.line_amount,
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
