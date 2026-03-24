/**
 * GET  /api/srn  — list SRNs (?wo_id= or ?status= filter)
 * POST /api/srn  — submit a new Service Receipt Note
 *
 * SRN documents confirmation of service delivery against a Work Order (service PO).
 * Unlike GRN (goods receipt), SRN lines are scope-item confirmations — no
 * PO_LINES quantity tracking.  The Work Order is marked FULLY_RECEIVED on submit.
 *
 * Caller identity is read from JWT middleware headers (x-user-id, x-user-role).
 */

import { NextRequest, NextResponse } from "next/server";
import {
  readSheet,
  appendRowByFields,
  updateRowWhere,
  getNextSeq,
  generateId,
  writeAuditLog,
} from "@/lib/sheets";

const ALLOWED_ROLES = [
  "Warehouse", "Site_Head", "Procurement_Team", "Accounts", "System_Admin",
];

const VALID_WO_STATUSES = [
  "ISSUED", "ACKNOWLEDGED", "ACCEPTED", "PARTIALLY_RECEIVED",
];

// ── GET ──────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const woId   = req.nextUrl.searchParams.get("wo_id");
  const status = req.nextUrl.searchParams.get("status");

  const rows = await readSheet("SRN");

  const filtered = rows.filter((r) => {
    if (woId   && r.WO_ID  !== woId)   return false;
    if (status && r.STATUS !== status) return false;
    return true;
  });

  return NextResponse.json({ srns: filtered });
}

