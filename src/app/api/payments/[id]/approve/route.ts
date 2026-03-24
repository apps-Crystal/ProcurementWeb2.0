/**
 * PATCH /api/payments/[id]/approve  (SOP §9.2)
 *
 * Body: { action, remarks?, utr_number?, voucher_number?,
 *          advance_deduction?, credit_note_deduction?, debit_note_deduction?, tds_deduction? }
 *
 * Caller identity is read from JWT middleware headers (x-user-id, x-user-role).
 *
 * Stage flow:
 *   SUBMITTED            → PROCUREMENT_VERIFIED  (Procurement)
 *   PROCUREMENT_VERIFIED → ACCOUNTS_VERIFIED     (Accounts — may edit deductions)
 *   ACCOUNTS_VERIFIED    → MANAGEMENT_APPROVED   (Management)
 *   MANAGEMENT_APPROVED  → RELEASED              (Finance — UTR required)
 *
 * Special: HOLD → HELD | RESUME_HOLD → previous status | REJECT → REJECTED
 *
 * SoD: creator + all previous stage actors barred (§15.1).
 * SLA: Stage 2/3 = 1 day, Stage 4 = 2 days, Stage 5 = due date.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  updateRowWhere,
  appendRowByFields,
  getNextSeq,
  generateId,
  readSheet,
  writeAuditLog,
} from "@/lib/sheets";

const STAGE_MAP: Record<string, { nextStatus: string; stageNumber: string; stageName: string; slaDays: number }> = {
  PROCUREMENT_VERIFY: { nextStatus: "PROCUREMENT_VERIFIED", stageNumber: "2", stageName: "Procurement Verification", slaDays: 1 },
  ACCOUNTS_VERIFY:    { nextStatus: "ACCOUNTS_VERIFIED",    stageNumber: "3", stageName: "Accounts Verification",    slaDays: 1 },
  MANAGEMENT_APPROVE: { nextStatus: "MANAGEMENT_APPROVED",  stageNumber: "4", stageName: "Management Approval",       slaDays: 2 },
  FINANCE_RELEASE:    { nextStatus: "RELEASED",             stageNumber: "5", stageName: "Finance Release",           slaDays: 0 },
  HOLD:               { nextStatus: "HELD",                 stageNumber: "",  stageName: "Payment Hold",              slaDays: 0 },
  RESUME_HOLD:        { nextStatus: "",                     stageNumber: "",  stageName: "Hold Released",             slaDays: 0 },
  REJECT:             { nextStatus: "REJECTED",             stageNumber: "",  stageName: "Payment Rejected",          slaDays: 0 },
};

const REQUIRED_STATUS: Record<string, string | null> = {
  PROCUREMENT_VERIFY: "SUBMITTED",
  ACCOUNTS_VERIFY:    "PROCUREMENT_VERIFIED",
  MANAGEMENT_APPROVE: "ACCOUNTS_VERIFIED",
  FINANCE_RELEASE:    "MANAGEMENT_APPROVED",
  HOLD:        null,
  RESUME_HOLD: "HELD",
  REJECT:      null,
};

const RESUME_MAP: Record<string, string> = {
  "1": "SUBMITTED",
  "2": "PROCUREMENT_VERIFIED",
  "3": "ACCOUNTS_VERIFIED",
  "4": "MANAGEMENT_APPROVED",
};

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    // BUG-PAY-003: Read caller identity from JWT headers, not body
    const callerId   = req.headers.get("x-user-id")  ?? "";
    const callerRole = req.headers.get("x-user-role") ?? "";

    if (!callerId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const {
      action, remarks = "", utr_number = "", voucher_number = "", payment_mode = "",
      advance_deduction, credit_note_deduction, debit_note_deduction, tds_deduction,
    } = await req.json();

    if (!action)
      return NextResponse.json({ error: "action is required" }, { status: 400 });

    const stage = STAGE_MAP[action];
    if (!stage)
      return NextResponse.json({ error: `action must be one of: ${Object.keys(STAGE_MAP).join(", ")}` }, { status: 400 });

    const [payments, paymentStages, users] = await Promise.all([
      readSheet("PAYMENTS"), readSheet("PAYMENT_STAGES"), readSheet("USERS"),
    ]);

    const payment = payments.find((p) => p.PAYMENT_ID === id);
    if (!payment) return NextResponse.json({ error: "Payment not found" }, { status: 404 });

    // Status gate
    const required = REQUIRED_STATUS[action];
    if (required && payment.STATUS !== required)
      return NextResponse.json({ error: `Action "${action}" requires status "${required}", current: "${payment.STATUS}".` }, { status: 422 });

    if ((action === "HOLD" || action === "REJECT") && ["RELEASED", "REJECTED"].includes(payment.STATUS))
      return NextResponse.json({ error: `Cannot ${action} a payment with status "${payment.STATUS}".` }, { status: 422 });

    // SoD — only applies to the 4 formal approval steps, not to HOLD / RESUME_HOLD / REJECT
    const myStages = paymentStages.filter((s) => s.PAYMENT_ID === id);
    const SOD_ACTIONS = ["PROCUREMENT_VERIFY", "ACCOUNTS_VERIFY", "MANAGEMENT_APPROVE", "FINANCE_RELEASE"];
    if (SOD_ACTIONS.includes(action)) {
      const FORMAL_STAGES = ["SUBMITTED", "PROCUREMENT_VERIFIED", "ACCOUNTS_VERIFIED", "MANAGEMENT_APPROVED", "RELEASED"];
      const prevActors = myStages
        .filter((s) => FORMAL_STAGES.includes(s.ACTION))
        .map((s) => s.ACTOR_USER_ID)
        .filter(Boolean);
      if (payment.CREATED_BY) prevActors.push(payment.CREATED_BY);
      if (prevActors.includes(callerId))
        return NextResponse.json({ error: "Segregation of duties violation: you have already acted on this payment or created it (SOP §15.1)." }, { status: 422 });
    }

    // BUG-PAY-004: Stage-to-role enforcement for the four formal approval actions
    const STAGE_ROLE_MAP: Record<string, string[]> = {
      PROCUREMENT_VERIFY: ["Procurement_Team", "System_Admin"],
      ACCOUNTS_VERIFY:    ["Accounts",         "System_Admin"],
      MANAGEMENT_APPROVE: ["Management",        "System_Admin"],
      FINANCE_RELEASE:    ["Finance",           "System_Admin"],
    };
    if (STAGE_ROLE_MAP[action]) {
      const allowedRoles = STAGE_ROLE_MAP[action];
      if (!allowedRoles.includes(callerRole)) {
        return NextResponse.json(
          { error: `Your role (${callerRole}) is not authorised to perform '${action}'. Required: ${allowedRoles.join(" or ")} (SOP §9.2).` },
          { status: 403 }
        );
      }
    }

    const actor = users.find((u) => u.USER_ID === callerId);
    const actorName = actor?.FULL_NAME ?? callerId;
    const actorRole = callerRole || actor?.ROLE || "";
    const now = new Date().toISOString();

    // F-06 — Role-based REJECT gate
    const REJECT_ROLE_MAP: Record<string, string[]> = {
      SUBMITTED:            ["Procurement_Team", "Accounts", "System_Admin"],
      PROCUREMENT_VERIFIED: ["Accounts", "System_Admin"],
      ACCOUNTS_VERIFIED:    ["Management", "System_Admin"],
      MANAGEMENT_APPROVED:  ["Finance", "Management", "System_Admin"],
    };
    if (action === "REJECT") {
      const allowedRoles = REJECT_ROLE_MAP[payment.STATUS] ?? ["System_Admin"];
      if (!allowedRoles.includes(actorRole))
        return NextResponse.json(
          { error: `Your role (${actorRole}) cannot reject a payment in status "${payment.STATUS}".` },
          { status: 403 }
        );
    }

    // Require non-trivial remarks for REJECT and HOLD
    if ((action === "REJECT" || action === "HOLD") && (!remarks || !remarks.trim())) {
      return NextResponse.json(
        { error: `${action === "REJECT" ? "Rejection" : "Hold"} reason is mandatory. Please provide remarks.` },
        { status: 400 }
      );
    }
    if ((action === "REJECT" || action === "HOLD") && remarks.trim().length < 10) {
      return NextResponse.json(
        { error: `${action === "REJECT" ? "Rejection" : "Hold"} reason must be at least 10 characters to provide meaningful context.` },
        { status: 400 }
      );
    }

    // F-07 — Role-based HOLD gate
    const HOLD_ALLOWED_ROLES = ["Accounts", "Finance", "Management", "System_Admin"];
    if (action === "HOLD") {
      if (!HOLD_ALLOWED_ROLES.includes(actorRole))
        return NextResponse.json(
          { error: "Only Accounts, Finance, Management, or System_Admin may place a payment on hold." },
          { status: 403 }
        );
    }

    // F-14 — RESUME_HOLD has no SoD restriction by design (the person resuming
    // should not be blocked just because they performed a prior approval step).
    // HOLD is now role-gated (F-07) which provides adequate guardrails.

    if (action === "FINANCE_RELEASE" && !utr_number.trim())
      return NextResponse.json({ error: "UTR Number is required to release payment." }, { status: 400 });

    // Resolve new status
    let newStatus = stage.nextStatus;
    if (action === "RESUME_HOLD") {
      const formalStages = myStages.filter((s) =>
        ["SUBMITTED", "PROCUREMENT_VERIFIED", "ACCOUNTS_VERIFIED", "MANAGEMENT_APPROVED", "RELEASED"].includes(s.ACTION)
      );
      const maxN = formalStages.reduce((mx, s) => Math.max(mx, parseInt(s.STAGE_NUMBER || "0")), 0);
      newStatus = RESUME_MAP[String(maxN)] ?? "SUBMITTED";
    }

    // Build updates
    const updates: Record<string, string | number> = {
      STATUS: newStatus, LAST_UPDATED_BY: callerId, LAST_UPDATED_DATE: now,
    };
    if (action === "HOLD") updates.HOLD_REASON = remarks.trim();
    if (action === "REJECT") updates.PAYMENT_DATE = now.slice(0, 10);
    if (action === "FINANCE_RELEASE") {
      updates.PAYMENT_DATE = now.slice(0, 10);
      updates.UTR_NUMBER = utr_number;
      updates.PAYMENT_VOUCHER_NUMBER = voucher_number;
      if (payment_mode) updates.PAYMENT_MODE = payment_mode;
    }
    if (action === "ACCOUNTS_VERIFY") {
      const vals = [advance_deduction, credit_note_deduction, debit_note_deduction, tds_deduction];
      for (const v of vals) {
        if (v !== undefined && (isNaN(parseFloat(v)) || parseFloat(v) < 0))
          return NextResponse.json({ error: "Deduction values must be non-negative numbers." }, { status: 400 });
      }
      const gross = parseFloat(payment.GROSS_AMOUNT || "0");
      const adv = advance_deduction     !== undefined ? parseFloat(advance_deduction)     : parseFloat(payment.ADVANCE_DEDUCTION     || "0");
      const crd = credit_note_deduction !== undefined ? parseFloat(credit_note_deduction) : parseFloat(payment.CREDIT_NOTE_DEDUCTION || "0");
      const dbt = debit_note_deduction  !== undefined ? parseFloat(debit_note_deduction)  : parseFloat(payment.DEBIT_NOTE_DEDUCTION  || "0");
      const tds = tds_deduction         !== undefined ? parseFloat(tds_deduction)         : parseFloat(payment.TDS_DEDUCTION         || "0");
      updates.ADVANCE_DEDUCTION = adv; updates.CREDIT_NOTE_DEDUCTION = crd;
      updates.DEBIT_NOTE_DEDUCTION = dbt; updates.TDS_DEDUCTION = tds;
      updates.NET_PAYABLE = parseFloat(Math.max(0, gross - adv - crd - dbt - tds).toFixed(2));
    }

    await updateRowWhere("PAYMENTS", "PAYMENT_ID", id, updates);

    // Write stage log
    if (stage.stageNumber || action === "HOLD" || action === "RESUME_HOLD" || action === "REJECT") {
      let slaDue = "";
      if (stage.slaDays > 0) {
        const sla = new Date(now); sla.setHours(sla.getHours() + stage.slaDays * 24); slaDue = sla.toISOString();
      } else if (action === "FINANCE_RELEASE" && payment.PAYMENT_DUE_DATE) {
        slaDue = new Date(payment.PAYMENT_DUE_DATE).toISOString();
      }
      const stageSeq = await getNextSeq("PAYMENT_STAGES");
      await appendRowByFields("PAYMENT_STAGES", {
        STAGE_LOG_ID: generateId("STGE", stageSeq),
        PAYMENT_ID: id,
        STAGE_NUMBER: stage.stageNumber || String(myStages.length + 2),
        STAGE_NAME: stage.stageName,
        ACTOR_USER_ID: callerId,
        ACTOR_NAME: actorName,
        ACTOR_ROLE: actorRole,
        ACTION: newStatus || action,
        ACTION_TIMESTAMP: now,
        REMARKS: remarks,
        SLA_DUE_TIMESTAMP: slaDue,
      });
    }

    await writeAuditLog({ userId: callerId, module: "PAYMENTS", recordId: id, action: `PAYMENT_${action}`, remarks });
    return NextResponse.json({ success: true, pay_id: id, status: newStatus || payment.STATUS });
  } catch (err) {
    console.error("[payments/approve]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Internal server error" }, { status: 500 });
  }
}
