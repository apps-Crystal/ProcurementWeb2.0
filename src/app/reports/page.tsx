"use client";

import { useEffect, useState } from "react";
import {
  BarChart3, Download, Loader2, Lock, AlertTriangle,
  TrendingUp, CheckCircle2, Clock, Users, Package,
  CreditCard, FileText, ChevronDown,
} from "lucide-react";
import { useCurrentUser } from "@/components/auth/AuthProvider";
import { exportToCsv } from "@/lib/export";
import { fmtDate } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type ReportType = "open_po" | "payment_queue" | "vendor_outstanding" | "spend_analysis";
type Tab = "reports" | "dashboard";

interface ChartRow { label: string; value: number }

interface OpenPOData {
  rows: Record<string, string>[];
  total_value: number;
  count: number;
}
interface PaymentQueueData {
  rows: Record<string, unknown>[];
  by_stage: Record<string, { count: number; total: number }>;
  msme_overdue_count: number;
}
interface VendorOutstandingData {
  rows: Record<string, unknown>[];
}
interface SpendAnalysisData {
  by_site: ChartRow[];
  by_category: ChartRow[];
  by_vendor: ChartRow[];
  by_month: ChartRow[];
  grand_total: number;
}

interface DashData {
  mprs:     Record<string, string>[];
  sprs:     Record<string, string>[];
  pos:      Record<string, string>[];
  payments: Record<string, string>[];
  grns:     Record<string, string>[];
}

// ── Access control ────────────────────────────────────────────────────────────

const REPORT_ACCESS: Record<ReportType, string[]> = {
  open_po:            ["Procurement_Team", "Procurement_Head", "Management", "System_Admin"],
  payment_queue:      ["Accounts", "Finance", "Management", "System_Admin"],
  vendor_outstanding: ["Accounts", "Finance", "Procurement_Head", "Management", "System_Admin"],
  spend_analysis:     ["Management", "Procurement_Head", "System_Admin"],
};

// ── Simple horizontal bar chart (CSS only — no external lib) ──────────────────

