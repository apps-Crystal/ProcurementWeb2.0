"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Scale,
  Search,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  XCircle,
  ChevronRight,
  PlayCircle,
} from "lucide-react";
import { fmtDate } from "@/lib/utils";
import { useCurrentUser } from "@/components/auth/AuthProvider";

// ── Types ─────────────────────────────────────────────────────────────────────

type MatchStatus = "MATCHED" | "QUANTITY_VARIANCE" | "PRICE_VARIANCE" | "FRAUD_RISK" | "NO_GRN" | "NO_INVOICE";

interface MatchRow {
  match_id:       string;
  po_id:          string;
  grn_id:         string;
  inv_id:         string;
  match_status:   MatchStatus;
  max_qty_var:    string;
  max_price_var:  string;
  triggered_by:   string;
  created_at:     string;
}

type Tab = "All" | "Matched" | "Variance" | "Risk";

// ── Helpers ───────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: MatchStatus }) {
  const map: Record<MatchStatus, { label: string; cls: string; icon: React.ReactNode }> = {
    MATCHED:           { label: "Matched",           cls: "bg-success/10 text-success border-success/20",           icon: <CheckCircle2 className="w-3 h-3" /> },
    QUANTITY_VARIANCE: { label: "Qty Variance",      cls: "bg-warning/10 text-warning-800 border-warning/20",       icon: <AlertTriangle className="w-3 h-3" /> },
    PRICE_VARIANCE:    { label: "Price Variance",    cls: "bg-danger/10 text-danger border-danger/20",              icon: <AlertTriangle className="w-3 h-3" /> },
    FRAUD_RISK:        { label: "Fraud Risk",        cls: "bg-danger/10 text-danger border-danger/20",              icon: <ShieldAlert className="w-3 h-3" /> },
    NO_GRN:            { label: "No GRN",            cls: "bg-primary-100 text-primary-700 border-primary-200",     icon: <XCircle className="w-3 h-3" /> },
    NO_INVOICE:        { label: "No Invoice",        cls: "bg-primary-100 text-primary-700 border-primary-200",     icon: <XCircle className="w-3 h-3" /> },
  };
  const s = map[status] ?? map.MATCHED;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-sm border ${s.cls}`}>
      {s.icon} {s.label}
    </span>
  );
}

function fmtAmt(v: string | number | undefined) {
  const n = parseFloat(String(v ?? "0"));
  if (isNaN(n)) return "—";
  return "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function VarPill({ pct }: { pct: string }) {
  const n = parseFloat(pct ?? "0");
  if (!n) return <span className="text-success font-mono text-[10px]">0%</span>;
  return (
    <span className={`font-mono text-[10px] font-bold ${n > 0.5 ? "text-danger" : "text-warning-800"}`}>
      {n > 0 ? "+" : ""}{n.toFixed(2)}%
    </span>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function ThreeWayMatchWrapper() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary-400" /></div>}>
      <ThreeWayMatch />
    </Suspense>
  );
}

function ThreeWayMatch() {
  const router    = useRouter();
  const { user }  = useCurrentUser();

  // ── List state ──────────────────────────────────────────────────────────────
  const [matches, setMatches]     = useState<MatchRow[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [tab, setTab]             = useState<Tab>("All");
  const [search, setSearch]       = useState("");

  // ── Run-match panel ─────────────────────────────────────────────────────────
  const [showRunPanel, setShowRunPanel] = useState(false);
  const [runPoId, setRunPoId]     = useState("");
  const [runGrnId, setRunGrnId]   = useState("");
  const [runInvId, setRunInvId]   = useState("");
  const [running, setRunning]     = useState(false);
  const [runResult, setRunResult] = useState<{ match_status: MatchStatus; message: string; match_id: string } | null>(null);
  const [runError, setRunError]   = useState("");

  // ── Load list ────────────────────────────────────────────────────────────────
  useEffect(() => {
    loadList();
  }, []);

  function loadList() {
    setLoadingList(true);
    fetch("/api/match")
      .then((r) => r.json())
      .then((data) => {
        const rows: Record<string, string>[] = data.matches ?? [];
        setMatches(rows.map((r) => ({
          match_id:      r.MATCH_ID        ?? "",
          po_id:         r.PO_ID           ?? "—",
          grn_id:        r.GRN_ID          ?? "—",
          inv_id:        r.INVOICE_ID      ?? "—",
          match_status:  (r.MATCH_RESULT   ?? "MATCHED") as MatchStatus,
          max_qty_var:   r.QTY_VARIANCE    ?? "0",
          max_price_var: r.RATE_VARIANCE_PCT ?? "0",
          triggered_by:  r.REVIEWED_BY     ?? "—",
          created_at:    r.MATCH_TIMESTAMP ?? "",
        })));
      })
      .catch(() => setMatches([]))
      .finally(() => setLoadingList(false));
  }

  // ── Run match ────────────────────────────────────────────────────────────────
  async function handleRunMatch() {
    if (!runPoId.trim() || !runInvId.trim()) { setRunError("PO ID and Invoice ID are required."); return; }
    setRunning(true);
    setRunError("");
    setRunResult(null);
    try {
      const res  = await fetch("/api/match", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ po_id: runPoId.trim(), grn_id: runGrnId.trim() || undefined, inv_id: runInvId.trim(), triggered_by: user?.userId ?? "SYSTEM" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Match failed");
      setRunResult({ match_status: json.match_status, message: json.message, match_id: json.match_id });
      loadList(); // refresh list
      if (json.match_id) router.push(`/invoices/match/${json.match_id}`);
    } catch (e) {
      setRunError(e instanceof Error ? e.message : "Failed");
    } finally {
      setRunning(false);
    }
  }

  // ── Filter ───────────────────────────────────────────────────────────────────
  const filtered = matches.filter((m) => {
    const matchTab =
      tab === "All"      ? true :
      tab === "Matched"  ? m.match_status === "MATCHED" :
      tab === "Variance" ? (m.match_status === "PRICE_VARIANCE" || m.match_status === "QUANTITY_VARIANCE") :
                           (m.match_status === "FRAUD_RISK" || m.match_status === "NO_GRN");
    const q = search.toLowerCase();
    return matchTab && (!q || m.match_id.toLowerCase().includes(q) || m.po_id.toLowerCase().includes(q) ||
      m.inv_id.toLowerCase().includes(q) || m.grn_id.toLowerCase().includes(q));
  });

  const matchedCount  = matches.filter((m) => m.match_status === "MATCHED").length;
  const varianceCount = matches.filter((m) => m.match_status === "PRICE_VARIANCE" || m.match_status === "QUANTITY_VARIANCE").length;
  const riskCount     = matches.filter((m) => m.match_status === "FRAUD_RISK" || m.match_status === "NO_GRN").length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-bold text-primary-900 tracking-tight flex items-center gap-2">
            <Scale className="w-6 h-6 text-primary-600" /> Three-Way Match
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            PO ↔ GRN ↔ Invoice verification. Variances trigger payment holds per SOP §8.4.
          </p>
        </div>
        <button
          onClick={() => { setShowRunPanel(!showRunPanel); setRunResult(null); setRunError(""); }}
          className="h-9 px-4 bg-primary-900 hover:bg-primary-800 text-white text-sm font-medium rounded-sm transition-colors shadow-sm flex items-center gap-2"
        >
          <PlayCircle className="w-4 h-4" /> Run New Match
        </button>
      </div>

      {/* Run Match Panel */}
      {showRunPanel && (
        <div className="enterprise-card p-5 border-t-4 border-t-primary-900 space-y-4">
          <h2 className="text-sm font-bold text-primary-900 uppercase tracking-wide">Run Three-Way Match</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">PO ID <span className="text-danger">*</span></label>
              <input type="text" className="enterprise-input font-mono" placeholder="PO-2503-0001"
                value={runPoId} onChange={(e) => setRunPoId(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">GRN ID</label>
              <input type="text" className="enterprise-input font-mono" placeholder="GRN-2503-0001 (optional)"
                value={runGrnId} onChange={(e) => setRunGrnId(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Invoice ID <span className="text-danger">*</span></label>
              <input type="text" className="enterprise-input font-mono" placeholder="INV-2503-0001"
                value={runInvId} onChange={(e) => setRunInvId(e.target.value)} />
            </div>
          </div>
          {runError && (
            <div className="flex items-center gap-2 p-2 bg-danger/10 border border-danger/30 rounded-sm text-xs text-danger">
              <XCircle className="w-3.5 h-3.5 shrink-0" /> {runError}
            </div>
          )}
          {runResult && (
            <div className={`flex items-start gap-2 p-3 rounded-sm text-xs border ${runResult.match_status === "MATCHED" ? "bg-success/10 border-success/30 text-success" : "bg-warning/10 border-warning/30 text-warning-800"}`}>
              {runResult.match_status === "MATCHED" ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />}
              <div>
                <p className="font-bold">{runResult.match_status.replace(/_/g, " ")}</p>
                <p className="mt-0.5">{runResult.message}</p>
              </div>
            </div>
          )}
          <button
            onClick={handleRunMatch}
            disabled={running}
            className="h-9 px-6 bg-primary-900 hover:bg-primary-800 text-white text-sm font-bold rounded-sm transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {running ? <><Loader2 className="w-4 h-4 animate-spin" /> Running…</> : <><PlayCircle className="w-4 h-4" /> Run Match</>}
          </button>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="enterprise-card p-4 flex flex-col items-center justify-center text-center">
          <span className="text-3xl font-mono font-bold text-primary-900">{matches.length}</span>
          <span className="text-xs font-bold text-text-secondary uppercase tracking-wider mt-1">Total Matches</span>
        </div>
        <div className="enterprise-card p-4 flex flex-col items-center justify-center text-center">
          <span className="text-3xl font-mono font-bold text-success">{matchedCount}</span>
          <span className="text-xs font-bold text-text-secondary uppercase tracking-wider mt-1">Matched</span>
        </div>
        <div className="enterprise-card p-4 flex flex-col items-center justify-center text-center">
          <span className="text-3xl font-mono font-bold text-warning-800">{varianceCount}</span>
          <span className="text-xs font-bold text-text-secondary uppercase tracking-wider mt-1">Variances</span>
        </div>
        <div className="enterprise-card p-4 flex flex-col items-center justify-center text-center">
          <span className="text-3xl font-mono font-bold text-danger">{riskCount}</span>
          <span className="text-xs font-bold text-text-secondary uppercase tracking-wider mt-1">Fraud / No GRN</span>
        </div>
      </div>

      {/* Match list */}
      <div className="enterprise-card flex flex-col">
        <div className="p-4 border-b border-border bg-primary-50/30 flex flex-col sm:flex-row justify-between gap-4">
          <div className="flex bg-surface border border-border rounded-sm p-1 shadow-sm overflow-x-auto gap-0.5">
            {(["All", "Matched", "Variance", "Risk"] as Tab[]).map((t) => {
              const count = t === "All" ? matches.length : t === "Matched" ? matchedCount : t === "Variance" ? varianceCount : riskCount;
              const activeMap: Record<Tab, string> = { All: "bg-primary-900 text-white", Matched: "bg-success text-white", Variance: "bg-warning text-white", Risk: "bg-danger text-white" };
              const inactiveMap: Record<Tab, string> = { All: "text-text-secondary hover:text-primary-900", Matched: "text-success hover:text-success/80", Variance: "text-warning-800 hover:text-warning", Risk: "text-danger hover:text-danger/80" };
              return (
                <button key={t} onClick={() => setTab(t)}
                  className={`px-4 py-1.5 text-xs font-bold rounded-sm transition-colors whitespace-nowrap ${tab === t ? activeMap[t] : inactiveMap[t]}`}>
                  {t} ({count})
                </button>
              );
            })}
          </div>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2.5 top-2 text-text-secondary" />
            <input type="text" placeholder="Search Match ID, PO, Invoice…" value={search}
              onChange={(e) => setSearch(e.target.value)} className="enterprise-input pl-8 w-64" />
          </div>
        </div>

        <div className="overflow-auto">
          {loadingList ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-primary-400" /></div>
          ) : filtered.length === 0 ? (
            <div className="px-6 py-14 text-center text-text-secondary">
              <Scale className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No match records found.</p>
            </div>
          ) : (
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="text-[11px] text-text-secondary bg-surface border-b border-border uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3 font-semibold">Match ID</th>
                  <th className="px-4 py-3 font-semibold">PO</th>
                  <th className="px-4 py-3 font-semibold">GRN</th>
                  <th className="px-4 py-3 font-semibold">Invoice</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold text-right">Price Var%</th>
                  <th className="px-4 py-3 font-semibold text-right">Qty Var%</th>
                  <th className="px-4 py-3 font-semibold">Date</th>
                  <th className="px-4 py-3 font-semibold w-24"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((m) => (
                  <tr key={m.match_id} className="transition-colors hover:bg-primary-50/20">
                    <td className="px-4 py-3 font-mono text-xs font-bold text-primary-700">{m.match_id}</td>
                    <td className="px-4 py-3 font-mono text-xs text-text-secondary">{m.po_id}</td>
                    <td className="px-4 py-3 font-mono text-xs text-text-secondary">{m.grn_id || "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs text-text-secondary">{m.inv_id}</td>
                    <td className="px-4 py-3"><StatusBadge status={m.match_status} /></td>
                    <td className="px-4 py-3 text-right"><VarPill pct={m.max_price_var} /></td>
                    <td className="px-4 py-3 text-right"><VarPill pct={m.max_qty_var} /></td>
                    <td className="px-4 py-3 text-xs text-text-secondary">{fmtDate(m.created_at)}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => router.push(`/invoices/match/${m.match_id}`)}
                        className="inline-flex items-center gap-1 text-[10px] font-bold text-primary-700 hover:text-primary-900 bg-primary-50 hover:bg-primary-100 border border-primary-200 px-2 py-1 rounded-sm transition-colors"
                      >
                        Details <ChevronRight className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="bg-primary-50 border border-primary-200 text-primary-700 text-[11px] font-bold tracking-wide uppercase p-2 rounded-sm flex items-center justify-center text-center">
        ⚑ Audit: All match results and payment decisions are logged. — SOP §8.4
      </div>
    </div>
  );
}
