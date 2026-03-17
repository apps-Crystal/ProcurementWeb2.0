/**
 * POST /api/po   — create PO from approved PR
 * GET  /api/po   — list POs
 *
 * Body (POST):
 * {
 *   pr_id, pr_type: "MPR" | "SPR",
 *   vendor_id, vendor_name, vendor_email,
 *   delivery_date, delivery_location,
 *   freight_charges, installation_charges,
 *   advance_percent, tally_po_number,
 *   special_commercial_terms, created_by
 * }
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
import { sendPoDispatch } from "@/lib/email";

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status");
  const rows = await readSheet("PO");
  const filtered = status ? rows.filter((r) => r.STATUS === status) : rows;
  return NextResponse.json({ pos: filtered });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      pr_id,
      pr_type = "MPR",
      vendor_id,
      vendor_name,
      vendor_email = "",
      delivery_date,
      delivery_location = "",
      freight_charges = 0,
      installation_charges = 0,
      advance_percent = 0,
      tally_po_number = "",
      special_commercial_terms = "",
      created_by,
    } = body;

    if (!pr_id || !vendor_id || !delivery_date) {
      return NextResponse.json(
        { error: "pr_id, vendor_id, and delivery_date are required" },
        { status: 400 }
      );
    }

    // Fetch the approved PR
    const prSheet   = pr_type === "SPR" ? "SPR"   : "MPR";
    const prIdField = pr_type === "SPR" ? "SPR_ID" : "PR_ID";
    const prs = await readSheet(prSheet);
    const pr  = prs.find((r) => r[prIdField] === pr_id);

    if (!pr) {
      return NextResponse.json({ error: "PR not found" }, { status: 404 });
    }
    if (pr.STATUS !== "APPROVED") {
      return NextResponse.json(
        { error: "PR must be APPROVED before a PO can be created" },
        { status: 400 }
      );
    }

    // Fetch PR lines to compute totals
    const lineSheet   = pr_type === "SPR" ? "SPR_LINES" : "MPR_LINES";
    const lineIdField = pr_type === "SPR" ? "SPR_ID"    : "PR_ID";
    const prLines = await readSheet(lineSheet);
    const myLines = prLines.filter((l) => l[lineIdField] === pr_id);

    // Compute totals from lines
    const subtotal  = myLines.reduce((s, l) =>
      s + parseFloat(l.LINE_AMOUNT_BEFORE_GST ?? l.LINE_AMOUNT ?? "0"), 0);
    const totalGst  = myLines.reduce((s, l) =>
      s + parseFloat(l.GST_AMOUNT ?? "0"), 0);
    const freightNum        = parseFloat(String(freight_charges))       || 0;
    const installationNum   = parseFloat(String(installation_charges))  || 0;
    const advancePct        = parseFloat(String(advance_percent))       || 0;
    const grandTotal        = subtotal + totalGst + freightNum + installationNum;
    const advanceAmount     = (grandTotal * advancePct) / 100;
    const hasCustomTerms    = special_commercial_terms.trim().length > 0;

    const seq  = await getNextSeq("PO");
    const poId = generateId("PO", seq);
    const now  = new Date().toISOString();

    await appendRowByFields("PO", {
      PO_ID:                       poId,
      PO_TYPE:                     pr_type,
      PO_DATE:                     now.slice(0, 10),
      PO_VERSION:                  "1",
      TALLY_PO_NUMBER:             tally_po_number,
      SOURCE_PR_ID:                pr_id,
      SOURCE_PR_TYPE:              pr_type,
      VENDOR_ID:                   vendor_id,
      VENDOR_NAME:                 vendor_name,
      VENDOR_EMAIL:                vendor_email,
      DELIVERY_DATE:               delivery_date,
      DELIVERY_LOCATION:           delivery_location || pr.DELIVERY_LOCATION || "",
      FREIGHT_CHARGES:             freightNum,
      INSTALLATION_CHARGES:        installationNum,
      PAYMENT_TERMS:               pr.PAYMENT_TERMS ?? "Standard",
      ADVANCE_PAYMENT_PCT:         advancePct,
      ADVANCE_AMOUNT:              advanceAmount,
      PAYMENT_SCHEDULE:            "",
      SUBTOTAL:                    subtotal,
      TOTAL_GST:                   totalGst,
      FREIGHT_GST:                 0,
      GRAND_TOTAL:                 grandTotal,
      TC_STANDARD_APPLIED:         hasCustomTerms ? "N" : "Y",
      TC_CUSTOMISED:               hasCustomTerms ? "Y" : "N",
      TC_CUSTOMISATION_NOTES:      special_commercial_terms,
      TC_APPROVED_BY:              "",
      PO_PDF_URL:                  "",
      CUSTOM_TC_DOC_URL:           "",
      ACK_STATUS:                  "PENDING",
      ACK_TIMESTAMP:               "",
      ACK_METHOD:                  "",
      ACCEPTANCE_STATUS:           "",
      ACCEPTANCE_TIMESTAMP:        "",
      ACCEPTANCE_REMARKS:          "",
      FF_ALL_GRNS_CLOSED:          "N",
      FF_NO_OPEN_FLAGS:            "N",
      FF_WARRANTY_CONFIRMED:       "N",
      FF_ADVANCE_ADJUSTED:         "N",
      FF_NO_PENDING_DEBIT_NOTES:   "N",
      FF_GST_ITC_CONFIRMED:        "N",
      FF_TDS_CONFIRMED:            "N",
      FF_CHECKLIST_COMPLETE:       "N",
      STATUS:                      "ISSUED",
      CREATED_BY:                  created_by,
      CREATED_DATE:                now,
      RELEASED_BY:                 created_by,
      RELEASED_DATE:               now,
      AMENDMENT_REASON:            "",
      AMENDMENT_APPROVED_BY:       "",
      CANCELLATION_REASON:         "",
      CANCELLED_BY:                "",
      CANCELLED_DATE:              "",
      ADVANCE_RECOVERY_TRIGGERED:  "N",
      LAST_UPDATED_BY:             created_by,
      LAST_UPDATED_DATE:           now,
    });

    // Copy PR lines to PO_LINES
    for (const [i, line] of myLines.entries()) {
      const lineSeq = await getNextSeq("PO_LINES");
      await appendRowByFields("PO_LINES", {
        LINE_ID:          generateId("POL", lineSeq),
        PO_ID:            poId,
        LINE_NUMBER:      i + 1,
        ITEM_DESCRIPTION: line.ITEM_NAME ?? line.ITEM_DESCRIPTION ?? line.SERVICE_DESCRIPTION ?? "",
        UOM:              line.UNIT_OF_MEASURE ?? line.UOM ?? "",
        QTY:              line.QUANTITY ?? line.QTY ?? 0,
        RATE:             line.RATE ?? 0,
        GST_PERCENT:      line.GST_PERCENT ?? 0,
        HSN_CODE:         line.HSN_CODE ?? line.SAC_CODE ?? "",
        LINE_AMOUNT:      line.LINE_TOTAL ?? line.LINE_AMOUNT_BEFORE_GST ?? line.LINE_AMOUNT ?? 0,
      });
    }

    // Mark the source PR as PO_CREATED so it leaves the pending queue
    await updateRowWhere(prSheet, prIdField, pr_id, {
      STATUS:            "PO_CREATED",
      LAST_UPDATED_BY:   created_by,
      LAST_UPDATED_DATE: now,
    });

    await writeAuditLog({ userId: created_by, module: "PO", recordId: poId, action: "PO_CREATED", remarks: `From ${pr_type}: ${pr_id}` });

    // ── Email 1: PO Dispatch to Vendor ────────────────────────────────────────
    if (vendor_email) {
      const vendorRows = await readSheet("VENDORS");
      const vendorRow  = vendorRows.find((v) => v.VENDOR_ID === vendor_id);
      const contactName = vendorRow?.CONTACT_PERSON ?? vendor_name;

      // Fire-and-forget — don't block the response on email delivery
      sendPoDispatch({
        poId,
        poDate:               now.slice(0, 10),
        totalAmount:          grandTotal,
        deliveryDate:         delivery_date,
        deliveryLocation:     delivery_location || pr.DELIVERY_LOCATION || "",
        vendorContactName:    contactName,
        vendorEmail:          vendor_email,
        procurementOfficerName: created_by,
      }).catch((err) => console.error("[email] PO dispatch failed:", err));
    }

    return NextResponse.json({ success: true, po_id: poId }, { status: 201 });
  } catch (err) {
    console.error("[po POST]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
