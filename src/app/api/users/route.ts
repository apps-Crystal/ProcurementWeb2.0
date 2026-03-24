/**
 * GET /api/users — return id→name map for display purposes
 * Query: ?ids=USR-001,USR-002  (optional; returns all if omitted)
 */

import { NextRequest, NextResponse } from "next/server";
import { readSheet } from "@/lib/sheets";

export async function GET(req: NextRequest) {
  const idsParam = req.nextUrl.searchParams.get("ids");
  const rows = await readSheet("USERS");

  const filtered = idsParam
    ? rows.filter((r) => idsParam.split(",").includes(r.USER_ID))
    : rows;

  // Return a lightweight id→name map only
  const nameMap: Record<string, string> = {};
  for (const r of filtered) {
    if (r.USER_ID) nameMap[r.USER_ID] = r.FULL_NAME ?? r.USER_ID;
  }

  return NextResponse.json({ users: nameMap });
}
