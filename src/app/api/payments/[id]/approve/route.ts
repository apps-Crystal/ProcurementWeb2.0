/**
 * PATCH /api/payments/[id]/approve
 *
 * Advances a payment through the 5-stage lifecycle.
 * Body: { action, approved_by, remarks?, utr_number?, voucher_number? }
 *
 * Stage flow (per SOP §9.2):
 *   SUBMITTED           → PROCUREMENT_VERIFIED  (Procurement team)
 *   PROCUREMENT_VERIFIED → ACCOUNTS_VERIFIED    (Accounts team)
 *   ACCOUNTS_VERIFIED   → MANAGEMENT_APPROVED   (Management — tier by amount)
 *   MANAGEMENT_APPROVED → RELEASED              (Finance — enters UTR)
 *
 * Any stage can reject → REJECTED
 * Any stage can hold  → HELD
 */

import { NextRequest, NextResponse } from "next/server";
import { updateRowWhere, appendRowByFields, getNextSeq, generateId, readSheet, writeAuditLog } from "@/lib/sheets";

const STAGE_MAP: Record<string, { nextStatus: string; stageNumber: string }> = {
  PROCUREMENT_VERIFY: { nextStatus: "PROCUREMENT_VERIFIED", stageNumber: "2" },
  ACCOUNTS_VERIFY: { nextStatus: "ACCOUNTS_VERIFIED", stageNumber: "3" },
  MANAGEMENT_APPROVE: { nextStatus: "MANAGEMENT_APPROVED", stageNumber: "4" },
  FINANCE_RELEASE: { nextStatus: "RELEASED", stageNumber: "5" },
  HOLD: { nextStatus: "HELD", stageNumber: "" },
  REJECT: { nextStatus: "REJECTED", stageNumber: "" },
};

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const {
      action,
      approved_by,
      remarks = "",
      utr_number = "",
      voucher_number = "",
    } = await req.json();

    const stage = STAGE_MAP[action];
    if (!stage) {
      return NextResponse.json(
        {
          error: `action must be one of: ${Object.keys(STAGE_MAP).join(", ")}`,
        },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();

    // Build update object
    const updates: Record<string, string> = {
      STATUS: stage.nextStatus,
      LAST_UPDATED_BY: approved_by,
      LAST_UPDATED_DATE: now,
    };

    // Add stage-specific fields
    if (action === "PROCUREMENT_VERIFY") {
      updates.PROCUREMENT_VERIFIED_BY = approved_by;
      updates.PROCUREMENT_VERIFIED_DATE = now;
    } else if (action === "ACCOUNTS_VERIFY") {
      updates.ACCOUNTS_VERIFIED_BY = approved_by;
      updates.ACCOUNTS_VERIFIED_DATE = now;
    } else if (action === "MANAGEMENT_APPROVE") {
      updates.MANAGEMENT_APPROVED_BY = approved_by;
      updates.MANAGEMENT_APPROVED_DATE = now;
    } else if (action === "FINANCE_RELEASE") {
      updates.FINANCE_RELEASED_BY = approved_by;
      updates.FINANCE_RELEASED_DATE = now;
      updates.UTR_NUMBER = utr_number;
      updates.VOUCHER_NUMBER = voucher_number;
    }

    await updateRowWhere("PAYMENTS", "PAY_ID", id, updates);

    // Append to PAYMENT_STAGES audit trail
    if (stage.stageNumber) {
      const stageSeq = await getNextSeq("PAYMENT_STAGES");
      await appendRowByFields("PAYMENT_STAGES", {
        STAGE_ID:      generateId("STGE", stageSeq),
        PAY_ID:        id,
        STAGE_NUMBER:  stage.stageNumber,
        STAGE_STATUS:  stage.nextStatus,
        ACTIONED_BY:   approved_by,
        ACTIONED_AT:   now,
        REMARKS:       remarks,
        UTR_NUMBER:    utr_number,
        VOUCHER_NUMBER: voucher_number,
      });
    }

    await writeAuditLog({ userId: approved_by, module: "PAYMENTS", recordId: id, action: `PAYMENT_${action}`, remarks });

    return NextResponse.json({
      success: true,
      pay_id: id,
      status: stage.nextStatus,
    });
  } catch (err) {
    console.error("[payments/approve]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
