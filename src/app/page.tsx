"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  FileText,
  ShoppingCart,
  Clock,
  AlertTriangle,
  PackageCheck,
  Building2,
  Loader2,
  CheckCircle2,
  Briefcase,
} from "lucide-react";

interface KPIs {
  pendingPRs: number;
  openPOsValue: number;
  openFlags: number;
  msmeWarningCount: number;
}

interface InboxRow {
  id: string;
  type: string;
  requestor: string;
  site: string;
  amount: string;
}

interface MatchException {
  match_id: string;
  po_id: string;
  inv_id: string;
  status: string;
  max_price_variance: string;
  max_qty_variance: string;
}

export default function Dashboard() {
  const [kpis, setKpis] = useState<KPIs | null>(null);
  const [inbox, setInbox] = useState<InboxRow[]>([]);
  const [exceptions, setExceptions] = useState<MatchException[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function safeJson(res: Response) {
      if (!res.ok) {
        console.warn(`[dashboard] API ${res.url} returned ${res.status}`);
        return {};
      }
      try {
        const text = await res.text();
        return text ? JSON.parse(text) : {};
      } catch {
        console.warn(`[dashboard] Non-JSON response from ${res.url}`);
        return {};
      }
    }

    async function load() {
      try {
        const [prRes, poRes, flagRes, matchRes] = await Promise.all([
          fetch("/api/pr?status=SUBMITTED").then(safeJson),
          fetch("/api/po").then(safeJson),
          fetch("/api/flags").then(safeJson),
          fetch("/api/match").then(safeJson),
        ]);

        const submittedPRs: any[] = prRes.prs ?? [];
        const allPOs: any[]       = poRes.pos ?? [];
        const allFlags: any[]     = flagRes.flags ?? [];
        const allMatches: any[]   = matchRes.matches ?? [];

        // KPIs
        const openPOs   = allPOs.filter((p: any) => ["ISSUED", "ACKNOWLEDGED", "ACCEPTED"].includes(p.STATUS));
        const openPOVal = openPOs.reduce((s: number, p: any) => s + (parseFloat(String(p.GRAND_TOTAL ?? "").replace(/,/g, "")) || 0), 0);
        const openFlags = allFlags.filter((f: any) => f.STATUS === "OPEN").length;
        const msmeWarn  = allFlags.filter((f: any) => f.TYPE === "Vendor Compliance" && f.STATUS === "OPEN").length;

        setKpis({
          pendingPRs:      submittedPRs.length,
          openPOsValue:    openPOVal,
          openFlags,
          msmeWarningCount: msmeWarn,
        });

        // Action inbox — latest 5 submitted PRs
        const inboxRows: InboxRow[] = submittedPRs.slice(0, 5).map((pr: any) => ({
          id:        pr.PR_ID ?? pr.SPR_ID ?? "—",
          type:      pr.PR_TYPE ?? "MPR",
          requestor: pr.REQUESTOR_NAME ?? "—",
          site:      pr.REQUESTOR_SITE ?? "—",
          amount:    parseFloat(pr.TOTAL_AMOUNT_WITH_GST ?? "0") > 0
                       ? `₹${parseFloat(pr.TOTAL_AMOUNT_WITH_GST).toLocaleString("en-IN")}`
                       : "—",
        }));
        setInbox(inboxRows);

        // Three-way match exceptions
        const excRows: MatchException[] = allMatches
          .filter((m: any) => m.MATCH_RESULT && m.MATCH_RESULT !== "MATCHED")
          .slice(0, 5)
          .map((m: any) => ({
            match_id:            m.MATCH_ID         ?? "—",
            po_id:               m.PO_ID            ?? "—",
            inv_id:              m.INVOICE_ID       ?? "—",
            status:              m.MATCH_RESULT,
            max_price_variance:  m.RATE_VARIANCE_PCT ?? "0",
            max_qty_variance:    m.QTY_VARIANCE      ?? "0",
          }));
        setExceptions(excRows);
      } catch (e) {
        console.error("[dashboard]", e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const fmtVal = (v: number) => {
    if (v >= 1_00_00_000) return `₹${(v / 1_00_00_000).toFixed(1)}Cr`;
    if (v >= 1_00_000)    return `₹${(v / 1_00_000).toFixed(1)}L`;
    return `₹${v.toLocaleString("en-IN")}`;
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-bold text-primary-900 tracking-tight">Management Dashboard</h1>
          <p className="text-sm text-text-secondary mt-1">System overview and pending actions across all sites.</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="enterprise-card p-4 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform duration-300">
            <FileText className="w-16 h-16 text-primary-900" />
          </div>
          <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Pending PRs</p>
          <div className="mt-2 flex items-baseline gap-2">
            {loading ? <Loader2 className="w-5 h-5 animate-spin text-primary-400" /> : (
              <span className="text-3xl font-bold text-primary-900">{kpis?.pendingPRs ?? 0}</span>
            )}
            {!loading && (kpis?.pendingPRs ?? 0) > 0 && (
              <span className="text-xs font-medium text-warning flex items-center bg-warning/10 px-1.5 rounded-sm">
                <Clock className="w-3 h-3 mr-1" /> Awaiting approval
              </span>
            )}
          </div>
        </div>

        <div className="enterprise-card p-4 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform duration-300">
            <ShoppingCart className="w-16 h-16 text-primary-900" />
          </div>
          <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Open POs Value</p>
          <div className="mt-2 flex items-baseline gap-2">
            {loading ? <Loader2 className="w-5 h-5 animate-spin text-primary-400" /> : (
              <span className="text-3xl font-bold text-primary-900">{fmtVal(kpis?.openPOsValue ?? 0)}</span>
            )}
          </div>
        </div>

        <div className={`enterprise-card p-4 relative overflow-hidden group ${(kpis?.openFlags ?? 0) > 0 ? "border-l-4 border-l-danger" : ""}`}>
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform duration-300">
            <AlertTriangle className="w-16 h-16 text-danger" />
          </div>
          <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Flags & Disputes</p>
          <div className="mt-2 flex items-baseline gap-2">
            {loading ? <Loader2 className="w-5 h-5 animate-spin text-primary-400" /> : (
              <span className={`text-3xl font-bold ${(kpis?.openFlags ?? 0) > 0 ? "text-danger" : "text-primary-900"}`}>
                {kpis?.openFlags ?? 0}
              </span>
            )}
            {!loading && <span className="text-xs font-medium text-text-secondary">Open</span>}
          </div>
        </div>

        <div className="enterprise-card p-4 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform duration-300">
            <Building2 className="w-16 h-16 text-primary-900" />
          </div>
          <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider">MSME Compliance</p>
          <div className="mt-2 flex items-baseline gap-2">
            {loading ? <Loader2 className="w-5 h-5 animate-spin text-primary-400" /> : (
              <span className={`text-3xl font-bold ${(kpis?.msmeWarningCount ?? 0) > 0 ? "text-warning" : "text-success"}`}>
                {kpis?.msmeWarningCount ?? 0}
              </span>
            )}
            {!loading && <span className="text-xs font-medium text-text-secondary">Issues</span>}
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left — Wider */}
        <div className="lg:col-span-2 space-y-6">

          {/* Action Inbox */}
          <section className="enterprise-card flex flex-col min-h-[300px]">
            <div className="p-4 border-b border-border flex justify-between items-center bg-primary-50/50">
              <h2 className="text-sm font-bold text-primary-900 uppercase tracking-wide">PR Approval Inbox</h2>
              {!loading && (
                <span className="text-xs font-medium bg-primary-100 text-primary-800 px-2 py-0.5 rounded-sm">
                  {inbox.length} Item{inbox.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
            <div className="flex-1 overflow-auto">
              {loading ? (
                <div className="flex items-center justify-center h-40">
                  <Loader2 className="w-5 h-5 animate-spin text-primary-400" />
                </div>
              ) : inbox.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-text-secondary">
                  <CheckCircle2 className="w-8 h-8 text-success/40 mb-2" />
                  <p className="text-sm">No pending approvals</p>
                </div>
              ) : (
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-text-secondary bg-surface sticky top-0 border-b border-border">
                    <tr>
                      <th className="px-4 py-3 font-semibold uppercase">PR ID</th>
                      <th className="px-4 py-3 font-semibold uppercase">Type</th>
                      <th className="px-4 py-3 font-semibold uppercase">Requestor / Site</th>
                      <th className="px-4 py-3 font-semibold uppercase text-right">Amount</th>
                      <th className="px-4 py-3 font-semibold uppercase text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {inbox.map((row) => (
                      <tr key={row.id} className="hover:bg-primary-50/50 transition-colors cursor-pointer"
                          onClick={() => window.location.href = `/pr/${row.id}`}>
                        <td className="px-4 py-3 font-mono text-primary-700 font-medium text-xs whitespace-nowrap">{row.id}</td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded-sm border border-border bg-surface text-text-secondary flex items-center gap-1 w-fit">
                            {row.type === "MPR" ? <PackageCheck className="w-3 h-3" /> : <Briefcase className="w-3 h-3" />}
                            {row.type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-text-primary">
                          <div>{row.requestor}</div>
                          <div className="text-[10px] text-text-secondary">{row.site}</div>
                        </td>
                        <td className="px-4 py-3 font-mono font-medium text-xs text-right">{row.amount}</td>
                        <td className="px-4 py-3 text-right">
                          <Link href={`/pr/${row.id}`}
                            className="text-xs font-semibold text-primary-600 hover:text-primary-900 border border-transparent hover:border-primary-200 px-2 py-1 rounded-sm transition-all"
                            onClick={e => e.stopPropagation()}>
                            Review →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="p-3 border-t border-border bg-surface text-center">
              <Link href="/pr/approvals" className="text-xs font-medium text-primary-600 hover:text-primary-800 transition-colors">
                View All Pending Approvals →
              </Link>
            </div>
          </section>

          {/* Three-Way Match Exceptions */}
          <section className="enterprise-card flex flex-col">
            <div className="p-4 border-b border-danger/20 bg-danger/5 flex justify-between items-center">
              <h2 className="text-sm font-bold text-danger uppercase tracking-wide flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" /> Three-Way Match Exceptions
              </h2>
              {!loading && (
                <span className="text-xs font-medium bg-danger/10 text-danger px-2 py-0.5 rounded-sm">
                  {exceptions.length} Open
                </span>
              )}
            </div>
            <div className="overflow-x-auto">
              {loading ? (
                <div className="flex items-center justify-center h-24">
                  <Loader2 className="w-5 h-5 animate-spin text-primary-400" />
                </div>
              ) : exceptions.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-24 text-text-secondary">
                  <CheckCircle2 className="w-6 h-6 text-success/40 mb-1" />
                  <p className="text-xs">No match exceptions</p>
                </div>
              ) : (
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-text-secondary bg-surface border-b border-border">
                    <tr>
                      <th className="px-4 py-2 font-semibold">Match ID</th>
                      <th className="px-4 py-2 font-semibold">PO → Invoice</th>
                      <th className="px-4 py-2 font-semibold">Issue</th>
                      <th className="px-4 py-2 font-semibold text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {exceptions.map((m) => {
                      const isPrice = m.status === "PRICE_VARIANCE";
                      const isNoGRN = m.status === "NO_GRN";
                      return (
                        <tr key={m.match_id} className={isNoGRN ? "bg-danger/5" : "bg-warning/5"}>
                          <td className="px-4 py-3 font-mono text-xs">{m.match_id}</td>
                          <td className="px-4 py-3 text-xs">{m.po_id} → {m.inv_id}</td>
                          <td className="px-4 py-3 font-medium text-danger text-xs">
                            {isNoGRN ? "NO GRN"
                              : isPrice ? `Price: +${parseFloat(m.max_price_variance).toFixed(1)}%`
                              : `Qty: ${parseFloat(m.max_qty_variance).toFixed(1)}%`}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Link href="/invoices/match"
                              className={`text-[10px] uppercase tracking-wider font-bold text-white px-2 py-1 rounded-sm ${isNoGRN ? "bg-danger hover:bg-danger/90" : "bg-warning hover:bg-warning/90"}`}>
                              Resolve
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </div>

        {/* Right Column */}
        <div className="space-y-6">

          {/* MSME Alert — only show if there are issues */}
          {!loading && (kpis?.msmeWarningCount ?? 0) > 0 && (
            <div className="enterprise-card border-l-4 border-l-warning bg-warning/5 p-4 flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-bold text-warning-800">MSME Compliance Alert</h3>
                  <p className="text-xs text-text-secondary mt-1">
                    {kpis?.msmeWarningCount} MSME vendor{kpis?.msmeWarningCount !== 1 ? "s" : ""} with compliance issues. Review required.
                  </p>
                </div>
              </div>
              <Link href="/flags" className="mt-2 text-xs font-bold text-center w-full bg-surface border border-warning/30 text-warning-800 py-1.5 rounded-sm hover:bg-warning/10 transition-colors block">
                View Compliance Report
              </Link>
            </div>
          )}

          {/* Quick Actions */}
          <section className="enterprise-card">
            <div className="p-4 border-b border-border bg-primary-50/50">
              <h2 className="text-sm font-bold text-primary-900 uppercase tracking-wide">Quick Actions</h2>
            </div>
            <div className="p-2 grid grid-cols-2 gap-2">
              <Link href="/pr/mpr/new" className="p-3 border border-border bg-surface hover:bg-primary-50 hover:border-primary-200 rounded-sm flex flex-col items-center justify-center gap-2 transition-all group">
                <FileText className="w-5 h-5 text-primary-400 group-hover:text-primary-700" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-text-secondary group-hover:text-primary-900">New MPR</span>
              </Link>
              <Link href="/receipts/grn/new" className="p-3 border border-border bg-surface hover:bg-primary-50 hover:border-primary-200 rounded-sm flex flex-col items-center justify-center gap-2 transition-all group">
                <PackageCheck className="w-5 h-5 text-primary-400 group-hover:text-primary-700" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-text-secondary group-hover:text-primary-900">New GRN</span>
              </Link>
              <Link href="/pr/approvals" className="p-3 border border-border bg-surface hover:bg-primary-50 hover:border-primary-200 rounded-sm flex flex-col items-center justify-center gap-2 transition-all group">
                <Clock className="w-5 h-5 text-primary-400 group-hover:text-primary-700" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-text-secondary group-hover:text-primary-900">Approvals</span>
              </Link>
              <Link href="/flags" className="p-3 border border-border bg-surface hover:bg-primary-50 hover:border-primary-200 rounded-sm flex flex-col items-center justify-center gap-2 transition-all group">
                <AlertTriangle className="w-5 h-5 text-primary-400 group-hover:text-primary-700" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-text-secondary group-hover:text-primary-900">Flags</span>
              </Link>
            </div>
          </section>

        </div>
      </div>

    </div>
  );
}
