/**
 * Crystal Group — Email Utility
 *
 * Sender: Crystal Group Procurement <apps@crystalgroup.com>
 *
 * Templates implemented:
 *   1. sendPoDispatch            — on PO creation (auto)
 *   2. sendPoAckReminder         — when vendor hasn't acknowledged in 2 working days (cron)
 *   3. sendPoAcceptanceConfirm   — when vendor formally accepts the PO (auto)
 *   4. sendPoAmendmentReissue    — when an amended PO is re-issued to vendor (SOP §6.3)
 */

import nodemailer from "nodemailer";

// ── Transporter ───────────────────────────────────────────────────────────────

function createTransporter() {
  return nodemailer.createTransport({
    host:   process.env.SMTP_HOST   ?? "smtp.gmail.com",
    port:   parseInt(process.env.SMTP_PORT ?? "587"),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER ?? "",
      pass: process.env.SMTP_PASS ?? "",
    },
  });
}

const FROM = "Crystal Group Procurement <apps@crystalgroup.com>";
const PROCUREMENT_EMAIL = process.env.PROCUREMENT_EMAIL ?? "apps@crystalgroup.com";
const WAREHOUSE_EMAIL   = process.env.WAREHOUSE_EMAIL   ?? "warehouse@crystalgroup.com";
const APP_BASE_URL      = process.env.NEXT_PUBLIC_APP_URL ?? "https://procurement.crystalgroup.com";

// ── Helper ────────────────────────────────────────────────────────────────────

function fmt(date: string) {
  if (!date) return "—";
  const d = new Date(date);
  if (isNaN(d.getTime())) return date;
  const day   = String(d.getDate()).padStart(2, "0");
  const month = d.toLocaleString("en-IN", { month: "short" });
  return `${day} - ${month} - ${d.getFullYear()}`;
}

function fmtAmount(val: string | number) {
  const n = typeof val === "string" ? parseFloat(val) : val;
  if (isNaN(n)) return "—";
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2 });
}

// ── Type ──────────────────────────────────────────────────────────────────────

export interface POLineEmailItem {
  itemDescription: string;
  qty:             string | number;
  uom:             string;
  rate:            string | number;
  gstPercent:      string | number;
  lineTotal:       string | number;
}

export interface POEmailContext {
  poId:              string;
  poDate:            string;
  totalAmount:       string | number;
  deliveryDate:      string;
  deliveryLocation:  string;
  vendorContactName: string;
  vendorEmail:       string;
  procurementOfficerName: string;
  paymentTerms?:     string;
  advancePercent?:   string | number;
  advanceAmount?:    string | number;
  specialTerms?:     string;
  lines?:            POLineEmailItem[];
}

// ── Line items table helper ───────────────────────────────────────────────────

