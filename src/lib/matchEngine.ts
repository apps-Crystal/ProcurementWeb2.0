/**
 * matchEngine.ts
 *
 * Shared three-way match logic — imported by:
 *   - POST /api/match          (manual run from UI)
 *   - PATCH /api/grn/[id]/verify (auto-trigger on GRN approval)
 *
 * Outcomes (SOP §8.4):
 *   MATCHED           → full payment SUBMITTED
 *   QUANTITY_VARIANCE → partial payment SUBMITTED for accepted qty; flag raised
 *   PRICE_VARIANCE    → HELD payment created; flag raised
 *   FRAUD_RISK        → HELD payment created; flag raised
 *   NO_GRN            → no payment; flag raised
 */

import {
  readSheet,
  appendRowByFields,
  updateRowWhere,
  getNextSeq,
  generateId,
  writeAuditLog,
} from "@/lib/sheets";

export type MatchStatus =
  | "MATCHED"
  | "QUANTITY_VARIANCE"
  | "PRICE_VARIANCE"
  | "FRAUD_RISK"
  | "NO_GRN"
  | "NO_INVOICE";

export interface RunMatchParams {
  po_id:        string;
  grn_id?:      string;
  inv_id:       string;
  triggered_by: string;
}

export interface MatchLineResult {
  po_line_id:         string;
  description:        string;
  po_qty:             number;
  grn_accepted_qty:   number;
  invoice_qty:        number;
  po_rate:            number;
  invoice_rate:       number;
  qty_variance_pct:   number;
  price_variance_pct: number;
  line_status:        MatchStatus;
}

export interface RunMatchResult {
  match_id:     string;
  match_status: MatchStatus;
  message:      string;
  payment_id:   string | null;
  flag_id:      string | null;
  line_results: MatchLineResult[];
}

// ─────────────────────────────────────────────────────────────────────────────

