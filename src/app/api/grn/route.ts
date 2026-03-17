/**
 * POST /api/grn   — submit a new GRN (multipart/form-data)
 * GET  /api/grn   — list GRNs (?po_id= filter)
 *
 * Form fields:
 *   data              — JSON string with scalar fields + lines array
 *   delivery_challan  — File (mandatory)
 *   vendor_invoice    — File (mandatory)
 *   material_photos   — File (optional)
 */

import { NextRequest, NextResponse } from "next/server";
import {
  readSheet,
  appendRowByFields,
  getNextSeq,
  generateId,
  writeAuditLog,
} from "@/lib/sheets";
import { uploadFileToDrive } from "@/lib/drive";

export async function GET(req: NextRequest) {
  const poId = req.nextUrl.searchParams.get("po_id");
  const rows = await readSheet("GRN");
  const filtered = poId ? rows.filter((r) => r.PO_REF === poId) : rows;
  return NextResponse.json({ grns: filtered });
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    const dataRaw = formData.get("data") as string;
    if (!dataRaw)
      return NextResponse.json({ error: "Missing 'data' field" }, { status: 400 });

    const body = JSON.parse(dataRaw);
    const {
      po_id,
      site,
      received_by,
      grn_date = new Date().toISOString().slice(0, 10),
      lr_number = "",
      challan_number = "",
      vehicle_number = "",
      transporter_name = "",
      eway_bill_number = "",
      invoice_number = "",
      invoice_date = "",
      lines = [] as Record<string, unknown>[],
    } = body;

    if (!po_id || !site || !received_by || !lines.length) {
      return NextResponse.json(
        { error: "po_id, site, received_by, and at least one line are required" },
        { status: 400 }
      );
    }

    const challanFile = formData.get("delivery_challan") as File | null;
    const invoiceFile = formData.get("vendor_invoice") as File | null;
    const photosFile  = formData.get("material_photos")  as File | null;

    if (!challanFile)
      return NextResponse.json({ error: "Delivery challan is mandatory" }, { status: 400 });
    if (!invoiceFile)
      return NextResponse.json({ error: "Vendor invoice is mandatory" }, { status: 400 });

    const seq   = await getNextSeq("GRN");
    const grnId = generateId("GRN", seq);
    const now   = new Date().toISOString();

    // Upload files: ROOT/GRN/<GRN_ID>/
    const [challanUpload, invoiceUpload] = await Promise.all([
      uploadFileToDrive(challanFile, "GRN", grnId, "delivery_challan.pdf"),
      uploadFileToDrive(invoiceFile, "GRN", grnId, "vendor_invoice.pdf"),
    ]);

    let photosUrl = "";
    if (photosFile) {
      const up = await uploadFileToDrive(photosFile, "GRN", grnId, "material_photos.pdf");
      photosUrl = up.web_view_link;
    }

    const totalReceived  = (lines as Record<string,unknown>[]).reduce((s, l) => s + Number(l.qty_received  ?? 0), 0);
    const totalAccepted  = (lines as Record<string,unknown>[]).reduce((s, l) => s + Number(l.qty_accepted  ?? 0), 0);
    const totalDefective = (lines as Record<string,unknown>[]).reduce((s, l) => s + Number(l.qty_defective ?? 0), 0);

    await appendRowByFields("GRN", {
      GRN_ID:                  grnId,
      GRN_DATE:                grn_date,
      PO_REF:                  po_id,
      SITE:                    site,
      RECEIVED_BY:             received_by,
      VERIFIED_BY:             "",
      VERIFIED_DATE:           "",
      LR_NUMBER:               lr_number,
      CHALLAN_NUMBER:          challan_number,
      VEHICLE_NUMBER:          vehicle_number,
      TRANSPORTER_NAME:        transporter_name,
      EWAY_BILL_NUMBER:        eway_bill_number,
      INVOICE_NUMBER:          invoice_number,
      INVOICE_DATE:            invoice_date,
      TOTAL_QTY_RECEIVED:      totalReceived,
      TOTAL_QTY_ACCEPTED:      totalAccepted,
      TOTAL_QTY_DEFECTIVE:     totalDefective,
      DELIVERY_CHALLAN_URL:    challanUpload.web_view_link,
      MATERIAL_PHOTOS_URL:     photosUrl,
      VENDOR_INVOICE_URL:      invoiceUpload.web_view_link,
      STATUS:                  "PENDING",
      CREATED_BY:              received_by,
      CREATED_AT:              now,
    });

    for (const [i, line] of (lines as Record<string,unknown>[]).entries()) {
      const lseq = await getNextSeq("GRN_LINES");
      await appendRowByFields("GRN_LINES", {
        GRN_LINE_ID:     generateId("GRNL", lseq),
        GRN_ID:          grnId,
        LINE_NUMBER:     i + 1,
        PO_LINE_REF:     String(line.po_line_ref ?? ""),
        ITEM_DESCRIPTION: String(line.item_description ?? ""),
        QTY_ORDERED:     Number(line.qty_ordered  ?? 0),
        QTY_RECEIVED:    Number(line.qty_received ?? 0),
        QTY_DEFECTIVE:   Number(line.qty_defective ?? 0),
        QTY_ACCEPTED:    Number(line.qty_accepted  ?? 0),
        CONDITION:       String(line.condition    ?? "Good"),
        QC_OUTCOME:      String(line.qc_outcome   ?? "Pass"),
        INSPECTOR_NAME:  String(line.inspector_name ?? received_by),
        INSPECTION_DATE: grn_date,
        REMARKS:         String(line.remarks ?? ""),
      });
    }

    await writeAuditLog({ userId: received_by, module: "GRN", recordId: grnId, action: "GRN_SUBMIT", remarks: `PO: ${po_id}` });

    return NextResponse.json(
      {
        success: true, grn_id: grnId,
        drive_links: {
          delivery_challan: challanUpload.web_view_link,
          vendor_invoice:   invoiceUpload.web_view_link,
          material_photos:  photosUrl,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("[grn POST]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
