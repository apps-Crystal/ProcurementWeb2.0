/**
 * POST /api/po   — create PO from approved PR
 * GET  /api/po   — list POs
 *
 * Body (POST):
 * {
 *   pr_id, pr_type: "MPR" | "SPR",
 *   vendor_id, vendor_name, vendor_email,
 *   delivery_date, delivery_location,
 *   freight_charges, installation_charges,
 *   advance_percent, tally_po_number,
 *   special_commercial_terms, created_by
 * }
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
import { sendPoDispatch } from "@/lib/email";

const GRN_VALID_STATUSES = ["ISSUED", "OPEN", "PARTIALLY_RECEIVED", "ACKNOWLEDGED", "ACCEPTED"];

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status");
  const q      = req.nextUrl.searchParams.get("q")?.toLowerCase().trim() ?? "";
  const forGrn = req.nextUrl.searchParams.get("for_grn") === "1";

  const rows = await readSheet("PO");

  let filtered = rows;

  // When searching for GRN, restrict to statuses that can receive goods
  if (forGrn) {
    filtered = filtered.filter((r) => GRN_VALID_STATUSES.includes(r.STATUS));
  } else if (status) {
    filtered = filtered.filter((r) => r.STATUS === status);
  }

  // Full-text search: PO_ID or VENDOR_NAME
  if (q) {
    filtered = filtered.filter(
      (r) =>
        r.PO_ID?.toLowerCase().includes(q) ||
        r.VENDOR_NAME?.toLowerCase().includes(q)
    );
  }

  // Cap search results to avoid huge payloads
  if (q) filtered = filtered.slice(0, 20);

  return NextResponse.json({ pos: filtered });
}

export async function POST(req: NextRequest) {
  try {
    // ── Resolve caller from JWT headers ──────────────────────────────────────
    const callerId   = req.headers.get("x-user-id")   ?? "";
    const callerRole = req.headers.get("x-user-role") ?? "";
    if (!callerId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();

    const {
      pr_id,
      pr_type = "MPR",
      vendor_id,
      vendor_name,
      vendor_email = "",
      delivery_date,
      delivery_location = "",
      freight_charges = 0,
      installation_charges = 0,
      advance_percent = 0,
      tally_po_number = "",
      special_commercial_terms = "",
    } = body;

    // Use verified caller identity — ignore any created_by from body
    const created_by = callerId;

    if (!pr_id || !vendor_id || !delivery_date) {
      return NextResponse.json(
        { error: "pr_id, vendor_id, and delivery_date are required" },
        { status: 400 }
      );
    }

    // BUG-008: Tally PO Number is mandatory
    if (!tally_po_number || String(tally_po_number).trim() === "") {
      return NextResponse.json(
        { error: "tally_po_number is required before issuing a PO." },
        { status: 400 }
      );
    }

    // Fetch the approved PR
    const prSheet   = pr_type === "SPR" ? "SPR"   : "MPR";
    const prIdField = pr_type === "SPR" ? "SPR_ID" : "PR_ID";
    const prs = await readSheet(prSheet);
    const pr  = prs.find((r) => r[prIdField] === pr_id);

    if (!pr) {
      return NextResponse.json({ error: "PR not found" }, { status: 404 });
    }
    if (pr.STATUS !== "APPROVED") {
      return NextResponse.json(
        { error: "PR must be APPROVED before a PO can be created" },
        { status: 400 }
      );
    }

    // BUG-012: Vendor must be ACTIVE
    const vendorRows = await readSheet("VENDORS");
    const vendorRow  = vendorRows.find((v) => v.VENDOR_ID === vendor_id);
    if (!vendorRow) {
      return NextResponse.json(
        { error: `Vendor '${vendor_id}' not found.` },
        { status: 404 }
      );
    }
    if (vendorRow.STATUS !== "ACTIVE") {
      return NextResponse.json(
        { error: `Cannot create PO: vendor '${vendor_name}' has status '${vendorRow.STATUS}'. Only ACTIVE vendors may receive purchase orders.` },
        { status: 400 }
      );
    }

    // Fetch PR lines to compute totals
    const lineSheet   = pr_type === "SPR" ? "SPR_LINES" : "MPR_LINES";
    const lineIdField = pr_type === "SPR" ? "SPR_ID"    : "PR_ID";
    const prLines = await readSheet(lineSheet);
    let myLines = prLines.filter((l) => l[lineIdField] === pr_id);

    // SPRs store all line data on the SPR row itself (never writes to SPR_LINES).
    // Synthesize a single line from the SPR row so PO_LINES gets populated.
    if (pr_type === "SPR" && myLines.length === 0) {
      const qty    = parseFloat(String(pr.QUANTITY ?? "1"));
      const rate   = parseFloat(String(pr.RATE ?? "0"));
      const gst    = parseFloat(String(pr.GST_PERCENT ?? "0"));
      const base   = qty * rate;
      const gstAmt = (base * gst) / 100;
      myLines = [{
        ITEM_NAME:              pr.SERVICE_DESCRIPTION ?? pr.SERVICE_CATEGORY ?? "Service",
        ITEM_DESCRIPTION:       pr.SERVICE_DESCRIPTION ?? "",
        UNIT_OF_MEASURE:        "Service",
        QUANTITY:               String(qty),
        RATE:                   String(rate),
        GST_PERCENT:            String(gst),
        HSN_SAC_CODE:           pr.SAC_CODE ?? "",
        LINE_AMOUNT_BEFORE_GST: String(base),
        GST_AMOUNT:             String(gstAmt),
        LINE_TOTAL:             String(base + gstAmt),
        REMARKS:                "",
      }];
    }

    // Compute totals from lines
    const subtotal  = myLines.reduce((s, l) =>
      s + parseFloat(l.LINE_AMOUNT_BEFORE_GST ?? l.LINE_AMOUNT ?? "0"), 0);
    const totalGst  = myLines.reduce((s, l) =>
      s + parseFloat(l.GST_AMOUNT ?? "0"), 0);
    const freightNum        = parseFloat(String(freight_charges))       || 0;
    const installationNum   = parseFloat(String(installation_charges))  || 0;
    const advancePct        = parseFloat(String(advance_percent))       || 0;
    const grandTotal        = subtotal + totalGst + freightNum + installationNum;
    const advanceAmount     = (grandTotal * advancePct) / 100;
    const hasCustomTerms    = special_commercial_terms.trim().length > 0;

    let seq  = await getNextSeq("PO");
    let poId = generateId("PO", seq);
    const existingPO = await readSheet("PO");
    if (existingPO.some((r: any) => r.PO_ID === poId)) {
      poId = generateId("PO", await getNextSeq("PO"));
    }

    // BUG-PO-001: Prevent duplicate PO for the same source PR
    const duplicatePO = existingPO.find((r: any) => r.SOURCE_PR_ID === pr_id);
    if (duplicatePO) {
      return NextResponse.json(
        { error: `A PO (${duplicatePO.PO_ID}) already exists for PR ${pr_id}. Each approved PR may only generate one PO.` },
        { status: 409 }
      );
    }
    const now  = new Date().toISOString();

    await appendRowByFields("PO", {
      PO_ID:                       poId,
      PO_TYPE:                     pr_type,
      PO_DATE:                     now.slice(0, 10),
      PO_VERSION:                  "1",
      TALLY_PO_NUMBER:             tally_po_number,
      SOURCE_PR_ID:                pr_id,
      SOURCE_PR_TYPE:              pr_type,
      VENDOR_ID:                   vendor_id,
      VENDOR_NAME:                 vendor_name,
      VENDOR_EMAIL:                vendor_email,
      DELIVERY_DATE:               delivery_date,
      DELIVERY_LOCATION:           delivery_location || pr.DELIVERY_LOCATION || "",
      FREIGHT_CHARGES:             freightNum,
      INSTALLATION_CHARGES:        installationNum,
      PAYMENT_TERMS:               pr.PAYMENT_TERMS ?? "Standard",
      ADVANCE_PAYMENT_PCT:         advancePct,
      ADVANCE_AMOUNT:              advanceAmount,
      PAYMENT_SCHEDULE:            "",
      PAYMENT_SCHEDULE_TYPE:       pr.PAYMENT_SCHEDULE_TYPE      ?? "",
      PAYMENT_SCHEDULE_TOTAL_PCT:  pr.PAYMENT_SCHEDULE_TOTAL_PCT ?? "",
      SUBTOTAL:                    subtotal,
      TOTAL_GST:                   totalGst,
      FREIGHT_GST:                 0,
      GRAND_TOTAL:                 grandTotal,
      TC_STANDARD_APPLIED:         hasCustomTerms ? "N" : "Y",
      TC_CUSTOMISED:               hasCustomTerms ? "Y" : "N",
      TC_CUSTOMISATION_NOTES:      special_commercial_terms,
      TC_APPROVED_BY:              "",
      PO_PDF_URL:                  "",
      CUSTOM_TC_DOC_URL:           "",
      ACK_STATUS:                  "PENDING",
      ACK_TIMESTAMP:               "",
      ACK_METHOD:                  "",
      ACCEPTANCE_STATUS:           "",
      ACCEPTANCE_TIMESTAMP:        "",
      ACCEPTANCE_REMARKS:          "",
      FF_ALL_GRNS_CLOSED:          "N",
      FF_NO_OPEN_FLAGS:            "N",
      FF_WARRANTY_CONFIRMED:       "N",
      FF_ADVANCE_ADJUSTED:         "N",
      FF_NO_PENDING_DEBIT_NOTES:   "N",
      FF_GST_ITC_CONFIRMED:        "N",
      FF_TDS_CONFIRMED:            "N",
      FF_CHECKLIST_COMPLETE:       "N",
      STATUS:                      "ISSUED",
      CREATED_BY:                  created_by,
      CREATED_DATE:                now,
      RELEASED_BY:                 created_by,
      RELEASED_DATE:               now,
      AMENDMENT_REASON:            "",
      AMENDMENT_APPROVED_BY:       "",
      CANCELLATION_REASON:         "",
      CANCELLED_BY:                "",
      CANCELLED_DATE:              "",
      ADVANCE_RECOVERY_TRIGGERED:  "N",
      LAST_UPDATED_BY:             created_by,
      LAST_UPDATED_DATE:           now,
    });

    // Copy PR lines to PO_LINES
    for (const [i, line] of myLines.entries()) {
      const lineSeq = await getNextSeq("PO_LINES");
      await appendRowByFields("PO_LINES", {
        PO_LINE_ID:             generateId("POL", lineSeq),
        PO_ID:                  poId,
        LINE_NUMBER:            i + 1,
        MPR_LINE_ID:            line.MPR_LINE_ID ?? line.SPR_LINE_ID ?? "",
        ITEM_NAME:              line.ITEM_NAME ?? line.SERVICE_DESCRIPTION ?? "",
        ITEM_DESCRIPTION:       line.ITEM_DESCRIPTION ?? line.SERVICE_DESCRIPTION ?? "",
        UNIT_OF_MEASURE:        line.UNIT_OF_MEASURE ?? line.UOM ?? "",
        ORDERED_QTY:            line.QUANTITY ?? line.QTY ?? line.ORDERED_QTY ?? 0,
        RATE:                   line.RATE ?? 0,
        GST_PERCENT:            line.GST_PERCENT ?? 0,
        HSN_SAC_CODE:           line.HSN_SAC_CODE ?? line.HSN_CODE ?? line.SAC_CODE ?? "",
        LINE_AMOUNT_BEFORE_GST: line.LINE_AMOUNT_BEFORE_GST ?? line.LINE_AMOUNT ?? 0,
        GST_AMOUNT:             line.GST_AMOUNT ?? 0,
        LINE_TOTAL:             line.LINE_TOTAL ?? 0,
        QTY_RECEIVED:           0,
        QTY_OUTSTANDING:        line.QUANTITY ?? line.QTY ?? line.ORDERED_QTY ?? 0,
        REMARKS:                line.REMARKS ?? "",
      });
    }

    // Mark the source PR as PO_CREATED so it leaves the pending queue
    await updateRowWhere(prSheet, prIdField, pr_id, {
      STATUS:            "PO_CREATED",
      LAST_UPDATED_BY:   created_by,
      LAST_UPDATED_DATE: now,
    });

    await writeAuditLog({ userId: created_by, userRole: callerRole, module: "PO", recordId: poId, action: "PO_CREATED", remarks: `From ${pr_type}: ${pr_id}` });

    // ── Email 1: PO Dispatch to Vendor ────────────────────────────────────────
    if (vendor_email) {
      const contactName = vendorRow?.CONTACT_PERSON ?? vendor_name;

      // Fire-and-forget — don't block the response on email delivery
      sendPoDispatch({
        poId,
        poDate:               now.slice(0, 10),
        totalAmount:          grandTotal,
        deliveryDate:         delivery_date,
        deliveryLocation:     delivery_location || pr.DELIVERY_LOCATION || "",
        vendorContactName:    contactName,
        vendorEmail:          vendor_email,
        procurementOfficerName: created_by,
        paymentTerms:         pr.PAYMENT_TERMS ?? "Standard",
        advancePercent:       advancePct,
        advanceAmount:        advanceAmount,
        specialTerms:         special_commercial_terms || "",
        lines: myLines.map((l) => ({
          itemDescription: l.ITEM_DESCRIPTION ?? l.ITEM_NAME ?? l.SERVICE_DESCRIPTION ?? "",
          qty:             l.QUANTITY ?? l.QTY ?? l.ORDERED_QTY ?? 0,
          uom:             l.UNIT_OF_MEASURE ?? l.UOM ?? "",
          rate:            l.RATE ?? 0,
          gstPercent:      l.GST_PERCENT ?? 0,
          lineTotal:       l.LINE_TOTAL ?? 0,
        })),
      }).catch((err) => console.error("[email] PO dispatch failed:", err));
    }

    return NextResponse.json({ success: true, po_id: poId }, { status: 201 });
  } catch (err) {
    console.error("[po POST]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