// ── POST ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    // ── 1. Caller identity ────────────────────────────────────────────────────
    const callerId   = req.headers.get("x-user-id")   ?? "";
    const callerRole = req.headers.get("x-user-role") ?? "";

    if (!callerId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!ALLOWED_ROLES.includes(callerRole)) {
      return NextResponse.json(
        { error: "Forbidden: only Site_Head, Warehouse, Procurement_Team, or Accounts may submit SRNs." },
        { status: 403 }
      );
    }

    const body = await req.json();

    const {
      wo_id,
      receipt_date = new Date().toISOString().slice(0, 10),
      service_period_from = "",
      service_period_to   = "",
      service_description = "",
      site                = "",
      remarks             = "",
      lines               = [] as Record<string, unknown>[],
    } = body;

    // ── 2. Required fields ────────────────────────────────────────────────────
    if (!wo_id) {
      return NextResponse.json(
        { error: "wo_id (Work Order ID) is required." },
        { status: 400 }
      );
    }
    if (!receipt_date) {
      return NextResponse.json({ error: "receipt_date is required." }, { status: 400 });
    }
    if (!Array.isArray(lines) || lines.length === 0) {
      return NextResponse.json(
        { error: "At least one scope line is required." },
        { status: 400 }
      );
    }

    // ── 3. Date validation ────────────────────────────────────────────────────
    const today = new Date().toISOString().slice(0, 10);
    if (receipt_date > today) {
      return NextResponse.json(
        { error: `Receipt date cannot be in the future (today is ${today}).` },
        { status: 400 }
      );
    }

    // ── 4. Validate Work Order ────────────────────────────────────────────────
    const allPOs = await readSheet("PO");
    const wo = allPOs.find((r) => r.PO_ID === wo_id);

    if (!wo) {
      return NextResponse.json(
        { error: `Work Order / PO "${wo_id}" not found.` },
        { status: 404 }
      );
    }

    // BUG-SRN-001: SRN is only valid for service-type POs (SPR). Material POs use GRN.
    if (wo.PO_TYPE !== "SPR" && wo.SOURCE_PR_TYPE !== "SPR") {
      return NextResponse.json(
        { error: `SRN can only be raised against a Service PO (SPR type). PO ${wo_id} is a material PO — use GRN instead.` },
        { status: 422 }
      );
    }

    if (!VALID_WO_STATUSES.includes(wo.STATUS)) {
      return NextResponse.json(
        { error: `Work Order ${wo_id} is not in a receivable state (status: ${wo.STATUS}).` },
        { status: 400 }
      );
    }
    if (wo.PO_DATE && receipt_date < wo.PO_DATE.slice(0, 10)) {
      return NextResponse.json(
        { error: `Receipt date (${receipt_date}) cannot be before the Work Order date (${wo.PO_DATE.slice(0, 10)}).` },
        { status: 400 }
      );
    }

    // ── 5. Validate lines ─────────────────────────────────────────────────────
    const activeLines = lines.filter((l) => String(l.scope_item ?? "").trim() !== "");
    if (activeLines.length === 0) {
      return NextResponse.json(
        { error: "At least one scope item must be provided." },
        { status: 400 }
      );
    }

    for (const [i, line] of activeLines.entries()) {
      const lineNum = i + 1;
      const qty = Number(line.quantity ?? 0);
      if (qty <= 0) {
        return NextResponse.json(
          { error: `Line ${lineNum}: quantity must be greater than zero.` },
          { status: 400 }
        );
      }
      const rate = Number(line.rate ?? 0);
      if (rate < 0) {
        return NextResponse.json(
          { error: `Line ${lineNum}: rate cannot be negative.` },
          { status: 400 }
        );
      }
      const validStatuses = ["DELIVERED", "PARTIAL", "PENDING", "REJECTED"];
      const ds = String(line.delivery_status ?? "DELIVERED");
      if (!validStatuses.includes(ds)) {
        return NextResponse.json(
          { error: `Line ${lineNum}: delivery_status must be one of ${validStatuses.join(", ")}.` },
          { status: 400 }
        );
      }
    }

    // ── 6. Lookup caller name ─────────────────────────────────────────────────
    const users      = await readSheet("USERS");
    const callerUser = users.find((u) => u.USER_ID === callerId);
    const callerName = callerUser?.FULL_NAME ?? callerId;

    const now = new Date().toISOString();

    // ── 7. Generate SRN ID ────────────────────────────────────────────────────
    let seq   = await getNextSeq("SRN");
    let srnId = generateId("SRN", seq);

    const existingSRNs = await readSheet("SRN");
    if (existingSRNs.some((r: Record<string, string>) => r.SRN_ID === srnId)) {
      srnId = generateId("SRN", await getNextSeq("SRN"));
    }

    // ── 8. Write SRN header row ───────────────────────────────────────────────
    const sprId = wo.SOURCE_PR_TYPE === "SPR" ? (wo.SOURCE_PR_ID ?? "") : "";

    await appendRowByFields("SRN", {
      SRN_ID:              srnId,
      SRN_DATE:            receipt_date,
      WO_ID:               wo_id,
      SPR_ID:              sprId,
      VENDOR_ID:           wo.VENDOR_ID   ?? "",
      VENDOR_NAME:         wo.VENDOR_NAME ?? "",
      SITE:                site || wo.DELIVERY_LOCATION || "",
      SERVICE_DESCRIPTION: service_description,
      SERVICE_PERIOD_FROM: service_period_from,
      SERVICE_PERIOD_TO:   service_period_to,
      MILESTONE_CONFIRMED: "",
      MILESTONE_NAME:      "",
      STATUS:              "SUBMITTED",
      RAISED_BY_USER_ID:   callerId,
      RAISED_BY_NAME:      callerName,
      RAISED_DATE:         now,
      LAST_UPDATED_BY:     callerId,
      LAST_UPDATED_DATE:   now,
    });

    // ── 9. Write SRN_LINES ────────────────────────────────────────────────────
    for (const [i, line] of activeLines.entries()) {
      const lseq   = await getNextSeq("SRN_LINES");
      const qty    = Number(line.quantity ?? 1);
      const rate   = Number(line.rate     ?? 0);
      const amount = parseFloat((qty * rate).toFixed(2));

      await appendRowByFields("SRN_LINES", {
        SRN_LINE_ID:     generateId("SRNL", lseq),
        SRN_ID:          srnId,
        LINE_NUMBER:     i + 1,
        SCOPE_ITEM:      String(line.scope_item ?? ""),
        DELIVERY_STATUS: String(line.delivery_status ?? "DELIVERED"),
        QUANTITY:        qty,
        RATE:            rate,
        AMOUNT:          amount,
        REMARKS:         String(line.remarks ?? ""),
      });
    }

    // ── 10. Update Work Order status ──────────────────────────────────────────
    // Service is considered fully received when an SRN is submitted.
    // If any line is PARTIAL or PENDING, mark as PARTIALLY_RECEIVED instead.
    const hasIncomplete = activeLines.some((l) =>
      ["PARTIAL", "PENDING"].includes(String(l.delivery_status ?? "DELIVERED"))
    );
    const newPoStatus = hasIncomplete ? "PARTIALLY_RECEIVED" : "FULLY_RECEIVED";

    await updateRowWhere("PO", "PO_ID", wo_id, {
      STATUS:            newPoStatus,
      LAST_UPDATED_BY:   callerId,
      LAST_UPDATED_DATE: now,
    });

    // ── 11. Audit log ─────────────────────────────────────────────────────────
    await writeAuditLog({
      userId:   callerId,
      userRole: callerRole,
      module:   "SRN",
      recordId: srnId,
      action:   "SRN_CREATED",
      remarks:  `From Work Order: ${wo_id}`,
    });

    return NextResponse.json({ success: true, srn_id: srnId }, { status: 201 });

  } catch (err) {
    console.error("[srn POST]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
