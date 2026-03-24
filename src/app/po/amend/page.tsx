"use client";

import { useState } from "react";
import {
  FileEdit, Search, UploadCloud, FileCheck, AlertTriangle,
  Send, Calculator, CalendarDays, ListPlus, Loader2,
  CheckCircle2, XCircle, Info, ShieldAlert,
} from "lucide-react";
import { useCurrentUser } from "@/components/auth/AuthProvider";

// ── Types ──────────────────────────────────────────────────────────────────

type AmendmentType = "Value Enhancement" | "Timeline Extension" | "Scope Change" | "Cancellation";

interface POData {
  PO_ID: string;
  PO_TYPE: string;
  PO_DATE: string;
  PO_VERSION: string;
  VENDOR_NAME: string;
  VENDOR_EMAIL: string;
  DELIVERY_DATE: string;
  DELIVERY_LOCATION: string;
  GRAND_TOTAL: string;
  SUBTOTAL: string;
  TOTAL_GST: string;
  STATUS: string;
  SOURCE_PR_ID: string;
  PAYMENT_TERMS: string;
  AMENDMENT_REASON: string;
  FREIGHT_CHARGES: string;
  INSTALLATION_CHARGES: string;
  FREIGHT_GST: string;
}

interface POLine {
  PO_LINE_ID: string;
  LINE_NUMBER: string;
  ITEM_NAME: string;
  ITEM_DESCRIPTION: string;
  UNIT_OF_MEASURE: string;
  ORDERED_QTY: string;
  RATE: string;
  GST_PERCENT: string;
  LINE_TOTAL: string;
  HSN_SAC_CODE: string;
}

interface EditableLine {
  _key: number;
  PO_LINE_ID: string;
  LINE_NUMBER: string;
  ITEM_NAME: string;
  ITEM_DESCRIPTION: string;
  UNIT_OF_MEASURE: string;
  ORDERED_QTY: string;
  RATE: string;
  GST_PERCENT: string;
  HSN_SAC_CODE: string;
  REMARKS: string;
  _deleted: boolean;
  _isNew: boolean;
}

const AMENDMENT_TYPES: AmendmentType[] = [
  "Value Enhancement",
  "Timeline Extension",
  "Scope Change",
  "Cancellation",
];

const fmt = (v: string | number) =>
  Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ── Component ──────────────────────────────────────────────────────────────

