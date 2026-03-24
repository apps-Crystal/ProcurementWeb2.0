"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ClipboardList,
  Search,
  Loader2,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ChevronRight,
  Wrench,
} from "lucide-react";
import { fmtDate } from "@/lib/utils";

interface SRNRow {
  srn_id:       string;
  srn_date:     string;
  wo_id:        string;
  vendor_name:  string;
  site:         string;
  raised_by:    string;
  status:       string;
}

type Tab = "All" | "Submitted" | "Verified" | "Rejected";

function StatusBadge({ status }: { status: string }) {
  if (status === "VERIFIED" || status === "SRN_VERIFIED")
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-success bg-success/10 border border-success/20 px-2 py-0.5 rounded-sm uppercase tracking-wide">
        <CheckCircle2 className="w-3 h-3" /> Verified
      </span>
    );
  if (status === "REJECTED")
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-danger bg-danger/10 border border-danger/20 px-2 py-0.5 rounded-sm uppercase tracking-wide">
        <AlertTriangle className="w-3 h-3" /> Rejected
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-warning-800 bg-warning/10 border border-warning/20 px-2 py-0.5 rounded-sm uppercase tracking-wide">
      <Clock className="w-3 h-3" /> Submitted
    </span>
  );
}

export default function SRNListPage() {
  const router = useRouter();

  const [srns, setSrns]       = useState<SRNRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]         = useState<Tab>("All");
  const [search, setSearch]   = useState("");

  useEffect(() => {
    fetch("/api/srn")
      .then((r) => r.ok ? r.json() : { srns: [] })
      .then((data) => {
        const rows: Record<string, string>[] = data.srns ?? [];
        setSrns(
          rows.map((r) => ({
            srn_id:      r.SRN_ID      ?? "",
            srn_date:    r.SRN_DATE    ?? "",
            wo_id:       r.WO_ID       ?? "—",
            vendor_name: r.VENDOR_NAME ?? "—",
            site:        r.SITE        ?? "—",
            raised_by:   r.RAISED_BY_NAME ?? r.RAISED_BY_USER_ID ?? "—",
            status:      r.STATUS      ?? "SUBMITTED",
          }))
        );
      })
      .catch(() => setSrns([]))
      .finally(() => setLoading(false));
  }, []);

  const submittedCount = srns.filter((s) =>
    !["VERIFIED", "SRN_VERIFIED", "REJECTED"].includes(s.status)
  ).length;
  const verifiedCount = srns.filter((s) =>
    ["VERIFIED", "SRN_VERIFIED"].includes(s.status)
  ).length;
  const rejectedCount = srns.filter((s) => s.status === "REJECTED").length;

  const filtered = srns.filter((s) => {
    const matchTab =
      tab === "All" ||
      (tab === "Submitted" && !["VERIFIED", "SRN_VERIFIED", "REJECTED"].includes(s.status)) ||
      (tab === "Verified"  && ["VERIFIED", "SRN_VERIFIED"].includes(s.status)) ||
      (tab === "Rejected"  && s.status === "REJECTED");
    const q = search.toLowerCase();
    return (
      matchTab &&
      (!q ||
        s.srn_id.toLowerCase().includes(q) ||
        s.wo_id.toLowerCase().includes(q) ||
        s.vendor_name.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-bold text-primary-900 tracking-tight flex items-center gap-2">
            <Wrench className="w-6 h-6 text-primary-500" /> Service Receipt Notes
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            All SRNs submitted for service work orders — track delivery confirmation.
          </p>
        </div>
        <button
          onClick={() => router.push("/receipts/srn/new")}
          className="h-9 px-4 bg-primary-700 hover:bg-primary-800 text-white text-sm font-medium rounded-sm transition-colors shadow-sm flex items-center gap-2"
        >
          <Wrench className="w-4 h-4" /> New SRN
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="enterprise-card p-4 flex flex-col items-center justify-center text-center">
          <span className="text-3xl font-mono font-bold text-primary-900">{srns.length}</span>
          <span className="text-xs font-bold text-text-secondary uppercase tracking-wider mt-1">Total SRNs</span>
        </div>
        <div className="enterprise-card p-4 flex flex-col items-center justify-center text-center">
          <span className="text-3xl font-mono font-bold text-warning-800">{submittedCount}</span>
          <span className="text-xs font-bold text-text-secondary uppercase tracking-wider mt-1">Pending Verification</span>
        </div>
        <div className="enterprise-card p-4 flex flex-col items-center justify-center text-center">
          <span className="text-3xl font-mono font-bold text-success">{verifiedCount}</span>
          <span className="text-xs font-bold text-text-secondary uppercase tracking-wider mt-1">Verified</span>
        </div>
        <div className="enterprise-card p-4 flex flex-col items-center justify-center text-center">
          <span className="text-3xl font-mono font-bold text-danger">{rejectedCount}</span>
          <span className="text-xs font-bold text-text-secondary uppercase tracking-wider mt-1">Rejected</span>
        </div>
      </div>

      {/* Main table */}
      <div className="enterprise-card flex flex-col min-h-[400px]">
        {/* Toolbar */}
        <div className="p-4 border-b border-border bg-primary-50/30 flex flex-col sm:flex-row justify-between gap-4">
          <div className="flex bg-surface border border-border rounded-sm p-1 shadow-sm overflow-x-auto gap-0.5">
            {(["All", "Submitted", "Verified", "Rejected"] as Tab[]).map((t) => {
              const count =
                t === "All"       ? srns.length :
                t === "Submitted" ? submittedCount :
                t === "Verified"  ? verifiedCount : rejectedCount;
              const active =
                t === "All"       ? "bg-primary-900 text-white shadow-sm" :
                t === "Submitted" ? "bg-warning text-white shadow-sm" :
                t === "Verified"  ? "bg-success text-white shadow-sm" :
                                    "bg-danger text-white shadow-sm";
              const inactive =
                t === "All"       ? "text-text-secondary hover:text-primary-900" :
                t === "Submitted" ? "text-warning-800 hover:text-warning" :
                t === "Verified"  ? "text-success hover:text-success/80" :
                                    "text-danger hover:text-danger/80";
              return (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-4 py-1.5 text-xs font-bold rounded-sm transition-colors whitespace-nowrap ${tab === t ? active : inactive}`}
                >
                  {t} ({count})
                </button>
              );
            })}
          </div>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2.5 top-2 text-text-secondary" />
            <input
              type="text"
              placeholder="Search SRN ID, WO, Vendor…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="enterprise-input pl-8 w-64"
            />
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto bg-surface">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-primary-400" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-6 py-16 text-center text-text-secondary">
              <ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No SRNs found.</p>
            </div>
          ) : (
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="text-[11px] text-text-secondary bg-surface border-b border-border uppercase tracking-wider sticky top-0">
                <tr>
                  <th className="px-4 py-3 font-semibold">SRN ID</th>
                  <th className="px-4 py-3 font-semibold">Work Order</th>
                  <th className="px-4 py-3 font-semibold">Vendor</th>
                  <th className="px-4 py-3 font-semibold">Site</th>
                  <th className="px-4 py-3 font-semibold">SRN Date</th>
                  <th className="px-4 py-3 font-semibold">Raised By</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold w-20"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((s) => (
                  <tr key={s.srn_id} className="hover:bg-primary-50/20 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs font-bold text-primary-700">{s.srn_id}</td>
                    <td className="px-4 py-3 font-mono text-xs text-text-secondary">{s.wo_id}</td>
                    <td className="px-4 py-3 text-xs font-medium text-primary-900 max-w-[180px] truncate" title={s.vendor_name}>{s.vendor_name}</td>
                    <td className="px-4 py-3 text-xs text-text-secondary">{s.site}</td>
                    <td className="px-4 py-3 text-xs text-text-secondary">{fmtDate(s.srn_date)}</td>
                    <td className="px-4 py-3 text-xs text-text-secondary">{s.raised_by}</td>
                    <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => router.push(`/receipts/srn/new?wo=${s.wo_id}`)}
                        className="inline-flex items-center gap-1 text-[10px] font-bold text-primary-700 hover:text-primary-900 bg-primary-50 hover:bg-primary-100 border border-primary-200 px-2 py-1 rounded-sm transition-colors"
                      >
                        New SRN <ChevronRight className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
