/**
 * GET  /api/flags/[id]  — single flag detail + linked comments
 * PATCH /api/flags/[id] — resolve a flag (SOP §10.2)
 */

import { NextRequest, NextResponse } from "next/server";
import { readSheet, updateRowWhere, writeAuditLog } from "@/lib/sheets";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const [flagRows, commentRows] = await Promise.all([
      readSheet("FLAGS"),
      readSheet("FLAGS_COMMENTS"),
    ]);
    const flag = flagRows.find((f) => f.FLAG_ID === id);
    if (!flag) {
      return NextResponse.json({ error: "Flag not found" }, { status: 404 });
    }
    const comments = commentRows
      .filter((c) => c.FLAG_ID === id)
      .sort((a, b) => (a.COMMENT_DATE ?? "").localeCompare(b.COMMENT_DATE ?? ""));
    return NextResponse.json({ flag, comments });
  } catch (err) {
    console.error("[flags/[id] GET]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

const ALLOWED_ROLES = ["Accounts", "Management", "System_Admin"];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const callerRole = req.headers.get("x-user-role") ?? "";
    if (!ALLOWED_ROLES.includes(callerRole)) {
      return NextResponse.json(
        { error: "Forbidden: only Accounts, Management, or System_Admin may resolve flags." },
        { status: 403 }
      );
    }

    // BUG-FLG-003: Read callerId from JWT headers, not body
    const callerId = req.headers.get("x-user-id") ?? "";
    if (!callerId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const { resolution_notes = "" } = await req.json();

    if (!resolution_notes.trim()) {
      return NextResponse.json(
        { error: "Resolution notes are required (SOP §10.2)." },
        { status: 400 }
      );
    }

    // Verify flag exists in FLAGS sheet
    const flags = await readSheet("FLAGS");
    const flag  = flags.find((f) => f.FLAG_ID === id);
    if (!flag) {
      return NextResponse.json({ error: "Flag not found" }, { status: 404 });
    }
    if (flag.STATUS === "RESOLVED") {
      return NextResponse.json({ error: "Flag is already resolved." }, { status: 422 });
    }

    const now = new Date().toISOString();

    await updateRowWhere("FLAGS", "FLAG_ID", id, {
      STATUS:                "RESOLVED",
      REVIEWED_BY_USER_ID:   callerId,
      REVIEW_DATE:           now.slice(0, 10),
      REVIEW_COMMENTS:       resolution_notes,
      RESOLUTION:            "RESOLVED",
      RESOLUTION_DATE:       now.slice(0, 10),
      LAST_UPDATED_BY:       callerId,
      LAST_UPDATED_DATE:     now,
    });

    await writeAuditLog({
      userId:   callerId,
      module:   "FLAGS",
      recordId: id,
      action:   "FLAG_RESOLVED",
      remarks:  resolution_notes,
    });

    return NextResponse.json({ success: true, flag_id: id, status: "RESOLVED" });
  } catch (err) {
    console.error("[flags/[id]]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
