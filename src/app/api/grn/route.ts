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
  updateRowWhere,
  getNextSeq,
  generateId,
  writeAuditLog,
} from "@/lib/sheets";
import { uploadFileToDrive } from "@/lib/drive";

const ALLOWED_ROLES = ["Warehouse", "Site_Head", "Procurement_Team", "System_Admin"];
const ALLOWED_MIME_PREFIXES = ["application/pdf", "image/"];
const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB
const VALID_PO_STATUSES = ["ISSUED", "OPEN", "PARTIALLY_RECEIVED", "ACKNOWLEDGED", "ACCEPTED"];

export async function GET(req: NextRequest) {
  const poId  = req.nextUrl.searchParams.get("po_id");
  const grnId = req.nextUrl.searchParams.get("grn_id");
  const rows = await readSheet("GRN");
  const filtered = grnId
    ? rows.filter((r) => r.GRN_ID === grnId)
    : poId
      ? rows.filter((r) => r.PO_ID === poId)
      : rows;
  return NextResponse.json({ grns: filtered });
}

export async function POST(req: NextRequest) {
  try {
    // ── Role enforcement + JWT identity (BUG-GRN-001) ──────────────────────
    const callerId   = req.headers.get("x-user-id")   ?? "";
    const callerName = req.headers.get("x-user-name")  ?? "";
    const callerRole = req.headers.get("x-user-role") ?? "";

    if (!callerId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!ALLOWED_ROLES.includes(callerRole)) {
      return NextResponse.json(
        { error: "Forbidden: only Warehouse, Site_Head, or Procurement_Team may submit GRNs." },
        { status: 403 }
      );
    }

    const formData = await req.formData();

    const dataRaw = formData.get("data") as string;
    if (!dataRaw)
      return NextResponse.json({ error: "Missing 'data' field" }, { status: 400 });

    const body = JSON.parse(dataRaw);
    const {
      po_id,
      site,
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

    // ── Required scalar fields ──────────────────────────────────────────────
    if (!po_id || !site || !lines.length) {
      return NextResponse.json(
        { error: "po_id, site, and at least one line are required" },
        { status: 400 }
      );
    }
    if (!challan_number) {
      return NextResponse.json({ error: "Challan / LR number is required" }, { status: 400 });
    }
    if (!invoice_number) {
      return NextResponse.json({ error: "Vendor invoice number is required" }, { status: 400 });
    }
    if (!invoice_date) {
      return NextResponse.json({ error: "Vendor invoice date is required" }, { status: 400 });
    }

    // ── Date validation ─────────────────────────────────────────────────────
    const today = new Date().toISOString().slice(0, 10);
    if (grn_date > today) {
      return NextResponse.json(
        { error: `GRN date cannot be in the future (today is ${today}).` },
        { status: 400 }
      );
    }
    if (invoice_date > grn_date) {
      return NextResponse.json(
        { error: "Vendor invoice date cannot be after the GRN date." },
        { status: 400 }
      );
    }

    // ── File presence ───────────────────────────────────────────────────────
    const challanFile = formData.get("delivery_challan") as File | null;
    const invoiceFile = formData.get("vendor_invoice") as File | null;
    const photosFile  = formData.get("material_photos")  as File | null;

    if (!challanFile)
      return NextResponse.json({ error: "Delivery challan is mandatory" }, { status: 400 });
    if (!invoiceFile)
      return NextResponse.json({ error: "Vendor invoice is mandatory" }, { status: 400 });

    // ── File type & size validation ─────────────────────────────────────────
    for (const [label, file] of [["Delivery challan", challanFile], ["Vendor invoice", invoiceFile], ...(photosFile ? [["Material photos", photosFile]] : [])] as [string, File][]) {
      if (!ALLOWED_MIME_PREFIXES.some((prefix) => file.type.startsWith(prefix))) {
        return NextResponse.json(
          { error: `${label}: only PDF or image files are accepted (received: ${file.type || "unknown"}).` },
          { status: 400 }
        );
      }
      if (file.size > MAX_FILE_BYTES) {
        return NextResponse.json(
          { error: `${label} exceeds the 20 MB limit (size: ${(file.size / 1024 / 1024).toFixed(1)} MB).` },
          { status: 400 }
        );
      }
    }

    // ── Fetch & validate PO ─────────────────────────────────────────────────
    const allPOs = await readSheet("PO");
    const po = allPOs.find((r) => r.PO_ID === po_id);

    if (!po) {
      return NextResponse.json(
        { error: `Purchase Order ${po_id} not found.` },
        { status: 404 }
      );
    }
    if (!VALID_PO_STATUSES.includes(po.STATUS)) {
      return NextResponse.json(
        { error: `PO ${po_id} is not open for receiving (status: ${po.STATUS}).` },
        { status: 422 }
      );
    }

    // ── Fetch PO lines and validate ─────────────────────────────────────────
    const allPoLines = await readSheet("PO_LINES");
    const poLineIds = new Set(
      allPoLines.filter((r) => r.PO_ID === po_id).map((r) => r.PO_LINE_ID)
    );

    // Check PO is not already fully received
    const poLinesForThisPO = allPoLines.filter((r) => r.PO_ID === po_id);
    const allFullyReceived =
      poLinesForThisPO.length > 0 &&
      poLinesForThisPO.every((r) => {
        const outstanding = parseFloat(r.QTY_OUTSTANDING ?? "0");
        return isNaN(outstanding) ? false : outstanding <= 0;
      });
    if (allFullyReceived) {
      return NextResponse.json(
        { error: `PO ${po_id} has already been fully received. No further GRNs can be submitted.` },
        { status: 422 }
      );
    }

    // ── Duplicate challan check ─────────────────────────────────────────────
    const existingGRNs = await readSheet("GRN");
    const challanToCheck = (challan_number || lr_number).trim().toLowerCase();
    if (challanToCheck) {
      const duplicate = existingGRNs.find(
        (r) =>
          r.LR_CHALLAN_NUMBER?.trim().toLowerCase() === challanToCheck &&
          r.STATUS !== "REJECTED"
      );
      if (duplicate) {
        return NextResponse.json(
          { error: `Challan / LR number "${challan_number || lr_number}" has already been submitted in GRN ${duplicate.GRN_ID}.` },
          { status: 422 }
        );
      }
    }

    // ── Validate GRN date is not before PO date ─────────────────────────────
    if (po.PO_DATE && grn_date < po.PO_DATE.slice(0, 10)) {
      return NextResponse.json(
        { error: `GRN date (${grn_date}) cannot be before the PO issue date (${po.PO_DATE.slice(0, 10)}).` },
        { status: 400 }
      );
    }

    // ── Validate lines ──────────────────────────────────────────────────────
    const typedLines = lines as Record<string, unknown>[];

    // Filter out fully-received lines (qty_received == 0) that were passed in
    const activeLines = typedLines.filter((l) => Number(l.qty_received ?? 0) !== 0);
    if (activeLines.length === 0) {
      return NextResponse.json(
        { error: "At least one line must have a received quantity greater than zero." },
        { status: 400 }
      );
    }

    for (const [i, line] of activeLines.entries()) {
      const lineNum = i + 1;
      const poLineId = String(line.po_line_ref ?? "");

      // Cross-validate PO_LINE_ID belongs to this PO
      if (poLineId && !poLineIds.has(poLineId)) {
        return NextResponse.json(
          { error: `Line ${lineNum}: PO line "${poLineId}" does not belong to PO ${po_id}.` },
          { status: 400 }
        );
      }

      const qtyReceived  = Number(line.qty_received  ?? 0);
      const qtyDefective = Number(line.qty_defective ?? 0);

      // No negatives
      if (qtyReceived < 0 || qtyDefective < 0) {
        return NextResponse.json(
          { error: `Line ${lineNum}: quantities cannot be negative.` },
          { status: 400 }
        );
      }

      // Find the PO line to check outstanding qty
      const poLine = allPoLines.find((r) => r.PO_LINE_ID === poLineId);
      if (poLine) {
        const rawOutstanding = parseFloat(poLine.QTY_OUTSTANDING ?? "");
        const orderedQty = parseFloat(poLine.ORDERED_QTY ?? "0") || 0;
        const outstanding = isNaN(rawOutstanding) ? orderedQty : Math.max(0, rawOutstanding);
        if (qtyReceived > outstanding) {
          return NextResponse.json(
            {
              error: `Line ${lineNum} (${String(line.item_description ?? poLineId)}): received qty (${qtyReceived}) exceeds outstanding qty (${outstanding}).`,
            },
            { status: 400 }
          );
        }
      }

      // Defective cannot exceed received
      if (qtyDefective > qtyReceived) {
        return NextResponse.json(
          {
            error: `Line ${lineNum}: defective qty (${qtyDefective}) cannot exceed received qty (${qtyReceived}).`,
          },
          { status: 400 }
        );
      }
    }

    // ── Generate IDs and upload files ───────────────────────────────────────
    let seq   = await getNextSeq("GRN");
    let grnId = generateId("GRN", seq);
    const existingGRN = await readSheet("GRN");
    if (existingGRN.some((r: any) => r.GRN_ID === grnId)) {
      grnId = generateId("GRN", await getNextSeq("GRN"));
    }
    const now   = new Date().toISOString();

    const [challanUpload, invoiceUpload] = await Promise.all([
      uploadFileToDrive(challanFile, "GRN", grnId, "delivery_challan.pdf"),
      uploadFileToDrive(invoiceFile, "GRN", grnId, "vendor_invoice.pdf"),
    ]);

    let photosUrl = "";
    if (photosFile) {
      const up = await uploadFileToDrive(photosFile, "GRN", grnId, "material_photos.pdf");
      photosUrl = up.web_view_link;
    }

    // ── Compute totals (server-side, ignoring client-supplied accepted qty) ──
    const totalOrdered   = activeLines.reduce((s, l) => s + Number(l.qty_ordered   ?? 0), 0);
    const totalReceived  = activeLines.reduce((s, l) => s + Number(l.qty_received  ?? 0), 0);
    const totalDefective = activeLines.reduce((s, l) => s + Number(l.qty_defective ?? 0), 0);
    const totalAccepted  = Math.max(0, totalReceived - totalDefective);

    const outcomes  = activeLines.map((l) => String(l.qc_outcome ?? "Pass"));
    const overallQC = outcomes.includes("Fail") ? "Fail"
      : outcomes.includes("Defective") ? "Defective"
      : outcomes.includes("Conditional Accept") ? "Conditional Accept"
      : "Pass";

    await appendRowByFields("GRN", {
      GRN_ID:                  grnId,
      GRN_DATE:                grn_date,
      PO_ID:                   po_id,
      VENDOR_ID:               po.VENDOR_ID ?? "",
      VENDOR_NAME:             po.VENDOR_NAME ?? "",
      SITE:                    site,
      LR_CHALLAN_NUMBER:       challan_number || lr_number,
      VEHICLE_NUMBER:          vehicle_number,
      TRANSPORTER_NAME:        transporter_name,
      DELIVERY_DATE:           grn_date,
      EWAY_BILL_NUMBER:        eway_bill_number,
      VENDOR_INVOICE_NUMBER:   invoice_number,
      VENDOR_INVOICE_DATE:     invoice_date,
      QC_CONDUCTED:            "Y",
      QC_INSPECTOR_NAME:       callerName || callerId,
      QC_INSPECTION_DATE:      grn_date,
      QC_OVERALL_OUTCOME:      overallQC,
      QC_REMARKS:              "",
      DELIVERY_CHALLAN_URL:    challanUpload.web_view_link,
      MATERIAL_PHOTOS_URL:     photosUrl,
      VENDOR_INVOICE_URL:      invoiceUpload.web_view_link,
      TOTAL_ORDERED_QTY:       totalOrdered,
      TOTAL_RECEIVED_QTY:      totalReceived,
      TOTAL_ACCEPTED_QTY:      totalAccepted,
      TOTAL_DEFECTIVE_QTY:     totalDefective,
      STATUS:                  "PENDING",
      RAISED_BY_USER_ID:       callerId,
      RAISED_BY_NAME:          callerName || callerId,
      RAISED_DATE:             now,
      LAST_UPDATED_BY:         callerId,
      LAST_UPDATED_DATE:       now,
    });

    for (const [i, line] of activeLines.entries()) {
      const lseq = await getNextSeq("GRN_LINES");
      const qtyReceived  = Number(line.qty_received  ?? 0);
      const qtyDefective = Number(line.qty_defective ?? 0);
      const qtyAccepted  = Math.max(0, qtyReceived - qtyDefective); // recomputed server-side
      await appendRowByFields("GRN_LINES", {
        GRN_LINE_ID:     generateId("GRNL", lseq),
        GRN_ID:          grnId,
        PO_LINE_ID:      String(line.po_line_ref    ?? ""),
        LINE_NUMBER:     i + 1,
        ITEM_NAME:       String(line.item_description || allPoLines.find((p) => p.PO_LINE_ID === String(line.po_line_ref))?.ITEM_DESCRIPTION || ""),
        UNIT_OF_MEASURE: String(line.unit_of_measure || allPoLines.find((p) => p.PO_LINE_ID === String(line.po_line_ref))?.UNIT_OF_MEASURE || ""),
        ORDERED_QTY:     Number(line.qty_ordered || allPoLines.find((p) => p.PO_LINE_ID === String(line.po_line_ref))?.ORDERED_QTY || 0),
        RECEIVED_QTY:    qtyReceived,
        DEFECTIVE_QTY:   qtyDefective,
        ACCEPTED_QTY:    qtyAccepted,
        ITEM_CONDITION:  String(line.condition     ?? "Good"),
        QC_LINE_OUTCOME: String(line.qc_outcome    ?? "Pass"),
        REMARKS:         String(line.remarks       ?? ""),
      });
    }

    // BUG-GRN-004: PO_LINES quantity update moved to verify/APPROVE only.
    // GRN is PENDING on submit — quantities confirmed only after Site Head approval.

    // BUG-GRN-005: Update PO status to PARTIALLY_RECEIVED on GRN submission
    await updateRowWhere("PO", "PO_ID", po_id, {
      STATUS:            "PARTIALLY_RECEIVED",
      LAST_UPDATED_BY:   callerId,
      LAST_UPDATED_DATE: now,
    });

    await writeAuditLog({ userId: callerId, module: "GRN", recordId: grnId, action: "GRN_SUBMIT", remarks: `PO: ${po_id}` });

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
    const msg = err instanceof Error ? err.message : "Internal server error";
    const isFormDataErr = msg.toLowerCase().includes("formdata") || msg.toLowerCase().includes("parse body");
    return NextResponse.json(
      { error: isFormDataErr ? "File upload failed — files may be too large (max 20 MB each). Please compress and retry." : msg },
      { status: 500 }
    );
  }
}
