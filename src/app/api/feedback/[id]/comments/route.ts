/**
 * POST /api/feedback/[id]/comments — add a comment to a feedback item
 *
 * Access:
 *   - The reporter themselves
 *   - System_Admin
 *   - Management
 *
 * Body: { comment_text, is_internal_note }
 *   - comment_text required
 *   - is_internal_note "Y" | "N" (default "N"); only System_Admin / Management may set "Y"
 */

import { NextRequest, NextResponse } from "next/server";
import { readSheet, appendRowByFields, getNextSeq, generateId } from "@/lib/sheets";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const callerId   = req.headers.get("x-user-id")   ?? "";
    const callerRole = req.headers.get("x-user-role")  ?? "";

    if (!callerId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { comment_text, is_internal_note = "N" } = body;

    if (!comment_text?.trim()) {
      return NextResponse.json({ error: "comment_text is required" }, { status: 400 });
    }

    // Verify feedback exists and check access
    const [feedbackRows, users] = await Promise.all([
      readSheet("FEEDBACK"),
      readSheet("USERS"),
    ]);

    const feedback = feedbackRows.find((f) => f.FEEDBACK_ID === id);
    if (!feedback) {
      return NextResponse.json({ error: "Feedback not found" }, { status: 404 });
    }

    const isAdmin    = callerRole === "System_Admin" || callerRole === "Management";
    const isReporter = feedback.REPORTED_BY_USER_ID === callerId;
    const isAssignee = feedback.ASSIGNED_TO_USER_ID === callerId;

    if (!isAdmin && !isReporter && !isAssignee) {
      return NextResponse.json(
        { error: "Forbidden: you do not have permission to comment on this feedback item." },
        { status: 403 }
      );
    }

    // Only System_Admin / Management may add internal notes
    const internalNote = (isAdmin && is_internal_note === "Y") ? "Y" : "N";

    const actor      = users.find((u) => u.USER_ID === callerId);
    const callerName = actor?.FULL_NAME ?? callerId;

    const seq       = await getNextSeq("FEEDBACK_COMMENTS");
    const commentId = generateId("FBCMT", seq);
    const now       = new Date().toISOString();

    await appendRowByFields("FEEDBACK_COMMENTS", {
      COMMENT_ID:           commentId,
      FEEDBACK_ID:          id,
      COMMENT_DATE:         now,
      COMMENTED_BY_USER_ID: callerId,
      COMMENTED_BY_NAME:    callerName,
      COMMENTED_BY_ROLE:    callerRole,
      COMMENT_TEXT:         comment_text.trim(),
      ATTACHMENT_URL:       "",
      IS_INTERNAL_NOTE:     internalNote,
    });

    return NextResponse.json({ success: true, comment_id: commentId }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/feedback/[id]/comments]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
