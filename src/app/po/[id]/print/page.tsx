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

  const [po, setPo]                   = useState<PORow | null>(null);
  const [lines, setLines]             = useState<POLine[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState("");
  const [generating, setGenerating]   = useState(false);
  const [createdByName, setCreatedByName] = useState<string>("");
  const printRef   = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const downloadPDF = useCallback(async (id: string) => {
    if (!contentRef.current) return;
    setGenerating(true);
    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);

      // ── Step 1: Measure signature block position BEFORE html2canvas ──────────
      // We need this to avoid splitting the signature across pages.
      const sigEl = contentRef.current.querySelector(".po-signature-block") as HTMLElement | null;
      const containerRect  = contentRef.current.getBoundingClientRect();
      const containerH_css = containerRect.height; // CSS pixel height of the content area

      // These will be converted to mm after we know totalContentH
      const sigTopFraction    = sigEl ? (sigEl.getBoundingClientRect().top - containerRect.top) / containerH_css : 1;
      const sigBottomFraction = sigEl ? (sigEl.getBoundingClientRect().bottom - containerRect.top) / containerH_css : 1;

      // ── Step 2: Render content to canvas ─────────────────────────────────────
      const canvas = await html2canvas(contentRef.current, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });

      const pdf   = new jsPDF("p", "mm", "a4");
      const pageW = pdf.internal.pageSize.getWidth();   // 210 mm
      const pageH = pdf.internal.pageSize.getHeight();  // 297 mm

      // ── Step 3: Load letterhead images ───────────────────────────────────────
      async function loadAsJpeg(src: string): Promise<{ dataUrl: string; ar: number }> {
        return new Promise((resolve) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => {
            const c = document.createElement("canvas");
            c.width  = img.naturalWidth;
            c.height = img.naturalHeight;
            const ctx = c.getContext("2d")!;
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, c.width, c.height);
            ctx.drawImage(img, 0, 0);
            resolve({ dataUrl: c.toDataURL("image/jpeg", 0.82), ar: img.naturalHeight / img.naturalWidth });
          };
          img.onerror = () => resolve({ dataUrl: "", ar: 0.15 });
          img.src = src;
        });
      }

      const [hdr, ftr] = await Promise.all([
        loadAsJpeg("/letterhead.png"),
        loadAsJpeg("/letterhead-footer.png"),
      ]);

      const hdrH    = hdr.ar * pageW;   // header height in mm
      const ftrH    = ftr.ar * pageW;   // footer height in mm
      const gapMM    = 6;                // breathing room: header→content and content→footer
      const bufferMM = 2;               // internal top/bottom padding per page slice
      const usableH  = pageH - hdrH - ftrH - gapMM * 2 - bufferMM * 2;

      // Total content height in mm
      const totalContentH = (canvas.height / canvas.width) * pageW;

      // Signature block boundaries in mm
      const sigStartMM = sigTopFraction    * totalContentH;
      const sigEndMM   = sigBottomFraction * totalContentH;

      // Minimum content slice — don't create a page for less than this
      const MIN_SLICE_MM = 5;

      // ── Step 4: Build no-break zones (signature + T&C clauses + section headers) ──
      const noBreakZones: Array<{ startMM: number; endMM: number }> = [];

      // Signature block
      if (sigEl) {
        noBreakZones.push({ startMM: sigStartMM, endMM: sigEndMM });
      }

      // T&C clause rows — each row must not be split mid-sentence
      contentRef.current.querySelectorAll(".tc-clause").forEach((el: Element) => {
        const rect   = (el as HTMLElement).getBoundingClientRect();
        const top    = ((rect.top    - containerRect.top) / containerH_css) * totalContentH;
        const bottom = ((rect.bottom - containerRect.top) / containerH_css) * totalContentH;
        noBreakZones.push({ startMM: top, endMM: bottom });
      });

      // T&C section headers — keep header with at least its first clause (next sibling table)
      contentRef.current.querySelectorAll(".tc-section-header").forEach((el: Element) => {
        const hdrRect = (el as HTMLElement).getBoundingClientRect();
        const next    = (el as HTMLElement).nextElementSibling;
        const bottomEl = next ?? el as HTMLElement;
        const bottom = ((bottomEl.getBoundingClientRect().bottom - containerRect.top) / containerH_css) * totalContentH;
        const top    = ((hdrRect.top - containerRect.top) / containerH_css) * totalContentH;
        noBreakZones.push({ startMM: top, endMM: bottom });
      });

      // ── Step 4b: Calculate break points respecting all no-break zones ────────
      function calcSlices(): Array<[number, number]> {
        const slices: Array<[number, number]> = [];
        let pos = 0;
        while (totalContentH - pos > MIN_SLICE_MM) {
          let end = Math.min(pos + usableH, totalContentH);

          // Check if this slice cuts into any no-break zone
          for (const zone of noBreakZones) {
            if (pos < zone.startMM && end > zone.startMM && end < zone.endMM) {
              const beforeZone = zone.startMM - pos;
              if (beforeZone > MIN_SLICE_MM) {
                end = zone.startMM;
                break;
              }
            }
          }

          slices.push([pos, end]);
          pos = end;
        }
        return slices.length > 0 ? slices : [[0, totalContentH]];
      }

      // If content only slightly overflows (< 28%), compress onto one page
      const overflow      = totalContentH - usableH;
      const fitOnOnePage  = overflow > 0 && overflow / usableH < 0.15;

      const slices     = fitOnOnePage ? [[0, totalContentH] as [number, number]] : calcSlices();
      const totalPages = slices.length;

      // ── Step 5: Stamp each page ───────────────────────────────────────────────
      // Order: header → content (in safe zone) → page number → footer
      const stampPage = (contentDataUrl: string, contentH: number, pageNum: number) => {
        if (hdr.dataUrl) pdf.addImage(hdr.dataUrl, "JPEG", 0, 0, pageW, hdrH);
        pdf.addImage(contentDataUrl, "PNG", 0, hdrH + gapMM + bufferMM, pageW, contentH);
        pdf.setFontSize(7);
        pdf.setTextColor(120, 120, 120);
        pdf.text(`Page ${pageNum} of ${totalPages}`, pageW / 2, pageH - ftrH - gapMM, { align: "center" });
        pdf.setTextColor(0, 0, 0);
        if (ftr.dataUrl) pdf.addImage(ftr.dataUrl, "JPEG", 0, pageH - ftrH, pageW, ftrH);
      };

      slices.forEach(([startMM, endMM], i) => {
        if (i > 0) pdf.addPage();

        // For fitOnOnePage compress content to exactly usableH
        const sliceH = fitOnOnePage ? usableH : (endMM - startMM);
        const srcY   = Math.round((startMM / totalContentH) * canvas.height);
        const srcH   = Math.max(1, Math.round(((endMM - startMM) / totalContentH) * canvas.height));

        const slice  = document.createElement("canvas");
        slice.width  = canvas.width;
        slice.height = srcH;
        const ctx    = slice.getContext("2d")!;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, slice.width, slice.height);
        ctx.drawImage(canvas, 0, srcY, canvas.width, srcH, 0, 0, canvas.width, srcH);

        stampPage(slice.toDataURL("image/png"), sliceH, i + 1);
      });

      pdf.save(`PO-${id}.pdf`);

      // Upload to Drive so vendors and all other parties get the exact same file
      const pdfBytes = pdf.output("arraybuffer");
      const uploadForm = new FormData();
      uploadForm.append(
        "file",
        new Blob([pdfBytes], { type: "application/pdf" }),
        `PO-${id}.pdf`
      );
      fetch(`/api/po/${id}/document`, { method: "POST", body: uploadForm }).catch(
        (e) => console.warn("[PO print] Drive upload failed:", e)
      );
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
        // Resolve creator user ID → full name
        const createdById = d.po?.CREATED_BY;
        if (createdById) {
          fetch(`/api/users?ids=${createdById}`)
            .then((r) => r.json())
            .then((u) => setCreatedByName(u.users?.[createdById] ?? createdById))
            .catch(() => setCreatedByName(createdById));
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [poId]);

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
      padding: "12px 20px 12px 20px",
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
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/letterhead.png" alt="Crystal Group Letterhead" style={{ width: "100%", display: "block" }} />

        <div style={styles.contentArea} ref={contentRef}>

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
                <td style={styles.tdBoldRight}>₹{fmt(String(subtotal + totalGst))}</td>
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

          {/* T&C — SOP-PROC-001 v1.2, Section 14 (clauses T&C 1–20) */}
          <div style={styles.sectionHeader as React.CSSProperties}>Standard Terms &amp; Conditions (SOP-PROC-001 v1.2)</div>
          <div style={{ fontSize: "8pt", lineHeight: "1.55", marginBottom: "8px" }}>

            {/* 14.1 General Terms */}
            <div className="tc-section-header" style={{ fontWeight: "bold", marginTop: "6px", marginBottom: "3px", textDecoration: "underline" }}>14.1 General Terms</div>
            <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
              <tbody>
                {[
                  ["T&C 1", "Acceptance", "This Purchase Order constitutes a binding contract upon vendor acknowledgement. Vendor must acknowledge and accept this PO within 2 working days. Failure to acknowledge within this period will be treated as deemed acceptance. Vendor acceptance (not merely acknowledgement) is required before any delivery or advance payment is processed."],
                  ["T&C 2", "Price Validity", "Prices stated in this PO are fixed and not subject to variation unless agreed in writing by Crystal Group Procurement Head before delivery. No verbal price variation will be accepted."],
                  ["T&C 3", "Delivery", "Vendor must deliver goods on or before the Delivery Date stated in this PO. Early delivery requires prior written approval. Late delivery entitles Crystal Group to levy liquidated damages at 0.5% of PO value per week of delay, subject to a maximum of 5% of total PO value, without prejudice to other remedies."],
                  ["T&C 4", "Quantity", "Crystal Group is not obligated to accept quantities exceeding those stated in this PO without prior written approval. Excess quantities will be returned at vendor's cost and risk."],
                  ["T&C 5", "Packaging & Labelling", "All goods must be suitably packed, marked and labelled to prevent damage during transit. A packing list must accompany every delivery. Vendor bears responsibility for transit damage due to inadequate packaging."],
                ].map(([ref, heading, text]) => (
                  <tr key={ref} className="tc-clause" style={{ verticalAlign: "top" }}>
                    <td style={{ width: "52px", fontWeight: "bold", paddingRight: "4px", paddingBottom: "3px", whiteSpace: "nowrap" }}>{ref}</td>
                    <td style={{ width: "170px", fontWeight: "bold", paddingRight: "6px", paddingBottom: "3px", wordBreak: "break-word" }}>{heading}:</td>
                    <td style={{ paddingBottom: "3px" }}>{text}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* 14.2 Quality Terms */}
            <div className="tc-section-header" style={{ fontWeight: "bold", marginTop: "6px", marginBottom: "3px", textDecoration: "underline" }}>14.2 Quality Terms</div>
            <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
              <tbody>
                {[
                  ["T&C 6", "Quality Standards", "All goods supplied must conform to the specifications stated in the PO and to applicable Indian Standards (BIS) or other standards specified. Crystal Group reserves the right to inspect, test and reject goods that do not meet specifications."],
                  ["T&C 7", "Inspection & Rejection", "Crystal Group's Warehouse team will inspect goods upon arrival (Quality Check & Site Inspection). Goods may be rejected for: non-conformance to specification, quantity shortage, damage or defects. Rejected goods will be returned to the vendor within 7 working days at vendor's expense."],
                  ["T&C 8", "Warranty", "Vendor warrants that all goods are free from defects in material and workmanship for a minimum period of 12 months from date of delivery or as specified in the PO. Defective goods identified during the warranty period will be replaced or repaired by the vendor at no cost to Crystal Group."],
                  ["T&C 9", "Test Certificates", "For materials requiring test certificates (structural steel, electrical components, chemicals), test certificates from approved laboratories must accompany the delivery. Goods without required certificates may be rejected."],
                ].map(([ref, heading, text]) => (
                  <tr key={ref} className="tc-clause" style={{ verticalAlign: "top" }}>
                    <td style={{ width: "52px", fontWeight: "bold", paddingRight: "4px", paddingBottom: "3px", whiteSpace: "nowrap" }}>{ref}</td>
                    <td style={{ width: "170px", fontWeight: "bold", paddingRight: "6px", paddingBottom: "3px", wordBreak: "break-word" }}>{heading}:</td>
                    <td style={{ paddingBottom: "3px" }}>{text}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* 14.3 Legal & Compliance Terms */}
            <div className="tc-section-header" style={{ fontWeight: "bold", marginTop: "6px", marginBottom: "3px", textDecoration: "underline" }}>14.3 Legal &amp; Compliance Terms</div>
            <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
              <tbody>
                {[
                  ["T&C 10", "Taxes & Statutory Compliance", "Vendor is responsible for compliance with all applicable taxes including GST. GST amounts must be correctly stated on invoices with valid GSTIN. Crystal Group will deduct TDS as applicable under the Income Tax Act. Vendor must ensure GST returns are filed such that input tax credit is available to Crystal Group."],
                  ["T&C 11", "MSME Declaration", "Vendors registered as MSME must declare their Udyam Registration Number. Crystal Group is committed to paying MSME vendors within 45 days of invoice acceptance in compliance with the MSMED Act, 2006."],
                  ["T&C 12", "Confidentiality", "Vendor agrees to keep confidential all information received from Crystal Group including PO details, pricing, specifications and business information. This obligation survives termination of the contract."],
                  ["T&C 13", "Intellectual Property", "Where goods or services involve IP, vendor warrants that supply does not infringe any third-party rights and indemnifies Crystal Group against all claims arising from IP infringement."],
                  ["T&C 14", "Force Majeure", "Neither party shall be liable for delays caused by circumstances beyond reasonable control provided the affected party gives notice within 5 days of the event and takes reasonable steps to mitigate the impact."],
                  ["T&C 15", "Governing Law & Dispute Resolution", "This PO is governed by the laws of India. Any dispute arising from this PO shall first be subject to good faith negotiation. If unresolved within 30 days, disputes shall be referred to arbitration in accordance with the Arbitration and Conciliation Act, 1996. The seat of arbitration shall be Kolkata, India."],
                  ["T&C 16", "Anti-Bribery & Anti-Corruption", "Vendor and its representatives must not offer, give or receive any bribe, kickback, commission or improper payment in connection with this PO. Any such conduct will result in immediate cancellation of the PO and may be reported to appropriate authorities."],
                  ["T&C 17", "Cancellation & Termination", "Crystal Group may cancel this PO in whole or in part by written notice in the event of vendor default, insolvency or failure to meet delivery or quality terms. Crystal Group's liability on cancellation is limited to payment for goods already delivered and accepted."],
                ].map(([ref, heading, text]) => (
                  <tr key={ref} className="tc-clause" style={{ verticalAlign: "top" }}>
                    <td style={{ width: "52px", fontWeight: "bold", paddingRight: "4px", paddingBottom: "3px", whiteSpace: "nowrap" }}>{ref}</td>
                    <td style={{ width: "170px", fontWeight: "bold", paddingRight: "6px", paddingBottom: "3px", wordBreak: "break-word" }}>{heading}:</td>
                    <td style={{ paddingBottom: "3px" }}>{text}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* 14.4 Payment Terms */}
            <div className="tc-section-header" style={{ fontWeight: "bold", marginTop: "6px", marginBottom: "3px", textDecoration: "underline" }}>14.4 Payment Terms</div>
            <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
              <tbody>
                {[
                  ["T&C 18", "Standard Payment Terms", "Payment terms are as specified on the face of this PO. Standard terms are 30 days from date of invoice verification unless otherwise stated. Advance payments, where applicable, are noted on the PO. MSME vendors: 45 days from invoice acceptance."],
                  ["T&C 19", "Invoice Requirements", "Vendor invoices must include: PO number, GRN reference (if available), GSTIN of both parties, HSN / SAC codes, complete itemised details, and bank details. Invoices not meeting these requirements will be returned without processing."],
                  ["T&C 20", "Set-Off", "Crystal Group reserves the right to set off against any payment any amounts due from the vendor including rejected goods value, liquidated damages or advance recovery."],
                ].map(([ref, heading, text]) => (
                  <tr key={ref} className="tc-clause" style={{ verticalAlign: "top" }}>
                    <td style={{ width: "52px", fontWeight: "bold", paddingRight: "4px", paddingBottom: "3px", whiteSpace: "nowrap" }}>{ref}</td>
                    <td style={{ width: "170px", fontWeight: "bold", paddingRight: "6px", paddingBottom: "3px", wordBreak: "break-word" }}>{heading}:</td>
                    <td style={{ paddingBottom: "3px" }}>{text}</td>
                  </tr>
                ))}
              </tbody>
            </table>

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
          <div className="po-signature-block" style={styles.signatureBlock}>
            <div>
              <div style={{ fontWeight: "bold", marginBottom: "6px" }}>For Crystal Group / CRPL Infra Pvt. Ltd.</div>
              <div style={styles.signBox}>
                <div style={{ marginTop: "40px" }}>Authorized Signatory</div>
                <div style={{ fontSize: "8pt", color: "#555" }}>{createdByName || po.CREATED_BY}</div>
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

        </div>

        {/* ── Crystal Group Letterhead Footer ─────────────────────────────── */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/letterhead-footer.png" alt="Crystal Group Footer" style={{ width: "100%", display: "block", marginTop: "16px" }} />

      </div>
    </>
  );
}
