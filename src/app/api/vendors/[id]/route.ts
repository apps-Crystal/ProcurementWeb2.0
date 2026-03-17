/**
 * GET /api/vendors/[id] — fetch a single vendor + its sub-profiles
 */

import { NextRequest, NextResponse } from "next/server";
import { readSheet } from "@/lib/sheets";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const [vendors, allSubProfiles] = await Promise.all([
      readSheet("VENDORS"),
      readSheet("VENDOR_SUB_PROFILES"),
    ]);

    const vendor = vendors.find((r) => r.VENDOR_ID === id);
    if (!vendor) {
      return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
    }

    const subProfiles = allSubProfiles.filter((r) => r.VENDOR_ID === id);

    return NextResponse.json({ vendor, subProfiles });
  } catch (err) {
    console.error("[GET /api/vendors/[id]]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
