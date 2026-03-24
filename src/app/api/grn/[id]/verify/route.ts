/**
 * PATCH /api/grn/[id]/verify
 *
 * Site Head approves or flags a GRN (SOP §15.1 — segregation of duties).
 * Body: { action: "APPROVE" | "FLAG", verified_by, remarks? }
 *
 * APPROVE → STATUS: GRN_VERIFIED
 *           → PO_LINES quantities updated (QTY_RECEIVED, QTY_OUTSTANDING)
 * FLAG    → STATUS: FLAGGED
 *           → Record written to FLAGS sheet (visible in Flags & Disputes)
 */

import { NextRequest, NextResponse } from "next/server";
import {
  updateRowWhere,
  readSheet,
  appendRowByFields,
  getNextSeq,
  generateId,
  writeAuditLog,
} from "@/lib/sheets";
import { runThreeWayMatch } from "@/lib/matchEngine";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // BUG-GRN-002: Read caller identity from JWT headers (not body)
    const callerId   = req.headers.get("x-user-id")   ?? "";
    const callerRole = req.headers.get("x-user-role") ?? "";

    if (!callerId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // BUG-GRN-003: Role enforcement — only Site_Head or System_Admin may verify
    const VERIFY_ALLOWED_ROLES = ["Site_Head", "System_Admin"];
    if (!VERIFY_ALLOWED_ROLES.includes(callerRole)) {
      return NextResponse.json(
        { error: "Forbidden: only Site_Head or System_Admin may verify a GRN (SOP §15.1)." },
        { status: 403 }
      );
    }

    const { action, remarks = "" } = await req.json();

    if (!action) {
      return NextResponse.json({ error: "action is required" }, { status: 400 });
    }
    if (!["APPROVE", "FLAG"].includes(action)) {
      return NextResponse.json({ error: "action must be APPROVE or FLAG" }, { status: 400 });
    }
    if (action === "FLAG" && !remarks.trim()) {
      return NextResponse.json(
        { error: "Remarks are required when flagging a GRN." },
        { status: 400 }
      );
    }

    const grns = await readSheet("GRN");
    const grn  = grns.find((g) => g.GRN_ID === id);
    if (!grn) {
      return NextResponse.json({ error: "GRN not found" }, { status: 404 });
    }

    // BUG-GRN-006: Guard against re-verification of terminal-status GRNs
    const TERMINAL_STATUSES = ["GRN_VERIFIED", "FLAGGED", "REJECTED"];
    if (TERMINAL_STATUSES.includes(grn.STATUS)) {
      return NextResponse.json(
        { error: `GRN ${id} is already in status '${grn.STATUS}' and cannot be re-verified.` },
        { status: 422 }
      );
    }

    // BUG-GRN-002: SoD check uses JWT callerId, not body-supplied value
    if (grn.RAISED_BY_USER_ID === callerId) {
      return NextResponse.json(
        { error: "Segregation of duties violation: you cannot approve a GRN you submitted (SOP §15.1)." },
        { status: 422 }
      );
    }

    const now       = new Date().toISOString();
    const newStatus = action === "APPROVE" ? "GRN_VERIFIED" : "FLAGGED";

    await updateRowWhere("GRN", "GRN_ID", id, {
      STATUS:                  newStatus,
      SITE_HEAD_USER_ID:       callerId,
      SITE_HEAD_ACTION_DATE:   now,
      SITE_HEAD_REMARKS:       remarks,
      LAST_UPDATED_BY:         callerId,
      LAST_UPDATED_DATE:       now,
    });

    if (action === "APPROVE") {
      // ── Update PO_LINES quantities on approval ──────────────────────────────
      const grnLines   = await readSheet("GRN_LINES");
      const allPoLines = await readSheet("PO_LINES");
      const myLines    = grnLines.filter((l) => l.GRN_ID === id);

      for (const line of myLines) {
        const poLineId = line.PO_LINE_ID;
        const qtyRcvd  = parseFloat(line.RECEIVED_QTY ?? "0") || 0;
        if (!poLineId || qtyRcvd === 0) continue;

        const poLine = allPoLines.find((r) => r.PO_LINE_ID === poLineId);
        if (!poLine) continue;

        const orderedQty     = parseFloat(poLine.ORDERED_QTY   ?? "0") || 0;
        const prevReceived   = parseFloat(poLine.QTY_RECEIVED  ?? "0") || 0;
        const newReceived    = prevReceived + qtyRcvd;
        const newOutstanding = Math.max(0, orderedQty - newReceived);

        await updateRowWhere("PO_LINES", "PO_LINE_ID", poLineId, {
          QTY_RECEIVED:    newReceived,
          QTY_OUTSTANDING: newOutstanding,
        });
      }

      // BUG-GRN-005: Update PO status after quantities are confirmed on approval
      const refreshedLines = await readSheet("PO_LINES");
      const thisPOLines    = refreshedLines.filter((r) => r.PO_ID === grn.PO_ID);
      const allReceived    = thisPOLines.length > 0 &&
        thisPOLines.every((r) => parseFloat(r.QTY_OUTSTANDING ?? "1") <= 0);
      const newPoStatus    = allReceived ? "FULLY_RECEIVED" : "PARTIALLY_RECEIVED";
      await updateRowWhere("PO", "PO_ID", grn.PO_ID, {
        STATUS:            newPoStatus,
        LAST_UPDATED_BY:   callerId,
        LAST_UPDATED_DATE: now,
      });
    } else {
      // ── FLAG: write to FLAGS sheet so it surfaces in Flags & Disputes ───────
      const seq    = await getNextSeq("FLAGS");
      const flagId = generateId("FLG", seq);

      await appendRowByFields("FLAGS", {
        FLAG_ID:           flagId,
        FLAG_DATE:         now.slice(0, 10),
        FLAG_TYPE:         "GRN Flagged",
        FLAG_DESCRIPTION:  remarks || "Site Head flagged this GRN during verification.",
        SOURCE_TYPE:       "GRN_VERIFY",
        SOURCE_ID:         id,
        VENDOR_ID:         grn.VENDOR_ID ?? "",
        RAISED_BY_USER_ID: callerId,
        RAISED_DATE:       now,
        STATUS:            "OPEN",
      });
    }

    await writeAuditLog({
      userId:   callerId,
      module:   "GRN",
      recordId: id,
      action:   `GRN_SITE_HEAD_${action}`,
      remarks,
    });

    // ── Auto-trigger three-way match on GRN approval ───────────────────────────
    let autoMatchId: string | null = null;
    if (action === "APPROVE" && grn.PO_ID) {
      try {
        const invoices = await readSheet("INVOICES");
        const linked   = invoices.find(
          (i) => i.GRN_ID === id && i.STATUS !== "MATCHED"
        );
        if (linked) {
          const result = await runThreeWayMatch({
            po_id:        grn.PO_ID,
            grn_id:       id,
            inv_id:       linked.INV_ID,
            triggered_by: `AUTO:${callerId}`,
          });
          autoMatchId = result.match_id;
        }
      } catch (matchErr) {
        // Non-fatal — GRN approval still succeeds even if auto-match fails
        console.error("[grn/verify] Auto three-way match failed:", matchErr);
      }
    }

    return NextResponse.json({ success: true, grn_id: id, status: newStatus, auto_match_id: autoMatchId });
  } catch (err) {
    console.error("[grn/verify]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
