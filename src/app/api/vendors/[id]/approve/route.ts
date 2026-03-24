/**
 * PATCH /api/vendors/[id]/approve
 *
 * Body: { action, remarks }
 *
 * Caller identity is read from JWT middleware headers (x-user-id, x-user-role).
 *
 * Actions:
 *  VERIFY_REFERENCES — sets REFERENCE_VERIFIED=Y
 *  APPROVE           — sets STATUS=ACTIVE (requires REFERENCE_VERIFIED=Y)
 *  REQUEST_INFO      — keeps STATUS=PENDING_KYC, appends remark
 *  DEACTIVATE        — sets STATUS=DEACTIVATED, DEACTIVATION_REASON=remarks
 */

import { NextRequest, NextResponse } from "next/server";
import { readSheet, updateRowWhere, writeAuditLog } from "@/lib/sheets";

function fmtTs(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
    + " " + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // BUG-VND-003: Read caller identity from JWT headers, not body
    const callerId   = req.headers.get("x-user-id")   ?? "";
    const callerRole = req.headers.get("x-user-role")  ?? "";

    if (!callerId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // BUG-VND-004: Role enforcement for vendor approval actions
    const APPROVE_ALLOWED_ROLES = ["Procurement_Team", "Procurement_Head", "System_Admin"];
    if (!APPROVE_ALLOWED_ROLES.includes(callerRole)) {
      return NextResponse.json(
        { error: "Forbidden: only Procurement_Team, Procurement_Head, or System_Admin may perform vendor approval actions (SOP §11.2)." },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await req.json() as { action: string; remarks?: string };
    const { action, remarks = "" } = body;

    if (!action) {
      return NextResponse.json(
        { error: "action is required" },
        { status: 400 }
      );
    }

    // Load current vendor
    const rows = await readSheet("VENDORS");
    const vendor = rows.find((r) => r.VENDOR_ID === id);
    if (!vendor) {
      return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
    }

    const now = new Date().toISOString();

    if (action === "VERIFY_REFERENCES") {
      await updateRowWhere("VENDORS", "VENDOR_ID", id, {
        REFERENCE_VERIFIED: "Y",
        LAST_UPDATED_BY: callerId,
        LAST_UPDATED_DATE: now,
      });
      await writeAuditLog({ userId: callerId, module: "VENDORS", recordId: id, action: "VENDOR_REFERENCES_VERIFIED", remarks });
    } else if (action === "APPROVE") {
      if (vendor.REFERENCE_VERIFIED !== "Y") {
        return NextResponse.json(
          { error: "References must be verified first" },
          { status: 400 }
        );
      }
      await updateRowWhere("VENDORS", "VENDOR_ID", id, {
        STATUS: "ACTIVE",
        APPROVED_BY: callerId,
        APPROVED_DATE: now,
        LAST_UPDATED_BY: callerId,
        LAST_UPDATED_DATE: now,
      });
      await writeAuditLog({ userId: callerId, module: "VENDORS", recordId: id, action: "VENDOR_APPROVED", remarks });
    } else if (action === "REQUEST_INFO") {
      // Resolve user name for readable log entry
      const userRows = await readSheet("USERS");
      const actor = userRows.find((u) => u.USER_ID === callerId);
      const actorName = actor?.FULL_NAME ?? callerId;

      const existingRemarks = vendor.REMARKS ?? "";
      const logEntry = `[${fmtTs(now)}] ${actorName}: ${remarks}`;
      const newRemarks = existingRemarks ? `${existingRemarks}\n${logEntry}` : logEntry;
      await updateRowWhere("VENDORS", "VENDOR_ID", id, {
        STATUS: "PENDING_KYC",
        REMARKS: newRemarks,
        LAST_UPDATED_BY: callerId,
        LAST_UPDATED_DATE: now,
      });
      await writeAuditLog({ userId: callerId, module: "VENDORS", recordId: id, action: "VENDOR_INFO_REQUESTED", remarks });
    } else if (action === "DEACTIVATE") {
      await updateRowWhere("VENDORS", "VENDOR_ID", id, {
        STATUS: "DEACTIVATED",
        DEACTIVATION_REASON: remarks,
        LAST_UPDATED_BY: callerId,
        LAST_UPDATED_DATE: now,
      });
      await writeAuditLog({ userId: callerId, module: "VENDORS", recordId: id, action: "VENDOR_DEACTIVATED", remarks });
    } else {
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    // Return updated vendor
    const updatedRows = await readSheet("VENDORS");
    const updatedVendor = updatedRows.find((r) => r.VENDOR_ID === id);

    return NextResponse.json({ vendor: updatedVendor });
  } catch (err) {
    console.error("[PATCH /api/vendors/[id]/approve]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
