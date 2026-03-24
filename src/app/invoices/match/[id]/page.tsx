"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Scale,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  XCircle,
  FileText,
  Package,
  Receipt,
  ArrowLeft,
  ArrowRight,
  Flag,
  BadgeCheck,
  ChevronRight,
} from "lucide-react";
import { useCurrentUser } from "@/components/auth/AuthProvider";
import { fmtDate } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type MatchStatus =
  | "MATCHED"
  | "QUANTITY_VARIANCE"
  | "PRICE_VARIANCE"
  | "FRAUD_RISK"
  | "NO_GRN"
  | "NO_INVOICE";

type Resolution = "DEBIT_NOTE" | "ACCEPT_VARIANCE" | "REJECT" | "";

interface DetailData {
  match:    Record<string, string>;
  lines:    Record<string, string>[];
  po:       Record<string, string> | null;
  poLines:  Record<string, string>[];
  grn:      Record<string, string> | null;
  grnLines: Record<string, string>[];
  invoice:  Record<string, string> | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtAmt(v: string | number | undefined) {
  const n = parseFloat(String(v ?? "0"));
  if (isNaN(n)) return "—";
  return "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function StatusChip({ status }: { status: MatchStatus }) {
  const map: Record<MatchStatus, { label: string; cls: string; icon: React.ReactNode }> = {
    MATCHED:           { label: "Matched",             cls: "bg-success/10 text-success border-success/30",               icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
    QUANTITY_VARIANCE: { label: "Qty Variance",        cls: "bg-warning/10 text-warning-800 border-warning/30",           icon: <AlertTriangle className="w-3.5 h-3.5" /> },
    PRICE_VARIANCE:    { label: "Price Variance Detected", cls: "bg-danger/10 text-danger border-danger/30",              icon: <AlertTriangle className="w-3.5 h-3.5" /> },
    FRAUD_RISK:        { label: "Fraud Risk",          cls: "bg-danger/10 text-danger border-danger/30",                  icon: <ShieldAlert className="w-3.5 h-3.5" /> },
    NO_GRN:            { label: "No GRN",              cls: "bg-primary-100 text-primary-600 border-primary-300",         icon: <XCircle className="w-3.5 h-3.5" /> },
    NO_INVOICE:        { label: "No Invoice",          cls: "bg-primary-100 text-primary-600 border-primary-300",         icon: <XCircle className="w-3.5 h-3.5" /> },
  };
  const s = map[status] ?? map.MATCHED;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide px-3 py-1 rounded-sm border ${s.cls}`}>
      {s.icon} {s.label}
    </span>
  );
}

function AiConfidenceBadge({ score }: { score: string }) {
  const n = parseFloat(score ?? "0");
  const cls = n >= 85 ? "bg-success/10 text-success border-success/30"
    : n >= 70 ? "bg-warning/10 text-warning-800 border-warning/30"
    : "bg-danger/10 text-danger border-danger/30";
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-sm border ${cls}`}>
      <BadgeCheck className="w-3 h-3" /> AI {n}%
    </span>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function MatchDetailWrapper() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary-400" /></div>}>
      <MatchDetailPage />
    </Suspense>
  );
}

