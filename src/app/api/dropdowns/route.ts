/**
 * GET /api/dropdowns?list=SITES
 *
 * Returns active dropdown options for a given LIST_NAME from the DROPDOWNS sheet.
 * Sorted by SORT_ORDER ascending.
 */

import { NextRequest, NextResponse } from "next/server";
import { readSheet } from "@/lib/sheets";

export async function GET(req: NextRequest) {
  const list = req.nextUrl.searchParams.get("list");

  if (!list) {
    return NextResponse.json({ error: "list query param is required" }, { status: 400 });
  }

  console.log(`[dropdowns] Fetching list: ${list}`);
  try {
    let rows: any[] = [];
    try {
      rows = await readSheet("DROPDOWNS");
    } catch (e) {
      console.warn("[dropdowns] DROPDOWNS sheet not found, trying DROPDOWN");
      rows = await readSheet("DROPDOWN");
    }

    console.log(`[dropdowns] Total rows: ${rows.length}`);

    let filtered = rows
      .filter((r) => r.LIST_NAME === list && r.IS_ACTIVE !== "N")
      .sort((a, b) => {
        const aSo = parseInt(a.SORT_ORDER ?? "0", 10);
        const bSo = parseInt(b.SORT_ORDER ?? "0", 10);
        return aSo - bSo;
      })
      .map((r) => ({ value: r.VALUE, label: r.LABEL ?? r.VALUE }));

    // Fallback if sheet is empty or list missing
    if (filtered.length === 0 && list === "SITE") {
      console.warn("[dropdowns] No sites found in sheet, using fallback list.");
      filtered = [
        { value: "Mumbai HO", label: "Mumbai HO" },
        { value: "Pune Manufacturing", label: "Pune Manufacturing" },
        { value: "Noida R&D", label: "Noida R&D" },
      ];
    }

    console.log(`[dropdowns] Found ${filtered.length} options for ${list}`);
    return NextResponse.json({ options: filtered });
  } catch (err) {
    console.error(`[dropdowns] Error reading dropdown sheet:`, err);
    return NextResponse.json({ 
      options: [], 
      error: "Dropdown sheet not found or empty. Please ensure a sheet named 'DROPDOWNS' or 'DROPDOWN' exists with columns LIST_NAME, VALUE, LABEL, IS_ACTIVE, and SORT_ORDER." 
    }, { status: 500 });
  }
}
