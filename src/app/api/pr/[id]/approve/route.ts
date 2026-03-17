/**
 * PATCH /api/pr/[id]/approve
 *
 * Approve or reject a PR (MPR or SPR).
 * Body: { action: "APPROVED" | "REJECTED", approver_id, approver_name, remarks, pr_type: "MPR" | "SPR" }
 *
 * On APPROVED → triggers PO auto-generation (calls /api/po internally)
 */

import { NextRequest, NextResponse } from "next/server";
import { updateRowWhere, writeAuditLog } from "@/lib/sheets";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { action, approver_id, approver_name, remarks, pr_type = "MPR" } = await req.json();

    if (!["APPROVED", "REJECTED"].includes(action)) {
      return NextResponse.json({ error: "action must be APPROVED or REJECTED" }, { status: 400 });
    }

    const sheet = pr_type === "SPR" ? "SPR" : "MPR";
    const idField = pr_type === "SPR" ? "SPR_ID" : "PR_ID";
    const now = new Date().toISOString();

    await updateRowWhere(sheet, idField, id, {
      STATUS: action,
      ASSIGNED_APPROVER_ID: approver_id,
      ASSIGNED_APPROVER_NAME: approver_name,
      APPROVER_ACTION_DATE: now,
      APPROVER_REMARKS: remarks ?? "",
      LAST_UPDATED_BY: approver_id,
      LAST_UPDATED_DATE: now,
    });

    await writeAuditLog({ userId: approver_id, module: sheet, recordId: id, action: `PR_${action}`, remarks });

    return NextResponse.json({ success: true, pr_id: id, status: action });
  } catch (err) {
    console.error("[pr/approve]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
