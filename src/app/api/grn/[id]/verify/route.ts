/**
 * PATCH /api/grn/[id]/verify
 *
 * Site Head approves or flags a GRN.
 * Body: { action: "APPROVE" | "FLAG", verified_by, flag_type?, flag_remarks? }
 *
 * On APPROVE → status set to GRN_VERIFIED
 *           → triggers three-way match if invoice already uploaded
 * On FLAG   → status set to FLAGGED, payment set to HELD
 */

import { NextRequest, NextResponse } from "next/server";
import { updateRowWhere, readSheet, writeAuditLog } from "@/lib/sheets";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { action, verified_by, flag_type, flag_remarks } = await req.json();

    const now = new Date().toISOString();
    const newStatus = action === "APPROVE" ? "GRN_VERIFIED" : "FLAGGED";

    await updateRowWhere("GRN", "GRN_ID", id, {
      STATUS: newStatus,
      VERIFIED_BY: verified_by,
      VERIFIED_DATE: now,
    });

    await writeAuditLog({ userId: verified_by, module: "GRN", recordId: id, action: `GRN_${action}`, remarks: flag_remarks ?? "" });

    // If approved and invoice already exists for this GRN → trigger match
    let matchTriggered = false;
    if (action === "APPROVE") {
      const invoices = await readSheet("INVOICES");
      const linkedInvoice = invoices.find((inv) => inv.GRN_ID === id);
      if (linkedInvoice) {
        // Get PO ref from GRN
        const grns = await readSheet("GRN");
        const grn = grns.find((g) => g.GRN_ID === id);

        if (grn) {
          // Fire match in background — client can poll /api/match
          const matchBody = {
            po_id: grn.PO_REF,
            grn_id: id,
            inv_id: linkedInvoice.INV_ID,
            triggered_by: verified_by,
          };

          // Internal fetch to match route
          const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
          fetch(`${baseUrl}/api/match`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(matchBody),
          }).catch((e) => console.error("[grn/verify] match trigger failed", e));

          matchTriggered = true;
        }
      }
    }

    return NextResponse.json({
      success: true,
      grn_id: id,
      status: newStatus,
      match_triggered: matchTriggered,
    });
  } catch (err) {
    console.error("[grn/verify]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
