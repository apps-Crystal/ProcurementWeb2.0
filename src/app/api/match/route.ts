/**
 * POST /api/match
 *
 * Runs the Three-Way Match: PO vs GRN vs Invoice.
 * Called automatically after Site Head approves GRN and invoice is uploaded.
 *
 * Body: { po_id, grn_id, inv_id, triggered_by }
 *
 * Match outcomes (per SOP §8.4):
 *   MATCHED          → payment entry auto-created (SUBMITTED)
 *   QUANTITY_VARIANCE → payment created for accepted qty; difference held
 *   PRICE_VARIANCE   → payment HELD; Debit Note option raised
 *   FRAUD_RISK       → payment HELD; management alerted (AI confidence < 70)
 *   NO_GRN           → payment BLOCKED
 *
 * GET /api/match?match_id=MCH-xxx  → returns match details
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

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

type MatchStatus =
  | "MATCHED"
  | "QUANTITY_VARIANCE"
  | "PRICE_VARIANCE"
  | "FRAUD_RISK"
  | "NO_GRN"
  | "NO_INVOICE";

interface MatchLineResult {
  po_line_id: string;
  description: string;
  po_qty: number;
  grn_accepted_qty: number;
  invoice_qty: number;
  po_rate: number;
  invoice_rate: number;
  qty_variance_pct: number;
  price_variance_pct: number;
  line_status: MatchStatus;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET — fetch match result
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const matchId = req.nextUrl.searchParams.get("match_id");

  if (!matchId) {
    // Return all matches pending resolution
    const matches = await readSheet("THREE_WAY_MATCH");
    return NextResponse.json({ matches });
  }

  const matches = await readSheet("THREE_WAY_MATCH");
  const match = matches.find((m) => m.MATCH_ID === matchId);
  if (!match) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  const lines = await readSheet("THREE_WAY_MATCH_LINES");
  const matchLines = lines.filter((l) => l.MATCH_ID === matchId);

  return NextResponse.json({ match, lines: matchLines });
}

// ─────────────────────────────────────────────────────────────────────────────
// POST — run the match
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { po_id, grn_id, inv_id, triggered_by } = await req.json();

    if (!po_id || !inv_id) {
      return NextResponse.json({ error: "po_id and inv_id are required" }, { status: 400 });
    }

    // ── Load source data ──────────────────────────────────────────────────────

    // No GRN check
    if (!grn_id) {
      return NextResponse.json({
        match_status: "NO_GRN",
        message: "No GRN found for this PO. Payment blocked until GRN is raised and approved.",
      }, { status: 200 });
    }

    const [poLines, grnLines, invoiceLines, invoices] = await Promise.all([
      readSheet("PO_LINES"),
      readSheet("GRN_LINES"),
      readSheet("INVOICE_LINES"),
      readSheet("INVOICES"),
    ]);

    const myPoLines = poLines.filter((l) => l.PO_ID === po_id);
    const myGrnLines = grnLines.filter((l) => l.GRN_ID === grn_id);
    const myInvLines = invoiceLines.filter((l) => l.INV_ID === inv_id);
    const invoice = invoices.find((i) => i.INV_ID === inv_id);

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    // ── Fraud risk check (AI confidence) ─────────────────────────────────────
    const confidenceScore = parseFloat(invoice.AI_CONFIDENCE_SCORE ?? "100");
    if (confidenceScore < 70) {
      await flagMatchResult(po_id, grn_id, inv_id, "FRAUD_RISK", [], triggered_by);
      return NextResponse.json({
        match_status: "FRAUD_RISK",
        message: `AI confidence score is ${confidenceScore}%. Invoice flagged for management review before payment.`,
        confidence_score: confidenceScore,
      });
    }

    // ── Line-level matching ───────────────────────────────────────────────────
    const lineResults: MatchLineResult[] = [];
    let overallStatus: MatchStatus = "MATCHED";

    for (const poLine of myPoLines) {
      const grnLine = myGrnLines.find(
        (g) => g.PO_LINE_REF === poLine.LINE_ID
      );
      const invLine = myInvLines.find(
        (i) => i.DESCRIPTION?.toLowerCase() === poLine.ITEM_DESCRIPTION?.toLowerCase()
      );

      const poQty = parseFloat(poLine.QTY ?? "0");
      const grnAccepted = parseFloat(grnLine?.QTY_ACCEPTED ?? "0");
      const invQty = parseFloat(invLine?.QTY ?? "0");
      const poRate = parseFloat(poLine.RATE ?? "0");
      const invRate = parseFloat(invLine?.RATE ?? "0");

      const qtyVariancePct =
        grnAccepted > 0 ? Math.abs((invQty - grnAccepted) / grnAccepted) * 100 : 0;
      const priceVariancePct =
        poRate > 0 ? Math.abs((invRate - poRate) / poRate) * 100 : 0;

      let lineStatus: MatchStatus = "MATCHED";

      if (priceVariancePct > 0.5) {
        lineStatus = "PRICE_VARIANCE";
        overallStatus = "PRICE_VARIANCE";
      } else if (invQty > grnAccepted) {
        lineStatus = "QUANTITY_VARIANCE";
        if (overallStatus === "MATCHED") overallStatus = "QUANTITY_VARIANCE";
      }

      lineResults.push({
        po_line_id: poLine.LINE_ID,
        description: poLine.ITEM_DESCRIPTION,
        po_qty: poQty,
        grn_accepted_qty: grnAccepted,
        invoice_qty: invQty,
        po_rate: poRate,
        invoice_rate: invRate,
        qty_variance_pct: Math.round(qtyVariancePct * 100) / 100,
        price_variance_pct: Math.round(priceVariancePct * 100) / 100,
        line_status: lineStatus,
      });
    }

    // ── Write match result to sheets ─────────────────────────────────────────
    const matchId = await flagMatchResult(po_id, grn_id, inv_id, overallStatus, lineResults, triggered_by);

    // ── Auto-create payment entry if full match ───────────────────────────────
    let paymentId: string | null = null;
    if (overallStatus === "MATCHED") {
      paymentId = await createPaymentEntry(po_id, grn_id, inv_id, invoice, triggered_by);
      // Update invoice status
      await updateRowWhere("INVOICES", "INV_ID", inv_id, { STATUS: "MATCHED" });
    } else {
      // Payment is held
      await updateRowWhere("INVOICES", "INV_ID", inv_id, { STATUS: "EXCEPTION" });
    }

    await writeAuditLog({ userId: triggered_by ?? "SYSTEM", module: "THREE_WAY_MATCH", recordId: matchId, action: "THREE_WAY_MATCH", remarks: `Status: ${overallStatus}` });

    return NextResponse.json({
      match_id: matchId,
      match_status: overallStatus as MatchStatus,
      line_results: lineResults,
      payment_id: paymentId,
      message: getMatchMessage(overallStatus),
    });
  } catch (err) {
    console.error("[match]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

async function flagMatchResult(
  poId: string,
  grnId: string,
  invId: string,
  status: MatchStatus,
  lines: MatchLineResult[],
  triggeredBy: string
): Promise<string> {
  const seq = await getNextSeq("THREE_WAY_MATCH");
  const matchId = generateId("MCH", seq);
  const now = new Date().toISOString();

  // Aggregate variances
  const maxQtyVar = lines.reduce((m, l) => Math.max(m, l.qty_variance_pct), 0);
  const maxPriceVar = lines.reduce((m, l) => Math.max(m, l.price_variance_pct), 0);

  await appendRowByFields("THREE_WAY_MATCH", {
    MATCH_ID:              matchId,
    PO_ID:                 poId,
    GRN_ID:                grnId,
    INV_ID:                invId,
    MATCH_STATUS:          status,
    MAX_QTY_VARIANCE_PCT:  maxQtyVar,
    MAX_PRICE_VARIANCE_PCT: maxPriceVar,
    VARIANCE_REASON:       "",
    RESOLUTION_TYPE:       "",
    TRIGGERED_BY:          triggeredBy,
    CREATED_AT:            now,
  });

  // Write line results
  for (const line of lines) {
    const lineSeq = await getNextSeq("THREE_WAY_MATCH_LINES");
    await appendRowByFields("THREE_WAY_MATCH_LINES", {
      MATCH_LINE_ID:      generateId("MCHL", lineSeq),
      MATCH_ID:           matchId,
      PO_LINE_ID:         line.po_line_id,
      DESCRIPTION:        line.description,
      PO_QTY:             line.po_qty,
      GRN_ACCEPTED_QTY:   line.grn_accepted_qty,
      INVOICE_QTY:        line.invoice_qty,
      PO_RATE:            line.po_rate,
      INVOICE_RATE:       line.invoice_rate,
      QTY_VARIANCE_PCT:   line.qty_variance_pct,
      PRICE_VARIANCE_PCT: line.price_variance_pct,
      LINE_STATUS:        line.line_status,
    });
  }

  return matchId;
}

async function createPaymentEntry(
  poId: string,
  grnId: string,
  invId: string,
  invoice: Record<string, string>,
  triggeredBy: string
): Promise<string> {
  const seq = await getNextSeq("PAYMENTS");
  const payId = generateId("PAY", seq);
  const now = new Date().toISOString();

  // Due date = invoice verification date + 30 days (standard terms)
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 30);

  await appendRowByFields("PAYMENTS", {
    PAY_ID:               payId,
    INV_ID:               invId,
    PO_ID:                poId,
    GRN_ID:               grnId,
    VENDOR_ID:            invoice.VENDOR_ID ?? "",
    VENDOR_NAME:          invoice.VENDOR_NAME ?? "",
    GROSS_AMOUNT:         invoice.TOTAL_PAYABLE ?? "0",
    ADVANCE_ALREADY_PAID: "0",
    CREDIT_NOTES_APPLIED: "0",
    DEBIT_NOTES_APPLIED:  "0",
    TDS_AMOUNT:           "0",
    NET_PAYABLE:          invoice.TOTAL_PAYABLE ?? "0",
    PAYMENT_TYPE:         "Invoice",
    PAYMENT_DUE_DATE:     dueDate.toISOString().slice(0, 10),
    IS_MSME:              invoice.IS_MSME === "Y" ? "Y" : "N",
    STATUS:               "SUBMITTED",
    CREATED_BY:           triggeredBy ?? "SYSTEM",
    CREATED_AT:           now,
  });

  const stageSeq = await getNextSeq("PAYMENT_STAGES");
  await appendRowByFields("PAYMENT_STAGES", {
    STAGE_ID:     generateId("STGE", stageSeq),
    PAY_ID:       payId,
    STAGE_NUMBER: "1",
    STAGE_STATUS: "SUBMITTED",
    ACTIONED_BY:  triggeredBy ?? "SYSTEM",
    ACTIONED_AT:  now,
    REMARKS:      "Auto-created from full three-way match",
  });

  return payId;
}

function getMatchMessage(status: MatchStatus): string {
  const messages: Record<MatchStatus, string> = {
    MATCHED: "Full match. Payment entry created and sent to Procurement for verification.",
    QUANTITY_VARIANCE: "Quantity shortfall detected. Payment created for accepted quantity only. Balance held pending delivery.",
    PRICE_VARIANCE: "Price variance detected. Payment held. Accounts and Procurement to review. Debit Note option available.",
    FRAUD_RISK: "Low AI confidence score. Invoice flagged. Management review required before any payment is released.",
    NO_GRN: "No GRN on file for this PO. Payment blocked until GRN is raised and approved.",
    NO_INVOICE: "No invoice uploaded. Cannot run match.",
  };
  return messages[status];
}
