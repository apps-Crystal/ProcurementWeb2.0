"use client";

/**
 * /po/[id]/print — Crystal Group Purchase Order (Printable / PDF view)
 *
 * This page renders a complete, printable PO with Crystal Group letterhead.
 * Usage:
 *   1. Navigate to /po/<PO_ID>/print
 *   2. Press Ctrl+P (or Cmd+P on Mac) → Save as PDF
 *      OR click the "Download PDF" button which triggers window.print()
 *
 * Letterhead images:
 *   Place header and footer PNG files in /public/letterhead/:
 *     /public/letterhead/header.png  — CRPL Infra Pvt. Ltd. letterhead header
 *     /public/letterhead/footer.png  — address / phone / website footer
 *   (See /templates/po/README.md for setup instructions)
 */

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import { LOGO_DATA_URL } from "./logoData";

interface PORow {
  PO_ID?: string;
  PO_DATE?: string;
  TALLY_PO_NUMBER?: string;
  SOURCE_PR_ID?: string;
  SOURCE_PR_TYPE?: string;
  VENDOR_ID?: string;
  VENDOR_NAME?: string;
  VENDOR_EMAIL?: string;
  DELIVERY_DATE?: string;
  DELIVERY_LOCATION?: string;
  FREIGHT_CHARGES?: string;
  INSTALLATION_CHARGES?: string;
  PAYMENT_TERMS?: string;
  ADVANCE_PAYMENT_PCT?: string;
  ADVANCE_AMOUNT?: string;
  SUBTOTAL?: string;
  TOTAL_GST?: string;
  GRAND_TOTAL?: string;
  TC_STANDARD_APPLIED?: string;
  TC_CUSTOMISED?: string;
  TC_CUSTOMISATION_NOTES?: string;
  SPECIAL_COMMERCIAL_TERMS?: string;
  CREATED_BY?: string;
  STATUS?: string;
}

interface POLine {
  LINE_NUMBER?: string;
  ITEM_NAME?: string;
  ITEM_DESCRIPTION?: string;
  UNIT_OF_MEASURE?: string;
  ORDERED_QTY?: string;
  RATE?: string;
  GST_PERCENT?: string;
  HSN_SAC_CODE?: string;
  LINE_AMOUNT_BEFORE_GST?: string;
  GST_AMOUNT?: string;
  LINE_TOTAL?: string;
}