export default function POAmendmentPage() {
  const { user } = useCurrentUser();

  // ── PO fetch state ────────────────────────────────────────────────────────
  const [poInput, setPoInput]     = useState("");
  const [fetching, setFetching]   = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [po, setPo]               = useState<POData | null>(null);
  const [lines, setLines]         = useState<POLine[]>([]);

  // ── Amendment form state ──────────────────────────────────────────────────
  const [amendType, setAmendType] = useState<AmendmentType>("Value Enhancement");
  const [reason, setReason]       = useState("");
  const [docFile, setDocFile]     = useState<File | null>(null);

  // Value Enhancement
  const [newValue, setNewValue]   = useState("");

  // Timeline Extension
  const [newDate, setNewDate]     = useState("");
  const [ldWaiver, setLdWaiver]   = useState(false);

  // Scope Change
  const [scopeNotes, setScopeNotes] = useState("");

  // Cancellation
  const [vendorConfirmed, setVendorConfirmed] = useState(false);

  // Line items editor (Scope Change)
  const [editableLines, setEditableLines] = useState<EditableLine[]>([]);
  const [nextLineKey, setNextLineKey] = useState(0);

  // Submit state
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [successResult, setSuccessResult] = useState<{ po_id: string; new_version: number; status: string } | null>(null);

  function calcLine(qty: string, rate: string, gstPct: string) {
    const q = parseFloat(qty) || 0;
    const r = parseFloat(rate) || 0;
    const g = parseFloat(gstPct) || 0;
    const lineAmt = q * r;
    const gstAmt  = lineAmt * (g / 100);
    return { lineAmt, gstAmt, lineTotal: lineAmt + gstAmt };
  }

  // ── Fetch PO ──────────────────────────────────────────────────────────────
  async function handleFetch() {
    const id = poInput.trim().toUpperCase();
    if (!id) return;
    setFetching(true);
    setFetchError("");
    setPo(null);
    setLines([]);
    try {
      const res = await fetch(`/api/po/${id}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "PO not found");
      setPo(json.po);
      setLines(json.lines ?? []);
      setNewValue(json.po.GRAND_TOTAL ?? "");
      setNewDate(json.po.DELIVERY_DATE ?? "");
      const initLines: EditableLine[] = (json.lines ?? []).map((l: POLine, i: number) => ({
        _key:             i,
        PO_LINE_ID:       l.PO_LINE_ID,
        LINE_NUMBER:      l.LINE_NUMBER,
        ITEM_NAME:        l.ITEM_NAME,
        ITEM_DESCRIPTION: l.ITEM_DESCRIPTION,
        UNIT_OF_MEASURE:  l.UNIT_OF_MEASURE,
        ORDERED_QTY:      l.ORDERED_QTY,
        RATE:             l.RATE,
        GST_PERCENT:      l.GST_PERCENT,
        HSN_SAC_CODE:     l.HSN_SAC_CODE,
        REMARKS:          "",
        _deleted:         false,
        _isNew:           false,
      }));
      setEditableLines(initLines);
      setNextLineKey(initLines.length);
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : "Failed to fetch PO");
    } finally {
      setFetching(false);
    }
  }

  // ── Value delta calculation ───────────────────────────────────────────────
  const currentValue  = parseFloat(po?.GRAND_TOTAL ?? "0") || 0;
  const proposedValue = parseFloat(newValue) || 0;
  const delta         = proposedValue - currentValue;
  const deltaPct      = currentValue > 0 ? (delta / currentValue) * 100 : 0;
  const isHighVariance = Math.abs(deltaPct) > 10;

  // ── Submit ────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!po) return;
    setSubmitError("");

    if (!reason.trim()) return setSubmitError("Amendment reason is required.");
    if (amendType === "Value Enhancement" && (!newValue || proposedValue <= 0))
      return setSubmitError("New proposed value is required.");
    if (amendType === "Timeline Extension" && !newDate)
      return setSubmitError("New delivery date is required.");
    if (amendType === "Scope Change" && editableLines.filter(l => !l._deleted).length === 0)
      return setSubmitError("At least one line item must remain after scope change.");
    if (amendType === "Cancellation" && !vendorConfirmed)
      return setSubmitError("Confirm that the vendor has been notified before cancelling.");

    setSubmitting(true);
    try {
      const res = await fetch(`/api/po/${po.PO_ID}/amend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amendment_type:   amendType,
          reason:           reason.trim(),
          amended_by:       user?.userId ?? "PROCUREMENT",
          new_value:        amendType === "Value Enhancement" ? proposedValue : undefined,
          new_delivery_date: amendType === "Timeline Extension" ? newDate : undefined,
          ld_waiver:        amendType === "Timeline Extension" ? ldWaiver : undefined,
          scope_notes:      amendType === "Scope Change" ? scopeNotes.trim() : undefined,
          line_items:       amendType === "Scope Change"
            ? editableLines
                .filter(l => !(l._isNew && l._deleted))
                .map(l => ({
                  _action:          l._deleted ? "delete" : l._isNew ? "add" : "update",
                  PO_LINE_ID:       l.PO_LINE_ID,
                  LINE_NUMBER:      l.LINE_NUMBER,
                  ITEM_NAME:        l.ITEM_NAME,
                  ITEM_DESCRIPTION: l.ITEM_DESCRIPTION,
                  UNIT_OF_MEASURE:  l.UNIT_OF_MEASURE,
                  ORDERED_QTY:      l.ORDERED_QTY,
                  RATE:             l.RATE,
                  GST_PERCENT:      l.GST_PERCENT,
                  HSN_SAC_CODE:     l.HSN_SAC_CODE,
                  REMARKS:          l.REMARKS,
                }))
            : undefined,
          vendor_confirmed: amendType === "Cancellation" ? vendorConfirmed : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Amendment failed");
      setSuccessResult(json);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Amendment submission failed");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Success screen ────────────────────────────────────────────────────────
  if (successResult) {
    const isCancelled = successResult.status === "CANCELLED";
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        {isCancelled
          ? <XCircle className="w-16 h-16 text-danger" />
          : <CheckCircle2 className="w-16 h-16 text-success" />}
        <h2 className="text-2xl font-bold text-primary-900">
          {isCancelled ? "PO Cancelled" : "Amendment Submitted"}
        </h2>
        <p className="text-text-secondary text-sm text-center max-w-md">
          <span className="font-mono font-bold text-primary-700">{successResult.po_id}</span> — Version {successResult.new_version} created.
          {!isCancelled && " PO re-sent to vendor for acknowledgement and acceptance as per SOP §6.3."}
        </p>
        <div className="flex gap-3 mt-2">
          <button
            onClick={() => { setPo(null); setPoInput(""); setReason(""); setSuccessResult(null); }}
            className="px-4 py-2 text-sm font-medium bg-primary-900 text-white rounded-sm hover:bg-primary-800"
          >
            New Amendment
          </button>
          <a href="/po/open" className="px-4 py-2 text-sm font-medium border border-border rounded-sm hover:bg-primary-50">
            Back to Open POs
          </a>
        </div>
      </div>
    );
  }

  const poLoaded = !!po;
  const nonAmendableStatus = poLoaded && !["ACCEPTED", "ACKNOWLEDGED", "ISSUED", "RELEASED", "AMENDMENT_PENDING"].includes(po!.STATUS);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-20">

      {/* ── Page Header ───────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-bold text-primary-900 tracking-tight flex items-center gap-2">
            <FileEdit className="w-6 h-6 text-warning" />
            PO Amendment Request
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Amend value, timeline, or scope of a confirmed Purchase Order — SOP §6.3
          </p>
        </div>
        <button
          onClick={handleSubmit}
          disabled={!poLoaded || submitting || nonAmendableStatus}
          className="h-9 px-5 bg-primary-900 hover:bg-primary-800 text-white text-sm font-medium rounded-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm flex items-center gap-2"
        >
          {submitting
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</>
            : <><Send className="w-4 h-4" /> Submit Amendment</>}
        </button>
      </div>

      {submitError && (
        <div className="bg-danger/10 border border-danger/30 text-danger text-sm p-3 rounded-sm flex items-center gap-2">
          <XCircle className="w-4 h-4 shrink-0" /> {submitError}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">

        {/* ── LEFT COLUMN ─────────────────────────────────────────────────── */}
        <div className="xl:col-span-1 space-y-6">

          {/* 1 — PO Lookup */}
          <div className="enterprise-card p-4 space-y-4 border-t-4 border-t-warning">
            <h2 className="text-sm font-bold text-primary-900 uppercase tracking-wide border-b border-border pb-2">
              1. Select Purchase Order
            </h2>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">
                PO Number <span className="text-danger">*</span>
              </label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2 h-4 w-4 text-text-secondary" />
                <input
                  type="text"
                  className="enterprise-input pl-8 font-mono"
                  placeholder="e.g. PO-2502-044"
                  value={poInput}
                  onChange={(e) => setPoInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleFetch()}
                />
              </div>
              {fetchError && (
                <p className="text-[11px] text-danger mt-1">{fetchError}</p>
              )}
            </div>
            <button
              onClick={handleFetch}
              disabled={fetching || !poInput.trim()}
              className="w-full h-8 bg-primary-900 hover:bg-primary-800 text-white text-xs font-medium rounded-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {fetching ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Fetching…</> : "Fetch PO Details"}
            </button>

            {/* PO Snapshot */}
            {po && (
              <div className="mt-2 p-3 bg-primary-50 border border-primary-200 rounded-sm space-y-2">
                <div className="flex items-center gap-2 mb-1">
                  <FileCheck className="w-4 h-4 text-primary-600" />
                  <span className="text-xs font-bold text-primary-900">Original PO — v{po.PO_VERSION}</span>
                  <span className={`ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-sm ${
                    po.STATUS === "ACCEPTED" ? "bg-success/20 text-success" :
                    po.STATUS === "CANCELLED" ? "bg-danger/20 text-danger" :
                    "bg-warning/20 text-warning-800"
                  }`}>{po.STATUS}</span>
                </div>
                <div className="text-xs space-y-1.5">
                  {[
                    ["PO ID",    po.PO_ID],
                    ["Type",     po.PO_TYPE],
                    ["Source PR", po.SOURCE_PR_ID],
                    ["Vendor",   po.VENDOR_NAME],
                    ["Issue Date", po.PO_DATE],
                    ["Delivery", po.DELIVERY_DATE],
                    ["Location", po.DELIVERY_LOCATION],
                    ["Payment",  po.PAYMENT_TERMS],
                  ].map(([label, val]) => (
                    <div key={label} className="flex justify-between gap-2">
                      <span className="text-text-secondary shrink-0">{label}:</span>
                      <span className="font-medium text-right truncate">{val || "—"}</span>
                    </div>
                  ))}
                  <div className="flex justify-between border-t border-primary-200/60 pt-1.5 mt-1">
                    <span className="text-text-secondary">Grand Total:</span>
                    <span className="font-mono font-bold text-primary-900">₹{fmt(po.GRAND_TOTAL)}</span>
                  </div>
                </div>

                {nonAmendableStatus && (
                  <div className="mt-2 p-2 bg-danger/10 border border-danger/30 rounded-sm flex items-start gap-1.5">
                    <ShieldAlert className="w-3.5 h-3.5 text-danger shrink-0 mt-0.5" />
                    <p className="text-[10px] text-danger font-bold">
                      PO in status <strong>{po.STATUS}</strong> cannot be amended.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 2 — Amendment Details (visible only after PO loaded) */}
          {po && !nonAmendableStatus && (
            <div className="enterprise-card p-4 space-y-4">
              <h2 className="text-sm font-bold text-primary-900 uppercase tracking-wide border-b border-border pb-2 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-warning" /> 2. Amendment Details
              </h2>

              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">
                  Amendment Type <span className="text-danger">*</span>
                </label>
                <select
                  className="enterprise-input"
                  value={amendType}
                  onChange={(e) => setAmendType(e.target.value as AmendmentType)}
                >
                  {AMENDMENT_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">
                  Reason for Amendment <span className="text-danger">*</span>
                </label>
                <textarea
                  className="w-full min-h-[80px] rounded-sm p-2.5 text-sm border border-border focus:ring-1 focus:ring-primary-600 outline-none transition-colors resize-none bg-surface"
                  placeholder="Provide detailed justification…"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">
                  Justification Document
                </label>
                <button
                  type="button"
                  onClick={() => document.getElementById("amend-doc-input")?.click()}
                  className="w-full flex flex-col items-center justify-center p-3 border border-dashed border-primary-300 rounded-sm bg-primary-50/30 hover:bg-primary-50 transition-colors cursor-pointer group"
                >
                  {docFile ? (
                    <><CheckCircle2 className="w-4 h-4 text-success mb-1" />
                      <span className="text-[10px] font-bold text-success truncate max-w-full px-1">{docFile.name}</span></>
                  ) : (
                    <><UploadCloud className="w-4 h-4 text-primary-400 group-hover:text-primary-600 mb-1" />
                      <span className="text-[10px] font-bold text-primary-700">Upload PDF / DOCX</span></>
                  )}
                </button>
                <input
                  id="amend-doc-input" type="file" accept=".pdf,.doc,.docx" className="hidden"
                  onChange={(e) => setDocFile(e.target.files?.[0] ?? null)}
                />
              </div>

              {/* SOD Notice */}
              <div className="p-2 bg-primary-50 border border-primary-200 rounded-sm flex items-start gap-1.5">
                <Info className="w-3.5 h-3.5 text-primary-600 shrink-0 mt-0.5" />
                <p className="text-[10px] text-primary-700">
                  Amendment must be approved by the same authority as the original PO. You cannot approve your own submission — SOP §15.1
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT COLUMN ────────────────────────────────────────────────── */}
        <div className="xl:col-span-3">
          {!po ? (
            <div className="enterprise-card h-full min-h-[400px] flex flex-col items-center justify-center p-8 text-center bg-surface">
              <FileEdit className="w-16 h-16 text-primary-200 mb-4" />
              <h3 className="text-lg font-bold text-primary-900 mb-2">Configure Amendment</h3>
              <p className="text-sm text-text-secondary max-w-md">
                Search and fetch a Purchase Order on the left to reveal amendment options.
              </p>
            </div>
          ) : nonAmendableStatus ? (
            <div className="enterprise-card h-full min-h-[300px] flex flex-col items-center justify-center p-8 text-center">
              <ShieldAlert className="w-12 h-12 text-danger/40 mb-3" />
              <p className="text-sm font-bold text-danger">This PO cannot be amended in its current status.</p>
              <p className="text-xs text-text-secondary mt-1">Only ACCEPTED or ACKNOWLEDGED POs can be amended.</p>
            </div>
          ) : (
            <div className="space-y-6">

              {/* ── LINE ITEMS (read-only reference) ────────────────────── */}
              {lines.length > 0 && (
                <div className="enterprise-card overflow-hidden">
                  <div className="p-3 bg-primary-50/50 border-b border-border">
                    <h2 className="text-sm font-bold text-primary-900 uppercase tracking-wide">
                      Current Line Items (v{po.PO_VERSION})
                    </h2>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-primary-900 text-white">
                        <tr>
                          <th className="px-4 py-2 text-left font-semibold">#</th>
                          <th className="px-4 py-2 text-left font-semibold">Item</th>
                          <th className="px-4 py-2 text-left font-semibold">HSN/SAC</th>
                          <th className="px-4 py-2 text-right font-semibold">Qty</th>
                          <th className="px-4 py-2 text-right font-semibold">Rate (₹)</th>
                          <th className="px-4 py-2 text-right font-semibold">GST%</th>
                          <th className="px-4 py-2 text-right font-semibold">Line Total (₹)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {lines.map((l) => (
                          <tr key={l.PO_LINE_ID} className="hover:bg-primary-50/30">
                            <td className="px-4 py-2.5 text-text-secondary">{l.LINE_NUMBER}</td>
                            <td className="px-4 py-2.5">
                              <p className="font-medium text-text-primary">{l.ITEM_NAME}</p>
                              {l.ITEM_DESCRIPTION && (
                                <p className="text-[10px] text-text-secondary mt-0.5">{l.ITEM_DESCRIPTION}</p>
                              )}
                            </td>
                            <td className="px-4 py-2.5 font-mono text-text-secondary">{l.HSN_SAC_CODE || "—"}</td>
                            <td className="px-4 py-2.5 text-right font-mono">{l.ORDERED_QTY} {l.UNIT_OF_MEASURE}</td>
                            <td className="px-4 py-2.5 text-right font-mono">{fmt(l.RATE)}</td>
                            <td className="px-4 py-2.5 text-right">{l.GST_PERCENT}%</td>
                            <td className="px-4 py-2.5 text-right font-mono font-bold text-primary-900">{fmt(l.LINE_TOTAL)}</td>
                          </tr>
                        ))}
                        <tr className="bg-primary-50 font-bold">
                          <td colSpan={6} className="px-4 py-2.5 text-right text-sm">Grand Total:</td>
                          <td className="px-4 py-2.5 text-right font-mono text-primary-900">₹{fmt(po.GRAND_TOTAL)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ── AMENDMENT TYPE PANEL ─────────────────────────────────── */}
              <div className="enterprise-card overflow-hidden">
                <div className="p-4 border-b border-border bg-warning/10">
                  <h2 className="text-sm font-bold text-warning-900 uppercase tracking-wide flex items-center gap-2">
                    <FileEdit className="w-4 h-4 text-warning" />
                    Amendment Details — {amendType}
                  </h2>
                </div>

                <div className="p-6">

                  {/* ── VALUE ENHANCEMENT ─────────────────────────────── */}
                  {amendType === "Value Enhancement" && (
                    <div className="max-w-xl space-y-5">
                      <div className="flex items-start gap-3 p-4 bg-primary-50 border border-primary-200 rounded-sm">
                        <Calculator className="w-7 h-7 text-primary-600 shrink-0" />
                        <div>
                          <h3 className="text-sm font-bold text-primary-900">Revise Total PO Value</h3>
                          <p className="text-xs text-text-secondary mt-1">
                            Increases beyond <strong>10%</strong> of current value will re-trigger the financial approval workflow.
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-text-secondary mb-1">Current Grand Total (₹)</label>
                          <input type="text" className="enterprise-input bg-primary-50 font-mono" value={fmt(po.GRAND_TOTAL)} disabled />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-primary-900 mb-1">
                            New Proposed Total (₹) <span className="text-danger">*</span>
                          </label>
                          <input
                            type="number"
                            className="enterprise-input font-mono font-bold focus:ring-primary-600"
                            placeholder="e.g. 1500000"
                            value={newValue}
                            onChange={(e) => setNewValue(e.target.value)}
                          />
                        </div>
                      </div>

                      {newValue && proposedValue > 0 && (
                        <div className={`p-3 border rounded-sm ${isHighVariance ? "bg-warning/10 border-warning/30" : "bg-surface border-border"}`}>
                          <div className="flex justify-between items-center text-sm">
                            <span className="font-bold text-text-primary">Net Change:</span>
                            <span className={`font-mono font-bold ${delta >= 0 ? "text-warning-800" : "text-success"}`}>
                              {delta >= 0 ? "+" : ""}₹{fmt(Math.abs(delta))} ({delta >= 0 ? "+" : ""}{deltaPct.toFixed(1)}%)
                            </span>
                          </div>
                          {isHighVariance && (
                            <p className="text-[10px] text-warning-800 mt-1.5 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3 shrink-0" />
                              Variance {">"} 10% — re-approval by same authority required per SOP §6.3
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── TIMELINE EXTENSION ────────────────────────────── */}
                  {amendType === "Timeline Extension" && (
                    <div className="max-w-xl space-y-5">
                      <div className="flex items-start gap-3 p-4 bg-primary-50 border border-primary-200 rounded-sm">
                        <CalendarDays className="w-7 h-7 text-primary-600 shrink-0" />
                        <div>
                          <h3 className="text-sm font-bold text-primary-900">Extend Delivery Deadline</h3>
                          <p className="text-xs text-text-secondary mt-1">
                            Extensions require business justification. Liquidated Damages (0.5%/week, max 5%) apply unless waived.
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-text-secondary mb-1">Current Delivery Date</label>
                          <input type="text" className="enterprise-input bg-primary-50" value={po.DELIVERY_DATE || "—"} disabled />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-primary-900 mb-1">
                            New Delivery Date <span className="text-danger">*</span>
                          </label>
                          <input
                            type="date"
                            className="enterprise-input focus:ring-primary-600"
                            value={newDate}
                            min={new Date().toISOString().slice(0, 10)}
                            onChange={(e) => setNewDate(e.target.value)}
                          />
                        </div>
                      </div>

                      <label className="flex items-start gap-2.5 cursor-pointer p-3 border border-border rounded-sm hover:bg-primary-50 transition-colors">
                        <input
                          type="checkbox"
                          checked={ldWaiver}
                          onChange={(e) => setLdWaiver(e.target.checked)}
                          className="mt-0.5 rounded"
                        />
                        <div>
                          <p className="text-xs font-bold text-text-primary">Waive Liquidated Damages (LD)</p>
                          <p className="text-[10px] text-text-secondary mt-0.5">
                            Check if management has approved waiver of LD for this extension. This will be noted in the amended PO.
                          </p>
                        </div>
                      </label>
                    </div>
                  )}

                  {/* ── SCOPE CHANGE ──────────────────────────────────── */}
                  {amendType === "Scope Change" && (
                    <div className="space-y-5">

                      {/* Editable Line Items Table */}
                      <div className="overflow-x-auto border border-border rounded-sm">
                        <table className="w-full text-xs">
                          <thead className="bg-primary-50 text-primary-700 border-b border-border">
                            <tr>
                              <th className="px-3 py-2 text-left font-semibold w-8">#</th>
                              <th className="px-3 py-2 text-left font-semibold min-w-[140px]">Item Name</th>
                              <th className="px-3 py-2 text-left font-semibold w-20">UOM</th>
                              <th className="px-3 py-2 text-right font-semibold w-20">Qty</th>
                              <th className="px-3 py-2 text-right font-semibold w-24">Rate (₹)</th>
                              <th className="px-3 py-2 text-right font-semibold w-20">GST %</th>
                              <th className="px-3 py-2 text-right font-semibold w-28">Line Total (₹)</th>
                              <th className="px-3 py-2 w-8"></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {editableLines.map((line, idx) => {
                              const { lineTotal } = calcLine(line.ORDERED_QTY, line.RATE, line.GST_PERCENT);
                              return (
                                <tr key={line._key} className={line._deleted ? "bg-danger/5" : line._isNew ? "bg-success/5" : ""}>
                                  <td className="px-3 py-1.5 text-text-secondary">{idx + 1}</td>
                                  <td className="px-3 py-1.5">
                                    <input
                                      className={`w-full border-b border-transparent hover:border-border focus:border-primary-500 bg-transparent text-xs outline-none transition-colors ${line._deleted ? "line-through text-text-secondary" : ""}`}
                                      value={line.ITEM_NAME}
                                      disabled={line._deleted}
                                      onChange={e => setEditableLines(prev => prev.map(l => l._key === line._key ? {...l, ITEM_NAME: e.target.value} : l))}
                                    />
                                  </td>
                                  <td className="px-3 py-1.5">
                                    <input
                                      className="w-full border-b border-transparent hover:border-border focus:border-primary-500 bg-transparent text-xs outline-none transition-colors disabled:opacity-50"
                                      value={line.UNIT_OF_MEASURE}
                                      disabled={line._deleted}
                                      onChange={e => setEditableLines(prev => prev.map(l => l._key === line._key ? {...l, UNIT_OF_MEASURE: e.target.value} : l))}
                                    />
                                  </td>
                                  <td className="px-3 py-1.5">
                                    <input
                                      type="number" min="0"
                                      className="w-full border-b border-transparent hover:border-border focus:border-primary-500 bg-transparent text-xs text-right outline-none transition-colors disabled:opacity-50"
                                      value={line.ORDERED_QTY}
                                      disabled={line._deleted}
                                      onChange={e => setEditableLines(prev => prev.map(l => l._key === line._key ? {...l, ORDERED_QTY: e.target.value} : l))}
                                    />
                                  </td>
                                  <td className="px-3 py-1.5">
                                    <input
                                      type="number" min="0"
                                      className="w-full border-b border-transparent hover:border-border focus:border-primary-500 bg-transparent text-xs text-right outline-none transition-colors disabled:opacity-50"
                                      value={line.RATE}
                                      disabled={line._deleted}
                                      onChange={e => setEditableLines(prev => prev.map(l => l._key === line._key ? {...l, RATE: e.target.value} : l))}
                                    />
                                  </td>
                                  <td className="px-3 py-1.5">
                                    <select
                                      className="w-full border-b border-transparent hover:border-border focus:border-primary-500 bg-transparent text-xs outline-none transition-colors disabled:opacity-50"
                                      value={line.GST_PERCENT}
                                      disabled={line._deleted}
                                      onChange={e => setEditableLines(prev => prev.map(l => l._key === line._key ? {...l, GST_PERCENT: e.target.value} : l))}
                                    >
                                      {["0","5","12","18","28"].map(v => <option key={v} value={v}>{v}%</option>)}
                                    </select>
                                  </td>
                                  <td className="px-3 py-1.5 text-right font-mono font-bold">
                                    {line._deleted
                                      ? <span className="text-danger text-[10px] font-bold">REMOVED</span>
                                      : <span className="text-primary-900">₹{fmt(lineTotal)}</span>}
                                  </td>
                                  <td className="px-3 py-1.5 text-center">
                                    {line._deleted ? (
                                      <button type="button" title="Restore"
                                        onClick={() => setEditableLines(prev => prev.map(l => l._key === line._key ? {...l, _deleted: false} : l))}
                                        className="text-success hover:opacity-70 font-bold text-sm leading-none"
                                      >↩</button>
                                    ) : (
                                      <button type="button" title="Remove line"
                                        onClick={() => line._isNew
                                          ? setEditableLines(prev => prev.filter(l => l._key !== line._key))
                                          : setEditableLines(prev => prev.map(l => l._key === line._key ? {...l, _deleted: true} : l))
                                        }
                                        className="text-danger/50 hover:text-danger font-bold text-sm leading-none"
                                      >✕</button>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Add line + Live totals */}
                      <div className="flex items-start justify-between gap-4">
                        <button
                          type="button"
                          onClick={() => {
                            const key = nextLineKey;
                            setNextLineKey(k => k + 1);
                            setEditableLines(prev => [...prev, {
                              _key: key, PO_LINE_ID: "",
                              LINE_NUMBER: String(prev.filter(l => !l._deleted).length + 1),
                              ITEM_NAME: "", ITEM_DESCRIPTION: "", UNIT_OF_MEASURE: "NOS",
                              ORDERED_QTY: "1", RATE: "0", GST_PERCENT: "18",
                              HSN_SAC_CODE: "", REMARKS: "",
                              _deleted: false, _isNew: true,
                            }]);
                          }}
                          className="flex items-center gap-1.5 text-xs font-medium text-primary-700 hover:text-primary-900 border border-dashed border-primary-300 px-3 py-1.5 rounded-sm hover:bg-primary-50 transition-colors shrink-0"
                        >
                          <ListPlus className="w-3.5 h-3.5" /> Add Line
                        </button>

                        {(() => {
                          const active = editableLines.filter(l => !l._deleted);
                          const sub = active.reduce((s, l) => s + (parseFloat(l.ORDERED_QTY)||0) * (parseFloat(l.RATE)||0), 0);
                          const gstTotal = active.reduce((s, l) => {
                            const la = (parseFloat(l.ORDERED_QTY)||0) * (parseFloat(l.RATE)||0);
                            return s + la * ((parseFloat(l.GST_PERCENT)||0) / 100);
                          }, 0);
                          const grand = sub + gstTotal
                            + (parseFloat(po!.FREIGHT_CHARGES || "0"))
                            + (parseFloat(po!.INSTALLATION_CHARGES || "0"))
                            + (parseFloat(po!.FREIGHT_GST || "0"));
                          const diff = grand - currentValue;
                          return (
                            <div className="text-xs text-right space-y-1">
                              <div className="flex gap-4 text-text-secondary">
                                <span>Subtotal: <span className="font-mono font-bold text-text-primary">₹{fmt(sub)}</span></span>
                                <span>GST: <span className="font-mono font-bold text-text-primary">₹{fmt(gstTotal)}</span></span>
                              </div>
                              <div className="text-sm font-bold text-primary-900 flex items-center gap-2 justify-end">
                                New Grand Total: ₹{fmt(grand)}
                                {Math.abs(diff) > 0.01 && (
                                  <span className={`text-xs font-normal ${diff > 0 ? "text-warning-800" : "text-success"}`}>
                                    ({diff > 0 ? "+" : ""}₹{fmt(Math.abs(diff))})
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })()}
                      </div>

                      {/* Optional amendment notes */}
                      <div>
                        <label className="block text-xs font-medium text-text-secondary mb-1">
                          Amendment Notes <span className="text-[10px]">(optional)</span>
                        </label>
                        <textarea
                          className="w-full min-h-[60px] rounded-sm p-2.5 text-sm border border-border focus:ring-1 focus:ring-primary-600 outline-none transition-colors resize-none bg-surface"
                          placeholder="e.g. Line 2 qty increased per revised BOQ, Line 3 spec changed per vendor advice…"
                          value={scopeNotes}
                          onChange={(e) => setScopeNotes(e.target.value)}
                        />
                      </div>

                      <div className="p-3 bg-warning/10 border border-warning/30 rounded-sm flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                        <p className="text-[10px] text-warning-800 font-medium">
                          Line item changes update the PO grand total automatically. Revised total {">"} 10% above original triggers re-approval per SOP §6.3.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* ── CANCELLATION ──────────────────────────────────── */}
                  {amendType === "Cancellation" && (
                    <div className="max-w-xl space-y-5">
                      <div className="flex items-start gap-3 p-4 bg-danger/10 border border-danger/30 rounded-sm">
                        <AlertTriangle className="w-7 h-7 text-danger shrink-0" />
                        <div>
                          <h3 className="text-sm font-bold text-danger">PO Cancellation Request</h3>
                          <p className="text-xs text-danger/80 mt-1">
                            Cancellation is only permitted before any GRN is recorded. If advance has been paid, an advance recovery workflow will be triggered. Procurement Head approval is required — SOP §6.4.
                          </p>
                        </div>
                      </div>

                      <div className="p-3 bg-surface border border-border rounded-sm space-y-3">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-text-secondary">PO ID:</span>
                          <span className="font-mono font-bold">{po.PO_ID}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-text-secondary">Vendor:</span>
                          <span className="font-medium">{po.VENDOR_NAME}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs border-t border-border pt-2">
                          <span className="text-text-secondary">Value at Risk:</span>
                          <span className="font-mono font-bold text-danger">₹{fmt(po.GRAND_TOTAL)}</span>
                        </div>
                      </div>

                      <label className="flex items-start gap-2.5 cursor-pointer p-3 border border-danger/30 rounded-sm hover:bg-danger/5 transition-colors">
                        <input
                          type="checkbox"
                          checked={vendorConfirmed}
                          onChange={(e) => setVendorConfirmed(e.target.checked)}
                          className="mt-0.5 rounded accent-red-600"
                        />
                        <div>
                          <p className="text-xs font-bold text-text-primary">
                            I confirm the vendor has been notified and agreed to the cancellation terms.
                          </p>
                          <p className="text-[10px] text-text-secondary mt-0.5">
                            Cancellation without vendor notice may result in breach of contract.
                          </p>
                        </div>
                      </label>

                      <div className="p-2.5 bg-primary-50 border border-primary-200 rounded-sm flex items-start gap-1.5">
                        <Info className="w-3.5 h-3.5 text-primary-600 shrink-0 mt-0.5" />
                        <p className="text-[10px] text-primary-700">
                          This action will be blocked by the system if any GRN exists against this PO. The system checks this automatically on submission.
                        </p>
                      </div>
                    </div>
                  )}

                </div>
              </div>

            </div>
          )}
        </div>
      </div>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <div className="mt-8 space-y-2">
        <div className="bg-primary-50 border border-primary-200 text-primary-700 text-[11px] font-bold tracking-wide uppercase p-2 rounded-sm flex items-center justify-center text-center">
          ⚑ All amendments are permanently versioned and logged in the Audit Trail — SOP §6.3 | §15.1
        </div>
        <p className="text-center text-xs text-text-secondary">
          Per Crystal Group SOP-PROC-001 Version 1.2 | Amended POs re-sent to vendor for re-acknowledgement
        </p>
      </div>
    </div>
  );
}
