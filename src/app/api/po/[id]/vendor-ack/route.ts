/**
 * GET /api/po/[id]/vendor-ack
 *
 * Public endpoint — vendors click this link from the PO dispatch email.
 * Marks the PO as ACKNOWLEDGED and returns a branded HTML confirmation page.
 * No authentication required (vendor-facing).
 */

import { NextRequest, NextResponse } from "next/server";
import { readSheet, updateRowWhere, writeAuditLog } from "@/lib/sheets";
import { fmtDate } from "@/lib/utils";

function htmlPage(title: string, heading: string, body: string, isError = false) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} — Crystal Group</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Arial, sans-serif;
      background: #f1f5f9;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .card {
      background: #ffffff;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
      max-width: 520px;
      width: 100%;
      overflow: hidden;
      box-shadow: 0 4px 16px rgba(0,0,0,0.08);
    }
    .header {
      background: ${isError ? "#dc2626" : "#166534"};
      color: #fff;
      padding: 24px 32px;
    }
    .header .brand {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      opacity: 0.8;
      margin-bottom: 8px;
    }
    .header h1 {
      font-size: 22px;
      font-weight: 700;
    }
    .body {
      padding: 28px 32px;
      color: #1e293b;
    }
    .icon {
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: ${isError ? "#fef2f2" : "#f0fdf4"};
      border: 2px solid ${isError ? "#fca5a5" : "#86efac"};
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 28px;
      margin-bottom: 20px;
    }
    .body p {
      font-size: 14px;
      color: #475569;
      line-height: 1.7;
      margin-bottom: 10px;
    }
    .po-box {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 14px 18px;
      margin: 18px 0;
      font-size: 13px;
      color: #334155;
    }
    .po-box strong { color: #1e293b; }
    .footer {
      background: #f8fafc;
      border-top: 1px solid #e2e8f0;
      padding: 14px 32px;
      font-size: 11px;
      color: #94a3b8;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div class="brand">Crystal Group · Procurement</div>
      <h1>${heading}</h1>
    </div>
    <div class="body">
      <div class="icon">${isError ? "⚠" : "✓"}</div>
      ${body}
    </div>
    <div class="footer">
      Crystal Group Integrated Procurement System &nbsp;·&nbsp;
      For queries contact <a href="mailto:apps@crystalgroup.com">apps@crystalgroup.com</a>
    </div>
  </div>
</body>
</html>`;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const rows = await readSheet("PO");
  const po   = rows.find((r) => r.PO_ID === id);

  // PO not found
  if (!po) {
    return new NextResponse(
      htmlPage(
        "Invalid Link",
        "Link Not Valid",
        `<p>This acknowledgement link is invalid or the Purchase Order could not be found.</p>
         <p>Please contact our Procurement Team at <a href="mailto:apps@crystalgroup.com">apps@crystalgroup.com</a> for assistance.</p>`,
        true
      ),
      { status: 404, headers: { "Content-Type": "text/html" } }
    );
  }

  // Already acknowledged
  if (po.ACK_STATUS === "ACKNOWLEDGED" || po.STATUS === "ACKNOWLEDGED" || po.STATUS === "ACCEPTED") {
    return new NextResponse(
      htmlPage(
        "Already Acknowledged",
        "Already Acknowledged",
        `<div class="po-box">
           <strong>PO Number:</strong> ${po.PO_ID}<br>
           <strong>Vendor:</strong> ${po.VENDOR_NAME ?? "—"}<br>
           <strong>Total Value:</strong> ₹${parseFloat(po.GRAND_TOTAL ?? "0").toLocaleString("en-IN", { minimumFractionDigits: 2 })}<br>
           <strong>Delivery Date:</strong> ${fmtDate(po.DELIVERY_DATE)}
         </div>
         <p>This Purchase Order has already been acknowledged. No further action is needed.</p>
         <p>If you have questions about your order, please contact us at <a href="mailto:apps@crystalgroup.com">apps@crystalgroup.com</a>.</p>`
      ),
      { status: 200, headers: { "Content-Type": "text/html" } }
    );
  }

  // PO cancelled — can't acknowledge
  if (po.STATUS === "CANCELLED") {
    return new NextResponse(
      htmlPage(
        "PO Cancelled",
        "Order Cancelled",
        `<p>Purchase Order <strong>${po.PO_ID}</strong> has been cancelled and no longer requires acknowledgement.</p>
         <p>Please contact us at <a href="mailto:apps@crystalgroup.com">apps@crystalgroup.com</a> if you have questions.</p>`,
        true
      ),
      { status: 200, headers: { "Content-Type": "text/html" } }
    );
  }

  // Mark as ACKNOWLEDGED
  const now = new Date().toISOString();
  await updateRowWhere("PO", "PO_ID", id, {
    ACK_STATUS:        "ACKNOWLEDGED",
    ACK_TIMESTAMP:     now,
    ACK_METHOD:        "EMAIL_LINK",
    STATUS:            "ACKNOWLEDGED",
    LAST_UPDATED_BY:   po.VENDOR_NAME ?? "VENDOR",
    LAST_UPDATED_DATE: now,
  });

  await writeAuditLog({ userId: po.VENDOR_ID ?? "VENDOR", userName: po.VENDOR_NAME ?? "", module: "PO", recordId: id, action: "PO_ACKNOWLEDGED", remarks: "Via email link" });

  return new NextResponse(
    htmlPage(
      "PO Acknowledged",
      "Purchase Order Acknowledged",
      `<p>Thank you for acknowledging Purchase Order <strong>${po.PO_ID}</strong>. Your acknowledgement has been recorded.</p>
       <div class="po-box">
         <strong>PO Number:</strong> ${po.PO_ID}<br>
         <strong>Vendor:</strong> ${po.VENDOR_NAME ?? "—"}<br>
         <strong>Total Value:</strong> ₹${parseFloat(po.GRAND_TOTAL ?? "0").toLocaleString("en-IN", { minimumFractionDigits: 2 })}<br>
         <strong>Delivery Date:</strong> ${fmtDate(po.DELIVERY_DATE)}<br>
         <strong>Delivery Location:</strong> ${po.DELIVERY_LOCATION ?? "—"}
       </div>
       <p><strong>Next step:</strong> Please review and formally accept this order to confirm your intent to fulfil delivery as per the agreed terms.</p>
       <p>Our Procurement Team will be in touch shortly. For any queries, contact us at <a href="mailto:apps@crystalgroup.com">apps@crystalgroup.com</a>.</p>`
    ),
    { status: 200, headers: { "Content-Type": "text/html" } }
  );
}
