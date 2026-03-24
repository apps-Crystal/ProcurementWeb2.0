/**
 * GET /api/flags
 *
 * Aggregates system flags from three sources:
 *   1. FLAGS sheet        — manually raised flags + GRN-verify flags
 *   2. THREE_WAY_MATCH sheet — variance flags from the match engine
 *   3. VENDORS sheet      — compliance alerts (missing Udyam, etc.)
 *
 * PATCH /api/flags/[id] — resolve a flag (handled in /api/flags/[id]/route.ts)
 */

import { NextRequest, NextResponse } from "next/server";
import { readSheet, appendRowByFields, getNextSeq, generateId } from "@/lib/sheets";

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status"); // "OPEN" | "RESOLVED" | null

  const [flagRows, matchRows, vendorRows] = await Promise.all([
    readSheet("FLAGS"),
    readSheet("THREE_WAY_MATCH"),
    readSheet("VENDORS"),
  ]);

  const flags: Record<string, string>[] = [];

  // ── 1. Manual / GRN-verify flags from the FLAGS sheet ────────────────────
  for (const f of flagRows) {
    flags.push({
      FLAG_ID:     f.FLAG_ID          ?? "",
      DATE:        f.FLAG_DATE        ?? f.RAISED_DATE?.slice(0, 10) ?? "",
      TYPE:        f.FLAG_TYPE        ?? "Manual Flag",
      DOC_REF:     f.SOURCE_ID        ?? "",
      VENDOR_ID:   f.VENDOR_ID        ?? "",
      VENDOR_NAME: f.RAISED_BY_NAME   ?? "",
      DESCRIPTION: f.FLAG_DESCRIPTION ?? "",
      STATUS:      f.STATUS           ?? "OPEN",
      SEVERITY:    "High",
      SOURCE:      f.SOURCE_TYPE      ?? "MANUAL",
      SOURCE_ID:   f.SOURCE_ID        ?? "",
    });
  }

  // ── 2. Three-Way Match variance flags (fallback for historical records) ──────
  // Real flags are now written directly to the FLAGS sheet by matchEngine.ts.
  // We only derive here for match records that pre-date that change (i.e. those
  // whose MATCH_ID does NOT already have a corresponding real FLAG row).
  const realMatchFlagSourceIds = new Set(
    flagRows
      .filter((f) => f.SOURCE_TYPE === "THREE_WAY_MATCH" && f.SOURCE_ID)
      .map((f) => f.SOURCE_ID)
  );

  for (const m of matchRows) {
    if (!m.MATCH_RESULT || m.MATCH_RESULT === "MATCHED") continue;
    // Skip if a real flag already exists for this match record
    if (m.MATCH_ID && realMatchFlagSourceIds.has(m.MATCH_ID)) continue;

    let type        = "Variance";
    let description = "";
    let severity    = "Medium";

    if (m.MATCH_RESULT === "PRICE_VARIANCE") {
      type        = "Price Mismatch";
      description = `Invoice price deviates from PO. Variance: ${m.RATE_VARIANCE_PCT ?? "?"}%`;
      severity    = "High";
    } else if (m.MATCH_RESULT === "QUANTITY_VARIANCE") {
      type        = "Quantity Mismatch";
      description = `Billed quantity differs from GRN accepted quantity.`;
      severity    = "High";
    } else if (m.MATCH_RESULT === "FRAUD_RISK") {
      type        = "Fraud Risk";
      description = `AI confidence below threshold. Manual review required.`;
      severity    = "High";
    } else if (m.MATCH_RESULT === "NO_GRN") {
      type        = "Missing GRN";
      description = "Invoice received but no corresponding GRN exists.";
      severity    = "High";
    } else if (m.MATCH_RESULT === "NO_INVOICE") {
      type        = "Missing Invoice";
      description = "GRN completed but vendor invoice not yet uploaded.";
      severity    = "Medium";
    }

    flags.push({
      FLAG_ID:     m.MATCH_ID ? `FLG-${m.MATCH_ID.slice(-8)}` : `FLG-${m.PO_ID}`,
      DATE:        m.MATCH_TIMESTAMP?.slice(0, 10) ?? "",
      TYPE:        type,
      DOC_REF:     [m.INVOICE_ID, m.PO_ID, m.GRN_ID].filter(Boolean).join(" / "),
      VENDOR_ID:   m.VENDOR_ID ?? "",
      VENDOR_NAME: "",
      DESCRIPTION: description,
      STATUS:      "OPEN",
      SEVERITY:    severity,
      SOURCE:      "THREE_WAY_MATCH",
      SOURCE_ID:   m.MATCH_ID ?? "",
    });
  }

  // ── 3. Vendor compliance flags ────────────────────────────────────────────
  for (const v of vendorRows) {
    if (v.STATUS !== "ACTIVE") continue;

    if (v.IS_MSME === "Y" && !v.UDYAM_REG_NUMBER) {
      flags.push({
        FLAG_ID:     `FLG-V-${v.VENDOR_ID}`,
        DATE:        new Date().toISOString().slice(0, 10),
        TYPE:        "Vendor Compliance",
        DOC_REF:     v.VENDOR_ID,
        VENDOR_ID:   v.VENDOR_ID,
        VENDOR_NAME: v.COMPANY_NAME,
        DESCRIPTION: "MSME vendor is missing Udyam Registration Number.",
        STATUS:      "OPEN",
        SEVERITY:    "Medium",
        SOURCE:      "VENDOR",
        SOURCE_ID:   v.VENDOR_ID,
      });
    }
  }

  // ── Filter by status if requested ─────────────────────────────────────────
  const result = status ? flags.filter((f) => f.STATUS === status) : flags;

  return NextResponse.json({ flags: result });
}

export async function POST(req: NextRequest) {
  try {
    // BUG-FLG-001: Read caller identity from JWT headers, not body
    const callerId   = req.headers.get("x-user-id")  ?? "";
    const callerRole = req.headers.get("x-user-role") ?? "";

    if (!callerId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const FLAG_ALLOWED_ROLES = ["Procurement_Team", "Accounts", "System_Admin"];
    if (!FLAG_ALLOWED_ROLES.includes(callerRole)) {
      return NextResponse.json(
        { error: "Forbidden: only Procurement_Team, Accounts, or System_Admin may raise flags (SOP §13)." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const {
      type,
      description,
      doc_ref = "",
      vendor_id = "",
      vendor_name = "",
      severity = "Medium",
      source = "MANUAL",
      source_id = "",
    } = body;

    if (!type || !description) {
      return NextResponse.json(
        { error: "type and description are required" },
        { status: 400 }
      );
    }

    const seq    = await getNextSeq("FLAGS");
    const flagId = generateId("FLG", seq);
    const now    = new Date().toISOString();

    await appendRowByFields("FLAGS", {
      FLAG_ID:           flagId,
      FLAG_DATE:         now.slice(0, 10),
      FLAG_TYPE:         type,
      FLAG_DESCRIPTION:  description,
      SOURCE_TYPE:       source,
      SOURCE_ID:         source_id || doc_ref,
      VENDOR_ID:         vendor_id,
      RAISED_BY_USER_ID: callerId,
      RAISED_DATE:       now,
      STATUS:            "OPEN",
    });

    return NextResponse.json({ success: true, flag_id: flagId }, { status: 201 });
  } catch (err) {
    console.error("[flags POST]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
