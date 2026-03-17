/**
 * GET /api/flags
 *
 * Aggregates system flags from:
 *   1. MATCH sheet — rows with status != MATCHED (variance flags)
 *   2. VENDORS sheet — compliance alerts (expired MSME cert, etc.)
 *
 * PATCH /api/flags/[id] — resolve a flag (handled in /api/flags/[id]/route.ts)
 */

import { NextRequest, NextResponse } from "next/server";
import { readSheet, appendRowByFields, getNextSeq, generateId } from "@/lib/sheets";

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status"); // "OPEN" | "RESOLVED" | null

  const [matchRows, vendorRows] = await Promise.all([
    readSheet("MATCH"),
    readSheet("VENDORS"),
  ]);

  const flags: Record<string, string>[] = [];

  // ── Match variance flags ───────────────────────────────────────────────────
  for (const m of matchRows) {
    if (!m.MATCH_STATUS || m.MATCH_STATUS === "MATCHED") continue;

    let type = "Variance";
    let description = "";
    let severity = "Medium";

    if (m.MATCH_STATUS === "PRICE_VARIANCE") {
      type = "Price Mismatch";
      description = `Invoice price deviates from PO. Variance: ${m.PRICE_VARIANCE_PCT ?? "?"}%`;
      severity = "High";
    } else if (m.MATCH_STATUS === "QUANTITY_VARIANCE") {
      type = "Quantity Mismatch";
      description = `Billed quantity differs from GRN accepted quantity. Variance: ${m.QTY_VARIANCE_PCT ?? "?"}%`;
      severity = "High";
    } else if (m.MATCH_STATUS === "FRAUD_RISK") {
      type = "Fraud Risk";
      description = `AI confidence below threshold (${m.AI_CONFIDENCE ?? "?"}%). Manual review required.`;
      severity = "High";
    } else if (m.MATCH_STATUS === "NO_GRN") {
      type = "Missing GRN";
      description = "Invoice received but no corresponding GRN exists.";
      severity = "High";
    } else if (m.MATCH_STATUS === "NO_INVOICE") {
      type = "Missing Invoice";
      description = "GRN completed but vendor invoice not yet uploaded.";
      severity = "Medium";
    }

    flags.push({
      FLAG_ID: m.MATCH_ID ? `FLG-${m.MATCH_ID.slice(-8)}` : `FLG-${m.PO_ID}`,
      DATE: m.MATCH_DATE ?? m.CREATED_DATE ?? "",
      TYPE: type,
      DOC_REF: [m.INV_ID, m.PO_ID, m.GRN_ID].filter(Boolean).join(" / "),
      VENDOR_ID: m.VENDOR_ID ?? "",
      VENDOR_NAME: m.VENDOR_NAME ?? "",
      DESCRIPTION: description,
      STATUS: m.FLAG_STATUS ?? "OPEN",
      SEVERITY: severity,
      SOURCE: "MATCH",
      SOURCE_ID: m.MATCH_ID ?? "",
    });
  }

  // ── Vendor compliance flags ────────────────────────────────────────────────
  const today = new Date();
  for (const v of vendorRows) {
    if (v.STATUS !== "ACTIVE") continue;

    // MSME cert expiry — Udyam certificates are valid for life but check if number is missing for MSME vendors
    if (v.IS_MSME === "Y" && !v.UDYAM_REG_NUMBER) {
      flags.push({
        FLAG_ID: `FLG-V-${v.VENDOR_ID}`,
        DATE: today.toISOString().slice(0, 10),
        TYPE: "Vendor Compliance",
        DOC_REF: v.VENDOR_ID,
        VENDOR_ID: v.VENDOR_ID,
        VENDOR_NAME: v.COMPANY_NAME,
        DESCRIPTION: "MSME vendor is missing Udyam Registration Number.",
        STATUS: "OPEN",
        SEVERITY: "Medium",
        SOURCE: "VENDOR",
        SOURCE_ID: v.VENDOR_ID,
      });
    }
  }

  // ── Filter by status if requested ─────────────────────────────────────────
  const result = status ? flags.filter((f) => f.STATUS === status) : flags;

  return NextResponse.json({ flags: result });
}

export async function POST(req: NextRequest) {
  try {
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
      created_by,
    } = body;

    if (!type || !description || !created_by) {
      return NextResponse.json(
        { error: "type, description, and created_by are required" },
        { status: 400 }
      );
    }

    const seq = await getNextSeq("FLAGS");
    const flagId = generateId("FLG", seq);
    const now = new Date().toISOString();

    await appendRowByFields("FLAGS", {
      FLAG_ID:          flagId,
      FLAG_DATE:        now.slice(0, 10),
      TYPE:             type,
      DOC_REF:          doc_ref,
      VENDOR_ID:        vendor_id,
      VENDOR_NAME:      vendor_name,
      DESCRIPTION:      description,
      STATUS:           "OPEN",
      SEVERITY:         severity,
      SOURCE:           source,
      SOURCE_ID:        source_id,
      CREATED_BY:       created_by,
      CREATED_AT:       now,
      RESOLVED_BY:      "",
      RESOLVED_DATE:    "",
      RESOLUTION_NOTES: "",
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
