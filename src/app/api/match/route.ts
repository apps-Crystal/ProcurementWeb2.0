/**
 * GET  /api/match             — list all match records
 * GET  /api/match?match_id=   — fetch single match with full document context
 * POST /api/match             — run a three-way match (delegates to matchEngine)
 * PATCH /api/match            — resolve a match (Debit Note / Accept Variance / Reject)
 */

import { NextRequest, NextResponse } from "next/server";
import { readSheet, updateRowWhere, writeAuditLog } from "@/lib/sheets";
import { runThreeWayMatch } from "@/lib/matchEngine";

export async function GET(req: NextRequest) {
  const matchId = req.nextUrl.searchParams.get("match_id");
  const invId   = req.nextUrl.searchParams.get("inv_id");

  const matches = await readSheet("THREE_WAY_MATCH");

  // Lookup by invoice ID — returns the most recent match for that invoice
  if (invId) {
    const match = matches.filter((m) => m.INVOICE_ID === invId).at(-1) ?? null;
    return NextResponse.json({ match });
  }

  if (!matchId) {
    return NextResponse.json({ matches });
  }

  const match   = matches.find((m) => m.MATCH_ID === matchId);
  if (!match) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  // Fetch full document context in parallel
  const [matchLineRows, poRows, poLineRows, grnRows, grnLineRows, invoiceRows] = await Promise.all([
    readSheet("THREE_WAY_MATCH_LINES"),
    readSheet("PO"),
    readSheet("PO_LINES"),
    readSheet("GRN"),
    readSheet("GRN_LINES"),
    readSheet("INVOICES"),
  ]);

  const lines    = matchLineRows.filter((l) => l.MATCH_ID === matchId);
  const po       = poRows.find((r) => r.PO_ID === match.PO_ID)        ?? null;
  const poLines  = poLineRows.filter((l) => l.PO_ID === match.PO_ID);
  const grn      = grnRows.find((r) => r.GRN_ID === match.GRN_ID)     ?? null;
  const grnLines = grnLineRows.filter((l) => l.GRN_ID === match.GRN_ID);
  const invoice  = invoiceRows.find((i) => i.INV_ID === match.INVOICE_ID) ?? null;

  return NextResponse.json({ match, lines, po, poLines, grn, grnLines, invoice });
}

export async function POST(req: NextRequest) {
  try {
    // BUG-MATCH-001: Read caller identity from JWT headers
    const callerId   = req.headers.get("x-user-id")  ?? "";
    const callerRole = req.headers.get("x-user-role") ?? "";

    if (!callerId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const MATCH_ALLOWED_ROLES = ["Procurement_Team", "System_Admin"];
    if (!MATCH_ALLOWED_ROLES.includes(callerRole)) {
      return NextResponse.json(
        { error: "Forbidden: only Procurement_Team or System_Admin may trigger three-way matching (SOP §9.1)." },
        { status: 403 }
      );
    }

    const { po_id, grn_id, inv_id } = await req.json();

    if (!po_id || !inv_id) {
      return NextResponse.json(
        { error: "po_id and inv_id are required" },
        { status: 400 }
      );
    }

    const result = await runThreeWayMatch({
      po_id,
      grn_id:       grn_id || undefined,
      inv_id,
      triggered_by: callerId,
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("[match POST]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    // BUG-MATCH-002: Read caller identity from JWT headers
    const callerId   = req.headers.get("x-user-id")  ?? "";
    const callerRole = req.headers.get("x-user-role") ?? "";

    if (!callerId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const RESOLVE_ALLOWED_ROLES = ["Accounts", "System_Admin"];
    if (!RESOLVE_ALLOWED_ROLES.includes(callerRole)) {
      return NextResponse.json(
        { error: "Forbidden: only Accounts or System_Admin may resolve match discrepancies (SOP §9.3)." },
        { status: 403 }
      );
    }

    const { match_id, resolution } = await req.json();

    if (!match_id || !resolution) {
      return NextResponse.json(
        { error: "match_id and resolution are required" },
        { status: 400 }
      );
    }

    const validResolutions = ["DEBIT_NOTE", "ACCEPT_VARIANCE", "REJECT"];
    if (!validResolutions.includes(resolution)) {
      return NextResponse.json(
        { error: `resolution must be one of: ${validResolutions.join(", ")}` },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();

    // Find the match record
    const matches = await readSheet("THREE_WAY_MATCH");
    const match   = matches.find((m) => m.MATCH_ID === match_id);
    if (!match) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    // BUG-MATCH-003: Guard against re-resolution of terminal-status matches
    const TERMINAL_MATCH_STATUSES = ["ACCEPTED", "REJECTED", "ESCALATED", "PAID"];
    if (TERMINAL_MATCH_STATUSES.includes(match.STATUS)) {
      return NextResponse.json(
        { error: `Match ${match_id} is already in status '${match.STATUS}' and cannot be re-resolved.` },
        { status: 422 }
      );
    }

    // Mark the match as resolved
    await updateRowWhere("THREE_WAY_MATCH", "MATCH_ID", match_id, {
      RESOLUTION_STATUS: resolution,
      MATCH_RESULT:      "MATCHED", // resolved = treated as matched for payment
      REVIEWED_BY:       callerId,
      REVIEW_DATE:       now,
    });

    // Find linked payment and act on it
    const payments = await readSheet("PAYMENTS");
    const payment  = payments.find(
      (p) => p.INVOICE_ID === match.INVOICE_ID && (p.STATUS === "HELD" || p.STATUS === "SUBMITTED")
    );

    if (payment) {
      if (resolution === "DEBIT_NOTE") {
        // Pay only at original PO value
        const poRows  = await readSheet("PO");
        const po      = poRows.find((r) => r.PO_ID === match.PO_ID);
        const poTotal = po?.GRAND_TOTAL ?? po?.TOTAL_AMOUNT_WITH_GST ?? payment.GROSS_AMOUNT ?? "0";
        await updateRowWhere("PAYMENTS", "PAYMENT_ID", payment.PAYMENT_ID, {
          NET_PAYABLE:       poTotal,
          STATUS:            "SUBMITTED",
          LAST_UPDATED_BY:   callerId,
          LAST_UPDATED_DATE: now,
        });
      } else if (resolution === "ACCEPT_VARIANCE") {
        // Pay at invoice amount
        await updateRowWhere("PAYMENTS", "PAYMENT_ID", payment.PAYMENT_ID, {
          STATUS:            "SUBMITTED",
          LAST_UPDATED_BY:   callerId,
          LAST_UPDATED_DATE: now,
        });
      } else if (resolution === "REJECT") {
        await updateRowWhere("PAYMENTS", "PAYMENT_ID", payment.PAYMENT_ID, {
          STATUS:            "REJECTED",
          LAST_UPDATED_BY:   callerId,
          LAST_UPDATED_DATE: now,
        });
        await updateRowWhere("INVOICES", "INV_ID", match.INVOICE_ID, {
          STATUS: "EXCEPTION",
        });
      }
    }

    await writeAuditLog({
      userId:   callerId,
      module:   "THREE_WAY_MATCH",
      recordId: match_id,
      action:   `MATCH_RESOLVED`,
      remarks:  `Resolution: ${resolution}`,
    });

    return NextResponse.json({ success: true, match_id, resolution });
  } catch (err) {
    console.error("[match PATCH]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
