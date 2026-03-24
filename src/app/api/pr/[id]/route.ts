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

  let lines = allLines.filter((l) => l[idField] === id);

  // SPRs store line data directly on the SPR row — synthesize a single line so
  // the detail page can render it without a separate SPR_LINES sheet entry.
  if (isSpr && lines.length === 0) {
    const qty   = parseFloat(pr.QUANTITY ?? "1");
    const rate  = parseFloat(pr.RATE ?? "0");
    const gst   = parseFloat(pr.GST_PERCENT ?? "0");
    const base  = qty * rate;
    const gstAmt = (base * gst) / 100;
    lines = [{
      LINE_NUMBER:            "1",
      ITEM_NAME:              pr.SERVICE_DESCRIPTION ?? pr.SERVICE_CATEGORY ?? "Service",
      ITEM_DESCRIPTION:       pr.SERVICE_DESCRIPTION ?? "",
      SERVICE_DESCRIPTION:    pr.SERVICE_DESCRIPTION ?? "",
      UNIT_OF_MEASURE:        "Service",
      QUANTITY:               pr.QUANTITY ?? "1",
      RATE:                   pr.RATE ?? "0",
      GST_PERCENT:            pr.GST_PERCENT ?? "0",
      SAC_CODE:               pr.SAC_CODE ?? "",
      LINE_AMOUNT_BEFORE_GST: String(base),
      GST_AMOUNT:             String(gstAmt),
      LINE_TOTAL:             String(base + gstAmt),
      AI_OVERRIDDEN:          "",
    }];
  }

  return NextResponse.json({ pr, lines, pr_type: isSpr ? "SPR" : "MPR" });
}