function buildLineTable(lines: POLineEmailItem[]): string {
  if (!lines || lines.length === 0) return "";
  const rows = lines.map((l, i) => `
    <tr style="background:${i % 2 === 0 ? "#ffffff" : "#f8fafc"}; border-bottom:1px solid #e2e8f0;">
      <td style="padding:8px 10px;">${i + 1}</td>
      <td style="padding:8px 10px;">${l.itemDescription || "—"}</td>
      <td style="padding:8px 10px;text-align:right;">${l.qty} ${l.uom}</td>
      <td style="padding:8px 10px;text-align:right;">₹${fmtAmount(l.rate)}</td>
      <td style="padding:8px 10px;text-align:right;">${l.gstPercent}%</td>
      <td style="padding:8px 10px;text-align:right;font-weight:600;">₹${fmtAmount(l.lineTotal)}</td>
    </tr>`).join("");
  return `
    <p style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#64748b;margin:20px 0 8px;">Line Items</p>
    <table style="width:100%;border-collapse:collapse;font-size:12px;">
      <thead>
        <tr style="background:#1a1a2e;color:#fff;">
          <th style="padding:8px 10px;text-align:left;font-weight:600;width:30px;">#</th>
          <th style="padding:8px 10px;text-align:left;font-weight:600;">Description</th>
          <th style="padding:8px 10px;text-align:right;font-weight:600;">Qty</th>
          <th style="padding:8px 10px;text-align:right;font-weight:600;">Rate</th>
          <th style="padding:8px 10px;text-align:right;font-weight:600;">GST</th>
          <th style="padding:8px 10px;text-align:right;font-weight:600;">Total</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// ── 1. PO Dispatch to Vendor ──────────────────────────────────────────────────
// Sent automatically when a PO is generated and ready for vendor acknowledgement.

export async function sendPoDispatch(ctx: POEmailContext): Promise<void> {
  if (!ctx.vendorEmail) return;

  const ackLink = `${APP_BASE_URL}/api/po/${ctx.poId}/vendor-ack`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; font-size: 14px; color: #1a1a2e; background: #f5f7fa; margin: 0; padding: 0; }
    .wrapper { max-width: 620px; margin: 30px auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 4px; overflow: hidden; }
    .header { background: #1a1a2e; color: #ffffff; padding: 20px 30px; }
    .header h1 { margin: 0; font-size: 18px; font-weight: 700; letter-spacing: 0.5px; }
    .header p { margin: 4px 0 0; font-size: 12px; color: #94a3b8; }
    .body { padding: 28px 30px; }
    .summary-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; padding: 16px 20px; margin: 20px 0; }
    .summary-box p { margin: 5px 0; font-size: 13px; }
    .summary-box strong { color: #1a1a2e; }
    .label { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; }
    .ack-btn { display: inline-block; margin: 20px 0; background: #1a1a2e; color: #ffffff !important; text-decoration: none; padding: 12px 28px; border-radius: 4px; font-weight: 700; font-size: 13px; letter-spacing: 0.3px; }
    .note { background: #fffbeb; border-left: 4px solid #f59e0b; padding: 10px 14px; margin: 20px 0; font-size: 12px; color: #92400e; }
    .footer { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px 30px; font-size: 11px; color: #94a3b8; }
    .footer strong { color: #64748b; }
  </style>
</head>
<body>
<div class="wrapper">
  <div class="header">
    <h1>Crystal Group</h1>
    <p>Purchase Order Notification</p>
  </div>
  <div class="body">
    <p>Dear ${ctx.vendorContactName},</p>
    <p>
      Please find attached Purchase Order No. <strong>${ctx.poId}</strong> dated <strong>${fmt(ctx.poDate)}</strong>
      for the supply of materials/services as detailed herein.
    </p>

    <div class="summary-box">
      <p class="label">Order Summary</p>
      <p>• <strong>PO Number:</strong> ${ctx.poId}</p>
      <p>• <strong>Total Value:</strong> ₹${fmtAmount(ctx.totalAmount)} (inclusive of GST)</p>
      <p>• <strong>Delivery Date:</strong> ${fmt(ctx.deliveryDate)}</p>
      <p>• <strong>Delivery Location:</strong> ${ctx.deliveryLocation || "—"}</p>
    </div>

    ${buildLineTable(ctx.lines ?? [])}

    <p style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#64748b;margin:20px 0 8px;">Payment &amp; Commercial Terms</p>
    <div class="summary-box" style="margin:0;">
      <p>• <strong>Payment Terms:</strong> ${ctx.paymentTerms || "Standard"}</p>
      ${ctx.advancePercent && parseFloat(String(ctx.advancePercent)) > 0
        ? `<p>• <strong>Advance Payment:</strong> ${ctx.advancePercent}% — ₹${fmtAmount(ctx.advanceAmount ?? 0)}</p>`
        : `<p>• <strong>Advance Payment:</strong> None</p>`}
      ${ctx.specialTerms ? `<p>• <strong>Special Terms:</strong> ${ctx.specialTerms}</p>` : ""}
    </div>

    <p style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#64748b;margin:20px 0 8px;">Standard Terms &amp; Conditions</p>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:4px;padding:12px 16px;font-size:11px;line-height:1.7;color:#475569;">
      <ol style="margin:0;padding-left:18px;">
        <li>All materials / services must conform to the specifications agreed upon.</li>
        <li>Delivery must be completed by the specified date. LD clauses apply for delays unless caused by Force Majeure.</li>
        <li>Quality Assurance certificate and test reports must accompany each shipment.</li>
        <li>Invoices to be raised only after GRN / SRN confirmation. All invoices must carry the PO and Tally PO number.</li>
        <li>GST: Vendor must ensure accurate GST charging and timely return filing for ITC eligibility.</li>
        <li>Warranty: Minimum 12 months from date of installation / commissioning unless otherwise specified.</li>
        <li>Disputes shall be resolved under Kolkata jurisdiction.</li>
      </ol>
    </div>

    <p style="margin-top:20px;"><strong>Required Actions:</strong></p>
    <ol style="font-size:13px; line-height:1.8;">
      <li>Review the order details above carefully.</li>
      <li>Click the button below within <strong>2 working days</strong> to acknowledge receipt.</li>
      <li>Confirm your acceptance to proceed with delivery.</li>
    </ol>

    <a href="${ackLink}" class="ack-btn">Review &amp; Acknowledge PO</a>

    <div class="note">
      Note: Delivery and advance payment (if applicable) will only be processed after your formal acceptance.
    </div>

    <p>
      For any queries regarding this order, please contact our Procurement Team at
      <a href="mailto:${PROCUREMENT_EMAIL}">${PROCUREMENT_EMAIL}</a>.
    </p>

    <p>
      Regards,<br>
      <strong>${ctx.procurementOfficerName}</strong><br>
      Procurement Team<br>
      Crystal Group
    </p>
  </div>
  <div class="footer">
    <strong>Crystal Group Integrated Procurement System</strong> — This is an automated notification.
    Do not reply to this email. Contact <a href="mailto:${PROCUREMENT_EMAIL}">${PROCUREMENT_EMAIL}</a> for assistance.
  </div>
</div>
</body>
</html>`;

  const transporter = createTransporter();
  await transporter.sendMail({
    from:    FROM,
    to:      ctx.vendorEmail,
    subject: `Purchase Order #${ctx.poId} from Crystal Group — Action Required`,
    html,
  });
}

