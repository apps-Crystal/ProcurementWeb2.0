/**
 * GET  /api/po/[id]  — fetch single PO with its line items
 * PATCH /api/po/[id] — update PO status (ACKNOWLEDGE, ACCEPT, CANCEL)
 */

import { NextRequest, NextResponse } from "next/server";
import { readSheet, updateRowWhere, writeAuditLog } from "@/lib/sheets";
import { sendPoAcceptanceConfirm } from "@/lib/email";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const rows = await readSheet("PO");
  const po = rows.find((r) => r.PO_ID === id);
  if (!po) return NextResponse.json({ error: "PO not found" }, { status: 404 });

  const allLines = await readSheet("PO_LINES");
  const lines = allLines.filter((l) => l.PO_ID === id);

  return NextResponse.json({ po, lines });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { action, reason, updated_by = "VENDOR" } = await req.json();

    const now = new Date().toISOString();

    const statusMap: Record<string, string> = {
      ACKNOWLEDGE: "ACKNOWLEDGED",
      ACCEPT:      "ACCEPTED",
      CANCEL:      "CANCELLED",
    };

    const newStatus = statusMap[action];
    if (!newStatus) {
      return NextResponse.json(
        { error: "action must be ACKNOWLEDGE, ACCEPT, or CANCEL" },
        { status: 400 }
      );
    }

    // Build field updates — ACK and ACCEPTANCE columns per schema
    const extraFields: Record<string, string> = {};
    if (action === "ACKNOWLEDGE") {
      extraFields.ACK_STATUS    = "ACKNOWLEDGED";
      extraFields.ACK_TIMESTAMP = now;
      extraFields.ACK_METHOD    = "EMAIL_LINK";
    }
    if (action === "ACCEPT") {
      extraFields.ACK_STATUS            = "ACKNOWLEDGED";   // also mark acked if not done
      extraFields.ACCEPTANCE_STATUS     = "ACCEPTED";
      extraFields.ACCEPTANCE_TIMESTAMP  = now;
    }
    if (action === "CANCEL" && reason) {
      extraFields.CANCELLATION_REASON = reason;
    }

    await updateRowWhere("PO", "PO_ID", id, {
      STATUS:            newStatus,
      LAST_UPDATED_BY:   updated_by,
      LAST_UPDATED_DATE: now,
      ...extraFields,
    });

    await writeAuditLog({ userId: updated_by, module: "PO", recordId: id, action: `PO_${action}`, remarks: reason ?? "" });

    // ── Email 3: Acceptance Confirmation ─────────────────────────────────────
    if (action === "ACCEPT") {
      const rows    = await readSheet("PO");
      const po      = rows.find((r) => r.PO_ID === id);
      if (po?.VENDOR_EMAIL) {
        const vendorRows  = await readSheet("VENDORS");
        const vendorRow   = vendorRows.find((v) => v.VENDOR_ID === po.VENDOR_ID);
        const contactName = vendorRow?.CONTACT_PERSON ?? po.VENDOR_NAME ?? "Vendor";

        sendPoAcceptanceConfirm({
          poId:                   id,
          poDate:                 po.PO_DATE ?? now.slice(0, 10),
          totalAmount:            po.GRAND_TOTAL ?? "0",
          deliveryDate:           po.DELIVERY_DATE ?? "",
          deliveryLocation:       po.DELIVERY_LOCATION ?? "",
          vendorContactName:      contactName,
          vendorEmail:            po.VENDOR_EMAIL,
          procurementOfficerName: po.CREATED_BY ?? "Procurement Team",
        }).catch((err) => console.error("[email] Acceptance confirm failed:", err));
      }
    }

    return NextResponse.json({ success: true, po_id: id, status: newStatus });
  } catch (err) {
    console.error("[po/[id] PATCH]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
