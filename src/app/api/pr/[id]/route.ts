/**
 * GET /api/pr/[id]
 *
 * Fetches a single PR (MPR or SPR) with its line items.
 * Detects type from ID prefix: "SPR-" → SPR, otherwise MPR.
 */

import { NextRequest, NextResponse } from "next/server";
import { readSheet } from "@/lib/sheets";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const isSpr = id.startsWith("SPR-");

  const sheet     = isSpr ? "SPR"       : "MPR";
  const lineSheet = isSpr ? "SPR_LINES" : "MPR_LINES";
  const idField   = isSpr ? "SPR_ID"    : "PR_ID";

  const [rows, allLines] = await Promise.all([
    readSheet(sheet),
    readSheet(lineSheet),
  ]);

  const pr = rows.find((r) => r[idField] === id);
  if (!pr) return NextResponse.json({ error: "PR not found" }, { status: 404 });

  const lines = allLines.filter((l) => l[idField] === id);

  return NextResponse.json({ pr, lines, pr_type: isSpr ? "SPR" : "MPR" });
}
