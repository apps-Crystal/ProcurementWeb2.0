/**
 * GET /api/grn/[id]/lines — fetch line items for a GRN
 */

import { NextRequest, NextResponse } from "next/server";
import { readSheet } from "@/lib/sheets";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const allLines = await readSheet("GRN_LINES");
    const lines = allLines.filter((l) => l.GRN_ID === id);
    return NextResponse.json({ lines });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
