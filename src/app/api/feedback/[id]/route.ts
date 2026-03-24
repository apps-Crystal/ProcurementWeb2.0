/**
 * GET   /api/feedback/[id] — single feedback detail + comments
 * PATCH /api/feedback/[id] — admin update (status, priority, assign, resolution)
 *
 * GET access:
 *   - The reporter (REPORTED_BY_USER_ID === callerId)
 *   - System_Admin
 *   - Management
 *   - Everyone else → 403
 *
 * PATCH access: System_Admin only
 */

import { NextRequest, NextResponse } from "next/server";
import { readSheet, updateRowWhere, writeAuditLog } from "@/lib/sheets";

const VALID_STATUSES   = ["Open", "Acknowledged", "In_Progress", "Resolved", "Closed", "Wont_Fix"] as const;
const VALID_PRIORITIES = ["P1", "P2", "P3", "P4"] as const;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const callerId   = req.headers.get("x-user-id")   ?? "";
    const callerRole = req.headers.get("x-user-role")  ?? "";

    if (!callerId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const [feedbackRows, commentRows] = await Promise.all([
      readSheet("FEEDBACK"),
      readSheet("FEEDBACK_COMMENTS"),
    ]);

    const feedback = feedbackRows.find((f) => f.FEEDBACK_ID === id);
    if (!feedback) {
      return NextResponse.json({ error: "Feedback not found" }, { status: 404 });
    }

    const isAdmin    = callerRole === "System_Admin" || callerRole === "Management";
    const isReporter = feedback.REPORTED_BY_USER_ID === callerId;
    const isAssignee = feedback.ASSIGNED_TO_USER_ID === callerId;

    if (!isAdmin && !isReporter && !isAssignee) {
      return NextResponse.json({ error: "Forbidden: you do not have access to this feedback item." }, { status: 403 });
    }

    let comments = commentRows
      .filter((c) => c.FEEDBACK_ID === id)
      .sort((a, b) => (a.COMMENT_DATE ?? "").localeCompare(b.COMMENT_DATE ?? ""));

    // Non-admins cannot see internal notes
    if (!isAdmin) {
      comments = comments.filter((c) => c.IS_INTERNAL_NOTE !== "Y");
    }

    return NextResponse.json({ feedback, comments });
  } catch (err) {
    console.error("[GET /api/feedback/[id]]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const callerId   = req.headers.get("x-user-id")   ?? "";
    const callerRole = req.headers.get("x-user-role")  ?? "";

    if (!callerId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (callerRole !== "System_Admin") {
      return NextResponse.json(
        { error: "Forbidden: only System_Admin may update feedback items." },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await req.json() as {
      status?: string;
      priority?: string;
      assigned_to_user_id?: string;
      resolution_notes?: string;
    };

    const { status, priority, assigned_to_user_id, resolution_notes } = body;

    // Validate
    if (status && !VALID_STATUSES.includes(status as typeof VALID_STATUSES[number])) {
      return NextResponse.json({ error: `status must be one of: ${VALID_STATUSES.join(", ")}` }, { status: 400 });
    }
    if (priority && !VALID_PRIORITIES.includes(priority as typeof VALID_PRIORITIES[number])) {
      return NextResponse.json({ error: `priority must be one of: ${VALID_PRIORITIES.join(", ")}` }, { status: 400 });
    }
    if ((status === "Resolved" || status === "Closed") && !resolution_notes?.trim()) {
      return NextResponse.json({ error: "resolution_notes is required when status is Resolved or Closed" }, { status: 400 });
    }

    // Verify feedback exists
    const feedbackRows = await readSheet("FEEDBACK");
    const feedback     = feedbackRows.find((f) => f.FEEDBACK_ID === id);
    if (!feedback) {
      return NextResponse.json({ error: "Feedback not found" }, { status: 404 });
    }

    const now = new Date().toISOString();
    const updates: Record<string, string> = {
      LAST_UPDATED_BY:   callerId,
      LAST_UPDATED_DATE: now,
    };

    if (status)             updates.STATUS = status;
    if (priority)           updates.PRIORITY = priority;
    if (resolution_notes)   updates.RESOLUTION_NOTES = resolution_notes.trim();
    if (status === "Resolved" || status === "Closed") {
      updates.RESOLVED_DATE = now.slice(0, 10);
    }

    // Look up assigned user name
    if (assigned_to_user_id) {
      const users    = await readSheet("USERS");
      const assignee = users.find((u) => u.USER_ID === assigned_to_user_id);
      if (!assignee) {
        return NextResponse.json({ error: "assigned_to_user_id not found in USERS" }, { status: 400 });
      }
      updates.ASSIGNED_TO_USER_ID = assigned_to_user_id;
      updates.ASSIGNED_TO_NAME    = assignee.FULL_NAME ?? assigned_to_user_id;
    }

    await updateRowWhere("FEEDBACK", "FEEDBACK_ID", id, updates);

    await writeAuditLog({
      userId:   callerId,
      module:   "FEEDBACK",
      recordId: id,
      action:   "FEEDBACK_UPDATED",
      remarks:  status ? `Status → ${status}` : "Fields updated",
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[PATCH /api/feedback/[id]]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
