/**
 * POST /api/po/[id]/fix-totals
 * One-time utility: re-computes SUBTOTAL, TOTAL_GST, GRAND_TOTAL from PO_LINES
 * and writes them back using live-header updateRowWhere (safe, no schema offset).
 * Also resets STATUS to "ISSUED" if it's not a valid status string.
 *
 * NOTE: This endpoint can be removed once the schema alignment bug is fully resolved.
 */
import { NextRequest, NextResponse } from "next/server";
import { readSheet, updateRowWhere } from "@/lib/sheets";

const VALID_STATUSES = new Set(["ISSUED", "ACKNOWLEDGED", "ACCEPTED", "CANCELLED", "PO_CREATED", "CLOSED"]);

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Fetch PO lines to recompute totals
    const allLines = await readSheet("PO_LINES");
    const lines = allLines.filter((l) => l.PO_ID === id);

    if (lines.length === 0) {
      return NextResponse.json({ error: "No PO lines found for " + id }, { status: 404 });
    }

    const subtotal   = lines.reduce((s, l) => s + (parseFloat(l.LINE_AMOUNT_BEFORE_GST ?? "0") || 0), 0);
    const totalGst   = lines.reduce((s, l) => s + (parseFloat(l.GST_AMOUNT ?? "0") || 0), 0);
    const grandTotal = subtotal + totalGst;

    // Check current PO status
    const pos = await readSheet("PO");
    const po  = pos.find((r) => r.PO_ID === id);
    if (!po) return NextResponse.json({ error: "PO not found" }, { status: 404 });

    const fixedStatus = VALID_STATUSES.has(po.STATUS ?? "") ? po.STATUS! : "ISSUED";

    // Also fix TC_CUSTOMISATION_NOTES if it contains a URL path (legacy offset bug)
    const tcNotes = po.TC_CUSTOMISATION_NOTES ?? "";
    const fixedTcNotes = tcNotes.startsWith("/po/") ? "" : tcNotes;

    await updateRowWhere("PO", "PO_ID", id, {
      SUBTOTAL:                subtotal,
      TOTAL_GST:               totalGst,
      GRAND_TOTAL:             grandTotal,
      STATUS:                  fixedStatus,
      TC_CUSTOMISATION_NOTES:  fixedTcNotes,
      LAST_UPDATED_DATE:       new Date().toISOString(),
    });

    return NextResponse.json({
      success:    true,
      po_id:      id,
      subtotal,
      total_gst:  totalGst,
      grand_total: grandTotal,
      status:     fixedStatus,
    });
  } catch (err) {
    console.error("[fix-totals]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
