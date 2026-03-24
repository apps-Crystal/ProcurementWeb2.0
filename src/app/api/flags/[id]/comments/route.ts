/**
 * GET  /api/flags/[id]/comments  — list comments for a flag
 * POST /api/flags/[id]/comments  — add a comment / resolution comment
 */

import { NextRequest, NextResponse } from "next/server";
import { readSheet, appendRowByFields, getNextSeq, generateId } from "@/lib/sheets";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const rows = await readSheet("FLAGS_COMMENTS");
    const comments = rows
      .filter((c) => c.FLAG_ID === id)
      .sort((a, b) => (a.COMMENT_DATE ?? "").localeCompare(b.COMMENT_DATE ?? ""));
    return NextResponse.json({ comments });
  } catch (err) {
    console.error("[flags/[id]/comments GET]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // BUG-FLG-002: Read caller identity from JWT headers, not body
    const callerId   = req.headers.get("x-user-id")  ?? "";
    const callerRole = req.headers.get("x-user-role") ?? "";

    if (!callerId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      comment_text,
      attachment_url = "",
      is_resolution_comment = "N",
    } = body;

    if (!comment_text?.trim()) {
      return NextResponse.json(
        { error: "comment_text is required" },
        { status: 400 }
      );
    }

    // Ensure flag exists and look up caller name
    const [flags, users] = await Promise.all([readSheet("FLAGS"), readSheet("USERS")]);
    const flag = flags.find((f) => f.FLAG_ID === id);
    if (!flag) {
      return NextResponse.json({ error: "Flag not found" }, { status: 404 });
    }
    const actor = users.find((u) => u.USER_ID === callerId);
    const callerName = actor?.FULL_NAME ?? callerId;

    const seq = await getNextSeq("FLAGS_COMMENTS");
    const commentId = generateId("FCMT", seq);
    const now = new Date().toISOString();

    await appendRowByFields("FLAGS_COMMENTS", {
      COMMENT_ID:             commentId,
      FLAG_ID:                id,
      COMMENT_DATE:           now,
      COMMENTED_BY_USER_ID:   callerId,
      COMMENTED_BY_NAME:      callerName,
      COMMENTED_BY_ROLE:      callerRole,
      COMMENT_TEXT:           comment_text.trim(),
      ATTACHMENT_URL:         attachment_url,
      IS_RESOLUTION_COMMENT:  is_resolution_comment,
    });

    return NextResponse.json({ success: true, comment_id: commentId }, { status: 201 });
  } catch (err) {
    console.error("[flags/[id]/comments POST]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