function SimpleBarChart({ data, unit = "₹" }: { data: ChartRow[]; unit?: string }) {
  if (!data.length) return <p className="text-xs text-text-secondary py-4 text-center">No data</p>;
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="space-y-2">
      {data.map((row) => (
        <div key={row.label} className="flex items-center gap-2 text-xs">
          <span className="w-28 truncate text-text-secondary shrink-0 text-right" title={row.label}>
            {row.label}
          </span>
          <div className="flex-1 bg-primary-100 rounded-sm overflow-hidden h-5">
            <div
              className="h-full bg-primary-600 rounded-sm transition-all duration-300"
              style={{ width: `${Math.max(2, (row.value / max) * 100)}%` }}
            />
          </div>
          <span className="w-24 text-right font-mono font-semibold text-primary-900 shrink-0">
            {unit === "₹"
              ? `₹${(row.value / 1_00_000).toFixed(1)}L`
              : row.value.toLocaleString("en-IN")}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function AgeingBadge({ bucket }: { bucket: string }) {
  const cls =
    bucket === "0–30 days"  ? "bg-success/10 text-success border-success/20" :
    bucket === "31–60 days" ? "bg-warning/10 text-warning-800 border-warning/20" :
    bucket === "61–90 days" ? "bg-orange-100 text-orange-700 border-orange-200" :
                              "bg-danger/10 text-danger border-danger/20";
  return (
    <span className={`text-[9px] font-bold uppercase px-2 py-0.5 border rounded-sm ${cls}`}>
      {bucket}
    </span>
  );
}

function fmtCrore(v: number) {
  if (v >= 1_00_00_000) return `₹${(v / 1_00_00_000).toFixed(2)} Cr`;
  if (v >= 1_00_000)    return `₹${(v / 1_00_000).toFixed(2)} L`;
  return `₹${v.toLocaleString("en-IN")}`;
}

function StatCard({
  label, value, sub, icon: Icon, color = "text-primary-700",
}: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; color?: string;
}) {
  return (
    <div className="enterprise-card p-4">
      <div className="flex items-start justify-between mb-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">{label}</span>
        <Icon className={`w-4 h-4 shrink-0 ${color}`} />
      </div>
      <div className={`text-2xl font-bold font-mono ${color}`}>{value}</div>
      {sub && <div className="text-[10px] text-text-secondary mt-1">{sub}</div>}
    </div>
  );
}

function ReportCard({
  title, type, role, children, onGenerate, loading, generated, onExport,
}: {
  title: string; type: ReportType; role: string;
  children: React.ReactNode;
  onGenerate: () => void; onExport: () => void;
  loading: boolean; generated: boolean;
}) {
  const canAccess = REPORT_ACCESS[type].includes(role);

  if (!canAccess) {
    return (
      <div className="enterprise-card p-6 opacity-60 select-none">
        <div className="flex items-center gap-2 mb-2">
          <Lock className="w-4 h-4 text-text-secondary" />
          <h3 className="text-sm font-bold text-text-secondary">{title}</h3>
        </div>
        <p className="text-xs text-text-secondary">Your role does not have access to this report.</p>
      </div>
    );
  }

  return (
    <div className="enterprise-card flex flex-col">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h3 className="text-sm font-bold text-primary-900">{title}</h3>
        <div className="flex gap-2">
          {generated && (
            <button
              onClick={onExport}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary-700 hover:text-primary-900 bg-primary-50 hover:bg-primary-100 border border-primary-200 px-2.5 py-1.5 rounded-sm transition-colors"
            >
              <Download className="w-3.5 h-3.5" /> CSV
            </button>
          )}
          <button
            onClick={onGenerate}
            disabled={loading}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-white bg-primary-700 hover:bg-primary-800 px-3 py-1.5 rounded-sm transition-colors disabled:opacity-50"
          >
            {loading
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating…</>
              : <><BarChart3 className="w-3.5 h-3.5" /> {generated ? "Refresh" : "Generate"}</>}
          </button>
        </div>
      </div>
      <div className="p-4 min-h-[80px]">
        {!generated && !loading && (
          <p className="text-xs text-text-secondary text-center py-8">Click Generate to load live data.</p>
        )}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-7 h-7 animate-spin text-primary-400" />
          </div>
        )}
        {generated && !loading && children}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const { user } = useCurrentUser();
  const role     = user?.role ?? "";

  const [activeTab, setActiveTab] = useState<Tab>("reports");

  // Report state
  const [rpLoading, setRpLoading] = useState<Partial<Record<ReportType, boolean>>>({});
  const [rpData,    setRpData]    = useState<{
    open_po?:            OpenPOData;
    payment_queue?:      PaymentQueueData;
    vendor_outstanding?: VendorOutstandingData;
    spend_analysis?:     SpendAnalysisData;
  }>({});
  const [rpError, setRpError] = useState<Partial<Record<ReportType, string>>>({});

  // Dashboard state
  const [dashData,    setDashData]    = useState<DashData | null>(null);
  const [dashLoading, setDashLoading] = useState(true);
  const [previewRole, setPreviewRole] = useState("");

  const ALL_ROLES = [
    "System_Admin", "Procurement_Head", "Procurement_Team",
    "Management", "Accounts", "Finance", "Site_Head", "Warehouse",
    "Requestor", "Designated_Approver",
  ];

  // Sync previewRole when user loads
  useEffect(() => { if (role && !previewRole) setPreviewRole(role); }, [role, previewRole]);

  // Load dashboard data when tab becomes active
  useEffect(() => {
    if (activeTab !== "dashboard" || dashData) return;
    setDashLoading(true);
    Promise.all([
      fetch("/api/pr/mpr").then((r) => r.ok ? r.json() : { prs: [] }),
      fetch("/api/pr/spr").then((r) => r.ok ? r.json() : { sprs: [] }),
      fetch("/api/po").then((r)      => r.ok ? r.json() : { pos: [] }),
      fetch("/api/payments").then((r) => r.ok ? r.json() : { payments: [] }),
      fetch("/api/grn").then((r)     => r.ok ? r.json() : { grns: [] }),
    ])
      .then(([mprData, sprData, poData, payData, grnData]) => {
        setDashData({
          mprs:     mprData.prs      ?? [],
          sprs:     sprData.sprs     ?? [],
          pos:      poData.pos       ?? [],
          payments: payData.payments ?? [],
          grns:     grnData.grns     ?? [],
        });
      })
      .catch(() => setDashData({ mprs: [], sprs: [], pos: [], payments: [], grns: [] }))
      .finally(() => setDashLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // ── Report generator ─────────────────────────────────────────────────────

  async function generate(type: ReportType) {
    setRpLoading((p) => ({ ...p, [type]: true }));
    setRpError((p)   => ({ ...p, [type]: "" }));
    try {
      const res  = await fetch(`/api/reports?type=${type}`);
      const data = await res.json();
      if (!res.ok) { setRpError((p) => ({ ...p, [type]: data.error ?? "Failed." })); return; }
      setRpData((p) => ({ ...p, [type]: data }));
    } catch {
      setRpError((p) => ({ ...p, [type]: "Network error." }));
    } finally {
      setRpLoading((p) => ({ ...p, [type]: false }));
    }
  }

  // ── Dashboard derived stats ───────────────────────────────────────────────

  function dashStats() {
    if (!dashData) return null;
    const { mprs, sprs, pos, payments, grns } = dashData;

    const pendingPRs    = [...mprs, ...sprs].filter((p) => p.STATUS === "SUBMITTED").length;
    const openPOs       = pos.filter((p) => !["CLOSED", "CANCELLED", "FULLY_RECEIVED"].includes(p.STATUS ?? "")).length;
    const openPOValue   = pos
      .filter((p) => !["CLOSED", "CANCELLED", "FULLY_RECEIVED"].includes(p.STATUS ?? ""))
      .reduce((s, p) => s + (parseFloat(String(p.GRAND_TOTAL ?? "").replace(/,/g, "")) || 0), 0);
    const pendingPay    = payments.filter((p) => p.STATUS !== "RELEASED" && p.STATUS !== "REJECTED").length;
    const pendingPayVal = payments
      .filter((p) => p.STATUS !== "RELEASED" && p.STATUS !== "REJECTED")
      .reduce((s, p) => s + (parseFloat(String(p.NET_PAYABLE ?? p.GROSS_AMOUNT ?? "").replace(/,/g, "")) || 0), 0);
    const msmeOverdue   = payments.filter((p) => {
      if (p.IS_MSME !== "Y" || p.STATUS === "RELEASED") return false;
      const age = Math.floor((Date.now() - new Date(p.CREATED_DATE ?? "").getTime()) / 86_400_000);
      return age > 45;
    }).length;
    const pendingGRNs   = grns.filter((g) => g.STATUS === "PENDING").length;
    const totalSpend    = pos
      .filter((p) => ["CLOSED", "FULLY_RECEIVED"].includes(p.STATUS ?? ""))
      .reduce((s, p) => s + (parseFloat(String(p.GRAND_TOTAL ?? "").replace(/,/g, "")) || 0), 0);
    const dueThisWeek   = pos.filter((p) => {
      const d    = new Date(p.DELIVERY_DATE ?? "");
      const diff = Math.floor((d.getTime() - Date.now()) / 86_400_000);
      return diff >= 0 && diff <= 7 && !["CLOSED", "CANCELLED", "FULLY_RECEIVED"].includes(p.STATUS ?? "");
    }).length;

    return { pendingPRs, openPOs, openPOValue, pendingPay, pendingPayVal, msmeOverdue, pendingGRNs, totalSpend, dueThisWeek };
  }

  const stats = dashStats();

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-20">

      {/* Header */}
      <div className="flex items-start justify-between border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-bold text-primary-900 tracking-tight flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-primary-600" /> Reports &amp; Dashboards
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Live procurement analytics — data governance per SOP §3.2 &amp; §12
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0.5 bg-primary-50 border border-border rounded-sm p-1 w-fit shadow-sm">
        {(["reports", "dashboard"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-5 py-2 text-sm font-semibold rounded-sm transition-colors ${
              activeTab === t
                ? "bg-primary-900 text-white shadow-sm"
                : "text-text-secondary hover:text-primary-900"
            }`}
          >
            {t === "reports" ? "Standard Reports" : "My Dashboard"}
          </button>
        ))}
      </div>

      {/* ── TAB 1: STANDARD REPORTS ──────────────────────────────────────────── */}
      {activeTab === "reports" && (
        <div className="space-y-6">

          {/* Report 1 — Open PO Register */}
          <ReportCard
            title="Open PO Register"
            type="open_po" role={role}
            loading={!!rpLoading.open_po} generated={!!rpData.open_po}
            onGenerate={() => generate("open_po")}
            onExport={() => exportToCsv("open_po_register.csv", rpData.open_po?.rows ?? [])}
          >
            {rpError.open_po && <p className="text-xs text-danger flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" />{rpError.open_po}</p>}
            {rpData.open_po && (() => {
              const d = rpData.open_po!;
              return (
                <div className="space-y-4">
                  <div className="flex gap-4 flex-wrap">
                    <div className="enterprise-card p-3 text-center min-w-[110px]">
                      <div className="text-2xl font-bold font-mono text-primary-900">{d.count}</div>
                      <div className="text-[10px] font-bold text-text-secondary uppercase tracking-wider mt-0.5">Open POs</div>
                    </div>
                    <div className="enterprise-card p-3 text-center min-w-[150px]">
                      <div className="text-2xl font-bold font-mono text-primary-700">{fmtCrore(d.total_value)}</div>
                      <div className="text-[10px] font-bold text-text-secondary uppercase tracking-wider mt-0.5">Total Value</div>
                    </div>
                  </div>
                  <div className="overflow-x-auto max-h-96 overflow-y-auto rounded-sm border border-border">
                    <table className="w-full text-xs text-left whitespace-nowrap">
                      <thead className="sticky top-0 bg-primary-50 border-b border-border text-[10px] text-text-secondary uppercase tracking-wider">
                        <tr>
                          <th className="px-3 py-2">PO ID</th><th className="px-3 py-2">Date</th>
                          <th className="px-3 py-2">Vendor</th><th className="px-3 py-2 text-right">Value</th>
                          <th className="px-3 py-2">Status</th><th className="px-3 py-2">ACK</th>
                          <th className="px-3 py-2">Del. Date</th><th className="px-3 py-2">Type</th>
                          <th className="px-3 py-2">Site</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {d.rows.map((r, i) => (
                          <tr key={i} className="hover:bg-primary-50/30">
                            <td className="px-3 py-2 font-mono font-bold text-primary-700">{r.PO_ID}</td>
                            <td className="px-3 py-2 text-text-secondary">{fmtDate(r.PO_DATE)}</td>
                            <td className="px-3 py-2 max-w-[150px] truncate" title={r.VENDOR_NAME}>{r.VENDOR_NAME}</td>
                            <td className="px-3 py-2 text-right font-mono">{fmtCrore(parseFloat(String(r.GRAND_TOTAL ?? "0").replace(/,/g, "")) || 0)}</td>
                            <td className="px-3 py-2"><span className="text-[9px] font-bold uppercase bg-primary-100 text-primary-700 px-1.5 py-0.5 rounded-sm">{r.STATUS}</span></td>
                            <td className="px-3 py-2 text-text-secondary">{r.ACK_STATUS || "—"}</td>
                            <td className="px-3 py-2 text-text-secondary">{fmtDate(r.DELIVERY_DATE)}</td>
                            <td className="px-3 py-2 text-text-secondary">{r.SOURCE_PR_TYPE || "—"}</td>
                            <td className="px-3 py-2 text-text-secondary">{r.DELIVERY_LOCATION || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}
          </ReportCard>

          {/* Report 2 — Payment Queue */}
          <ReportCard
            title="Payment Queue Report"
            type="payment_queue" role={role}
            loading={!!rpLoading.payment_queue} generated={!!rpData.payment_queue}
            onGenerate={() => generate("payment_queue")}
            onExport={() => exportToCsv("payment_queue.csv", (rpData.payment_queue?.rows ?? []) as Record<string, unknown>[])}
          >
            {rpError.payment_queue && <p className="text-xs text-danger flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" />{rpError.payment_queue}</p>}
            {rpData.payment_queue && (() => {
              const d = rpData.payment_queue!;
              const STAGE_LABELS: [string, string][] = [
                ["SUBMITTED",            "Submitted"],
                ["PROCUREMENT_VERIFIED", "Proc. Verified"],
                ["ACCOUNTS_VERIFIED",    "Accts. Verified"],
                ["MANAGEMENT_APPROVED",  "Mgmt. Approved"],
                ["RELEASED",             "Released"],
              ];
              return (
                <div className="space-y-5">
                  {d.msme_overdue_count > 0 && (
                    <div className="flex items-center gap-2 px-3 py-2.5 bg-danger/5 border border-danger/20 rounded-sm text-xs text-danger">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <strong>{d.msme_overdue_count} MSME payment{d.msme_overdue_count > 1 ? "s" : ""}</strong>&nbsp;overdue beyond 45 days — statutory non-compliance risk.
                    </div>
                  )}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                    {STAGE_LABELS.map(([key, label]) => {
                      const s = d.by_stage[key] ?? { count: 0, total: 0 };
                      return (
                        <div key={key} className="enterprise-card p-3 text-center">
                          <div className="text-xl font-bold font-mono text-primary-900">{s.count}</div>
                          <div className="text-[9px] font-bold uppercase tracking-wider text-text-secondary mt-0.5">{label}</div>
                          <div className="text-[10px] font-mono text-primary-600 mt-1">{fmtCrore(s.total)}</div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="overflow-x-auto max-h-80 overflow-y-auto rounded-sm border border-border">
                    <table className="w-full text-xs text-left whitespace-nowrap">
                      <thead className="sticky top-0 bg-primary-50 border-b border-border text-[10px] text-text-secondary uppercase tracking-wider">
                        <tr>
                          <th className="px-3 py-2">Payment ID</th><th className="px-3 py-2">Vendor</th>
                          <th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2">Status</th>
                          <th className="px-3 py-2">MSME</th><th className="px-3 py-2">Age (d)</th>
                          <th className="px-3 py-2">Due Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {(d.rows as Record<string, unknown>[]).map((r, i) => (
                          <tr key={i} className={`hover:bg-primary-50/20 ${r.MSME_OVERDUE ? "bg-danger/5" : ""}`}>
                            <td className="px-3 py-2 font-mono font-bold text-primary-700">{String(r.PAYMENT_ID)}</td>
                            <td className="px-3 py-2 max-w-[150px] truncate">{String(r.VENDOR_NAME)}</td>
                            <td className="px-3 py-2 text-right font-mono">{fmtCrore(Number(r.AMOUNT) || 0)}</td>
                            <td className="px-3 py-2"><span className="text-[9px] font-bold uppercase bg-primary-100 text-primary-700 px-1.5 py-0.5 rounded-sm">{String(r.STATUS)}</span></td>
                            <td className="px-3 py-2">
                              {r.IS_MSME === "Y"
                                ? <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-sm border ${r.MSME_OVERDUE ? "bg-danger/10 text-danger border-danger/20" : "bg-success/10 text-success border-success/20"}`}>{r.MSME_OVERDUE ? "OVERDUE" : "MSME"}</span>
                                : "—"}
                            </td>
                            <td className="px-3 py-2 font-mono">{Number(r.DAYS_AGE) || 0}</td>
                            <td className="px-3 py-2 text-text-secondary">{fmtDate(String(r.DUE_DATE ?? ""))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}
          </ReportCard>

          {/* Report 3 — Vendor Outstanding */}
          <ReportCard
            title="Vendor Outstanding Report"
            type="vendor_outstanding" role={role}
            loading={!!rpLoading.vendor_outstanding} generated={!!rpData.vendor_outstanding}
            onGenerate={() => generate("vendor_outstanding")}
            onExport={() => exportToCsv("vendor_outstanding.csv", (rpData.vendor_outstanding?.rows ?? []) as Record<string, unknown>[])}
          >
            {rpError.vendor_outstanding && <p className="text-xs text-danger flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" />{rpError.vendor_outstanding}</p>}
            {rpData.vendor_outstanding && (() => {
              const rows = (rpData.vendor_outstanding!.rows as Record<string, unknown>[]);
              const total = rows.reduce((s, r) => s + (Number(r.outstanding_amount) || 0), 0);
              return (
                <div className="space-y-4">
                  <div className="enterprise-card p-3 inline-flex flex-col text-center min-w-[160px]">
                    <div className="text-2xl font-bold font-mono text-primary-700">{fmtCrore(total)}</div>
                    <div className="text-[10px] font-bold text-text-secondary uppercase tracking-wider mt-0.5">Total Outstanding</div>
                  </div>
                  <div className="overflow-x-auto max-h-96 overflow-y-auto rounded-sm border border-border">
                    <table className="w-full text-xs text-left whitespace-nowrap">
                      <thead className="sticky top-0 bg-primary-50 border-b border-border text-[10px] text-text-secondary uppercase tracking-wider">
                        <tr>
                          <th className="px-3 py-2">Vendor</th><th className="px-3 py-2 text-right">Outstanding</th>
                          <th className="px-3 py-2">Ageing</th><th className="px-3 py-2">Oldest Invoice</th>
                          <th className="px-3 py-2">MSME</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {rows.map((r, i) => (
                          <tr key={i} className="hover:bg-primary-50/20">
                            <td className="px-3 py-2 font-medium max-w-[200px] truncate" title={String(r.VENDOR_NAME)}>{String(r.VENDOR_NAME)}</td>
                            <td className="px-3 py-2 text-right font-mono font-semibold text-primary-700">{fmtCrore(Number(r.outstanding_amount) || 0)}</td>
                            <td className="px-3 py-2"><AgeingBadge bucket={String(r.ageing_bucket)} /></td>
                            <td className="px-3 py-2 text-text-secondary">{fmtDate(String(r.oldest_invoice_date ?? ""))}</td>
                            <td className="px-3 py-2">
                              {r.MSME_FLAG === "Y"
                                ? <span className="text-[9px] font-bold uppercase bg-warning/10 text-warning-800 border border-warning/20 px-1.5 py-0.5 rounded-sm">MSME</span>
                                : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}
          </ReportCard>

          {/* Report 4 — Spend Analysis */}
          <ReportCard
            title="Spend Analysis"
            type="spend_analysis" role={role}
            loading={!!rpLoading.spend_analysis} generated={!!rpData.spend_analysis}
            onGenerate={() => generate("spend_analysis")}
            onExport={() => {
              const d = rpData.spend_analysis;
              if (!d) return;
              const rows = [
                ...d.by_site.map((r)     => ({ dimension: "By Site",     label: r.label, value: r.value })),
                ...d.by_category.map((r) => ({ dimension: "By Category", label: r.label, value: r.value })),
                ...d.by_vendor.map((r)   => ({ dimension: "By Vendor",   label: r.label, value: r.value })),
                ...d.by_month.map((r)    => ({ dimension: "By Month",    label: r.label, value: r.value })),
              ];
              exportToCsv("spend_analysis.csv", rows);
            }}
          >
            {rpError.spend_analysis && <p className="text-xs text-danger flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" />{rpError.spend_analysis}</p>}
            {rpData.spend_analysis && (() => {
              const d = rpData.spend_analysis!;
              const charts: { title: string; data: ChartRow[] }[] = [
                { title: "By Site",     data: d.by_site },
                { title: "By Category", data: d.by_category },
                { title: "By Vendor",   data: d.by_vendor },
                { title: "By Month",    data: d.by_month },
              ];
              return (
                <div className="space-y-6">
                  <div className="enterprise-card p-3 inline-flex flex-col text-center min-w-[160px]">
                    <div className="text-2xl font-bold font-mono text-primary-700">{fmtCrore(d.grand_total)}</div>
                    <div className="text-[10px] font-bold text-text-secondary uppercase tracking-wider mt-0.5">Total Spend (Closed POs)</div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {charts.map(({ title, data }) => (
                      <div key={title} className="space-y-2">
                        <h4 className="text-[11px] font-bold uppercase tracking-wider text-text-secondary">{title}</h4>
                        <SimpleBarChart data={data} />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </ReportCard>

        </div>
      )}

      {/* ── TAB 2: MY DASHBOARD ──────────────────────────────────────────────── */}
      {activeTab === "dashboard" && (
        <div className="space-y-6">

          {/* System_Admin: role-preview selector */}
          {role === "System_Admin" && (
            <div className="flex items-center gap-3 p-3 bg-primary-50 border border-primary-200 rounded-sm">
              <span className="text-xs font-bold text-primary-700 uppercase tracking-wider">Preview dashboard for:</span>
              <div className="relative">
                <select
                  value={previewRole}
                  onChange={(e) => setPreviewRole(e.target.value)}
                  className="enterprise-input pr-7 text-xs font-medium"
                >
                  {ALL_ROLES.map((r) => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}
                </select>
                <ChevronDown className="absolute right-2 top-2.5 w-3 h-3 text-text-secondary pointer-events-none" />
              </div>
            </div>
          )}

          {dashLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-primary-400" />
            </div>
          ) : stats ? (() => {
            const view = previewRole || role;
            return (
              <>
                {/* D1/D2 — Procurement */}
                {["Procurement_Team", "Procurement_Head", "Designated_Approver", "System_Admin"].includes(view) && (
                  <section className="space-y-4">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-text-secondary border-b border-border pb-2">
                      {view === "Procurement_Head" ? "D2 — Procurement Head Dashboard" : "D1 — Procurement Dashboard"}
                    </h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <StatCard label="Pending PR Approvals" value={stats.pendingPRs}         icon={FileText}    color="text-warning-800" sub="Awaiting review" />
                      <StatCard label="Open POs"             value={stats.openPOs}             icon={Package}     color="text-primary-700" sub={fmtCrore(stats.openPOValue)} />
                      <StatCard label="Pending Payments"     value={stats.pendingPay}          icon={CreditCard}  color="text-primary-500" sub={fmtCrore(stats.pendingPayVal)} />
                      <StatCard label="POs Due This Week"    value={stats.dueThisWeek}         icon={Clock}       color="text-danger"      sub="Delivery expected" />
                    </div>
                    {view === "Procurement_Head" && (
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        <StatCard label="Total Spend (Closed)" value={fmtCrore(stats.totalSpend)} icon={TrendingUp}    color="text-success" />
                        <StatCard label="MSME Overdue"          value={stats.msmeOverdue}          icon={AlertTriangle} color="text-danger"  sub="45-day statutory breach" />
                        <StatCard label="GRNs Pending Verify"  value={stats.pendingGRNs}          icon={CheckCircle2}  color="text-warning-800" />
                      </div>
                    )}
                  </section>
                )}

                {/* D3 — Management */}
                {view === "Management" && (
                  <section className="space-y-4">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-text-secondary border-b border-border pb-2">D3 — Management Dashboard</h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <StatCard label="Total Spend (FY)"    value={fmtCrore(stats.totalSpend)}   icon={TrendingUp}    color="text-success" />
                      <StatCard label="Pending Payments"    value={fmtCrore(stats.pendingPayVal)} icon={CreditCard}    color="text-primary-700" sub={`${stats.pendingPay} payments`} />
                      <StatCard label="MSME Overdue"        value={stats.msmeOverdue}             icon={AlertTriangle} color="text-danger"  sub="Statutory risk" />
                      <StatCard label="Pending Approvals"   value={stats.pendingPRs}              icon={FileText}      color="text-warning-800" sub="PRs awaiting action" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <StatCard label="Open POs"            value={stats.openPOs}                 icon={Package} color="text-primary-700" sub={fmtCrore(stats.openPOValue)} />
                      <StatCard label="POs Due This Week"   value={stats.dueThisWeek}             icon={Clock}   color="text-danger"      sub="Delivery expected" />
                    </div>
                  </section>
                )}

                {/* D4 — Accounts / Finance */}
                {["Accounts", "Finance"].includes(view) && (
                  <section className="space-y-4">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-text-secondary border-b border-border pb-2">D4 — Finance &amp; Accounts Dashboard</h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <StatCard label="Payment Queue"   value={stats.pendingPay}          icon={CreditCard}    color="text-primary-700" sub="Awaiting release" />
                      <StatCard label="Queue Value"     value={fmtCrore(stats.pendingPayVal)} icon={TrendingUp} color="text-primary-500" />
                      <StatCard label="MSME Overdue"    value={stats.msmeOverdue}         icon={AlertTriangle} color="text-danger"      sub="45-day rule breached" />
                      <StatCard label="Open POs"        value={stats.openPOs}             icon={Package}       color="text-text-secondary" />
                    </div>
                  </section>
                )}

                {/* D5 — Site Head */}
                {view === "Site_Head" && (
                  <section className="space-y-4">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-text-secondary border-b border-border pb-2">D5 — Site Head Dashboard</h2>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <StatCard label="Pending PRs"          value={stats.pendingPRs}          icon={FileText}   color="text-warning-800" sub="Require your review" />
                      <StatCard label="GRNs Pending Verify"  value={stats.pendingGRNs}         icon={CheckCircle2} color="text-primary-700" sub="Awaiting site head" />
                      <StatCard label="Total Site Spend"     value={fmtCrore(stats.totalSpend)} icon={TrendingUp} color="text-success" sub="Closed POs" />
                    </div>
                  </section>
                )}

                {/* D6 — Warehouse */}
                {view === "Warehouse" && (
                  <section className="space-y-4">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-text-secondary border-b border-border pb-2">D6 — Warehouse Dashboard</h2>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <StatCard label="GRNs Pending"         value={stats.pendingGRNs}  icon={CheckCircle2} color="text-warning-800" sub="Submitted, unverified" />
                      <StatCard label="Open POs"             value={stats.openPOs}      icon={Package}      color="text-primary-700" sub="Active deliveries" />
                      <StatCard label="Deliveries This Week" value={stats.dueThisWeek}  icon={Clock}        color="text-danger"      sub="Due ≤7 days" />
                    </div>
                  </section>
                )}

                {/* Requestor / others */}
                {["Requestor"].includes(view) && (
                  <section className="space-y-4">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-text-secondary border-b border-border pb-2">My Activity Summary</h2>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <StatCard label="My Pending PRs"  value={stats.pendingPRs}  icon={FileText}   color="text-warning-800" />
                      <StatCard label="Open POs"        value={stats.openPOs}     icon={Package}    color="text-primary-700" />
                      <StatCard label="Pending GRNs"    value={stats.pendingGRNs} icon={CheckCircle2} color="text-text-secondary" />
                    </div>
                  </section>
                )}
              </>
            );
          })() : (
            <div className="text-center py-16 text-text-secondary">
              <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No dashboard data available.</p>
            </div>
          )}

          <div className="bg-primary-50 border border-primary-200 text-primary-700 text-[11px] font-bold tracking-wide uppercase p-2 rounded-sm text-center">
            ⚑ Data Governance: Reports display data based on your role and site access — SOP §3.2 &amp; §12
          </div>
        </div>
      )}

    </div>
  );
}