function MatchDetailPage() {
  const { id }    = useParams<{ id: string }>();
  const router    = useRouter();
  const { user }  = useCurrentUser();

  const [data, setData]         = useState<DetailData | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");

  const [resolution, setResolution] = useState<Resolution>("");
  const [resolving, setResolving]   = useState(false);
  const [resolved, setResolved]     = useState(false);
  const [resolveErr, setResolveErr] = useState("");

  const [escalating, setEscalating]   = useState(false);
  const [escalated, setEscalated]     = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetch(`/api/match?match_id=${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setError(d.error); return; }
        setData(d);
      })
      .catch(() => setError("Failed to load match details."))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleResolve() {
    if (!resolution) return;
    setResolving(true);
    setResolveErr("");
    try {
      const res  = await fetch("/api/match", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ match_id: id, resolution, resolved_by: user?.userId ?? "SYSTEM" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      setResolved(true);
      // Refresh data
      const refreshed = await fetch(`/api/match?match_id=${id}`).then((r) => r.json());
      if (!refreshed.error) setData(refreshed);
    } catch (e) {
      setResolveErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setResolving(false);
    }
  }

  async function handleEscalate() {
    if (!data) return;
    setEscalating(true);
    try {
      await fetch("/api/flags", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          type:        "Escalation",
          description: `Match ${id} escalated for management review. Status: ${data.match.MATCH_RESULT}.`,
          source_id:   id,
          source:      "THREE_WAY_MATCH",
          created_by:  user?.userId ?? "SYSTEM",
        }),
      });
      setEscalated(true);
    } catch {
      // silent
    } finally {
      setEscalating(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-400" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-7xl mx-auto space-y-4">
        <button onClick={() => router.back()} className="text-sm text-text-secondary hover:text-primary-900 flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="enterprise-card p-8 text-center">
          <XCircle className="w-10 h-10 mx-auto mb-3 text-danger opacity-40" />
          <p className="text-sm text-text-secondary">{error || "Match not found."}</p>
        </div>
      </div>
    );
  }

  const { match, lines, po, poLines, grn, grnLines, invoice } = data;
  const matchStatus = (match.MATCH_RESULT ?? "MATCHED") as MatchStatus;
  const isResolved  = !!match.RESOLUTION_STATUS || resolved;
  const canResolve  = matchStatus !== "MATCHED" && !isResolved;

  // Invoice card border color based on status
  const invCardBorder =
    matchStatus === "MATCHED"           ? "border-success/40 bg-success/5" :
    matchStatus === "QUANTITY_VARIANCE" ? "border-warning/40 bg-warning/5" :
    matchStatus === "PRICE_VARIANCE"    ? "border-danger/30 bg-danger/5"   :
    matchStatus === "FRAUD_RISK"        ? "border-danger/40 bg-danger/5"   :
                                          "border-primary-200 bg-surface";

  return (
    <div className="space-y-5 max-w-7xl mx-auto pb-20">

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border pb-4">
        <div className="flex items-start gap-3">
          <button
            onClick={() => router.push("/invoices/match")}
            className="mt-1 text-text-secondary hover:text-primary-900 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-primary-900 tracking-tight flex items-center gap-2">
              <Scale className="w-5 h-5 text-primary-600" /> Three-Way Match Verification
            </h1>
            <p className="text-xs text-text-secondary mt-0.5">
              Match ID: <span className="font-mono font-bold text-primary-700">{id}</span>
              <span className="mx-2 text-border">|</span>
              Status: <span className="font-medium">{isResolved ? "Resolved" : matchStatus === "MATCHED" ? "Matched" : "Pending Resolution"}</span>
            </p>
            {(po?.VENDOR_NAME || invoice?.VENDOR_NAME) && (
              <p className="text-xs text-text-secondary mt-0.5">
                Vendor: <span className="font-bold text-primary-900">{po?.VENDOR_NAME || invoice?.VENDOR_NAME}</span>
                {po?.VENDOR_ID && <span className="ml-1.5 font-mono text-[10px] text-text-secondary">({po.VENDOR_ID})</span>}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <StatusChip status={matchStatus} />
          <button
            onClick={handleEscalate}
            disabled={escalating || escalated}
            className="h-8 px-3 border border-border text-xs font-bold text-primary-700 hover:bg-primary-50 rounded-sm transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            <Flag className="w-3.5 h-3.5" />
            {escalated ? "Escalated" : escalating ? "…" : "Escalate"}
          </button>
          {canResolve && (
            <button
              onClick={handleResolve}
              disabled={!resolution || resolving}
              className="h-8 px-4 bg-primary-900 hover:bg-primary-800 text-white text-xs font-bold rounded-sm transition-colors disabled:opacity-40 flex items-center gap-1.5"
            >
              {resolving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ChevronRight className="w-3.5 h-3.5" />}
              Resolve Match
            </button>
          )}
        </div>
      </div>

      {/* Resolved banner */}
      {isResolved && (
        <div className="flex items-center gap-2 p-3 bg-success/10 border border-success/30 rounded-sm text-xs text-success font-bold">
          <CheckCircle2 className="w-4 h-4" />
          Match resolved — {match.RESOLUTION_STATUS === "DEBIT_NOTE" ? "Debit note raised, payment at PO value" : match.RESOLUTION_STATUS === "ACCEPT_VARIANCE" ? "Price variance accepted, payment released" : "Invoice rejected"}
        </div>
      )}

      {resolveErr && (
        <div className="flex items-center gap-2 p-3 bg-danger/10 border border-danger/30 rounded-sm text-xs text-danger">
          <XCircle className="w-4 h-4" /> {resolveErr}
        </div>
      )}

      {/* Document ref breadcrumb */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-50 border border-primary-200 rounded-sm">
          <FileText className="w-3.5 h-3.5 text-primary-600" />
          <span className="text-text-secondary">PO</span>
          <span className="font-mono font-bold text-primary-700">{match.PO_ID || "—"}</span>
        </div>
        <ArrowRight className="w-4 h-4 text-text-secondary" />
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-success/5 border border-success/20 rounded-sm">
          <Package className="w-3.5 h-3.5 text-success" />
          <span className="text-text-secondary">GRN</span>
          <span className="font-mono font-bold text-primary-700">{match.GRN_ID || "—"}</span>
        </div>
        <ArrowRight className="w-4 h-4 text-text-secondary" />
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-accent-50 border border-accent-200 rounded-sm">
          <Receipt className="w-3.5 h-3.5 text-accent-600" />
          <span className="text-text-secondary">Invoice</span>
          <span className="font-mono font-bold text-primary-700">{match.INVOICE_ID || "—"}</span>
        </div>
        <span className="ml-auto text-[10px] text-text-secondary">
          {fmtDate(match.MATCH_TIMESTAMP)}
        </span>
      </div>

      {/* Three-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">

        {/* ── PO Card ── */}
        <div className="enterprise-card overflow-hidden">
          <div className="bg-primary-900 text-white px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 opacity-70" />
              <span className="font-mono font-bold text-sm">{po?.PO_ID ?? match.PO_ID ?? "—"}</span>
            </div>
            {po?.VENDOR_NAME && (
              <span className="text-[10px] font-bold bg-white/20 px-2 py-0.5 rounded-sm truncate max-w-[120px]" title={po.VENDOR_NAME}>
                {po.VENDOR_NAME}
              </span>
            )}
          </div>

          <div className="p-4 space-y-3 bg-surface">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <p className="text-text-secondary">Date</p>
                <p className="font-medium text-primary-900">{fmtDate(po?.PO_DATE ?? "")}</p>
              </div>
              <div>
                <p className="text-text-secondary">Terms</p>
                <p className="font-medium text-primary-900">{po?.PAYMENT_TERMS ?? "—"}</p>
              </div>
            </div>
            <div className="text-xs">
              <p className="text-text-secondary">Total Value</p>
              <p className="text-lg font-mono font-bold text-primary-900">{fmtAmt(po?.GRAND_TOTAL ?? po?.TOTAL_AMOUNT_WITH_GST)}</p>
            </div>
          </div>

          <div className="border-t border-border">
            {poLines.length === 0 ? (
              <p className="px-4 py-3 text-xs text-text-secondary italic">No line items</p>
            ) : poLines.map((l, i) => (
              <div key={i} className={`px-4 py-3 text-xs ${i > 0 ? "border-t border-border/60" : ""}`}>
                <p className="font-bold text-primary-900 mb-1.5">
                  {i + 1}. {l.ITEM_DESCRIPTION ?? l.ITEM_NAME ?? "—"}
                </p>
                <div className="grid grid-cols-2 gap-1 text-text-secondary">
                  <span>Qty Ordered:</span>
                  <span className="text-right font-mono font-medium text-primary-900">{l.ORDERED_QTY ?? l.QTY ?? "—"} {l.UNIT_OF_MEASURE ?? ""}</span>
                  <span>Unit Price:</span>
                  <span className="text-right font-mono font-medium text-primary-900">{fmtAmt(l.RATE)}</span>
                </div>
                <div className="flex justify-between mt-1.5 pt-1.5 border-t border-border/40 font-bold text-primary-900">
                  <span>Line Total:</span>
                  <span className="font-mono">{fmtAmt(l.LINE_TOTAL ?? l.AMOUNT_WITH_GST)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── GRN Card ── */}
        <div className="enterprise-card overflow-hidden">
          <div className="bg-primary-900 text-white px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 opacity-70" />
              <span className="font-mono font-bold text-sm">{grn?.GRN_ID ?? match.GRN_ID ?? "—"}</span>
            </div>
            {grn?.SITE && (
              <span className="text-[10px] font-bold bg-white/20 px-2 py-0.5 rounded-sm">
                {grn.SITE}
              </span>
            )}
          </div>

          <div className="p-4 space-y-3 bg-surface">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <p className="text-text-secondary">Date Received</p>
                <p className="font-medium text-primary-900">{fmtDate(grn?.GRN_DATE ?? grn?.CREATED_AT ?? "")}</p>
              </div>
              <div>
                <p className="text-text-secondary">Challan</p>
                <p className="font-mono font-medium text-primary-900">{grn?.LR_CHALLAN_NUMBER ?? "—"}</p>
              </div>
            </div>
            <div className="text-xs">
              <p className="text-text-secondary">Verified By</p>
              <p className="font-medium text-primary-900">{grn?.SITE_HEAD_USER_ID ?? grn?.RECEIVED_BY_NAME ?? "—"}</p>
            </div>
          </div>

          <div className="border-t border-border">
            {match.GRN_ID ? (
              grnLines.length === 0 ? (
                <p className="px-4 py-3 text-xs text-text-secondary italic">No line items recorded</p>
              ) : grnLines.map((l, i) => {
                const matchLine = lines.find((ml) => ml.PO_LINE_ID === l.PO_LINE_ID);
                const accepted  = parseFloat(l.ACCEPTED_QTY ?? "0");
                const ordered   = parseFloat(matchLine?.PO_QTY ?? "0");
                const isPartial = ordered > 0 && accepted < ordered;

                return (
                  <div key={i} className={`px-4 py-3 text-xs ${i > 0 ? "border-t border-border/60" : ""}`}>
                    <p className="font-bold text-primary-900 mb-1.5">
                      {i + 1}. {l.ITEM_NAME || matchLine?.PO_ITEM_DESCRIPTION || "—"}
                    </p>
                    <div className="grid grid-cols-2 gap-1 text-text-secondary">
                      <span>Qty Received:</span>
                      <span className="text-right font-mono font-medium text-primary-900">{l.RECEIVED_QTY ?? "—"}</span>
                      <span>Qty Accepted:</span>
                      <span className={`text-right font-mono font-bold ${isPartial ? "text-warning-800" : "text-success"}`}>
                        {accepted} {isPartial && <span className="text-[9px] ml-1">▲ partial</span>}
                      </span>
                      <span>Condition:</span>
                      <span className="text-right font-medium text-primary-900">{l.ITEM_CONDITION ?? "Good"}</span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="px-4 py-6 text-center text-text-secondary text-xs">
                <Package className="w-6 h-6 mx-auto mb-1 opacity-30" />
                No GRN linked to this match.
              </div>
            )}
          </div>
        </div>

        {/* ── Invoice Card ── */}
        <div className={`enterprise-card overflow-hidden border-2 ${invCardBorder}`}>
          <div className="px-4 py-3 flex items-center justify-between bg-surface border-b border-border">
            <div className="flex items-center gap-2">
              <Receipt className="w-4 h-4 text-primary-600" />
              <span className="font-mono font-bold text-sm text-primary-900">{invoice?.INV_ID ?? match.INVOICE_ID ?? "—"}</span>
            </div>
            {invoice?.AI_CONFIDENCE_SCORE && (
              <AiConfidenceBadge score={invoice.AI_CONFIDENCE_SCORE} />
            )}
          </div>

          <div className="p-4 space-y-3 bg-surface">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <p className="text-text-secondary">Invoice Date</p>
                <p className="font-medium text-primary-900">{fmtDate(invoice?.INVOICE_DATE ?? invoice?.INV_DATE ?? "")}</p>
              </div>
              <div>
                <p className="text-text-secondary">Due Date</p>
                {(() => {
                  const due = invoice?.PAYMENT_DUE_DATE ?? "";
                  const isPast = due && new Date(due) < new Date();
                  return <p className={`font-medium ${isPast ? "text-danger" : "text-primary-900"}`}>{fmtDate(due) || "—"}</p>;
                })()}
              </div>
            </div>
            <div className="text-xs">
              <p className="text-text-secondary">Total Billed</p>
              <p className={`text-lg font-mono font-bold ${matchStatus === "PRICE_VARIANCE" ? "text-danger" : "text-primary-900"}`}>
                {fmtAmt(invoice?.TOTAL_PAYABLE)}
              </p>
            </div>
          </div>

          <div className="border-t border-border">
            {lines.length === 0 ? (
              <p className="px-4 py-3 text-xs text-text-secondary italic">No line items</p>
            ) : lines.map((l, i) => {
              const priceVar   = parseFloat(l.RATE_VARIANCE_PCT ?? "0");
              const qtyVar     = parseFloat(l.QTY_VARIANCE ?? "0");
              const invQty     = parseFloat(l.INVOICE_QTY ?? "0");
              const grnQty     = parseFloat(l.RECEIPT_QTY ?? "0");
              const qtyMatches = Math.abs(qtyVar) < 0.001;
              const lineTotal  = invQty * parseFloat(l.INVOICE_RATE ?? "0");

              return (
                <div key={i} className={`px-4 py-3 text-xs ${i > 0 ? "border-t border-border/60" : ""} ${l.LINE_MATCH_RESULT !== "MATCHED" ? "bg-danger/5" : ""}`}>
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <p className="font-bold text-primary-900">
                      {i + 1}. {l.PO_ITEM_DESCRIPTION ?? "—"}
                    </p>
                    {l.LINE_MATCH_RESULT !== "MATCHED" && (
                      <AlertTriangle className="w-3.5 h-3.5 text-danger shrink-0 mt-0.5" />
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-text-secondary">
                    <span>Qty Billed:</span>
                    <span className="text-right font-mono font-medium flex items-center justify-end gap-1">
                      <span className={qtyVar > 0 ? "text-danger font-bold" : "text-primary-900"}>{l.INVOICE_QTY ?? "—"}</span>
                      {qtyMatches ? (
                        <span className="text-[9px] font-bold bg-success/10 text-success border border-success/20 px-1 py-0.5 rounded-sm">GRN Match</span>
                      ) : (
                        <span className="text-[9px] font-bold bg-danger/10 text-danger border border-danger/20 px-1 py-0.5 rounded-sm">Over GRN</span>
                      )}
                    </span>
                    <span>Unit Rate:</span>
                    <span className="text-right font-mono">
                      {priceVar > 0.5 ? (
                        <span className="flex flex-col items-end gap-0.5">
                          <span className="line-through text-text-secondary">{fmtAmt(l.PO_RATE)}</span>
                          <span className="text-danger font-bold">{fmtAmt(l.INVOICE_RATE)}</span>
                          <span className="text-[9px] text-danger font-bold">+{priceVar.toFixed(1)}% Above PO Rate</span>
                        </span>
                      ) : (
                        <span className="text-success font-medium">{fmtAmt(l.INVOICE_RATE)}</span>
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between mt-1.5 pt-1.5 border-t border-border/40 font-bold text-primary-900">
                    <span>Line Total:</span>
                    <span className={`font-mono ${priceVar > 0.5 ? "text-danger" : ""}`}>{fmtAmt(lineTotal)}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Resolution Options */}
          {canResolve && (
            <div className="border-t border-border p-4 bg-surface space-y-3">
              <p className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">Resolution Options</p>
              {[
                { value: "DEBIT_NOTE",      label: "Create Debit Note",        desc: "Process payment for original PO value; recover variance." },
                { value: "ACCEPT_VARIANCE", label: "Accept Price Variance",     desc: "Approve invoice as-is with amendment note. Payment at invoice amount." },
                { value: "REJECT",          label: "Reject Invoice",            desc: "Return to vendor for correction. Payment blocked." },
              ].map((opt) => (
                <label key={opt.value} className={`flex items-start gap-2.5 cursor-pointer p-2 rounded-sm border transition-colors ${resolution === opt.value ? "border-primary-400 bg-primary-50" : "border-border hover:bg-primary-50/40"}`}>
                  <input
                    type="radio"
                    name="resolution"
                    value={opt.value}
                    checked={resolution === opt.value}
                    onChange={() => setResolution(opt.value as Resolution)}
                    className="mt-0.5 accent-primary-900"
                  />
                  <div>
                    <p className="text-xs font-bold text-primary-900">{opt.label}</p>
                    <p className="text-[10px] text-text-secondary mt-0.5">{opt.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          )}

          {/* Resolved state */}
          {isResolved && match.RESOLUTION_STATUS && (
            <div className="border-t border-border p-3 bg-success/10 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
              <p className="text-xs text-success font-bold">
                Resolved: {match.RESOLUTION_STATUS === "DEBIT_NOTE" ? "Debit Note Raised" : match.RESOLUTION_STATUS === "ACCEPT_VARIANCE" ? "Variance Accepted" : "Invoice Rejected"}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Audit bar */}
      <div className="bg-primary-50 border border-primary-200 text-primary-700 text-[11px] font-bold tracking-wide uppercase p-2 rounded-sm flex items-center justify-center text-center">
        ⚑ Audit: All match results and payment decisions are logged per SOP §8.4.
      </div>
    </div>
  );
}
