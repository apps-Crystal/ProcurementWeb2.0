/**
 * GET /api/search?q=<query>&limit=<n>
 *
 * Searches across: PO, MPR, SPR, INVOICES, PAYMENTS, VENDORS
 * Returns up to `limit` results (default 20) grouped by entity type.
 * Query is matched case-insensitively against key ID and name fields.
 */
import { NextRequest, NextResponse } from "next/server";
import { readSheet } from "@/lib/sheets";

type SearchResult = {
  id: string;
  label: string;
  sublabel: string;
  type: string;
  href: string;
};

export async function GET(req: NextRequest) {
  const q     = (req.nextUrl.searchParams.get("q") ?? "").trim().toLowerCase();
  const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "20", 10);

  if (!q || q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const [pos, mprs, sprs, invoices, payments, vendors] = await Promise.all([
    readSheet("PO"),
    readSheet("MPR"),
    readSheet("SPR"),
    readSheet("INVOICES"),
    readSheet("PAYMENTS"),
    readSheet("VENDORS"),
  ]);

  const results: SearchResult[] = [];
  const match = (val: string | undefined) => (val ?? "").toLowerCase().includes(q);

  for (const r of pos) {
    if (match(r.PO_ID) || match(r.VENDOR_NAME) || match(r.TALLY_PO_NUMBER) || match(r.SOURCE_PR_ID)) {
      results.push({
        id: r.PO_ID,
        label: r.PO_ID,
        sublabel: `${r.VENDOR_NAME ?? "—"} · ${r.STATUS ?? ""}`,
        type: "PO",
        href: `/po/${r.PO_ID}/print`,
      });
    }
  }

  for (const r of mprs) {
    if (match(r.PR_ID) || match(r.REQUESTOR_NAME) || match(r.PROJECT_SITE)) {
      results.push({
        id: r.PR_ID,
        label: r.PR_ID,
        sublabel: `MPR · ${r.REQUESTOR_NAME ?? "—"} · ${r.STATUS ?? ""}`,
        type: "MPR",
        href: `/pr/${r.PR_ID}`,
      });
    }
  }

  for (const r of sprs) {
    if (match(r.SPR_ID) || match(r.REQUESTOR_NAME) || match(r.SERVICE_DESCRIPTION) || match(r.SERVICE_CATEGORY)) {
      results.push({
        id: r.SPR_ID,
        label: r.SPR_ID,
        sublabel: `SPR · ${r.SERVICE_CATEGORY ?? "—"} · ${r.STATUS ?? ""}`,
        type: "SPR",
        href: `/pr/${r.SPR_ID}`,
      });
    }
  }

  for (const r of invoices) {
    if (match(r.INV_ID) || match(r.VENDOR_NAME) || match(r.INVOICE_NUMBER)) {
      results.push({
        id: r.INV_ID,
        label: r.INV_ID,
        sublabel: `Invoice · ${r.VENDOR_NAME ?? "—"} · ${r.STATUS ?? ""}`,
        type: "INVOICE",
        href: `/invoices`,
      });
    }
  }

  for (const r of payments) {
    if (match(r.PAYMENT_ID) || match(r.VENDOR_NAME) || match(r.INVOICE_ID)) {
      results.push({
        id: r.PAYMENT_ID,
        label: r.PAYMENT_ID,
        sublabel: `Payment · ${r.VENDOR_NAME ?? "—"} · ₹${r.NET_PAYABLE ?? "0"} · ${r.STATUS ?? ""}`,
        type: "PAYMENT",
        href: `/payments/${r.PAYMENT_ID}`,
      });
    }
  }

  for (const r of vendors) {
    if (match(r.VENDOR_ID) || match(r.COMPANY_NAME) || match(r.PAN) || match(r.GSTIN)) {
      results.push({
        id: r.VENDOR_ID,
        label: r.COMPANY_NAME ?? r.VENDOR_ID,
        sublabel: `Vendor · ${r.VENDOR_ID} · ${r.STATUS ?? ""}`,
        type: "VENDOR",
        href: `/vendors/${r.VENDOR_ID}`,
      });
    }
  }

  return NextResponse.json({ results: results.slice(0, limit) });
}
