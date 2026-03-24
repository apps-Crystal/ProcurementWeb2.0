"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Wrench,
  Search,
  Send,
  Loader2,
  CheckCircle2,
  Plus,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import { useCurrentUser } from "@/components/auth/AuthProvider";

// ── Types ─────────────────────────────────────────────────────────────────────

interface WOResult {
  PO_ID:          string;
  VENDOR_NAME:    string;
  PO_DATE:        string;
  GRAND_TOTAL:    string;
  DELIVERY_DATE:  string;
  STATUS:         string;
  SOURCE_PR_TYPE: string;
}

interface ScopeLine {
  scope_item:      string;
  delivery_status: string;
  quantity:        number;
  rate:            number;
  remarks:         string;
}

const DELIVERY_STATUSES = ["DELIVERED", "PARTIAL", "PENDING", "REJECTED"] as const;

const EMPTY_LINE: ScopeLine = {
  scope_item:      "",
  delivery_status: "DELIVERED",
  quantity:        1,
  rate:            0,
  remarks:         "",
};

// ── Wrapper (required so useSearchParams works in server+client hybrid) ───────

export default function NewSRNWrapper() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-primary-400" />
      </div>
    }>
      <NewSRN />
    </Suspense>
  );
}

// ── Form ──────────────────────────────────────────────────────────────────────