function fmt(n: string | undefined, decimals = 2) {
  const v = parseFloat(n ?? "0") || 0;
  return v.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtDate(d: string | undefined) {
  if (!d) return "—";
  const date = new Date(d);
  if (isNaN(date.getTime())) return d;
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
}

export default function POPrintPage() {
  const params  = useParams();
  const poId    = params?.id as string;

  const [po, setPo]           = useState<PORow | null>(null);
  const [lines, setLines]     = useState<POLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [generating, setGenerating] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const downloadPDF = useCallback(async (id: string) => {
    if (!printRef.current) return;
    setGenerating(true);
    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);
      const canvas = await html2canvas(printRef.current, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const imgH  = (canvas.height * pageW) / canvas.width;
      let remaining = imgH;
      let yPos = 0;
      pdf.addImage(imgData, "PNG", 0, yPos, pageW, imgH);
      remaining -= pageH;
      while (remaining > 0) {
        yPos -= pageH;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, yPos, pageW, imgH);
        remaining -= pageH;
      }
      pdf.save(`PO-${id}.pdf`);
    } finally {
      setGenerating(false);
    }
  }, []);

  useEffect(() => {
    if (!poId) return;
    fetch(`/api/po/${poId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setError(d.error); return; }
        setPo(d.po);
        setLines(d.lines ?? []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [poId]);

  // Auto-download once data is rendered
  useEffect(() => {
    if (!po || loading) return;
    const timer = setTimeout(() => downloadPDF(poId), 600);
    return () => clearTimeout(timer);
  }, [po, loading, poId, downloadPDF]);

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "4rem", fontFamily: "Arial" }}>
        Loading PO…
      </div>
    );
  }

  if (error || !po) {
    return (
      <div style={{ padding: "2rem", fontFamily: "Arial", color: "#c00" }}>
        Error: {error || "PO not found"}
      </div>
    );
  }

  const subtotal        = parseFloat(po.SUBTOTAL ?? "0") || 0;
  const totalGst        = parseFloat(po.TOTAL_GST ?? "0") || 0;
  const freight         = parseFloat(po.FREIGHT_CHARGES ?? "0") || 0;
  const installation    = parseFloat(po.INSTALLATION_CHARGES ?? "0") || 0;
  const grandTotal      = parseFloat(po.GRAND_TOTAL ?? "0") || 0;
  const advancePct      = parseFloat(po.ADVANCE_PAYMENT_PCT ?? "0") || 0;
  const advanceAmount   = parseFloat(po.ADVANCE_AMOUNT ?? "0") || 0;

  const styles: Record<string, React.CSSProperties> = {
    page: {
      fontFamily: "'Times New Roman', Times, serif",
      fontSize: "11pt",
      color: "#111",
      maxWidth: "800px",
      margin: "0 auto",
      padding: "0",
      background: "#fff",
    },
    letterheadHeader: {
      width: "100%",
      display: "block",
      marginBottom: "0",
    },
    headerText: {
      textAlign: "center",
      borderTop: "2px solid #1a3a6b",
      borderBottom: "1px solid #1a3a6b",
      padding: "6px 20px",
      marginBottom: "12px",
    },
    contentArea: {
      padding: "0 20px",
    },
    h1: {
      fontSize: "16pt",
      fontWeight: "bold",
      textAlign: "center",
      textDecoration: "underline",
      margin: "8px 0",
      letterSpacing: "1px",
    },
    metaRow: {
      display: "flex",
      justifyContent: "space-between",
      fontSize: "10pt",
      margin: "4px 0",
    },
    sectionHeader: {
      fontWeight: "bold",
      textDecoration: "underline",
      marginTop: "14px",
      marginBottom: "4px",
      fontSize: "11pt",
    },
    table: {
      width: "100%",
      borderCollapse: "collapse" as const,
      fontSize: "9pt",
      marginTop: "6px",
    },
    th: {
      border: "1px solid #444",
      background: "#dce5f0",
      padding: "5px 6px",
      textAlign: "left" as const,
      fontWeight: "bold",
    },
    thRight: {
      border: "1px solid #444",
      background: "#dce5f0",
      padding: "5px 6px",
      textAlign: "right" as const,
      fontWeight: "bold",
    },
    td: {
      border: "1px solid #bbb",
      padding: "4px 6px",
      verticalAlign: "top" as const,
    },
    tdRight: {
      border: "1px solid #bbb",
      padding: "4px 6px",
      textAlign: "right" as const,
      verticalAlign: "top" as const,
    },
    tdBold: {
      border: "1px solid #bbb",
      padding: "4px 6px",
      fontWeight: "bold",
    },
    tdBoldRight: {
      border: "1px solid #bbb",
      padding: "4px 6px",
      textAlign: "right" as const,
      fontWeight: "bold",
    },
    totalRow: {
      background: "#f0f4ff",
      fontWeight: "bold",
    },
    signatureBlock: {
      marginTop: "30px",
      display: "flex",
      justifyContent: "space-between",
    },
    signBox: {
      border: "1px solid #888",
      padding: "8px 16px",
      minWidth: "200px",
      minHeight: "60px",
      fontSize: "9pt",
      textAlign: "center" as const,
    },
    footer: {
      marginTop: "16px",
      fontSize: "8pt",
      color: "#555",
      textAlign: "center" as const,
      borderTop: "1px solid #ccc",
      paddingTop: "6px",
    },
    noPrint: {
      position: "fixed" as const,
      top: "10px",
      right: "10px",
      zIndex: 9999,
    },
  };

  return (
    <>
      {/* Toolbar — not captured in PDF (outside printRef) */}
      <div style={styles.noPrint}>
        <button
          onClick={() => downloadPDF(poId)}
          disabled={generating}
          style={{
            padding: "10px 20px",
            background: generating ? "#6b8ab8" : "#1a3a6b",
            color: "#fff",
            border: "none",
            borderRadius: "4px",
            cursor: generating ? "default" : "pointer",
            fontSize: "13px",
            fontWeight: "bold",
            boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
          }}
        >
          {generating ? "⏳ Generating PDF…" : "⬇ Download PDF"}
        </button>
        <a
          href={`/po/open`}
          style={{
            display: "block",
            marginTop: "6px",
            textAlign: "center",
            fontSize: "11px",
            color: "#1a3a6b",
            textDecoration: "underline",
          }}
        >
          ← Back to POs
        </a>
      </div>

      <div style={styles.page} ref={printRef}>

        {/* ── Crystal Group Letterhead Header ─────────────────────────────── */}
        {/* Branded HTML letterhead — Crystal Group corporate identity      */}
        {/* (Place /public/letterhead/header.png here to override with PNG) */}
        <div
          id="letterhead-html"
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "stretch",
            width: "100%",
            minHeight: "130px",
            borderBottom: "3px solid #1a2b5e",
            marginBottom: "12px",
            fontFamily: "'Arial', sans-serif",
          }}
        >
          {/* Left: company name + tagline */}
          <div style={{
            flex: 1,
            padding: "20px 24px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            background: "#ffffff",
          }}>
            <div style={{ fontSize: "26pt", fontWeight: "900", color: "#1a2b5e", lineHeight: 1.1, letterSpacing: "-0.5px" }}>
              CRPL Infra Pvt. Ltd.
            </div>
            <div style={{ fontSize: "11pt", color: "#6b7280", fontStyle: "italic", marginTop: "4px" }}>
              A Crystal Group Company
            </div>
            <div style={{ marginTop: "14px", fontSize: "9pt", fontWeight: "bold", color: "#1a2b5e", letterSpacing: "1px" }}>
              BUILDING INDIA&apos;S COLD CHAIN BACKBONE
            </div>
          </div>

          {/* Right: Company logo */}
          <div style={{
            width: "160px",
            background: "#1a3a6b",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
          }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={LOGO_DATA_URL} alt="Crystal Procure" style={{ maxWidth: "120px", maxHeight: "90px", objectFit: "contain" }} />
          </div>
        </div>

        <div style={styles.contentArea}>

          {/* PO Title */}
          <div style={styles.h1 as React.CSSProperties}>PURCHASE ORDER</div>

          {/* PO Meta Info */}
          <div style={styles.metaRow}>
            <span><strong>PO No.:</strong> {po.PO_ID}</span>
            <span><strong>Tally PO No.:</strong> {po.TALLY_PO_NUMBER || "—"}</span>
            <span><strong>Date:</strong> {fmtDate(po.PO_DATE)}</span>
          </div>
          <div style={styles.metaRow}>
            <span><strong>Source PR:</strong> {po.SOURCE_PR_ID} ({po.SOURCE_PR_TYPE})</span>
            <span><strong>Status:</strong> {po.STATUS}</span>
          </div>

          <hr style={{ borderTop: "1px solid #aaa", margin: "10px 0" }} />

          {/* To / Vendor */}
          <div style={{ marginBottom: "10px" }}>
            <strong>To,</strong>
            <div style={{ marginLeft: "8px", lineHeight: "1.6" }}>
              <div>{po.VENDOR_NAME}</div>
              {po.VENDOR_EMAIL && <div style={{ fontSize: "9pt", color: "#444" }}>{po.VENDOR_EMAIL}</div>}
            </div>
          </div>

          {/* Subject line */}
          <div style={{ marginBottom: "10px" }}>
            <strong>Subject:</strong> Purchase Order for Supply / Services as per {po.SOURCE_PR_TYPE} {po.SOURCE_PR_ID}
          </div>

          <div style={{ marginBottom: "10px", lineHeight: "1.6" }}>
            We are pleased to confirm this Purchase Order for the supply / services as detailed below. Please acknowledge receipt
            and confirm acceptance by signing and returning a copy.
          </div>

          {/* Line Items Table */}
          <div style={styles.sectionHeader as React.CSSProperties}>Scope of Supply</div>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={{ ...styles.th, width: "30px" }}>#</th>
                <th style={styles.th}>Item / Description</th>
                <th style={{ ...styles.th, width: "40px" }}>HSN/SAC</th>
                <th style={{ ...styles.thRight, width: "40px" }}>UOM</th>
                <th style={{ ...styles.thRight, width: "50px" }}>Qty</th>
                <th style={{ ...styles.thRight, width: "80px" }}>Rate (₹)</th>
                <th style={{ ...styles.thRight, width: "40px" }}>GST %</th>
                <th style={{ ...styles.thRight, width: "80px" }}>Amt before GST (₹)</th>
                <th style={{ ...styles.thRight, width: "70px" }}>GST (₹)</th>
                <th style={{ ...styles.thRight, width: "90px" }}>Total (₹)</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, i) => (
                <tr key={i}>
                  <td style={styles.td}>{line.LINE_NUMBER ?? i + 1}</td>
                  <td style={styles.td}>
                    <strong>{line.ITEM_NAME || line.ITEM_DESCRIPTION || "—"}</strong>
                    {line.ITEM_DESCRIPTION && line.ITEM_NAME && line.ITEM_DESCRIPTION !== line.ITEM_NAME && (
                      <div style={{ fontSize: "8pt", color: "#555" }}>{line.ITEM_DESCRIPTION}</div>
                    )}
                  </td>
                  <td style={styles.td}>{line.HSN_SAC_CODE || "—"}</td>
                  <td style={styles.tdRight}>{line.UNIT_OF_MEASURE || "—"}</td>
                  <td style={styles.tdRight}>{line.ORDERED_QTY || "—"}</td>
                  <td style={styles.tdRight}>{fmt(line.RATE)}</td>
                  <td style={styles.tdRight}>{line.GST_PERCENT || "0"}%</td>
                  <td style={styles.tdRight}>{fmt(line.LINE_AMOUNT_BEFORE_GST)}</td>
                  <td style={styles.tdRight}>{fmt(line.GST_AMOUNT)}</td>
                  <td style={{ ...styles.tdRight, fontWeight: "bold" }}>{fmt(line.LINE_TOTAL)}</td>
                </tr>
              ))}

              {/* Totals */}
              <tr style={{ background: "#f5f5f5" }}>
                <td colSpan={7} style={{ ...styles.tdBold, textAlign: "right" as const }}>Sub-Total (before GST)</td>
                <td style={styles.tdBoldRight}>₹{fmt(po.SUBTOTAL)}</td>
                <td style={styles.tdBoldRight}>₹{fmt(po.TOTAL_GST)}</td>
                <td style={styles.tdBoldRight}>—</td>
              </tr>
              {freight > 0 && (
                <tr>
                  <td colSpan={9} style={{ ...styles.tdBold, textAlign: "right" as const }}>Freight Charges</td>
                  <td style={styles.tdBoldRight}>₹{fmt(po.FREIGHT_CHARGES)}</td>
                </tr>
              )}
              {installation > 0 && (
                <tr>
                  <td colSpan={9} style={{ ...styles.tdBold, textAlign: "right" as const }}>Installation Charges</td>
                  <td style={styles.tdBoldRight}>₹{fmt(po.INSTALLATION_CHARGES)}</td>
                </tr>
              )}
              <tr style={styles.totalRow}>
                <td colSpan={9} style={{ ...styles.tdBoldRight, background: "#dce5f0", fontSize: "12pt" }}>GRAND TOTAL (incl. GST)</td>
                <td style={{ ...styles.tdBoldRight, background: "#dce5f0", fontSize: "12pt" }}>₹{fmt(po.GRAND_TOTAL)}</td>
              </tr>
            </tbody>
          </table>

          {/* Delivery */}
          <div style={styles.sectionHeader as React.CSSProperties}>Delivery</div>
          <table style={styles.table}>
            <tbody>
              <tr>
                <td style={{ ...styles.td, width: "200px", fontWeight: "bold" }}>Delivery Date</td>
                <td style={styles.td}>{fmtDate(po.DELIVERY_DATE)}</td>
                <td style={{ ...styles.td, width: "200px", fontWeight: "bold" }}>Delivery Location</td>
                <td style={styles.td}>{po.DELIVERY_LOCATION || "—"}</td>
              </tr>
            </tbody>
          </table>

          {/* Payment Terms */}
          <div style={styles.sectionHeader as React.CSSProperties}>Payment Terms</div>
          <table style={styles.table}>
            <tbody>
              <tr>
                <td style={{ ...styles.td, width: "200px", fontWeight: "bold" }}>Payment Type</td>
                <td style={styles.td}>{po.PAYMENT_TERMS || "Standard"}</td>
                <td style={{ ...styles.td, width: "200px", fontWeight: "bold" }}>Advance %</td>
                <td style={styles.td}>{advancePct > 0 ? `${advancePct}% (₹${fmt(po.ADVANCE_AMOUNT)})` : "None"}</td>
              </tr>
            </tbody>
          </table>

          {/* T&C */}
          <div style={styles.sectionHeader as React.CSSProperties}>Terms &amp; Conditions</div>
          <div style={{ fontSize: "9pt", lineHeight: "1.6", marginBottom: "8px" }}>
            <ol style={{ paddingLeft: "20px", margin: 0 }}>
              <li>All materials / services must conform to the specifications agreed upon.</li>
              <li>Delivery must be completed by the specified delivery date. LD clauses apply for delays unless caused by Force Majeure.</li>
              <li>Quality Assurance certificate and test reports must accompany each shipment.</li>
              <li>Invoices to be raised only after GRN / SRN confirmation. All invoices must carry the PO number and Tally PO number.</li>
              <li>GST: Vendor must ensure accurate GST charging and timely return filing for ITC eligibility.</li>
              <li>Warranty: Minimum 12 months from date of installation / commissioning unless otherwise specified.</li>
              <li>Dispute Resolution: Disputes shall be resolved amicably or through arbitration under Kolkata jurisdiction.</li>
              <li>Force Majeure: Neither party shall be liable for delays caused by events beyond their reasonable control.</li>
            </ol>
          </div>

          {/* Special Terms (if any) */}
          {(po.TC_CUSTOMISATION_NOTES || po.SPECIAL_COMMERCIAL_TERMS) && (
            <>
              <div style={{ ...styles.sectionHeader as React.CSSProperties, color: "#8b0000" }}>Special Commercial Terms</div>
              <div style={{ fontSize: "9pt", lineHeight: "1.6", border: "1px solid #c00", padding: "6px", background: "#fff8f8" }}>
                {po.TC_CUSTOMISATION_NOTES || po.SPECIAL_COMMERCIAL_TERMS}
              </div>
            </>
          )}

          {/* Signature Block */}
          <div style={styles.signatureBlock}>
            <div>
              <div style={{ fontWeight: "bold", marginBottom: "6px" }}>For Crystal Group / CRPL Infra Pvt. Ltd.</div>
              <div style={styles.signBox}>
                <div style={{ marginTop: "40px" }}>Authorized Signatory</div>
                <div style={{ fontSize: "8pt", color: "#555" }}>{po.CREATED_BY}</div>
                <div style={{ fontSize: "8pt", color: "#555" }}>Date: {fmtDate(po.PO_DATE)}</div>
              </div>
            </div>

            <div>
              <div style={{ fontWeight: "bold", marginBottom: "6px" }}>Acknowledged &amp; Accepted by:</div>
              <div style={styles.signBox}>
                <div style={{ marginTop: "40px" }}>Authorized Representative</div>
                <div style={{ fontWeight: "bold" }}>{po.VENDOR_NAME}</div>
                <div style={{ fontSize: "8pt", color: "#555" }}>Date: _______________</div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div style={styles.footer}>
            <div>This is a system-generated Purchase Order from Crystal Group Integrated Procurement System.</div>
            <div>PO: {po.PO_ID} | Tally: {po.TALLY_PO_NUMBER || "—"} | Generated: {new Date().toLocaleString("en-IN")}</div>
          </div>


</div>
      </div>
    </>
  );
}