// ── 2. Vendor Acknowledgement Reminder ───────────────────────────────────────
// Sent by cron when vendor has not acknowledged the PO within 2 working days.
// isUrgent = true after 4+ working days (escalation tone).

export async function sendPoAckReminder(
  ctx: POEmailContext,
  isUrgent = false
): Promise<void> {
  if (!ctx.vendorEmail) return;

  const ackLink = `${APP_BASE_URL}/api/po/${ctx.poId}/vendor-ack`;

  const html = isUrgent ? `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; font-size: 14px; color: #1a1a2e; background: #f5f7fa; margin: 0; padding: 0; }
    .wrapper { max-width: 620px; margin: 30px auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 4px; overflow: hidden; }
    .header { background: #dc2626; color: #ffffff; padding: 20px 30px; }
    .header h1 { margin: 0; font-size: 18px; font-weight: 700; }
    .header p { margin: 4px 0 0; font-size: 12px; color: #fecaca; }
    .body { padding: 28px 30px; }
    .urgent-box { background: #fef2f2; border: 1px solid #fca5a5; border-radius: 4px; padding: 14px 18px; margin: 16px 0; font-size: 13px; }
    .ack-btn { display: inline-block; margin: 20px 0; background: #dc2626; color: #ffffff !important; text-decoration: none; padding: 12px 28px; border-radius: 4px; font-weight: 700; font-size: 13px; }
    .footer { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px 30px; font-size: 11px; color: #94a3b8; }
  </style>
</head>
<body>
<div class="wrapper">
  <div class="header">
    <h1>Crystal Group</h1>
    <p>URGENT: Acknowledgement Overdue</p>
  </div>
  <div class="body">
    <p>Dear ${ctx.vendorContactName},</p>

    <div class="urgent-box">
      <strong>⚠ Immediate Action Required</strong><br>
      Our records indicate that Purchase Order <strong>#${ctx.poId}</strong> issued on <strong>${fmt(ctx.poDate)}</strong>
      has not been acknowledged despite the 2-day SLA.
    </div>

    <p>
      Please acknowledge and accept this PO <strong>today</strong> to proceed with the order.
      Continued non-response may result in order cancellation.
    </p>

    <a href="${ackLink}" class="ack-btn">Acknowledge Immediately</a>

    <p>
      If there are concerns with the order terms, please contact us immediately at
      <a href="mailto:${PROCUREMENT_EMAIL}">${PROCUREMENT_EMAIL}</a>.
    </p>

    <p>
      Regards,<br>
      <strong>${ctx.procurementOfficerName}</strong><br>
      Procurement Head, Crystal Group
    </p>
  </div>
  <div class="footer">Crystal Group Integrated Procurement System — Automated Reminder</div>
</div>
</body>
</html>` : `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; font-size: 14px; color: #1a1a2e; background: #f5f7fa; margin: 0; padding: 0; }
    .wrapper { max-width: 620px; margin: 30px auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 4px; overflow: hidden; }
    .header { background: #1a1a2e; color: #ffffff; padding: 20px 30px; }
    .header h1 { margin: 0; font-size: 18px; font-weight: 700; }
    .header p { margin: 4px 0 0; font-size: 12px; color: #94a3b8; }
    .body { padding: 28px 30px; }
    .info-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; padding: 14px 18px; margin: 16px 0; font-size: 13px; }
    .ack-btn { display: inline-block; margin: 20px 0; background: #1a1a2e; color: #ffffff !important; text-decoration: none; padding: 12px 28px; border-radius: 4px; font-weight: 700; font-size: 13px; }
    .footer { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px 30px; font-size: 11px; color: #94a3b8; }
  </style>
</head>
<body>
<div class="wrapper">
  <div class="header">
    <h1>Crystal Group</h1>
    <p>Acknowledgement Reminder</p>
  </div>
  <div class="body">
    <p>Dear ${ctx.vendorContactName},</p>
    <p>
      This is a gentle reminder that Purchase Order <strong>#${ctx.poId}</strong> dated <strong>${fmt(ctx.poDate)}</strong>
      is awaiting your acknowledgement.
    </p>

    <div class="info-box">
      As per our process, vendor acknowledgement is required within <strong>2 working days</strong> of PO dispatch.
      Kindly acknowledge at your earliest convenience to avoid any delays in processing.
    </div>

    <a href="${ackLink}" class="ack-btn">Acknowledge PO Now</a>

    <p style="font-size:12px; color:#64748b;">
      If you have already acknowledged this PO, please disregard this message.
    </p>

    <p>
      For assistance, contact: <a href="mailto:${PROCUREMENT_EMAIL}">${PROCUREMENT_EMAIL}</a>
    </p>

    <p>
      Best regards,<br>
      <strong>${ctx.procurementOfficerName}</strong><br>
      Procurement Team, Crystal Group
    </p>
  </div>
  <div class="footer">Crystal Group Integrated Procurement System — Automated Reminder</div>
</div>
</body>
</html>`;

  const subject = isUrgent
    ? `URGENT: PO #${ctx.poId} — Acknowledgement Overdue`
    : `Reminder: PO #${ctx.poId} Awaiting Your Acknowledgement`;

  const transporter = createTransporter();
  await transporter.sendMail({ from: FROM, to: ctx.vendorEmail, subject, html });
}