function NewSRN() {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const { user }     = useCurrentUser();

  // WO search
  const [woInput,   setWoInput]   = useState(searchParams.get("wo") ?? "");
  const [woResults, setWoResults] = useState<WOResult[]>([]);
  const [woOpen,    setWoOpen]    = useState(false);
  const [woLoading, setWoLoading] = useState(false);
  const [woData,    setWoData]    = useState<WOResult | null>(null);
  const [woError,   setWoError]   = useState("");

  // Form fields
  const [receiptDate,       setReceiptDate]       = useState(new Date().toISOString().slice(0, 10));
  const [servicePeriodFrom, setServicePeriodFrom] = useState("");
  const [servicePeriodTo,   setServicePeriodTo]   = useState("");
  const [serviceDesc,       setServiceDesc]       = useState("");
  const [site,              setSite]              = useState("");
  const [remarks,           setRemarks]           = useState("");

  // Lines
  const [lines, setLines] = useState<ScopeLine[]>([{ ...EMPTY_LINE }]);

  // Submission
  const [submitting,   setSubmitting]   = useState(false);
  const [submitError,  setSubmitError]  = useState("");
  const [successId,    setSuccessId]    = useState("");

  // Pre-populate site from JWT user
  useEffect(() => {
    if (user?.site) setSite(user.site);
  }, [user]);

  // Auto-load WO from query param
  useEffect(() => {
    const wo = searchParams.get("wo");
    if (wo) void loadWO(wo);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── WO search ─────────────────────────────────────────────────────────────

  async function handleWoInput(val: string) {
    setWoInput(val);
    setWoData(null);
    setWoError("");
    if (val.trim().length < 2) { setWoResults([]); setWoOpen(false); return; }
    setWoLoading(true);
    try {
      const res  = await fetch(`/api/po?for_grn=1&q=${encodeURIComponent(val)}`);
      const data = await res.json();
      setWoResults(data.pos ?? []);
      setWoOpen(true);
    } catch {
      setWoResults([]);
    } finally {
      setWoLoading(false);
    }
  }

  async function loadWO(poId: string) {
    setWoLoading(true);
    setWoError("");
    try {
      const res  = await fetch(`/api/po?q=${encodeURIComponent(poId)}`);
      const data = await res.json();
      const po   = (data.pos ?? []).find((p: WOResult) => p.PO_ID === poId);
      if (po) {
        selectWO(po);
      } else {
        setWoError(`Work Order "${poId}" not found or not in a receivable state.`);
      }
    } catch {
      setWoError("Failed to load work order.");
    } finally {
      setWoLoading(false);
    }
  }

  function selectWO(wo: WOResult) {
    setWoData(wo);
    setWoInput(wo.PO_ID);
    setWoOpen(false);
    setWoError("");
  }

  // ── Line helpers ──────────────────────────────────────────────────────────

  function updateLine<K extends keyof ScopeLine>(i: number, key: K, val: ScopeLine[K]) {
    setLines((prev) => prev.map((l, idx) => idx === i ? { ...l, [key]: val } : l));
  }

  function addLine() {
    setLines((prev) => [...prev, { ...EMPTY_LINE }]);
  }

  function removeLine(i: number) {
    if (lines.length > 1) setLines((prev) => prev.filter((_, idx) => idx !== i));
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError("");

    if (!woData) { setSubmitError("Please select a Work Order."); return; }
    if (!receiptDate) { setSubmitError("Receipt date is required."); return; }

    const activeLines = lines.filter((l) => l.scope_item.trim() !== "");
    if (activeLines.length === 0) {
      setSubmitError("At least one scope item is required.");
      return;
    }
    for (const [i, l] of activeLines.entries()) {
      if (l.quantity <= 0) {
        setSubmitError(`Line ${i + 1}: quantity must be greater than zero.`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/srn", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wo_id:               woData.PO_ID,
          receipt_date:        receiptDate,
          service_period_from: servicePeriodFrom,
          service_period_to:   servicePeriodTo,
          service_description: serviceDesc,
          site,
          remarks,
          lines: activeLines,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setSubmitError(data.error ?? "Submission failed."); return; }
      setSuccessId(data.srn_id);
    } catch {
      setSubmitError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Success screen ────────────────────────────────────────────────────────

  if (successId) {
    return (
      <div className="max-w-lg mx-auto mt-20 enterprise-card p-10 text-center space-y-4">
        <CheckCircle2 className="w-14 h-14 text-success mx-auto" />
        <h2 className="text-2xl font-bold text-primary-900">SRN Submitted</h2>
        <p className="text-text-secondary text-sm">
          Service Receipt Note{" "}
          <span className="font-mono font-bold text-primary-700">{successId}</span>{" "}
          has been recorded successfully.
        </p>
        <div className="flex justify-center gap-3 pt-2">
          <button
            onClick={() => router.push("/receipts/srn")}
            className="h-9 px-5 bg-primary-700 hover:bg-primary-800 text-white text-sm font-medium rounded-sm transition-colors"
          >
            All SRNs
          </button>
          <button
            onClick={() => {
              setSuccessId("");
              setWoData(null);
              setWoInput("");
              setLines([{ ...EMPTY_LINE }]);
              setServiceDesc("");
              setServicePeriodFrom("");
              setServicePeriodTo("");
              setRemarks("");
            }}
            className="h-9 px-5 bg-surface hover:bg-primary-50 text-primary-700 text-sm font-medium border border-border rounded-sm transition-colors"
          >
            New SRN
          </button>
        </div>
      </div>
    );
  }

  // ── Main form ─────────────────────────────────────────────────────────────

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20">

      {/* Page header */}
      <div className="flex items-center gap-3 border-b border-border pb-4">
        <Wrench className="w-6 h-6 text-primary-500" />
        <div>
          <h1 className="text-2xl font-bold text-primary-900 tracking-tight">
            New Service Receipt Note (F5)
          </h1>
          <p className="text-sm text-text-secondary mt-0.5">
            Certify completion of services or milestones against a Work Order.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* ── Work Order search ─────────────────────────────────────────── */}
        <section className="enterprise-card p-5 space-y-4">
          <h2 className="text-sm font-bold text-primary-800 uppercase tracking-wider flex items-center gap-2">
            <Search className="w-4 h-4" /> 1. Link Work Order
          </h2>

          <div className="relative max-w-sm">
            <label className="block text-xs font-semibold text-text-secondary mb-1">
              Work Order / PO ID <span className="text-danger">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={woInput}
                onChange={(e) => handleWoInput(e.target.value)}
                onFocus={() => woResults.length > 0 && setWoOpen(true)}
                onBlur={() => setTimeout(() => setWoOpen(false), 150)}
                placeholder="Type WO or PO ID to search…"
                className="enterprise-input pr-8 w-full"
              />
              {woLoading && (
                <Loader2 className="absolute right-2.5 top-2.5 w-4 h-4 animate-spin text-text-secondary" />
              )}
            </div>

            {woOpen && woResults.length > 0 && (
              <div className="absolute z-30 top-full left-0 mt-1 w-full bg-surface border border-border rounded-sm shadow-lg max-h-60 overflow-y-auto">
                {woResults.map((po) => (
                  <button
                    key={po.PO_ID}
                    type="button"
                    onMouseDown={() => selectWO(po)}
                    className="w-full text-left px-3 py-2 hover:bg-primary-50 flex flex-col gap-0.5 border-b border-border last:border-0"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-sm bg-primary-100 text-primary-700 shrink-0">
                        {po.SOURCE_PR_TYPE || "PO"}
                      </span>
                      <span className="text-xs font-semibold text-text-primary">{po.PO_ID}</span>
                    </div>
                    <span className="text-[11px] text-text-secondary pl-7 truncate">
                      {po.VENDOR_NAME} · {po.STATUS}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {woError && (
              <p className="text-xs text-danger mt-1 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> {woError}
              </p>
            )}
          </div>

          {woData && (
            <div className="bg-primary-50 border border-primary-200 rounded-sm p-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div>
                <span className="text-text-secondary block">Vendor</span>
                <span className="font-semibold text-primary-900">{woData.VENDOR_NAME}</span>
              </div>
              <div>
                <span className="text-text-secondary block">WO Date</span>
                <span className="font-semibold text-primary-900">{woData.PO_DATE?.slice(0, 10) ?? "—"}</span>
              </div>
              <div>
                <span className="text-text-secondary block">Status</span>
                <span className="font-semibold text-primary-900">{woData.STATUS}</span>
              </div>
              <div>
                <span className="text-text-secondary block">WO Value</span>
                <span className="font-semibold text-primary-900">
                  ₹{parseFloat(woData.GRAND_TOTAL?.replace(/,/g, "") || "0").toLocaleString("en-IN")}
                </span>
              </div>
            </div>
          )}
        </section>

        {/* ── Receipt details ───────────────────────────────────────────── */}
        <section className="enterprise-card p-5 space-y-4">
          <h2 className="text-sm font-bold text-primary-800 uppercase tracking-wider">
            2. Receipt Details
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1">
                Receipt Date <span className="text-danger">*</span>
              </label>
              <input
                type="date"
                value={receiptDate}
                onChange={(e) => setReceiptDate(e.target.value)}
                max={new Date().toISOString().slice(0, 10)}
                required
                className="enterprise-input w-full"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1">Site / Location</label>
              <input
                type="text"
                value={site}
                onChange={(e) => setSite(e.target.value)}
                placeholder="e.g. Mumbai HQ"
                className="enterprise-input w-full"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1">Service Period From</label>
              <input
                type="date"
                value={servicePeriodFrom}
                onChange={(e) => setServicePeriodFrom(e.target.value)}
                className="enterprise-input w-full"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1">Service Period To</label>
              <input
                type="date"
                value={servicePeriodTo}
                onChange={(e) => setServicePeriodTo(e.target.value)}
                min={servicePeriodFrom || undefined}
                className="enterprise-input w-full"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-text-secondary mb-1">Service Description</label>
              <input
                type="text"
                value={serviceDesc}
                onChange={(e) => setServiceDesc(e.target.value)}
                placeholder="Brief description of services received"
                className="enterprise-input w-full"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-secondary mb-1">Remarks</label>
            <textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              rows={2}
              placeholder="General remarks…"
              className="enterprise-input w-full resize-none"
            />
          </div>
        </section>

        {/* ── Scope lines ───────────────────────────────────────────────── */}
        <section className="enterprise-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-primary-800 uppercase tracking-wider">
              3. Scope Items Confirmed
            </h2>
            <button
              type="button"
              onClick={addLine}
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary-700 hover:text-primary-900 bg-primary-50 hover:bg-primary-100 border border-primary-200 px-3 py-1.5 rounded-sm transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add Line
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="text-[10px] text-text-secondary uppercase tracking-wider bg-primary-50/50 border-b border-border">
                <tr>
                  <th className="px-3 py-2 font-semibold min-w-[220px]">
                    Scope Item / Milestone <span className="text-danger">*</span>
                  </th>
                  <th className="px-3 py-2 font-semibold w-36">Delivery Status</th>
                  <th className="px-3 py-2 font-semibold w-24">Qty</th>
                  <th className="px-3 py-2 font-semibold w-28">Rate (₹)</th>
                  <th className="px-3 py-2 font-semibold w-28 text-right">Amount</th>
                  <th className="px-3 py-2 font-semibold min-w-[160px]">Remarks</th>
                  <th className="px-3 py-2 w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {lines.map((line, i) => (
                  <tr key={i} className="hover:bg-primary-50/20">
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={line.scope_item}
                        onChange={(e) => updateLine(i, "scope_item", e.target.value)}
                        placeholder="e.g. Monthly housekeeping"
                        className="enterprise-input w-full text-xs"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={line.delivery_status}
                        onChange={(e) => updateLine(i, "delivery_status", e.target.value)}
                        className="enterprise-input w-full text-xs"
                      >
                        {DELIVERY_STATUSES.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={0.01}
                        step="any"
                        value={line.quantity}
                        onChange={(e) => updateLine(i, "quantity", parseFloat(e.target.value) || 0)}
                        className="enterprise-input w-full text-xs text-right"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={line.rate}
                        onChange={(e) => updateLine(i, "rate", parseFloat(e.target.value) || 0)}
                        className="enterprise-input w-full text-xs text-right"
                      />
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-primary-700">
                      ₹{(line.quantity * line.rate).toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={line.remarks}
                        onChange={(e) => updateLine(i, "remarks", e.target.value)}
                        placeholder="Optional"
                        className="enterprise-input w-full text-xs"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => removeLine(i)}
                        disabled={lines.length === 1}
                        className="p-1 text-text-secondary hover:text-danger disabled:opacity-30 transition-colors"
                        title="Remove line"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end border-t border-border pt-3">
            <span className="text-sm font-bold text-primary-900">
              Total: ₹{lines.reduce((s, l) => s + l.quantity * l.rate, 0).toLocaleString("en-IN", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          </div>
        </section>

        {/* SoD notice */}
        <div className="bg-primary-50 border border-primary-200 text-primary-700 text-[11px] font-bold tracking-wide uppercase p-2 rounded-sm text-center">
          ⚑ Segregation Control: You cannot approve your own submission — SOP §15.1
        </div>

        {/* Error banner */}
        {submitError && (
          <div className="flex items-start gap-2 px-4 py-3 bg-danger/5 border border-danger/20 rounded-sm text-sm text-danger">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            {submitError}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={() => router.push("/receipts/srn")}
            className="h-9 px-5 bg-surface hover:bg-primary-50 text-primary-700 text-sm font-medium border border-border rounded-sm transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || !woData}
            className="h-9 px-6 bg-primary-700 hover:bg-primary-800 text-white text-sm font-medium rounded-sm transition-colors shadow-sm flex items-center gap-2 disabled:opacity-50"
          >
            {submitting ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</>
            ) : (
              <><Send className="w-4 h-4" /> Submit SRN</>
            )}
          </button>
        </div>

      </form>
    </div>
  );
}
