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
  const { user_id } = await req.json();

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

  const now = new Date().toISOString();
  await updateRowWhere(sheet, idField, id, {
    STATUS:             "SUBMITTED",
    SUBMITTED_DATE:     now,
    LAST_UPDATED_BY:    user_id ?? "",
    LAST_UPDATED_DATE:  now,
  });

  await writeAuditLog({ userId: user_id ?? "", module: sheet, recordId: id, action: isSpr ? "SPR_SUBMIT" : "MPR_SUBMIT" });

  return NextResponse.json({ success: true });
}
