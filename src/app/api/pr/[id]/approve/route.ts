/**
 * PATCH /api/pr/[id]/approve
 *
 * Approve or reject a PR (MPR or SPR).
 * Body: { action: "APPROVED" | "REJECTED", remarks, pr_type: "MPR" | "SPR" }
 *
 * Security:
 *  - Caller identity is read from JWT headers (x-user-id, x-user-role) set by
 *    middleware — NOT from the request body (BUG-004/005 fix).
 *  - Server-side SoD: approver must not be the same user who submitted the PR
 *    (BUG-003 fix). The check is done against the sheet record, not the body.
 *  - Only users with role System_Admin or Procurement_Head may approve (BUG-005 fix).
 */

import { NextRequest, NextResponse } from "next/server";
import { readSheet, updateRowWhere, writeAuditLog } from "@/lib/sheets";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // ── 1. Resolve caller from JWT headers (set by middleware) ───────────────
    const callerId   = req.headers.get("x-user-id")   ?? "";
    const callerRole = req.headers.get("x-user-role") ?? "";

    if (!callerId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── 2. Role check — only System_Admin or Procurement_Head may approve ────
    const allowedRoles = ["System_Admin", "Procurement_Head"];
    if (!allowedRoles.includes(callerRole)) {
      return NextResponse.json(
        { error: "Forbidden: only Procurement_Head or System_Admin may approve PRs." },
        { status: 403 }
      );
    }

    const { action, remarks, pr_type = "MPR" } = await req.json();

    if (!["APPROVED", "REJECTED"].includes(action)) {
      return NextResponse.json({ error: "action must be APPROVED or REJECTED" }, { status: 400 });
    }

    const sheet    = pr_type === "SPR" ? "SPR" : "MPR";
    const idField  = pr_type === "SPR" ? "SPR_ID" : "PR_ID";

    // ── 3. Fetch the PR to enforce SoD ───────────────────────────────────────
    const rows = await readSheet(sheet);
    const pr   = rows.find((r) => r[idField] === id);

    if (!pr) {
      return NextResponse.json({ error: "PR not found" }, { status: 404 });
    }

    if (pr.STATUS !== "SUBMITTED") {
      return NextResponse.json(
        { error: `PR is in status '${pr.STATUS}' — only SUBMITTED PRs can be approved/rejected.` },
        { status: 409 }
      );
    }

    // SoD: approver ≠ requestor (SOP §15.1)
    if (pr.REQUESTOR_USER_ID && pr.REQUESTOR_USER_ID === callerId) {
      return NextResponse.json(
        { error: "Segregation of duties violation: you cannot approve your own PR (SOP §15.1)." },
        { status: 403 }
      );
    }

    const now = new Date().toISOString();

    // ── 4. Fetch caller's full name from USERS sheet ──────────────────────────
    const users      = await readSheet("USERS");
    const callerUser = users.find((u) => u.USER_ID === callerId);
    const callerName = callerUser?.FULL_NAME ?? callerId;

    await updateRowWhere(sheet, idField, id, {
      STATUS:                action,
      ASSIGNED_APPROVER_ID:   callerId,
      ASSIGNED_APPROVER_NAME: callerName,
      APPROVER_ACTION_DATE:   now,
      APPROVER_REMARKS:       remarks ?? "",
      LAST_UPDATED_BY:        callerId,
      LAST_UPDATED_DATE:      now,
    });

    await writeAuditLog({
      userId:    callerId,
      userName:  callerName,
      userRole:  callerRole,
      module:    sheet,
      recordId:  id,
      action:    `PR_${action}`,
      remarks,
    });

    return NextResponse.json({ success: true, pr_id: id, status: action });
  } catch (err) {
    console.error("[pr/approve]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
