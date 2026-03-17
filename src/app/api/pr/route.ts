/**
 * GET  /api/pr          — list all PRs (MPR + SPR)
 * POST /api/pr          — not used (use /api/pr/mpr or /api/pr/spr)
 */

import { NextRequest, NextResponse } from "next/server";
import { readSheet } from "@/lib/sheets";

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status");
  const site = req.nextUrl.searchParams.get("site");

  const [mprs, sprs] = await Promise.all([
    readSheet("MPR"),
    readSheet("SPR"),
  ]);

  let all: Array<Record<string, string>> = [
    ...mprs.map((r): Record<string, string> => ({ ...r, PR_TYPE: "MPR" })),
    ...sprs.map((r): Record<string, string> => ({ ...r, PR_TYPE: "SPR" })),
  ];

  if (status) all = all.filter((r) => r.STATUS === status);
  if (site) all = all.filter((r) => r.REQUESTOR_SITE === site);

  // Sort newest first by PR_DATE
  all.sort((a, b) => (b.PR_DATE ?? "").localeCompare(a.PR_DATE ?? ""));

  return NextResponse.json({ prs: all });
}
