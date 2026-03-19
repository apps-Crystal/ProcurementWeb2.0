/**
 * PATCH /api/pr/[id]/submit
 * Transitions a DRAFT PR to SUBMITTED status.
 * Validates that required fields are present before submitting.
 */

import { NextRequest, NextResponse } from "next/server";
import { readSheet, updateRowWhere, writeAuditLog } from "@/lib/sheets";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // BUG-004/005: Use caller identity from JWT headers
  const callerId = req.headers.get("x-user-id") ?? "";
  const callerRole = req.headers.get("x-user-role") ?? "";

  // Tolerate user_id from body only as a fallback (for backwards compat with client code)
  let bodyUserId = "";
  try {
    const body = await req.json();
    bodyUserId = body.user_id ?? "";
  } catch { /* empty body ok */ }

  const user_id = callerId || bodyUserId;

  const isSpr   = id.startsWith("SPR-");
  const sheet   = isSpr ? "SPR"    : "MPR";
  const idField = isSpr ? "SPR_ID" : "PR_ID";

  const rows = await readSheet(sheet);
  const pr   = rows.find((r) => r[idField] === id);
  if (!pr) return NextResponse.json({ error: "PR not found" }, { status: 404 });
  if (pr.STATUS !== "DRAFT")
    return NextResponse.json({ error: "Only DRAFT PRs can be submitted this way" }, { status: 400 });

  // Validate required fields are already populated in the draft
  if (isSpr) {
    if (!pr.SERVICE_CATEGORY || !pr.SERVICE_DESCRIPTION || !pr.RATE)
      return NextResponse.json(
        { error: "Draft is missing required fields (Service Category, Description, Rate). Please edit the draft first." },
        { status: 400 }
      );
  } else {
    if (!pr.CATEGORY || !pr.PURPOSE || !pr.EXPECTED_DELIVERY_DATE)
      return NextResponse.json(
        { error: "Draft is missing required fields (Category, Purpose, Delivery Date). Please edit the draft first." },
        { status: 400 }
      );
  }

  // BUG-024: Validate that at least one line item exists
  const lineSheet   = isSpr ? "SPR_LINES" : "MPR_LINES";
  const lineIdField = isSpr ? "SPR_ID"    : "PR_ID";
  const lineRows = await readSheet(lineSheet);
  const prLines  = lineRows.filter((l) => l[lineIdField] === id);
  if (prLines.length === 0) {
    return NextResponse.json(
      { error: "Cannot submit: this PR has no line items. Please add at least one item before submitting." },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();
  await updateRowWhere(sheet, idField, id, {
    STATUS:             "SUBMITTED",
    SUBMITTED_DATE:     now,
    LAST_UPDATED_BY:    user_id ?? "",
    LAST_UPDATED_DATE:  now,
  });

  await writeAuditLog({ userId: user_id ?? "", userRole: callerRole, module: sheet, recordId: id, action: isSpr ? "SPR_SUBMIT" : "MPR_SUBMIT" });

  return NextResponse.json({ success: true });
}