export async function runThreeWayMatch(params: RunMatchParams): Promise<RunMatchResult> {
  const { po_id, grn_id, inv_id, triggered_by } = params;

  // ── No GRN ──────────────────────────────────────────────────────────────────
  if (!grn_id) {
    const matchId = await writeMatchRecord(po_id, "", inv_id, "NO_GRN", [], triggered_by);
    await updateRowWhere("INVOICES", "INV_ID", inv_id, { STATUS: "EXCEPTION" });
    const flagId = await writeFlag({
      type:      "Missing GRN",
      description: `Invoice ${inv_id} received but no GRN exists for PO ${po_id}. Payment blocked.`,
      source:    "THREE_WAY_MATCH",
      sourceId:  matchId,
      createdBy: triggered_by,
    });
    await writeAuditLog({ userId: triggered_by, module: "THREE_WAY_MATCH", recordId: matchId, action: "THREE_WAY_MATCH", remarks: "Status: NO_GRN" });
    return { match_id: matchId, match_status: "NO_GRN", message: getMatchMessage("NO_GRN"), payment_id: null, flag_id: flagId, line_results: [] };
  }

  // ── GRN status guard (F-04) ──────────────────────────────────────────────────
  {
    const grnRows = await readSheet("GRN");
    const grnRec  = grnRows.find((g) => g.GRN_ID === grn_id);
    if (!grnRec || grnRec.STATUS !== "GRN_VERIFIED") {
      const grnStatus = grnRec?.STATUS ?? "NOT_FOUND";
      const matchId = await writeMatchRecord(po_id, grn_id, inv_id, "NO_GRN", [], triggered_by);
      await updateRowWhere("INVOICES", "INV_ID", inv_id, { STATUS: "EXCEPTION" });
      const flagId = await writeFlag({
        type:        "Flagged GRN",
        description: `GRN ${grn_id} has status "${grnStatus}" — three-way match blocked until GRN is verified by Site Head.`,
        source:      "THREE_WAY_MATCH",
        sourceId:    matchId,
        createdBy:   triggered_by,
      });
      await writeAuditLog({ userId: triggered_by, module: "THREE_WAY_MATCH", recordId: matchId, action: "THREE_WAY_MATCH", remarks: `Status: NO_GRN (GRN status: ${grnStatus})` });
      return { match_id: matchId, match_status: "NO_GRN", message: `GRN ${grn_id} is not verified (status: ${grnStatus}). Match blocked until Site Head approves.`, payment_id: null, flag_id: flagId, line_results: [] };
    }
  }

  const [poLines, grnLines, invoiceLines, invoices, vendors, purchaseOrders, users] = await Promise.all([
    readSheet("PO_LINES"),
    readSheet("GRN_LINES"),
    readSheet("INVOICE_LINES"),
    readSheet("INVOICES"),
    readSheet("VENDORS"),
    readSheet("PURCHASE_ORDERS"),
    readSheet("USERS"),
  ]);

  const myPoLines  = poLines.filter((l) => l.PO_ID === po_id);
  const myGrnLines = grnLines.filter((l) => l.GRN_ID === grn_id);
  const myInvLines = invoiceLines.filter((l) => l.INV_ID === inv_id);
  const invoice    = invoices.find((i) => i.INV_ID === inv_id);

  if (!invoice) throw new Error(`Invoice ${inv_id} not found`);

  // Vendor / PO / actor lookups (BUG 3, 10, 2, 4/17)
  const vendor           = vendors.find((v) => v.VENDOR_ID === invoice.VENDOR_ID);
  const isMsme           = vendor?.IS_MSME ?? "N";
  const po               = purchaseOrders.find((p) => p.PO_ID === po_id);
  const subProfileId     = po?.SUB_PROFILE_ID ?? "";
  const creditPeriodDays = parseInt(po?.CREDIT_PERIOD_DAYS ?? "30") || 30;
  const actor            = users.find((u) => u.USER_ID === triggered_by);
  const actorName        = actor?.FULL_NAME ?? triggered_by;
  const actorRole        = actor?.ROLE ?? "";

  // ── Fraud risk check (AI confidence) ────────────────────────────────────────
  const confidenceScore = parseFloat(invoice.AI_CONFIDENCE_SCORE ?? "100");
  if (confidenceScore < 70) {
    const matchId   = await writeMatchRecord(po_id, grn_id, inv_id, "FRAUD_RISK", [], triggered_by);
    await updateRowWhere("INVOICES", "INV_ID", inv_id, { STATUS: "EXCEPTION" });
    const paymentId = await createPaymentEntry(
      po_id, grn_id, inv_id, invoice, triggered_by, "HELD",
      `Fraud risk: AI confidence ${confidenceScore}% is below 70% threshold. Held pending management review.`,
      matchId, isMsme, creditPeriodDays, subProfileId, actorName, actorRole
    );
    const flagId = await writeFlag({
      type:        "Fraud Risk",
      description: `AI confidence score ${confidenceScore}% is below the 70% threshold. Invoice ${inv_id} requires manual review before payment.`,
      source:      "THREE_WAY_MATCH",
      sourceId:    matchId,
      createdBy:   triggered_by,
    });
    await writeAuditLog({ userId: triggered_by, module: "THREE_WAY_MATCH", recordId: matchId, action: "THREE_WAY_MATCH", remarks: `Status: FRAUD_RISK, confidence: ${confidenceScore}%` });
    return { match_id: matchId, match_status: "FRAUD_RISK", message: getMatchMessage("FRAUD_RISK"), payment_id: paymentId, flag_id: flagId, line_results: [] };
  }

  // ── Line-level matching ──────────────────────────────────────────────────────
  const lineResults: MatchLineResult[] = [];
  let overallStatus: MatchStatus = "MATCHED";

  for (const poLine of myPoLines) {
    const grnLine = myGrnLines.find((g) => g.PO_LINE_ID === poLine.PO_LINE_ID);
    const invLine = myInvLines.find(
      (i) => i.DESCRIPTION?.toLowerCase() === poLine.ITEM_DESCRIPTION?.toLowerCase()
    );

    const poQty       = parseFloat(poLine.ORDERED_QTY    ?? "0");
    const grnAccepted = parseFloat(grnLine?.ACCEPTED_QTY ?? "0");
    const invQty      = parseFloat(invLine?.QTY           ?? "0");
    const poRate      = parseFloat(poLine.RATE            ?? "0");
    const invRate     = parseFloat(invLine?.RATE          ?? "0");

    const qtyVariancePct   = grnAccepted > 0 ? Math.abs((invQty - grnAccepted) / grnAccepted) * 100 : 0;
    const priceVariancePct = poRate      > 0 ? Math.abs((invRate - poRate)       / poRate)      * 100 : 0;

    let lineStatus: MatchStatus = "MATCHED";
    if (priceVariancePct > 0.5) {
      lineStatus    = "PRICE_VARIANCE";
      overallStatus = "PRICE_VARIANCE";
    } else if (invQty > grnAccepted) {
      lineStatus = "QUANTITY_VARIANCE";
      if (overallStatus === "MATCHED") overallStatus = "QUANTITY_VARIANCE";
    }

    lineResults.push({
      po_line_id:         poLine.PO_LINE_ID,
      description:        poLine.ITEM_DESCRIPTION,
      po_qty:             poQty,
      grn_accepted_qty:   grnAccepted,
      invoice_qty:        invQty,
      po_rate:            poRate,
      invoice_rate:       invRate,
      qty_variance_pct:   Math.round(qtyVariancePct * 100) / 100,
      price_variance_pct: Math.round(priceVariancePct * 100) / 100,
      line_status:        lineStatus,
    });
  }

  const matchId = await writeMatchRecord(po_id, grn_id, inv_id, overallStatus, lineResults, triggered_by);

  let paymentId: string | null = null;
  let flagId:    string | null = null;

  // ── MATCHED — full payment ───────────────────────────────────────────────────
  if (overallStatus === "MATCHED") {
    paymentId = await createPaymentEntry(
      po_id, grn_id, inv_id, invoice, triggered_by, "SUBMITTED",
      "Auto-created from full three-way match.",
      matchId, isMsme, creditPeriodDays, subProfileId, actorName, actorRole
    );
    await updateRowWhere("INVOICES", "INV_ID", inv_id, { STATUS: "MATCHED" });

  // ── QUANTITY_VARIANCE — partial payment for accepted qty ─────────────────────
  } else if (overallStatus === "QUANTITY_VARIANCE") {
    const acceptedTotal = lineResults.reduce((sum, l) => sum + l.grn_accepted_qty * l.po_rate, 0);
    const varLineCount  = lineResults.filter((l) => l.line_status === "QUANTITY_VARIANCE").length;
    const maxQtyVar     = Math.max(...lineResults.map((l) => l.qty_variance_pct));

    paymentId = await createPaymentEntry(
      po_id, grn_id, inv_id, invoice, triggered_by, "SUBMITTED",
      `Partial payment for accepted quantity only (${varLineCount} line(s) with shortfall). Balance held pending delivery.`,
      matchId, isMsme, creditPeriodDays, subProfileId, actorName, actorRole, acceptedTotal
    );
    await updateRowWhere("INVOICES", "INV_ID", inv_id, { STATUS: "EXCEPTION" });
    flagId = await writeFlag({
      type:        "Quantity Mismatch",
      description: `Invoice ${inv_id} billed qty exceeds GRN accepted qty on ${varLineCount} line(s). Max variance: ${maxQtyVar.toFixed(2)}%. Partial payment created; balance held.`,
      source:      "THREE_WAY_MATCH",
      sourceId:    matchId,
      createdBy:   triggered_by,
    });

  // ── PRICE_VARIANCE — HELD payment, full amount visible to Finance ────────────
  } else if (overallStatus === "PRICE_VARIANCE") {
    const maxPriceVar = Math.max(...lineResults.map((l) => l.price_variance_pct));

    paymentId = await createPaymentEntry(
      po_id, grn_id, inv_id, invoice, triggered_by, "HELD",
      `Payment held: invoice price deviates from PO rate. Max variance: ${maxPriceVar.toFixed(2)}%. Procurement / Accounts review required.`,
      matchId, isMsme, creditPeriodDays, subProfileId, actorName, actorRole
    );
    await updateRowWhere("INVOICES", "INV_ID", inv_id, { STATUS: "EXCEPTION" });
    flagId = await writeFlag({
      type:        "Price Mismatch",
      description: `Invoice ${inv_id} price deviates from PO ${po_id} rate. Max variance: ${maxPriceVar.toFixed(2)}%. Payment held until reviewed.`,
      source:      "THREE_WAY_MATCH",
      sourceId:    matchId,
      createdBy:   triggered_by,
    });
  }

  await writeAuditLog({ userId: triggered_by, module: "THREE_WAY_MATCH", recordId: matchId, action: "THREE_WAY_MATCH", remarks: `Status: ${overallStatus}` });

  return { match_id: matchId, match_status: overallStatus, message: getMatchMessage(overallStatus), payment_id: paymentId, flag_id: flagId, line_results: lineResults };
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

async function writeMatchRecord(
  poId:        string,
  grnId:       string,
  invId:       string,
  status:      MatchStatus,
  lines:       MatchLineResult[],
  triggeredBy: string
): Promise<string> {
  const seq     = await getNextSeq("THREE_WAY_MATCH");
  const matchId = generateId("MCH", seq);
  const now     = new Date().toISOString();

  await appendRowByFields("THREE_WAY_MATCH", {
    MATCH_ID:          matchId,
    MATCH_TIMESTAMP:   now,
    INVOICE_ID:        invId,
    PO_ID:             poId,
    GRN_ID:            grnId,
    MATCH_RESULT:      status,
    RESOLUTION_STATUS: "",
  });

  for (const [idx, line] of lines.entries()) {
    const lineSeq = await getNextSeq("THREE_WAY_MATCH_LINES");
    await appendRowByFields("THREE_WAY_MATCH_LINES", {
      MATCH_LINE_ID:       generateId("MCHL", lineSeq),
      MATCH_ID:            matchId,
      LINE_NUMBER:         String(idx + 1),
      PO_LINE_ID:          line.po_line_id,
      PO_ITEM_DESCRIPTION: line.description,
      PO_QTY:              line.po_qty,
      PO_RATE:             line.po_rate,
      RECEIPT_QTY:         line.grn_accepted_qty,
      INVOICE_QTY:         line.invoice_qty,
      INVOICE_RATE:        line.invoice_rate,
      QTY_VARIANCE:        line.invoice_qty - line.grn_accepted_qty,
      RATE_VARIANCE_PCT:   line.price_variance_pct,
      LINE_MATCH_RESULT:   line.line_status,
    });
  }

  return matchId;
}

async function writeFlag(opts: {
  type:        string;
  description: string;
  source:      string;
  sourceId:    string;
  createdBy:   string;
}): Promise<string> {
  const seq    = await getNextSeq("FLAGS");
  const flagId = generateId("FLG", seq);
  const now    = new Date().toISOString();

  await appendRowByFields("FLAGS", {
    FLAG_ID:           flagId,
    FLAG_DATE:         now.slice(0, 10),
    FLAG_TYPE:         opts.type,
    FLAG_DESCRIPTION:  opts.description,
    SOURCE_TYPE:       opts.source,
    SOURCE_ID:         opts.sourceId,
    RAISED_BY_USER_ID: opts.createdBy,
    RAISED_DATE:       now,
    STATUS:            "OPEN",
  });

  return flagId;
}

async function createPaymentEntry(
  poId:             string,
  grnId:            string,
  invId:            string,
  invoice:          Record<string, string>,
  triggeredBy:      string,
  initialStatus:    string,
  remarks:          string,
  matchId:          string,
  isMsme:           string,
  creditPeriodDays: number,
  subProfileId:     string,
  actorName:        string,
  actorRole:        string,
  overrideAmount?:  number
): Promise<string> {
  const seq   = await getNextSeq("PAYMENTS");
  const payId = generateId("PAY", seq);
  const now   = new Date().toISOString();

  const baseDays    = isMsme === "Y" ? 45 : (creditPeriodDays || 30);
  const dueDate     = new Date(now);
  dueDate.setDate(dueDate.getDate() + baseDays);
  const msmeDueDate = isMsme === "Y" ? dueDate.toISOString().slice(0, 10) : "";

  const netPayable = overrideAmount !== undefined
    ? overrideAmount.toFixed(2)
    : (invoice.TOTAL_PAYABLE ?? "0");

  await appendRowByFields("PAYMENTS", {
    PAYMENT_ID:            payId,
    INVOICE_ID:            invId,
    PO_ID:                 poId,
    GRN_ID:                grnId,
    VENDOR_ID:             invoice.VENDOR_ID   ?? "",
    VENDOR_NAME:           invoice.VENDOR_NAME ?? "",
    GROSS_AMOUNT:          invoice.TOTAL_PAYABLE ?? "0",
    ADVANCE_DEDUCTION:     "0",
    CREDIT_NOTE_DEDUCTION: "0",
    DEBIT_NOTE_DEDUCTION:  "0",
    TDS_DEDUCTION:         "0",
    NET_PAYABLE:           netPayable,
    PAYMENT_TYPE:          "Invoice",
    PAYMENT_DUE_DATE:      dueDate.toISOString().slice(0, 10),
    MSME_DUE_DATE:         msmeDueDate,
    IS_MSME:               isMsme,
    MATCH_ID:              matchId,
    SUB_PROFILE_ID:        subProfileId,
    STATUS:                initialStatus,
    CREATED_BY:            triggeredBy ?? "SYSTEM",
    CREATED_DATE:          now,
  });

  const stageSeq = await getNextSeq("PAYMENT_STAGES");
  await appendRowByFields("PAYMENT_STAGES", {
    STAGE_LOG_ID:     generateId("STGE", stageSeq),
    PAYMENT_ID:       payId,
    STAGE_NUMBER:     "1",
    STAGE_NAME:       "Payment Submitted",
    ACTION:           initialStatus,
    ACTOR_USER_ID:    triggeredBy ?? "SYSTEM",
    ACTOR_NAME:       actorName,
    ACTOR_ROLE:       actorRole,
    ACTION_TIMESTAMP: now,
    REMARKS:          remarks,
  });

  return payId;
}

function getMatchMessage(status: MatchStatus): string {
  const messages: Record<MatchStatus, string> = {
    MATCHED:           "Full match. Payment entry created and sent to Procurement for verification.",
    QUANTITY_VARIANCE: "Quantity shortfall detected. Partial payment created for accepted quantity. Balance held pending delivery and new GRN.",
    PRICE_VARIANCE:    "Price variance detected. Payment held. Accounts and Procurement to review.",
    FRAUD_RISK:        "Low AI confidence score. Invoice flagged. Management review required before any payment is released.",
    NO_GRN:            "No GRN on file for this PO. Payment blocked until GRN is raised and approved.",
    NO_INVOICE:        "No invoice uploaded. Cannot run match.",
  };
  return messages[status];
}
