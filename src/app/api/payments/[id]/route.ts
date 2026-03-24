/**
 * GET /api/payments/[id]
 *
 * Returns a single payment enriched with all related documents:
 *   payment, stages, po, invoice, grn, match, vendor, subProfile
 */

import { NextRequest, NextResponse } from "next/server";
import { readSheet } from "@/lib/sheets";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const [
      payments,
      paymentStages,
      pos,
      invoices,
      grns,
      vendors,
      subProfiles,
      matchRows,
    ] = await Promise.all([
      readSheet("PAYMENTS"),
      readSheet("PAYMENT_STAGES"),
      readSheet("PO"),
      readSheet("INVOICES"),
      readSheet("GRN"),
      readSheet("VENDORS"),
      readSheet("VENDOR_SUB_PROFILES"),
      readSheet("THREE_WAY_MATCH"),
    ]);

    const payment = payments.find((p) => p.PAYMENT_ID === id);
    if (!payment) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    // Stages sorted by stage number
    const stages = paymentStages
      .filter((s) => s.PAYMENT_ID === id)
      .sort((a, b) => parseInt(a.STAGE_NUMBER || "0") - parseInt(b.STAGE_NUMBER || "0"));

    const po        = pos.find((p) => p.PO_ID === payment.PO_ID) ?? null;
    const invoice   = invoices.find((i) => i.INV_ID === payment.INVOICE_ID) ?? null;
    const grn       = grns.find((g) => g.GRN_ID === payment.GRN_ID) ?? null;
    const match     = matchRows.find((m) => m.MATCH_ID === payment.MATCH_ID) ?? null;
    const vendor    = vendors.find((v) => v.VENDOR_ID === payment.VENDOR_ID) ?? null;

    // Sub-profile: prefer payment's own sub_profile_id, fall back to PO's
    const subProfileId = payment.SUB_PROFILE_ID || po?.SUB_PROFILE_ID;
    const subProfile = subProfiles.find((s) => s.SUB_PROFILE_ID === subProfileId) ?? null;

    return NextResponse.json({ payment, stages, po, invoice, grn, match, vendor, subProfile });
  } catch (err) {
    console.error("[payments/[id] GET]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