// ── 3. Vendor Acceptance Confirmation ────────────────────────────────────────
// Sent to vendor after they formally accept the PO.

export async function sendPoAcceptanceConfirm(ctx: POEmailContext): Promise<void> {
  if (!ctx.vendorEmail) return;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; font-size: 14px; color: #1a1a2e; background: #f5f7fa; margin: 0; padding: 0; }
    .wrapper { max-width: 620px; margin: 30px auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 4px; overflow: hidden; }
    .header { background: #166534; color: #ffffff; padding: 20px 30px; }
    .header h1 { margin: 0; font-size: 18px; font-weight: 700; }
    .header p { margin: 4px 0 0; font-size: 12px; color: #bbf7d0; }
    .body { padding: 28px 30px; }
    .confirmed-box { background: #f0fdf4; border: 1px solid #86efac; border-radius: 4px; padding: 16px 20px; margin: 20px 0; }
    .confirmed-box p { margin: 5px 0; font-size: 13px; }
    .next-steps { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; padding: 14px 18px; margin: 16px 0; font-size: 13px; }
    .footer { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px 30px; font-size: 11px; color: #94a3b8; }
  </style>
</head>
<body>
<div class="wrapper">
  <div class="header">
    <h1>Crystal Group</h1>
    <p>PO Acceptance Confirmed ✓</p>
  </div>
  <div class="body">
    <p>Dear ${ctx.vendorContactName},</p>
    <p>
      Thank you for accepting Purchase Order <strong>#${ctx.poId}</strong>.
      Your acceptance has been recorded in our system.
    </p>

    <div class="confirmed-box">
      <p><strong>Order Confirmed</strong></p>
      <p>• <strong>PO Number:</strong> ${ctx.poId}</p>
      <p>• <strong>Total Value:</strong> ₹${fmtAmount(ctx.totalAmount)} (inclusive of GST)</p>
      <p>• <strong>Expected Delivery:</strong> ${fmt(ctx.deliveryDate)}</p>
      <p>• <strong>Delivery Location:</strong> ${ctx.deliveryLocation || "—"}</p>
    </div>

    <div class="next-steps">
      <strong>Next Steps:</strong><br><br>
      1. Please arrange delivery as per the agreed schedule.<br>
      2. Ensure delivery challan, invoice, and test certificates (if applicable) accompany the shipment.<br>
      3. Our Warehouse team will conduct Quality Check &amp; Site Inspection upon arrival.
    </div>

    <p>
      For any delivery coordination, contact our Warehouse at
      <a href="mailto:${WAREHOUSE_EMAIL}">${WAREHOUSE_EMAIL}</a>.
    </p>

    <p>We look forward to receiving your delivery.</p>

    <p>
      Best regards,<br>
      <strong>${ctx.procurementOfficerName}</strong><br>
      Procurement Team, Crystal Group
    </p>
  </div>
  <div class="footer">Crystal Group Integrated Procurement System — Automated Notification</div>
</div>
</body>
</html>`;

  const transporter = createTransporter();
  await transporter.sendMail({
    from:    FROM,
    to:      ctx.vendorEmail,
    subject: `Confirmation: PO #${ctx.poId} Accepted — Next Steps`,
    html,
  });
}

// ── 4. PO Amendment Re-issue to Vendor ───────────────────────────────────────
// Sent when procurement re-issues an amended PO. Vendor must re-acknowledge.

export interface POAmendmentEmailContext extends POEmailContext {
  version:       string | number;
  amendmentType: string;   // "Value Enhancement" | "Timeline Extension" | "Scope Change"
  amendmentReason: string;
}

export async function sendPoAmendmentReissue(ctx: POAmendmentEmailContext): Promise<void> {
  if (!ctx.vendorEmail) return;

  const ackLink = `${APP_BASE_URL}/api/po/${ctx.poId}/vendor-ack`;

  const amendTypeLabel: Record<string, string> = {
    "Value Enhancement": "Order Value Revised",
    "Timeline Extension": "Delivery Date Extended",
    "Scope Change": "Scope / Line Items Changed",
    "Cancellation": "Order Cancellation",
  };
  const changeLabel = amendTypeLabel[ctx.amendmentType] ?? ctx.amendmentType;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; font-size: 14px; color: #1a1a2e; background: #f5f7fa; margin: 0; padding: 0; }
    .wrapper { max-width: 620px; margin: 30px auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 4px; overflow: hidden; }
    .header { background: #92400e; color: #ffffff; padding: 20px 30px; }
    .header h1 { margin: 0; font-size: 18px; font-weight: 700; letter-spacing: 0.5px; }
    .header p { margin: 4px 0 0; font-size: 12px; color: #fde68a; }
    .body { padding: 28px 30px; }
    .amend-box { background: #fffbeb; border: 1px solid #f59e0b; border-radius: 4px; padding: 16px 20px; margin: 20px 0; }
    .amend-box p { margin: 5px 0; font-size: 13px; }
    .amend-box .label { font-size: 11px; color: #92400e; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 700; }
    .summary-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; padding: 16px 20px; margin: 20px 0; }
    .summary-box p { margin: 5px 0; font-size: 13px; }
    .note { background: #fef2f2; border-left: 4px solid #dc2626; padding: 10px 14px; margin: 20px 0; font-size: 12px; color: #7f1d1d; }
    .ack-btn { display: inline-block; margin: 20px 0; background: #92400e; color: #ffffff !important; text-decoration: none; padding: 12px 28px; border-radius: 4px; font-weight: 700; font-size: 13px; letter-spacing: 0.3px; }
    .footer { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px 30px; font-size: 11px; color: #94a3b8; }
  </style>
</head>
<body>
<div class="wrapper">
  <div class="header">
    <h1>Crystal Group</h1>
    <p>Purchase Order Amendment — Action Required (v${ctx.version})</p>
  </div>
  <div class="body">
    <p>Dear ${ctx.vendorContactName},</p>
    <p>
      Purchase Order <strong>#${ctx.poId}</strong> has been <strong>amended</strong> and re-issued.
      The revised PO (Version ${ctx.version}) supersedes all previous versions.
    </p>

    <div class="amend-box">
      <p class="label">Amendment Details</p>
      <p>• <strong>Change Type:</strong> ${changeLabel}</p>
      <p>• <strong>Reason:</strong> ${ctx.amendmentReason || "—"}</p>
      <p>• <strong>PO Version:</strong> v${ctx.version}</p>
    </div>

    <div class="summary-box">
      <p>• <strong>PO Number:</strong> ${ctx.poId}</p>
      <p>• <strong>Revised Total Value:</strong> ₹${fmtAmount(ctx.totalAmount)} (inclusive of GST)</p>
      <p>• <strong>Delivery Date:</strong> ${fmt(ctx.deliveryDate)}</p>
      <p>• <strong>Delivery Location:</strong> ${ctx.deliveryLocation || "—"}</p>
    </div>

    ${buildLineTable(ctx.lines ?? [])}

    <p style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#64748b;margin:20px 0 8px;">Payment &amp; Commercial Terms</p>
    <div class="summary-box" style="margin:0;">
      <p>• <strong>Payment Terms:</strong> ${ctx.paymentTerms || "Standard"}</p>
      ${ctx.advancePercent && parseFloat(String(ctx.advancePercent)) > 0
        ? `<p>• <strong>Advance Payment:</strong> ${ctx.advancePercent}% — ₹${fmtAmount(ctx.advanceAmount ?? 0)}</p>`
        : `<p>• <strong>Advance Payment:</strong> None</p>`}
      ${ctx.specialTerms ? `<p>• <strong>Special Terms:</strong> ${ctx.specialTerms}</p>` : ""}
    </div>

    <div class="note">
      <strong>Re-acknowledgement Required:</strong> Your previous acknowledgement has been reset.
      You must acknowledge and accept this revised PO to continue with the order.
    </div>

    <a href="${ackLink}" class="ack-btn">Review &amp; Acknowledge Amended PO</a>

    <p>
      For any queries, contact our Procurement Team at
      <a href="mailto:${PROCUREMENT_EMAIL}">${PROCUREMENT_EMAIL}</a>.
    </p>

    <p>
      Regards,<br>
      <strong>${ctx.procurementOfficerName}</strong><br>
      Procurement Team<br>
      Crystal Group
    </p>
  </div>
  <div class="footer">
    <strong>Crystal Group Integrated Procurement System</strong> — This is an automated notification.
    Do not reply to this email. Contact <a href="mailto:${PROCUREMENT_EMAIL}">${PROCUREMENT_EMAIL}</a> for assistance.
  </div>
</div>
</body>
</html>`;

  const transporter = createTransporter();
  await transporter.sendMail({
    from:    FROM,
    to:      ctx.vendorEmail,
    subject: `Amended PO #${ctx.poId} (v${ctx.version}) from Crystal Group — Re-acknowledgement Required`,
    html,
  });
}

// ── Working days helper ───────────────────────────────────────────────────────

export function workingDaysSince(dateStr: string): number {
  if (!dateStr) return 0;
  const start = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let count = 0;
  const cur = new Date(start);
  cur.setHours(0, 0, 0, 0);
  while (cur < today) {
    cur.setDate(cur.getDate() + 1);
    const day = cur.getDay();
    if (day !== 0 && day !== 6) count++; // skip Sat/Sun
  }
  return count;
}
