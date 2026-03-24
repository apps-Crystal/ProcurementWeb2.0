/**
 * GET  /api/payments         — list payment queue
 * POST /api/payments         — manually create a payment entry
 */

import { NextRequest, NextResponse } from "next/server";
import { readSheet, appendRowByFields, getNextSeq, generateId, writeAuditLog } from "@/lib/sheets";

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status");
  const rows = await readSheet("PAYMENTS");
  const TERMINAL = ["RELEASED", "REJECTED"];
  const filtered = status === "ACTIVE"
    ? rows.filter((r) => !TERMINAL.includes(r.STATUS))
    : status
      ? rows.filter((r) => r.STATUS === status)
      : rows;

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
    // BUG-PAY-001: Read caller identity from JWT headers, not body
    const callerId   = req.headers.get("x-user-id")  ?? "";
    const callerRole = req.headers.get("x-user-role") ?? "";

    if (!callerId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // BUG-PAY-002: Role enforcement — only Accounts or System_Admin may create payments
    const CREATE_ALLOWED_ROLES = ["Accounts", "System_Admin"];
    if (!CREATE_ALLOWED_ROLES.includes(callerRole)) {
      return NextResponse.json(
        { error: "Forbidden: only Accounts or System_Admin may create payment entries (SOP §9.2)." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const {
      inv_id = "",
      po_id = "",
      grn_id = "",
      match_id = "",
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
    } = body;

    if (!vendor_id || !gross_amount) {
      return NextResponse.json(
        { error: "vendor_id and gross_amount are required" },
        { status: 400 }
      );
    }

    // Resolve vendor name and actor details from sheets
    const [vendorRows, userRows] = await Promise.all([readSheet("VENDORS"), readSheet("USERS")]);
    const vendor = vendorRows.find((v) => v.VENDOR_ID === vendor_id);
    const resolvedVendorName = vendor?.COMPANY_NAME || vendor_name || "";
    const actor = userRows.find((u) => u.USER_ID === callerId);
    const actorName = actor?.FULL_NAME ?? callerId;
    const actorRole = callerRole || actor?.ROLE || "";

    const netPayable =
      parseFloat(String(gross_amount)) -
      parseFloat(String(advance_paid)) -
      parseFloat(String(credit_notes)) -
      parseFloat(String(debit_notes)) -
      parseFloat(String(tds_amount));

    let seq = await getNextSeq("PAYMENTS");
    let payId = generateId("PAY", seq);
    const existingPayments = await readSheet("PAYMENTS");
    if (existingPayments.some((p: any) => p.PAYMENT_ID === payId)) {
      payId = generateId("PAY", await getNextSeq("PAYMENTS"));
    }
    const now = new Date().toISOString();

    await appendRowByFields("PAYMENTS", {
      PAYMENT_ID:            payId,
      INVOICE_ID:            inv_id,
      PO_ID:                 po_id,
      GRN_ID:                grn_id,
      VENDOR_ID:             vendor_id,
      VENDOR_NAME:           resolvedVendorName,
      MATCH_ID:              match_id,
      GROSS_AMOUNT:          gross_amount,
      ADVANCE_DEDUCTION:     advance_paid,
      CREDIT_NOTE_DEDUCTION: credit_notes,
      DEBIT_NOTE_DEDUCTION:  debit_notes,
      TDS_DEDUCTION:         tds_amount,
      NET_PAYABLE:           netPayable,
      PAYMENT_TYPE:          payment_type,
      PAYMENT_DUE_DATE:      payment_due_date ?? "",
      IS_MSME:               is_msme,
      STATUS:                "SUBMITTED",
      CREATED_BY:            callerId,
      CREATED_DATE:          now,
    });

    const stageSeq = await getNextSeq("PAYMENT_STAGES");
    await appendRowByFields("PAYMENT_STAGES", {
      STAGE_LOG_ID:     generateId("STGE", stageSeq),
      PAYMENT_ID:       payId,
      STAGE_NUMBER:     "1",
      STAGE_NAME:       "Payment Submitted",
      ACTION:           "SUBMITTED",
      ACTOR_USER_ID:    callerId,
      ACTOR_NAME:       actorName,
      ACTOR_ROLE:       actorRole,
      ACTION_TIMESTAMP: now,
      REMARKS:          "Manual payment entry",
    });

    await writeAuditLog({ userId: callerId, module: "PAYMENTS", recordId: payId, action: "PAYMENT_CREATED" });

    return NextResponse.json({ success: true, pay_id: payId }, { status: 201 });
  } catch (err) {
    console.error("[payments POST]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
