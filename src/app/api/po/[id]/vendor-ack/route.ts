/**
 * GET  /api/po/[id]/vendor-ack
 *   Vendor clicks the email link → sees full PO details (with payment terms, T&C)
 *   + explicit "Acknowledge" button + "Download PDF" button.
 *   No authentication required (vendor-facing).
 *
 * POST /api/po/[id]/vendor-ack
 *   Vendor clicks the Acknowledge button → PO is marked ACKNOWLEDGED.
 */

import { NextRequest, NextResponse } from "next/server";
import { readSheet, updateRowWhere, writeAuditLog } from "@/lib/sheets";
import { fmtDate } from "@/lib/utils";

// ── Shared HTML shell ────────────────────────────────────────────────────────

function htmlShell(title: string, body: string, extraHead = "") {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} — Crystal Group</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; background: #f1f5f9; min-height: 100vh; padding: 24px 16px; color: #1e293b; }
    .page { max-width: 860px; margin: 0 auto; }
    .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.08); margin-bottom: 16px; }
    .hdr { background: #1a1a2e; color: #fff; padding: 20px 28px; }
    .hdr .brand { font-size: 11px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; opacity: .7; margin-bottom: 6px; }
    .hdr h1 { font-size: 20px; font-weight: 700; }
    .hdr p  { font-size: 12px; color: #94a3b8; margin-top: 4px; }
    .body { padding: 24px 28px; }
    .sec-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; color: #64748b; margin: 20px 0 8px; }
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 20px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 16px 20px; }
    .meta-grid .item .lbl { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; color: #64748b; margin-bottom: 2px; }
    .meta-grid .item .val { font-size: 13px; color: #1e293b; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
    thead tr { background: #1a1a2e; color: #fff; }
    thead th { padding: 9px 10px; text-align: left; font-weight: 600; font-size: 11.5px; }
    tbody tr { border-bottom: 1px solid #f1f5f9; }
    tbody tr:last-child { border-bottom: none; }
    tbody td { padding: 9px 10px; vertical-align: top; color: #334155; }
    .tr { text-align: right; }
    tfoot tr { background: #f0f4ff; }
    tfoot td { padding: 8px 10px; font-weight: 700; color: #1a1a2e; }
    tfoot .grand td { font-size: 14px; border-top: 2px solid #1a1a2e; }
    .tc-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 14px 16px; font-size: 12px; color: #475569; line-height: 1.7; }
    .tc-box ol { padding-left: 20px; margin: 0; }
    .special-box { background: #fffbeb; border: 1px solid #f59e0b; border-radius: 6px; padding: 12px 16px; font-size: 12px; color: #92400e; line-height: 1.6; }
    .ack-box { background: #f0fdf4; border: 1px solid #86efac; border-radius: 6px; padding: 20px 24px; margin: 20px 0; }
    .ack-box p { font-size: 13px; color: #166534; line-height: 1.6; }
    .ack-box p strong { color: #14532d; }
    .btn-row { display: flex; gap: 12px; align-items: center; margin-top: 16px; flex-wrap: wrap; }
    .ack-btn { display: inline-block; background: #166534; color: #fff; border: none; padding: 13px 28px; border-radius: 5px; font-weight: 700; font-size: 14px; cursor: pointer; letter-spacing: .3px; text-decoration: none; }
    .print-btn { display: inline-block; background: #1a1a2e; color: #fff; border: none; padding: 13px 22px; border-radius: 5px; font-weight: 600; font-size: 13px; cursor: pointer; letter-spacing: .2px; text-decoration: none; }
    .err-box { background: #fef2f2; border: 1px solid #fca5a5; border-radius: 6px; padding: 14px 18px; font-size: 12px; color: #7f1d1d; }
    .ok-box  { background: #f0fdf4; border: 1px solid #86efac; border-radius: 6px; padding: 20px 24px; }
    .ok-box p { font-size: 14px; color: #166534; line-height: 1.7; }
    .icon { font-size: 36px; margin-bottom: 12px; }
    .footer { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 12px 28px; font-size: 11px; color: #94a3b8; text-align: center; }
    @media (max-width: 600px) {
      .meta-grid { grid-template-columns: 1fr; }
      table { font-size: 11px; }
    }
    @media print {
      body { background: #fff; padding: 0; }
      .no-print { display: none !important; }
      .card { box-shadow: none; border: none; }
      .hdr { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      thead tr { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
  ${extraHead}
</head>
<body>
  <div class="page">
    ${body}
  </div>
</body>
</html>`;
}

function fmtAmt(val: string | number | undefined) {
  const n = parseFloat(String(val ?? "0"));
  if (isNaN(n)) return "—";
  return "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── GET — show full PO details + explicit acknowledge + download PDF ──────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const [poRows, lineRows] = await Promise.all([
    readSheet("PO"),
    readSheet("PO_LINES"),
  ]);
  const po = poRows.find((r) => r.PO_ID === id);
  let lines = lineRows
    .filter((r) => r.PO_ID === id)
    .sort((a, b) => parseInt(a.LINE_NUMBER ?? "0") - parseInt(b.LINE_NUMBER ?? "0"));

  // SPR-sourced POs may have no PO_LINES if created before the fix.
  // Fall back to the source SPR row to synthesize a line.
  if (lines.length === 0 && po && (po.PO_TYPE === "SPR" || po.SOURCE_PR_TYPE === "SPR")) {
    const sprRows = await readSheet("SPR");
    const spr     = sprRows.find((s) => s.SPR_ID === po.SOURCE_PR_ID);
    if (spr) {
      const qty    = parseFloat(String(spr.QUANTITY ?? "1"));
      const rate   = parseFloat(String(spr.RATE ?? "0"));
      const gst    = parseFloat(String(spr.GST_PERCENT ?? "0"));
      const base   = qty * rate;
      const gstAmt = (base * gst) / 100;
      lines = [{
        LINE_NUMBER:            "1",
        ITEM_DESCRIPTION:       spr.SERVICE_DESCRIPTION ?? spr.SERVICE_CATEGORY ?? "Service",
        ITEM_NAME:              spr.SERVICE_DESCRIPTION ?? spr.SERVICE_CATEGORY ?? "Service",
        HSN_SAC_CODE:           spr.SAC_CODE ?? "",
        ORDERED_QTY:            String(qty),
        UNIT_OF_MEASURE:        "Service",
        RATE:                   String(rate),
        GST_PERCENT:            String(gst),
        LINE_AMOUNT_BEFORE_GST: String(base),
        GST_AMOUNT:             String(gstAmt),
        LINE_TOTAL:             String(base + gstAmt),
      }];
    }
  }

  // PO not found
  if (!po) {
    return new NextResponse(
      htmlShell("Invalid Link", `<div class="card">
        <div class="hdr" style="background:#dc2626;"><div class="brand">Crystal Group · Procurement</div><h1>Link Not Valid</h1></div>
        <div class="body"><div class="err-box"><p>This acknowledgement link is invalid or the PO could not be found. Contact <a href="mailto:apps@crystalgroup.com">apps@crystalgroup.com</a>.</p></div></div>
        <div class="footer">Crystal Group Integrated Procurement System</div>
      </div>`),
      { status: 404, headers: { "Content-Type": "text/html" } }
    );
  }

  // Already actioned — block re-acknowledgment or re-rejection for any terminal state
  const TERMINAL_ACK_STATUSES = ["ACKNOWLEDGED", "VENDOR_REJECTED"];
  const POST_ACK_PO_STATUSES  = ["ACKNOWLEDGED", "ACCEPTED", "GRN_SUBMITTED", "PARTIALLY_RECEIVED", "FULLY_RECEIVED", "CLOSED", "VENDOR_REJECTED"];
  if (TERMINAL_ACK_STATUSES.includes(po.ACK_STATUS) || POST_ACK_PO_STATUSES.includes(po.STATUS)) {
    const wasRejected = po.ACK_STATUS === "VENDOR_REJECTED" || po.STATUS === "VENDOR_REJECTED";
    return new NextResponse(
      htmlShell(wasRejected ? "Already Rejected" : "Already Acknowledged", `<div class="card">
        <div class="hdr" style="background:${wasRejected ? "#dc2626" : "#166534"};"><div class="brand">Crystal Group · Procurement</div><h1>Already ${wasRejected ? "Rejected" : "Acknowledged"}</h1></div>
        <div class="body">
          <div class="${wasRejected ? "err-box" : "ok-box"}"><div class="icon">${wasRejected ? "✕" : "✓"}</div>
            <p>Purchase Order <strong>${po.PO_ID}</strong> has already been ${wasRejected ? "rejected" : "acknowledged"}. This action cannot be changed via this link.</p>
            <p style="margin-top:8px;font-size:12px;color:#475569;">For queries: <a href="mailto:apps@crystalgroup.com">apps@crystalgroup.com</a></p>
          </div>
        </div>
        <div class="footer">Crystal Group Integrated Procurement System</div>
      </div>`),
      { status: 200, headers: { "Content-Type": "text/html" } }
    );
  }

  // Cancelled
  if (po.STATUS === "CANCELLED") {
    return new NextResponse(
      htmlShell("PO Cancelled", `<div class="card">
        <div class="hdr" style="background:#dc2626;"><div class="brand">Crystal Group · Procurement</div><h1>Order Cancelled</h1></div>
        <div class="body"><div class="err-box"><p>Purchase Order <strong>${po.PO_ID}</strong> has been cancelled. Contact <a href="mailto:apps@crystalgroup.com">apps@crystalgroup.com</a>.</p></div></div>
        <div class="footer">Crystal Group Integrated Procurement System</div>
      </div>`),
      { status: 200, headers: { "Content-Type": "text/html" } }
    );
  }

  // ── Build page ──────────────────────────────────────────────────────────────
  // For SPR-sourced POs created before the fix, sheet totals may be ₹0 — fall back to synthesized lines
  const computedSubtotal = lines.reduce((s, l) => s + parseFloat(l.LINE_AMOUNT_BEFORE_GST ?? "0"), 0);
  const computedGst      = lines.reduce((s, l) => s + parseFloat(l.GST_AMOUNT ?? "0"), 0);
  const subtotal   = (parseFloat(po.SUBTOTAL ?? "0") || 0) || computedSubtotal;
  const totalGst   = (parseFloat(po.TOTAL_GST ?? "0") || 0) || computedGst;
  const freight    = parseFloat(po.FREIGHT_CHARGES ?? "0") || 0;
  const install    = parseFloat(po.INSTALLATION_CHARGES ?? "0") || 0;
  const grandTotal = (parseFloat(po.GRAND_TOTAL ?? "0") || 0) || (subtotal + totalGst + freight + install);
  const advancePct = parseFloat(po.ADVANCE_PAYMENT_PCT ?? "0") || 0;
  const advanceAmt = parseFloat(po.ADVANCE_AMOUNT ?? "0") || 0;

  const lineRowsHtml = lines.map((l, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><strong>${l.ITEM_DESCRIPTION || l.ITEM_NAME || "—"}</strong>${l.HSN_SAC_CODE ? `<br><span style="font-size:11px;color:#64748b;">HSN/SAC: ${l.HSN_SAC_CODE}</span>` : ""}</td>
      <td class="tr">${l.ORDERED_QTY ?? "—"} ${l.UNIT_OF_MEASURE ?? ""}</td>
      <td class="tr">${fmtAmt(l.RATE)}</td>
      <td class="tr">${l.GST_PERCENT ?? "0"}%</td>
      <td class="tr">${fmtAmt(l.LINE_AMOUNT_BEFORE_GST)}</td>
      <td class="tr">${fmtAmt(l.GST_AMOUNT)}</td>
      <td class="tr" style="font-weight:700;">${fmtAmt(l.LINE_TOTAL)}</td>
    </tr>`).join("");

  const specialTerms = po.TC_CUSTOMISATION_NOTES || po.SPECIAL_COMMERCIAL_TERMS || "";

  const body = `
    <div class="card" id="po-content">
      <div class="hdr">
        <div class="brand">Crystal Group · Procurement</div>
        <h1>Purchase Order #${po.PO_ID}</h1>
        <p>Please review the complete order details and payment terms below, then acknowledge using the button at the bottom.</p>
      </div>
      <div class="body">

        <div class="sec-title">Order Details</div>
        <div class="meta-grid">
          <div class="item"><div class="lbl">PO Number</div><div class="val">${po.PO_ID}</div></div>
          <div class="item"><div class="lbl">PO Date</div><div class="val">${fmtDate(po.PO_DATE)}</div></div>
          <div class="item"><div class="lbl">Vendor</div><div class="val">${po.VENDOR_NAME ?? "—"}</div></div>
          <div class="item"><div class="lbl">Tally PO Number</div><div class="val">${po.TALLY_PO_NUMBER || "—"}</div></div>
          <div class="item"><div class="lbl">Delivery Date</div><div class="val">${fmtDate(po.DELIVERY_DATE)}</div></div>
          <div class="item"><div class="lbl">Delivery Location</div><div class="val">${po.DELIVERY_LOCATION || "—"}</div></div>
        </div>

        <div class="sec-title">Scope of Supply / Services</div>
        <table>
          <thead>
            <tr>
              <th style="width:32px;">#</th>
              <th>Item / Description</th>
              <th class="tr" style="width:80px;">Qty</th>
              <th class="tr" style="width:90px;">Rate</th>
              <th class="tr" style="width:52px;">GST</th>
              <th class="tr" style="width:100px;">Amt (pre-GST)</th>
              <th class="tr" style="width:90px;">GST Amt</th>
              <th class="tr" style="width:100px;">Line Total</th>
            </tr>
          </thead>
          <tbody>
            ${lineRowsHtml || `<tr><td colspan="8" style="text-align:center;color:#94a3b8;padding:16px;">No line items</td></tr>`}
          </tbody>
          <tfoot>
            <tr><td colspan="5" style="text-align:right;">Sub-Total (before GST)</td><td class="tr">${fmtAmt(subtotal)}</td><td class="tr">${fmtAmt(totalGst)}</td><td class="tr">—</td></tr>
            ${freight > 0 ? `<tr><td colspan="7" style="text-align:right;">Freight Charges</td><td class="tr">${fmtAmt(freight)}</td></tr>` : ""}
            ${install > 0 ? `<tr><td colspan="7" style="text-align:right;">Installation Charges</td><td class="tr">${fmtAmt(install)}</td></tr>` : ""}
            <tr class="grand"><td colspan="7" style="text-align:right;font-size:14px;">Grand Total (incl. GST)</td><td class="tr" style="font-size:14px;">${fmtAmt(grandTotal)}</td></tr>
          </tfoot>
        </table>

        <div class="sec-title">Payment &amp; Commercial Terms</div>
        <div class="meta-grid">
          <div class="item"><div class="lbl">Payment Terms</div><div class="val">${po.PAYMENT_TERMS || "Standard"}</div></div>
          <div class="item"><div class="lbl">Advance Payment</div><div class="val">${advancePct > 0 ? `${advancePct}% — ${fmtAmt(advanceAmt)}` : "None"}</div></div>
        </div>

        ${specialTerms ? `
        <div class="sec-title">Special Commercial Terms</div>
        <div class="special-box">${specialTerms}</div>` : ""}

        <div class="sec-title">Standard Terms &amp; Conditions</div>
        <div class="tc-box">
          <ol>
            <li>All materials / services must conform to the specifications agreed upon.</li>
            <li>Delivery must be completed by the specified delivery date. LD clauses apply for delays unless caused by Force Majeure.</li>
            <li>Quality Assurance certificate and test reports must accompany each shipment.</li>
            <li>Invoices to be raised only after GRN / SRN confirmation. All invoices must carry the PO number and Tally PO number.</li>
            <li>GST: Vendor must ensure accurate GST charging and timely return filing for ITC eligibility.</li>
            <li>Warranty: Minimum 12 months from date of installation / commissioning unless otherwise specified.</li>
            <li>Dispute Resolution: Disputes shall be resolved amicably or through arbitration under Kolkata jurisdiction.</li>
            <li>Force Majeure: Neither party shall be liable for delays caused by events beyond their reasonable control.</li>
          </ol>
        </div>

        <div class="ack-box">
          <p>
            By clicking <strong>"Acknowledge Purchase Order"</strong> you confirm that you have received and reviewed
            Purchase Order <strong>#${po.PO_ID}</strong>, including all line items, payment terms, and conditions stated above,
            and agree to fulfil the order accordingly.
          </p>
          <div class="btn-row no-print">
            <form method="POST" action="/api/po/${po.PO_ID}/vendor-ack" style="display:inline;">
              <input type="hidden" name="action" value="ACKNOWLEDGE">
              <button type="submit" class="ack-btn">✓ &nbsp;Acknowledge Purchase Order</button>
            </form>
            <a href="/api/po/${po.PO_ID}/document" target="_blank" class="print-btn">⬇ &nbsp;Download / Print PDF</a>
          </div>
        </div>

        <div class="no-print" style="margin-top:12px;background:#fff7ed;border:1px solid #fdba74;border-radius:6px;padding:16px 20px;">
          <p style="font-size:12px;color:#9a3412;font-weight:700;margin-bottom:8px;">Unable to fulfil this order?</p>
          <form method="POST" action="/api/po/${po.PO_ID}/vendor-ack" id="reject-form" style="display:none;">
            <input type="hidden" name="action" value="VENDOR_REJECT">
            <textarea name="remarks" rows="3" placeholder="Please state the reason for rejection (required)…"
              style="width:100%;border:1px solid #fca5a5;border-radius:4px;padding:8px 10px;font-size:13px;resize:vertical;margin-bottom:8px;" required></textarea>
            <div style="display:flex;gap:10px;align-items:center;">
              <button type="submit" style="background:#dc2626;color:#fff;border:none;padding:10px 22px;border-radius:4px;font-weight:700;font-size:13px;cursor:pointer;">Confirm Rejection</button>
              <button type="button" onclick="document.getElementById('reject-form').style.display='none';document.getElementById('reject-btn').style.display='inline-block';"
                style="background:none;border:none;color:#64748b;font-size:12px;cursor:pointer;text-decoration:underline;">Cancel</button>
            </div>
          </form>
          <button id="reject-btn" type="button" onclick="document.getElementById('reject-form').style.display='block';this.style.display='none';"
            style="background:#dc2626;color:#fff;border:none;padding:9px 20px;border-radius:4px;font-weight:600;font-size:13px;cursor:pointer;">✕ &nbsp;Reject this PO</button>
        </div>

        <p style="font-size:12px;color:#64748b;margin-top:8px;">
          For queries regarding this order, contact our Procurement Team at
          <a href="mailto:apps@crystalgroup.com">apps@crystalgroup.com</a>.
        </p>
      </div>
      <div class="footer">
        Crystal Group Integrated Procurement System &nbsp;·&nbsp;
        PO: ${po.PO_ID} &nbsp;·&nbsp; Vendor: ${po.VENDOR_NAME ?? "—"} &nbsp;·&nbsp;
        <a href="mailto:apps@crystalgroup.com">apps@crystalgroup.com</a>
      </div>
    </div>`;

  return new NextResponse(htmlShell(`PO ${po.PO_ID} — Review & Acknowledge`, body), {
    status: 200,
    headers: { "Content-Type": "text/html" },
  });
}

// ── POST — vendor explicitly acknowledges ────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Parse form data (HTML forms POST as application/x-www-form-urlencoded)
  const formData = await req.formData().catch(() => new FormData());
  const action  = (formData.get("action") as string | null) ?? "ACKNOWLEDGE";
  const remarks = (formData.get("remarks") as string | null) ?? "";

  const rows = await readSheet("PO");
  const po   = rows.find((r) => r.PO_ID === id);

  if (!po) {
    return new NextResponse(
      htmlShell("Invalid Link", `<div class="card">
        <div class="hdr" style="background:#dc2626;"><div class="brand">Crystal Group · Procurement</div><h1>Link Not Valid</h1></div>
        <div class="body"><div class="err-box"><p>Purchase Order not found.</p></div></div>
        <div class="footer">Crystal Group Integrated Procurement System</div>
      </div>`),
      { status: 404, headers: { "Content-Type": "text/html" } }
    );
  }

  // Already actioned — block re-acknowledgment or re-rejection for any terminal state
  const TERMINAL_ACK_STATUSES_P = ["ACKNOWLEDGED", "VENDOR_REJECTED"];
  const POST_ACK_PO_STATUSES_P  = ["ACKNOWLEDGED", "ACCEPTED", "GRN_SUBMITTED", "PARTIALLY_RECEIVED", "FULLY_RECEIVED", "CLOSED", "VENDOR_REJECTED"];
  if (TERMINAL_ACK_STATUSES_P.includes(po.ACK_STATUS) || POST_ACK_PO_STATUSES_P.includes(po.STATUS)) {
    const wasRejected = po.ACK_STATUS === "VENDOR_REJECTED" || po.STATUS === "VENDOR_REJECTED";
    return new NextResponse(
      htmlShell(wasRejected ? "Already Rejected" : "Already Acknowledged", `<div class="card">
        <div class="hdr" style="background:${wasRejected ? "#dc2626" : "#166534"};"><div class="brand">Crystal Group · Procurement</div><h1>Already ${wasRejected ? "Rejected" : "Acknowledged"}</h1></div>
        <div class="body">
          <div class="${wasRejected ? "err-box" : "ok-box"}"><div class="icon">${wasRejected ? "✕" : "✓"}</div>
            <p>Purchase Order <strong>${po.PO_ID}</strong> has already been ${wasRejected ? "rejected" : "acknowledged"}. This action cannot be changed via this link.</p>
            <p style="margin-top:8px;font-size:12px;color:#475569;">For queries: <a href="mailto:apps@crystalgroup.com">apps@crystalgroup.com</a></p>
          </div>
        </div>
        <div class="footer">Crystal Group Integrated Procurement System</div>
      </div>`),
      { status: 200, headers: { "Content-Type": "text/html" } }
    );
  }

  if (po.STATUS === "CANCELLED") {
    return new NextResponse(
      htmlShell("PO Cancelled", `<div class="card">
        <div class="hdr" style="background:#dc2626;"><div class="brand">Crystal Group · Procurement</div><h1>Order Cancelled</h1></div>
        <div class="body"><div class="err-box"><p>PO <strong>${po.PO_ID}</strong> is cancelled.</p></div></div>
        <div class="footer">Crystal Group Integrated Procurement System</div>
      </div>`),
      { status: 200, headers: { "Content-Type": "text/html" } }
    );
  }

  // ── F-01: Vendor rejection ──────────────────────────────────────────────────
  if (action === "VENDOR_REJECT") {
    if (!remarks.trim()) {
      return new NextResponse(
        htmlShell("Rejection Reason Required", `<div class="card">
          <div class="hdr" style="background:#dc2626;"><div class="brand">Crystal Group · Procurement</div><h1>Rejection Reason Required</h1></div>
          <div class="body"><div class="err-box"><p>A rejection reason is required. Please go back and enter your reason before confirming.</p>
          <p style="margin-top:10px;"><a href="javascript:history.back()" style="color:#7f1d1d;font-weight:600;">← Go back</a></p></div></div>
          <div class="footer">Crystal Group Integrated Procurement System</div>
        </div>`),
        { status: 400, headers: { "Content-Type": "text/html" } }
      );
    }
    const now = new Date().toISOString();
    await updateRowWhere("PO", "PO_ID", id, {
      ACK_STATUS:        "VENDOR_REJECTED",
      ACK_REMARKS:       remarks,
      ACK_DATE:          now,
      STATUS:            "VENDOR_REJECTED",
      LAST_UPDATED_BY:   po.VENDOR_NAME ?? "VENDOR",
      LAST_UPDATED_DATE: now,
    });
    await writeAuditLog({
      userId:   po.VENDOR_ID ?? "VENDOR",
      userName: po.VENDOR_NAME ?? "",
      module:   "PO",
      recordId: id,
      action:   "VENDOR_REJECT",
      remarks,
    });
    return new NextResponse(
      htmlShell("PO Rejected", `<div class="card">
        <div class="hdr" style="background:#dc2626;"><div class="brand">Crystal Group · Procurement</div><h1>Purchase Order Rejected</h1></div>
        <div class="body">
          <div class="err-box" style="padding:20px 24px;">
            <div style="font-size:32px;margin-bottom:12px;">✕</div>
            <p style="font-size:14px;font-weight:700;margin-bottom:6px;">PO #${po.PO_ID} has been rejected.</p>
            <p style="font-size:13px;margin-bottom:4px;"><strong>Reason:</strong> ${remarks}</p>
            <p style="font-size:12px;margin-top:12px;color:#6b7280;">Our Procurement Team has been notified.
            For queries: <a href="mailto:apps@crystalgroup.com">apps@crystalgroup.com</a></p>
          </div>
        </div>
        <div class="footer">Crystal Group Integrated Procurement System</div>
      </div>`),
      { status: 200, headers: { "Content-Type": "text/html" } }
    );
  }

  // ── Default: acknowledge ────────────────────────────────────────────────────
  const now = new Date().toISOString();
  await updateRowWhere("PO", "PO_ID", id, {
    ACK_STATUS:        "ACKNOWLEDGED",
    ACK_TIMESTAMP:     now,
    ACK_METHOD:        "EMAIL_LINK",
    STATUS:            "ACKNOWLEDGED",
    LAST_UPDATED_BY:   po.VENDOR_NAME ?? "VENDOR",
    LAST_UPDATED_DATE: now,
  });

  await writeAuditLog({
    userId:   po.VENDOR_ID ?? "VENDOR",
    userName: po.VENDOR_NAME ?? "",
    module:   "PO",
    recordId: id,
    action:   "PO_ACKNOWLEDGED",
    remarks:  "Via email link — explicit confirm",
  });

  let grandTotal = parseFloat(po.GRAND_TOTAL ?? po.TOTAL_AMOUNT_WITH_GST ?? "0");
  // For SPR-sourced POs created before the fix, GRAND_TOTAL may be ₹0 — compute from SPR
  if (!grandTotal && (po.PO_TYPE === "SPR" || po.SOURCE_PR_TYPE === "SPR") && po.SOURCE_PR_ID) {
    const sprRows = await readSheet("SPR");
    const spr     = sprRows.find((s) => s.SPR_ID === po.SOURCE_PR_ID);
    if (spr) {
      const qty  = parseFloat(String(spr.QUANTITY ?? "1"));
      const rate = parseFloat(String(spr.RATE ?? "0"));
      const gst  = parseFloat(String(spr.GST_PERCENT ?? "0"));
      const base = qty * rate;
      grandTotal = base + (base * gst) / 100;
    }
  }

  return new NextResponse(
    htmlShell("PO Acknowledged", `<div class="card">
      <div class="hdr" style="background:#166534;"><div class="brand">Crystal Group · Procurement</div><h1>Purchase Order Acknowledged</h1></div>
      <div class="body">
        <div class="ok-box">
          <div class="icon">✓</div>
          <p>Thank you! Your acknowledgement for Purchase Order <strong>#${po.PO_ID}</strong> has been recorded.</p>
        </div>
        <div class="meta-grid" style="margin-top:16px;">
          <div class="item"><div class="lbl">PO Number</div><div class="val">${po.PO_ID}</div></div>
          <div class="item"><div class="lbl">Vendor</div><div class="val">${po.VENDOR_NAME ?? "—"}</div></div>
          <div class="item"><div class="lbl">Grand Total</div><div class="val">${fmtAmt(grandTotal)}</div></div>
          <div class="item"><div class="lbl">Delivery Date</div><div class="val">${fmtDate(po.DELIVERY_DATE)}</div></div>
        </div>
        <p style="font-size:13px;color:#475569;margin-top:16px;line-height:1.7;">
          Our Procurement Team will be in touch shortly. For queries contact
          <a href="mailto:apps@crystalgroup.com">apps@crystalgroup.com</a>.
        </p>
      </div>
      <div class="footer">Crystal Group Integrated Procurement System &nbsp;·&nbsp; <a href="mailto:apps@crystalgroup.com">apps@crystalgroup.com</a></div>
    </div>`),
    { status: 200, headers: { "Content-Type": "text/html" } }
  );
}
