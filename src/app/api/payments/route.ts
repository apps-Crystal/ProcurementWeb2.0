/**
 * GET  /api/payments         — list payment queue
 * POST /api/payments         — manually create a payment entry
 */

import { NextRequest, NextResponse } from "next/server";
import { readSheet, appendRowByFields, getNextSeq, generateId, writeAuditLog } from "@/lib/sheets";

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status");
  const rows = await readSheet("PAYMENTS");
  const filtered = status ? rows.filter((r) => r.STATUS === status) : rows;

  // Sort MSME first, then by due date
  filtered.sort((a, b) => {
    if (a.IS_MSME === "Y" && b.IS_MSME !== "Y") return -1;
    if (b.IS_MSME === "Y" && a.IS_MSME !== "Y") return 1;
    return (a.PAYMENT_DUE_DATE ?? "").localeCompare(b.PAYMENT_DUE_DATE ?? "");
  });

  return NextResponse.json({ payments: filtered });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      inv_id = "",
      po_id = "",
      grn_id = "",
      vendor_id,
      vendor_name,
      gross_amount,
      tds_amount = 0,
      advance_paid = 0,
      credit_notes = 0,
      debit_notes = 0,
      payment_type = "Manual",
      payment_due_date,
      is_msme = "N",
      created_by,
    } = body;

    if (!vendor_id || !gross_amount || !created_by) {
      return NextResponse.json(
        { error: "vendor_id, gross_amount, and created_by are required" },
        { status: 400 }
      );
    }

    const netPayable =
      parseFloat(String(gross_amount)) -
      parseFloat(String(advance_paid)) -
      parseFloat(String(credit_notes)) +
      parseFloat(String(debit_notes)) -
      parseFloat(String(tds_amount));

    const seq = await getNextSeq("PAYMENTS");
    const payId = generateId("PAY", seq);
    const now = new Date().toISOString();

    await appendRowByFields("PAYMENTS", {
      PAY_ID:               payId,
      INV_ID:               inv_id,
      PO_ID:                po_id,
      GRN_ID:               grn_id,
      VENDOR_ID:            vendor_id,
      VENDOR_NAME:          vendor_name,
      GROSS_AMOUNT:         gross_amount,
      ADVANCE_ALREADY_PAID: advance_paid,
      CREDIT_NOTES_APPLIED: credit_notes,
      DEBIT_NOTES_APPLIED:  debit_notes,
      TDS_AMOUNT:           tds_amount,
      NET_PAYABLE:          netPayable,
      PAYMENT_TYPE:         payment_type,
      PAYMENT_DUE_DATE:     payment_due_date ?? "",
      IS_MSME:              is_msme,
      STATUS:               "SUBMITTED",
      CREATED_BY:           created_by,
      CREATED_AT:           now,
    });

    const stageSeq = await getNextSeq("PAYMENT_STAGES");
    await appendRowByFields("PAYMENT_STAGES", {
      STAGE_ID:     generateId("STGE", stageSeq),
      PAY_ID:       payId,
      STAGE_NUMBER: "1",
      STAGE_STATUS: "SUBMITTED",
      ACTIONED_BY:  created_by,
      ACTIONED_AT:  now,
      REMARKS:      "Manual payment entry",
    });

    await writeAuditLog({ userId: created_by, module: "PAYMENTS", recordId: payId, action: "PAYMENT_CREATED" });

    return NextResponse.json({ success: true, pay_id: payId }, { status: 201 });
  } catch (err) {
    console.error("[payments POST]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
