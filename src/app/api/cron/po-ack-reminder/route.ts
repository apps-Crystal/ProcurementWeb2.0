/**
 * GET /api/cron/po-ack-reminder
 *
 * Checks all POs with ACK_STATUS = "PENDING" and sends reminder emails:
 *   - 2 working days since dispatch → polite reminder (Option A)
 *   - 4+ working days since dispatch → urgent escalation (Option B)
 *
 * Triggered by Vercel Cron daily at 9:00 AM IST (03:30 UTC).
 * Can also be called manually (protected by CRON_SECRET header).
 */

import { NextRequest, NextResponse } from "next/server";
import { readSheet, updateRowWhere, writeAuditLog } from "@/lib/sheets";
import { sendPoAckReminder, workingDaysSince } from "@/lib/email";

export async function GET(req: NextRequest) {
  // Protect the endpoint
  const secret = req.headers.get("x-cron-secret") ?? req.nextUrl.searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const pos = await readSheet("PO");

  // Only POs that are ISSUED and still pending acknowledgement
  const pending = pos.filter(
    (po) => po.STATUS === "ISSUED" && po.ACK_STATUS === "PENDING"
  );

  const results: { poId: string; days: number; action: string }[] = [];

  for (const po of pending) {
    const days = workingDaysSince(po.CREATED_DATE ?? po.PO_DATE ?? "");
    if (days < 2) continue; // not yet overdue

    const isUrgent = days >= 4;

    if (!po.VENDOR_EMAIL) continue;

    const vendorRows = await readSheet("VENDORS");
    const vendorRow  = vendorRows.find((v) => v.VENDOR_ID === po.VENDOR_ID);
    const contactName = vendorRow?.CONTACT_PERSON ?? po.VENDOR_NAME ?? "Vendor";

    try {
      await sendPoAckReminder(
        {
          poId:                   po.PO_ID,
          poDate:                 po.PO_DATE ?? "",
          totalAmount:            po.GRAND_TOTAL ?? "0",
          deliveryDate:           po.DELIVERY_DATE ?? "",
          deliveryLocation:       po.DELIVERY_LOCATION ?? "",
          vendorContactName:      contactName,
          vendorEmail:            po.VENDOR_EMAIL,
          procurementOfficerName: po.CREATED_BY ?? "Procurement Team",
        },
        isUrgent
      );

      await writeAuditLog({ userId: "SYSTEM", module: "PO", recordId: po.PO_ID, action: isUrgent ? "PO_ACK_REMINDER_URGENT" : "PO_ACK_REMINDER", remarks: `${days} working days elapsed` });

      results.push({ poId: po.PO_ID, days, action: isUrgent ? "URGENT" : "REMINDER" });
    } catch (err) {
      console.error(`[cron] Reminder failed for ${po.PO_ID}:`, err);
    }
  }

  return NextResponse.json({
    processed: results.length,
    results,
    checkedAt: new Date().toISOString(),
  });
}
