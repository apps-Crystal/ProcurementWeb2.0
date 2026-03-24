/**
 * GET /api/reports?type=<open_po|payment_queue|vendor_outstanding|spend_analysis>
 *
 * Role filtering:
 *  - Site_Head   → data filtered to their site (DELIVERY_LOCATION match)
 *  - Warehouse   → 403 on payment/spend reports
 *  - All others  → full data
 */

import { NextRequest, NextResponse } from "next/server";
import { readSheet } from "@/lib/sheets";

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysSince(dateStr: string | undefined): number {
  if (!dateStr) return 0;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 0;
  return Math.floor((Date.now() - d.getTime()) / 86_400_000);
}

function ageingBucket(days: number): string {
  if (days <= 30)  return "0–30 days";
  if (days <= 60)  return "31–60 days";
  if (days <= 90)  return "61–90 days";
  return "90+ days";
}

function toNum(v: string | undefined): number {
  return parseFloat(String(v ?? "").replace(/,/g, "")) || 0;
}

function monthLabel(dateStr: string | undefined): string {
  if (!dateStr) return "Unknown";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "Unknown";
  return d.toLocaleString("en-IN", { month: "short", year: "2-digit" });
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const type       = req.nextUrl.searchParams.get("type") ?? "";
  const callerRole = req.headers.get("x-user-role") ?? "";
  const callerSite = req.headers.get("x-user-site") ?? "";

  const WAREHOUSE_BLOCKED = ["payment_queue", "vendor_outstanding", "spend_analysis"];
  if (callerRole === "Warehouse" && WAREHOUSE_BLOCKED.includes(type)) {
    return NextResponse.json(
      { error: "Your role does not have access to this report." },
      { status: 403 }
    );
  }

  // ── open_po ──────────────────────────────────────────────────────────────────
  if (type === "open_po") {
    const allPOs = await readSheet("PO");
    const CLOSED = new Set(["CLOSED", "CANCELLED"]);
    let rows = allPOs.filter((r) => !CLOSED.has(r.STATUS ?? ""));

    if (callerRole === "Site_Head" && callerSite) {
      rows = rows.filter((r) => (r.DELIVERY_LOCATION ?? "").includes(callerSite));
    }

    const totalValue = rows.reduce((s, r) => s + toNum(r.GRAND_TOTAL), 0);

    return NextResponse.json({
      rows: rows.map((r) => ({
        PO_ID:             r.PO_ID            ?? "",
        PO_DATE:           r.PO_DATE          ?? "",
        VENDOR_NAME:       r.VENDOR_NAME      ?? "",
        GRAND_TOTAL:       r.GRAND_TOTAL      ?? "0",
        STATUS:            r.STATUS           ?? "",
        ACK_STATUS:        r.ACK_STATUS       ?? "",
        DELIVERY_DATE:     r.DELIVERY_DATE    ?? "",
        SOURCE_PR_TYPE:    r.SOURCE_PR_TYPE   ?? "",
        DELIVERY_LOCATION: r.DELIVERY_LOCATION ?? "",
      })),
      total_value: parseFloat(totalValue.toFixed(2)),
      count: rows.length,
    });
  }

  // ── payment_queue ────────────────────────────────────────────────────────────
  if (type === "payment_queue") {
    const [payments, vendors] = await Promise.all([
      readSheet("PAYMENTS"),
      readSheet("VENDORS"),
    ]);

    const vendorMsme = new Map<string, string>();
    for (const v of vendors) vendorMsme.set(v.VENDOR_ID, v.IS_MSME ?? "N");

    const STAGES = [
      "SUBMITTED", "PROCUREMENT_VERIFIED", "ACCOUNTS_VERIFIED",
      "MANAGEMENT_APPROVED", "RELEASED",
    ];

    const byStage: Record<string, { count: number; total: number }> = {};
    for (const s of STAGES) byStage[s] = { count: 0, total: 0 };

    let msmeOverdueCount = 0;

    const rows = payments.map((p) => {
      const isMsme = (p.IS_MSME ?? vendorMsme.get(p.VENDOR_ID) ?? "N") === "Y";
      const age    = daysSince(p.CREATED_DATE);
      const isOverdue = isMsme && age > 45 && p.STATUS !== "RELEASED";
      if (isOverdue) msmeOverdueCount++;

      const stage = byStage[p.STATUS];
      if (stage) {
        stage.count++;
        stage.total += toNum(p.NET_PAYABLE || p.GROSS_AMOUNT);
      }

      return {
        PAYMENT_ID:   p.PAYMENT_ID   ?? "",
        PO_ID:        p.PO_ID        ?? "",
        VENDOR_NAME:  p.VENDOR_NAME  ?? "",
        AMOUNT:       toNum(p.NET_PAYABLE || p.GROSS_AMOUNT),
        STATUS:       p.STATUS       ?? "",
        IS_MSME:      isMsme ? "Y" : "N",
        CREATED_DATE: p.CREATED_DATE ?? "",
        DUE_DATE:     p.PAYMENT_DUE_DATE ?? p.MSME_DUE_DATE ?? "",
        MSME_OVERDUE: isOverdue,
        DAYS_AGE:     age,
      };
    });

    return NextResponse.json({
      rows,
      by_stage: Object.fromEntries(
        Object.entries(byStage).map(([k, v]) => [k, { count: v.count, total: parseFloat(v.total.toFixed(2)) }])
      ),
      msme_overdue_count: msmeOverdueCount,
    });
  }

  // ── vendor_outstanding ───────────────────────────────────────────────────────
  if (type === "vendor_outstanding") {
    const [payments, vendors] = await Promise.all([
      readSheet("PAYMENTS"),
      readSheet("VENDORS"),
    ]);

    const vendorMsme = new Map<string, string>();
    for (const v of vendors) vendorMsme.set(v.VENDOR_ID, v.IS_MSME ?? "N");

    const outstanding = new Map<string, {
      VENDOR_ID: string;
      VENDOR_NAME: string;
      MSME_FLAG: string;
      amount: number;
      oldest_date: string;
    }>();

    for (const p of payments) {
      if (p.STATUS === "RELEASED" || p.STATUS === "REJECTED") continue;
      const vid  = p.VENDOR_ID  ?? "";
      const name = p.VENDOR_NAME ?? vid;
      const amt  = toNum(p.NET_PAYABLE || p.GROSS_AMOUNT);
      const date = p.CREATED_DATE ?? "";

      if (!outstanding.has(vid)) {
        outstanding.set(vid, {
          VENDOR_ID:   vid,
          VENDOR_NAME: name,
          MSME_FLAG:   (p.IS_MSME ?? vendorMsme.get(vid) ?? "N"),
          amount:      0,
          oldest_date: date,
        });
      }
      const entry = outstanding.get(vid)!;
      entry.amount += amt;
      if (date && (!entry.oldest_date || date < entry.oldest_date)) {
        entry.oldest_date = date;
      }
    }

    const rows = [...outstanding.values()]
      .sort((a, b) => b.amount - a.amount)
      .map((v) => {
        const days = daysSince(v.oldest_date);
        return {
          VENDOR_ID:           v.VENDOR_ID,
          VENDOR_NAME:         v.VENDOR_NAME,
          MSME_FLAG:           v.MSME_FLAG,
          outstanding_amount:  parseFloat(v.amount.toFixed(2)),
          oldest_invoice_date: v.oldest_date,
          ageing_days:         days,
          ageing_bucket:       ageingBucket(days),
        };
      });

    return NextResponse.json({ rows });
  }

  // ── spend_analysis ───────────────────────────────────────────────────────────
  if (type === "spend_analysis") {
    const allPOs = await readSheet("PO");
    const SPEND_STATUSES = new Set(["CLOSED", "FULLY_RECEIVED"]);

    let rows = allPOs.filter((r) => SPEND_STATUSES.has(r.STATUS ?? ""));
    if (callerRole === "Site_Head" && callerSite) {
      rows = rows.filter((r) => (r.DELIVERY_LOCATION ?? "").includes(callerSite));
    }

    const bySite:     Map<string, number> = new Map();
    const byCategory: Map<string, number> = new Map();
    const byVendor:   Map<string, number> = new Map();
    const byMonth:    Map<string, number> = new Map();

    let grandTotal = 0;

    for (const r of rows) {
      const val  = toNum(r.GRAND_TOTAL);
      const site = r.DELIVERY_LOCATION || "Unknown";
      const cat  = r.SOURCE_PR_TYPE    || "Unknown";
      const vend = r.VENDOR_NAME       || "Unknown";
      const mon  = monthLabel(r.PO_DATE);

      bySite.set(site,     (bySite.get(site)     ?? 0) + val);
      byCategory.set(cat,  (byCategory.get(cat)  ?? 0) + val);
      byVendor.set(vend,   (byVendor.get(vend)   ?? 0) + val);
      byMonth.set(mon,     (byMonth.get(mon)      ?? 0) + val);
      grandTotal += val;
    }

    const toArr = (m: Map<string, number>) =>
      [...m.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([label, value]) => ({ label, value: parseFloat(value.toFixed(2)) }));

    return NextResponse.json({
      by_site:     toArr(bySite),
      by_category: toArr(byCategory),
      by_vendor:   toArr(byVendor),
      by_month:    [...byMonth.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([label, value]) => ({ label, value: parseFloat(value.toFixed(2)) })),
      grand_total: parseFloat(grandTotal.toFixed(2)),
    });
  }

  return NextResponse.json(
    { error: `Unknown report type "${type}". Valid: open_po, payment_queue, vendor_outstanding, spend_analysis` },
    { status: 400 }
  );
}
