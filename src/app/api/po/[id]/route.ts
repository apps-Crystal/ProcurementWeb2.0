/**
 * GET  /api/po/[id]  — fetch single PO with its line items
 * PATCH /api/po/[id] — update PO status (ACKNOWLEDGE, ACCEPT, CANCEL)
 */

import { NextRequest, NextResponse } from "next/server";
import { readSheet, updateRowWhere, writeAuditLog, appendRowByFields, getNextSeq, generateId } from "@/lib/sheets";
import { sendPoAcceptanceConfirm, sendPoAmendmentReissue } from "@/lib/email";

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
    const { action, reason, updated_by: bodyUpdatedBy = "VENDOR" } = await req.json();

    // BUG-PO-004: Resolve caller identity from JWT for internal actions
    const jwtCallerId = req.headers.get("x-user-id");
    const updated_by  = (action === "CANCEL" || action === "RE_ISSUE")
      ? (jwtCallerId ?? bodyUpdatedBy)
      : bodyUpdatedBy;

    // BUG-PO-004: Role check for CANCEL
    if (action === "CANCEL") {
      const callerRole   = req.headers.get("x-user-role") ?? "";
      const allowedRoles = ["System_Admin", "Procurement_Head"];
      if (jwtCallerId && !allowedRoles.includes(callerRole)) {
        return NextResponse.json(
          { error: "Only Procurement_Head or System_Admin may cancel a PO (SOP §6.4)." },
          { status: 403 }
        );
      }
    }

    const now = new Date().toISOString();

    const statusMap: Record<string, string> = {
      ACKNOWLEDGE: "ACKNOWLEDGED",
      ACCEPT:      "ACCEPTED",
      CANCEL:      "CANCELLED",
      RE_ISSUE:    "ISSUED",
    };

    const newStatus = statusMap[action];
    if (!newStatus) {
      return NextResponse.json(
        { error: "action must be ACKNOWLEDGE, ACCEPT, CANCEL, or RE_ISSUE" },
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
    if (action === "RE_ISSUE") {
      extraFields.RELEASED_BY   = updated_by;
      extraFields.RELEASED_DATE = now;
    }

    // BUG-PO-005: Block CANCEL if any non-cancelled GRNs exist (SOP §6.4)
    if (action === "CANCEL") {
      const allGRNs    = await readSheet("GRN");
      const linkedGRNs = allGRNs.filter(
        (g: Record<string, string>) => g.PO_ID === id && g.STATUS !== "CANCELLED"
      );
      if (linkedGRNs.length > 0) {
        return NextResponse.json(
          { error: `Cannot cancel PO — ${linkedGRNs.length} GRN(s) already recorded against it (SOP §6.4). Use the amendment workflow to manage partial cancellations.` },
          { status: 422 }
        );
      }
    }

    await updateRowWhere("PO", "PO_ID", id, {
      STATUS:            newStatus,
      LAST_UPDATED_BY:   updated_by,
      LAST_UPDATED_DATE: now,
      ...extraFields,
    });

    await writeAuditLog({ userId: updated_by, module: "PO", recordId: id, action: `PO_${action}`, remarks: reason ?? "" });

    // BUG-PO-003: Auto-create advance payment entry on vendor acceptance (SOP §6.2 Step 2)
    if (action === "ACCEPT") {
      const poRows  = await readSheet("PO");
      const po      = poRows.find((r: Record<string, string>) => r.PO_ID === id);
      const advancePct = parseFloat(po?.ADVANCE_PAYMENT_PCT ?? "0");
      const advanceAmt = parseFloat(po?.ADVANCE_AMOUNT      ?? "0");

      if (po && advancePct > 0 && advanceAmt > 0) {
        const advSeq = await getNextSeq("PAYMENTS");
        const payId  = generateId("PAY", advSeq);

        await appendRowByFields("PAYMENTS", {
          PAY_ID:             payId,
          PAYMENT_TYPE:       "Advance",
          PO_ID:              id,
          PR_ID:              po.SOURCE_PR_ID   ?? "",
          PR_TYPE:            po.SOURCE_PR_TYPE ?? "",
          VENDOR_ID:          po.VENDOR_ID      ?? "",
          VENDOR_NAME:        po.VENDOR_NAME    ?? "",
          INVOICE_NUMBER:     "",
          INVOICE_DATE:       "",
          GROSS_AMOUNT:       advanceAmt,
          ADVANCE_PAID:       "0",
          CREDIT_NOTES:       "0",
          DEBIT_NOTES:        "0",
          TDS_AMOUNT:         "0",
          NET_PAYABLE:        advanceAmt,
          PAYMENT_MODE:       "",
          BANK_ACCOUNT:       "",
          IFSC_CODE:          "",
          PAYMENT_DUE_DATE:   now.slice(0, 10),
          MSME_FLAG:          "N",
          PRIORITY_LEVEL:     "NORMAL",
          STATUS:             "SUBMITTED",
          IS_PREPAID:         "N",
          CREATED_BY:         updated_by,
          CREATED_DATE:       now,
          LAST_UPDATED_BY:    updated_by,
          LAST_UPDATED_DATE:  now,
        });

        await updateRowWhere("PO", "PO_ID", id, { ADVANCE_RECOVERY_TRIGGERED: "Y" });

        await writeAuditLog({
          userId:   updated_by,
          module:   "PAYMENTS",
          recordId: payId,
          action:   "ADVANCE_PAYMENT_AUTO_CREATED",
          remarks:  `Auto-created on vendor acceptance of PO ${id}. Advance: ₹${advanceAmt}`,
        });
      }
    }

    // ── Email 4: Amendment Re-issue Notification ──────────────────────────────
    if (action === "RE_ISSUE") {
      const [rows, allPoLines] = await Promise.all([readSheet("PO"), readSheet("PO_LINES")]);
      const po   = rows.find((r) => r.PO_ID === id);
      if (po?.VENDOR_EMAIL) {
        const vendorRows  = await readSheet("VENDORS");
        const vendorRow   = vendorRows.find((v) => v.VENDOR_ID === po.VENDOR_ID);
        const contactName = vendorRow?.CONTACT_PERSON ?? po.VENDOR_NAME ?? "Vendor";
        const poLines     = allPoLines
          .filter((l) => l.PO_ID === id)
          .sort((a, b) => parseInt(a.LINE_NUMBER ?? "0") - parseInt(b.LINE_NUMBER ?? "0"));

        sendPoAmendmentReissue({
          poId:                   id,
          poDate:                 po.PO_DATE ?? now.slice(0, 10),
          totalAmount:            po.GRAND_TOTAL ?? "0",
          deliveryDate:           po.DELIVERY_DATE ?? "",
          deliveryLocation:       po.DELIVERY_LOCATION ?? "",
          vendorContactName:      contactName,
          vendorEmail:            po.VENDOR_EMAIL,
          procurementOfficerName: updated_by,
          version:                po.PO_VERSION ?? "2",
          amendmentType:          "Amendment",
          amendmentReason:        po.AMENDMENT_REASON ?? "",
          paymentTerms:           po.PAYMENT_TERMS ?? "Standard",
          advancePercent:         po.ADVANCE_PAYMENT_PCT ?? 0,
          advanceAmount:          po.ADVANCE_AMOUNT ?? 0,
          specialTerms:           po.TC_CUSTOMISATION_NOTES ?? po.SPECIAL_COMMERCIAL_TERMS ?? "",
          lines: poLines.map((l) => ({
            itemDescription: l.ITEM_DESCRIPTION ?? l.ITEM_NAME ?? "",
            qty:             l.ORDERED_QTY ?? 0,
            uom:             l.UNIT_OF_MEASURE ?? "",
            rate:            l.RATE ?? 0,
            gstPercent:      l.GST_PERCENT ?? 0,
            lineTotal:       l.LINE_TOTAL ?? 0,
          })),
        }).catch((err) => console.error("[email] Amendment re-issue notify failed:", err));
      }
    }

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
