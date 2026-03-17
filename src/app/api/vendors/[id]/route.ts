/**
 * GET /api/vendors/[id] — fetch a single vendor by VENDOR_ID
 */

import { NextRequest, NextResponse } from "next/server";
import { readSheet } from "@/lib/sheets";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const rows = await readSheet("VENDORS");
    const vendor = rows.find((r) => r.VENDOR_ID === id);
    if (!vendor) {
      return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
    }
    return NextResponse.json({ vendor });
  } catch (err) {
    console.error("[GET /api/vendors/[id]]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
