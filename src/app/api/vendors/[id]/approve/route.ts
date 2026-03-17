/**
 * PATCH /api/vendors/[id]/approve
 *
 * Body: { action, remarks, approved_by }
 *
 * Actions:
 *  VERIFY_REFERENCES — sets REFERENCE_VERIFIED=Y
 *  APPROVE           — sets STATUS=ACTIVE (requires REFERENCE_VERIFIED=Y)
 *  REQUEST_INFO      — keeps STATUS=PENDING_KYC, appends remark
 *  DEACTIVATE        — sets STATUS=DEACTIVATED, DEACTIVATION_REASON=remarks
 */

import { NextRequest, NextResponse } from "next/server";
import { readSheet, updateRowWhere, writeAuditLog } from "@/lib/sheets";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json() as {
      action: string;
      remarks?: string;
      approved_by: string;
    };

    const { action, remarks = "", approved_by } = body;

    if (!action || !approved_by) {
      return NextResponse.json(
        { error: "action and approved_by are required" },
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
        LAST_UPDATED_BY: approved_by,
        LAST_UPDATED_DATE: now,
      });
      await writeAuditLog({ userId: approved_by, module: "VENDORS", recordId: id, action: "VENDOR_REFERENCES_VERIFIED", remarks });
    } else if (action === "APPROVE") {
      if (vendor.REFERENCE_VERIFIED !== "Y") {
        return NextResponse.json(
          { error: "References must be verified first" },
          { status: 400 }
        );
      }
      await updateRowWhere("VENDORS", "VENDOR_ID", id, {
        STATUS: "ACTIVE",
        APPROVED_BY: approved_by,
        APPROVED_DATE: now,
        LAST_UPDATED_BY: approved_by,
        LAST_UPDATED_DATE: now,
      });
      await writeAuditLog({ userId: approved_by, module: "VENDORS", recordId: id, action: "VENDOR_APPROVED", remarks });
    } else if (action === "REQUEST_INFO") {
      const existingRemarks = vendor.REMARKS ?? "";
      const newRemarks = existingRemarks
        ? `${existingRemarks}\n[${now}] ${approved_by}: ${remarks}`
        : `[${now}] ${approved_by}: ${remarks}`;
      await updateRowWhere("VENDORS", "VENDOR_ID", id, {
        STATUS: "PENDING_KYC",
        REMARKS: newRemarks,
        LAST_UPDATED_BY: approved_by,
        LAST_UPDATED_DATE: now,
      });
      await writeAuditLog({ userId: approved_by, module: "VENDORS", recordId: id, action: "VENDOR_INFO_REQUESTED", remarks });
    } else if (action === "DEACTIVATE") {
      await updateRowWhere("VENDORS", "VENDOR_ID", id, {
        STATUS: "DEACTIVATED",
        DEACTIVATION_REASON: remarks,
        LAST_UPDATED_BY: approved_by,
        LAST_UPDATED_DATE: now,
      });
      await writeAuditLog({ userId: approved_by, module: "VENDORS", recordId: id, action: "VENDOR_DEACTIVATED", remarks });
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
