/**
 * POST /api/po/[id]/amend
 * SOP §6.3 — PO Amendment: re-versions the PO, resets vendor ack/acceptance,
 * and logs the amendment in the audit trail.
 * SOP §6.4 — Cancellation only permitted if no GRN exists against the PO.
 */

import { NextRequest, NextResponse } from "next/server";
import { readSheet, updateRowWhere, writeAuditLog, appendRowByFields, deleteRowsWhere, generateId, getNextSeq } from "@/lib/sheets";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // BUG-PO-007: JWT identity and role enforcement (SOP §6.3 / §15.1)
    const callerId   = req.headers.get("x-user-id")   ?? "";
    const callerRole = req.headers.get("x-user-role") ?? "";

    if (!callerId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const allowedRoles = ["System_Admin", "Procurement_Head"];
    if (!allowedRoles.includes(callerRole)) {
      return NextResponse.json(
        { error: "Only Procurement_Head or System_Admin may amend a PO (SOP §6.3)." },
        { status: 403 }
      );
    }

    const body = await req.json();

    const {
      amendment_type,   // "Value Enhancement" | "Timeline Extension" | "Scope Change" | "Cancellation"
      reason,
      new_value,        // for Value Enhancement
      new_delivery_date,// for Timeline Extension
      scope_notes,      // for Scope Change
      ld_waiver,        // boolean, for Timeline Extension
      line_items,       // array of line changes, for Scope Change
    } = body;

    if (!amendment_type || !reason) {
      return NextResponse.json(
        { error: "amendment_type and reason are required" },
        { status: 400 }
      );
    }

    // ── Fetch original PO ─────────────────────────────────────────────────────
    const allPOs = await readSheet("PO");
    const po = allPOs.find((r) => r.PO_ID === id);
    if (!po) {
      return NextResponse.json({ error: "PO not found" }, { status: 404 });
    }

    // Only confirmed POs can be amended
    const amendableStatuses = ["ACCEPTED", "ACKNOWLEDGED", "ISSUED", "RELEASED", "AMENDMENT_PENDING"];
    if (!amendableStatuses.includes(po.STATUS ?? "")) {
      return NextResponse.json(
        { error: `PO cannot be amended in status: ${po.STATUS}. Must be ACCEPTED or ACKNOWLEDGED.` },
        { status: 422 }
      );
    }

    // ── Cancellation: block if GRN exists ─────────────────────────────────────
    if (amendment_type === "Cancellation") {
      const allGRNs = await readSheet("GRN");
      const linkedGRNs = allGRNs.filter(
        (g) => g.PO_ID === id && g.STATUS !== "CANCELLED"
      );
      if (linkedGRNs.length > 0) {
        return NextResponse.json(
          { error: `Cannot cancel PO — ${linkedGRNs.length} GRN(s) already recorded against it (SOP §6.4).` },
          { status: 422 }
        );
      }
    }

    // ── Increment version ─────────────────────────────────────────────────────
    const currentVersion = parseInt(po.PO_VERSION ?? "1", 10);
    const newVersion = currentVersion + 1;
    const now = new Date().toISOString();

    // ── Build field updates ───────────────────────────────────────────────────
    const updates: Record<string, string> = {
      PO_VERSION:         String(newVersion),
      AMENDMENT_REASON:   reason,
      AMENDMENT_APPROVED_BY: callerId,
      // Reset vendor ack/acceptance — re-send required per SOP §6.3
      ACK_STATUS:          "PENDING",
      ACCEPTANCE_STATUS:   "PENDING",
      LAST_UPDATED_BY:     callerId,
      LAST_UPDATED_DATE:   now,
    };

    if (amendment_type === "Cancellation") {
      updates.STATUS            = "CANCELLED";
      updates.CANCELLATION_REASON = reason;
      updates.CANCELLED_BY      = callerId;
      updates.CANCELLED_DATE    = now;
    } else {
      updates.STATUS = "AMENDMENT_PENDING";
      if (amendment_type === "Value Enhancement" && new_value) {
        // BUG-PO-006: Proportionally recalculate SUBTOTAL and TOTAL_GST so financials stay consistent
        const freight       = parseFloat(po.FREIGHT_CHARGES      ?? "0") || 0;
        const install       = parseFloat(po.INSTALLATION_CHARGES ?? "0") || 0;
        const oldSubtotal   = parseFloat(po.SUBTOTAL             ?? "0") || 0;
        const oldTotalGst   = parseFloat(po.TOTAL_GST            ?? "0") || 0;
        const taxableBase   = new_value - freight - install;
        const oldTaxable    = (oldSubtotal + oldTotalGst) || 1;
        const scaleFactor   = taxableBase / oldTaxable;
        const newSubtotal   = parseFloat((oldSubtotal * scaleFactor).toFixed(2));
        const newTotalGst   = parseFloat((taxableBase - newSubtotal).toFixed(2));
        updates.SUBTOTAL    = String(newSubtotal);
        updates.TOTAL_GST   = String(newTotalGst);
        updates.GRAND_TOTAL = String(new_value);
      }
      if (amendment_type === "Timeline Extension" && new_delivery_date) {
        updates.DELIVERY_DATE = new_delivery_date;
        if (ld_waiver) {
          updates.TC_CUSTOMISATION_NOTES =
            `LD waiver granted for delivery extension. ${po.TC_CUSTOMISATION_NOTES ?? ""}`.trim();
        }
      }
      if (amendment_type === "Scope Change") {
        if (scope_notes) updates.TC_CUSTOMISATION_NOTES = scope_notes;

        if (Array.isArray(line_items) && line_items.length > 0) {
          for (const item of line_items) {
            const qty    = parseFloat(item.ORDERED_QTY) || 0;
            const rate   = parseFloat(item.RATE) || 0;
            const gst    = parseFloat(item.GST_PERCENT) || 0;
            const lamt   = qty * rate;
            const gstAmt = lamt * (gst / 100);
            const ltotal = lamt + gstAmt;

            if (item._action === "delete") {
              await deleteRowsWhere("PO_LINES", "PO_LINE_ID", item.PO_LINE_ID);
            } else if (item._action === "add") {
              const seq = await getNextSeq("PO_LINES");
              await appendRowByFields("PO_LINES", {
                PO_LINE_ID:             generateId("POL", seq),
                PO_ID:                  id,
                LINE_NUMBER:            item.LINE_NUMBER ?? String(seq),
                MPR_LINE_ID:            "",
                ITEM_NAME:              item.ITEM_NAME ?? "",
                ITEM_DESCRIPTION:       item.ITEM_DESCRIPTION || item.ITEM_NAME || "",
                UNIT_OF_MEASURE:        item.UNIT_OF_MEASURE ?? "",
                ORDERED_QTY:            String(qty),
                RATE:                   String(rate),
                GST_PERCENT:            String(gst),
                HSN_SAC_CODE:           item.HSN_SAC_CODE ?? "",
                LINE_AMOUNT_BEFORE_GST: String(lamt),
                GST_AMOUNT:             String(gstAmt),
                LINE_TOTAL:             String(ltotal),
                QTY_RECEIVED:           "0",
                QTY_OUTSTANDING:        String(qty),
                REMARKS:                item.REMARKS ?? "",
              });
            } else {
              await updateRowWhere("PO_LINES", "PO_LINE_ID", item.PO_LINE_ID, {
                ITEM_NAME:              item.ITEM_NAME ?? "",
                ITEM_DESCRIPTION:       item.ITEM_DESCRIPTION ?? "",
                UNIT_OF_MEASURE:        item.UNIT_OF_MEASURE ?? "",
                ORDERED_QTY:            String(qty),
                RATE:                   String(rate),
                GST_PERCENT:            String(gst),
                HSN_SAC_CODE:           item.HSN_SAC_CODE ?? "",
                LINE_AMOUNT_BEFORE_GST: String(lamt),
                GST_AMOUNT:             String(gstAmt),
                LINE_TOTAL:             String(ltotal),
                REMARKS:                item.REMARKS ?? "",
              });
            }
          }

          // Recalculate PO header totals from remaining lines
          const refreshed  = (await readSheet("PO_LINES")).filter(l => l.PO_ID === id);
          const subtotal   = refreshed.reduce((s, l) => s + (parseFloat(l.LINE_AMOUNT_BEFORE_GST) || 0), 0);
          const totalGst   = refreshed.reduce((s, l) => s + (parseFloat(l.GST_AMOUNT) || 0), 0);
          const freight    = parseFloat(po.FREIGHT_CHARGES    || "0");
          const install    = parseFloat(po.INSTALLATION_CHARGES || "0");
          const freightGst = parseFloat(po.FREIGHT_GST        || "0");
          updates.SUBTOTAL    = String(subtotal);
          updates.TOTAL_GST   = String(totalGst);
          updates.GRAND_TOTAL = String(subtotal + totalGst + freight + install + freightGst);
        }
      }
    }

    await updateRowWhere("PO", "PO_ID", id, updates);

    await writeAuditLog({
      userId:   callerId,
      module:   "PO",
      recordId: id,
      action:   `PO_AMENDMENT_${amendment_type.toUpperCase().replace(/ /g, "_")}`,
      remarks:  reason,
    });

    return NextResponse.json({
      success:     true,
      po_id:       id,
      new_version: newVersion,
      status:      updates.STATUS,
    });
  } catch (err) {
    console.error("[po/[id]/amend POST]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
