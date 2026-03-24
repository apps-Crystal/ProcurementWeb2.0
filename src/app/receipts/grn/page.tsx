"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  PackageCheck,
  Search,
  Loader2,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ClipboardList,
  ChevronRight,
} from "lucide-react";
import { useCurrentUser } from "@/components/auth/AuthProvider";
import { fmtDate } from "@/lib/utils";

interface GRNRow {
  grn_id:       string;
  po_id:        string;
  vendor_name:  string;
  site:         string;
  grn_date:     string;
  challan_no:   string;
  received_by:  string;
  status:       string;
}

type Tab = "All" | "Pending" | "Verified" | "Flagged";

const VERIFY_ROLES = ["Site_Head", "System_Admin"];

function StatusBadge({ status }: { status: string }) {
  if (status === "GRN_VERIFIED")
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-success bg-success/10 border border-success/20 px-2 py-0.5 rounded-sm uppercase tracking-wide">
        <CheckCircle2 className="w-3 h-3" /> Verified
      </span>
    );
  if (status === "FLAGGED")
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-danger bg-danger/10 border border-danger/20 px-2 py-0.5 rounded-sm uppercase tracking-wide">
        <AlertTriangle className="w-3 h-3" /> Flagged
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-warning-800 bg-warning/10 border border-warning/20 px-2 py-0.5 rounded-sm uppercase tracking-wide">
      <Clock className="w-3 h-3" /> Pending
    </span>
  );
}

export default function GRNListPage() {
  const router = useRouter();
  const { user } = useCurrentUser();
  const canVerify = VERIFY_ROLES.includes(user?.role ?? "");

  const [grns, setGrns]       = useState<GRNRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]         = useState<Tab>("All");
  const [search, setSearch]   = useState("");

  useEffect(() => {
    fetch("/api/grn")
      .then((r) => r.json())
      .then((data) => {
        const rows: Record<string, string>[] = data.grns ?? [];
        setGrns(
          rows.map((r) => ({
            grn_id:      r.GRN_ID      ?? "",
            po_id:       r.PO_ID       ?? "—",
            vendor_name: r.VENDOR_NAME ?? "—",
            site:        r.SITE        ?? "—",
            grn_date:    r.GRN_DATE    ?? r.CREATED_AT?.slice(0, 10) ?? "",
            challan_no:  r.CHALLAN_NUMBER ?? "—",
            received_by: r.RECEIVED_BY_NAME ?? r.RECEIVED_BY ?? "—",
            status:      r.STATUS      ?? "PENDING",
          }))
        );
      })
      .catch(() => setGrns([]))
      .finally(() => setLoading(false));
  }, []);

  const pendingCount  = grns.filter((g) => g.status === "PENDING").length;
  const verifiedCount = grns.filter((g) => g.status === "GRN_VERIFIED").length;
  const flaggedCount  = grns.filter((g) => g.status === "FLAGGED").length;

  const filtered = grns.filter((g) => {
    const matchTab =
      tab === "All" ||
      (tab === "Pending"  && g.status === "PENDING") ||
      (tab === "Verified" && g.status === "GRN_VERIFIED") ||
      (tab === "Flagged"  && g.status === "FLAGGED");
    const q = search.toLowerCase();
    return (
      matchTab &&
      (!q ||
        g.grn_id.toLowerCase().includes(q) ||
        g.po_id.toLowerCase().includes(q) ||
        g.vendor_name.toLowerCase().includes(q) ||
        g.challan_no.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-bold text-primary-900 tracking-tight flex items-center gap-2">
            <PackageCheck className="w-6 h-6 text-success" /> Goods Received Notes
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            All GRNs submitted across sites — track receipt status and verification.
          </p>
        </div>
        <button
          onClick={() => router.push("/receipts/grn/new")}
          className="h-9 px-4 bg-success hover:bg-success/90 text-white text-sm font-medium rounded-sm transition-colors shadow-sm flex items-center gap-2"
        >
          <PackageCheck className="w-4 h-4" /> New GRN
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="enterprise-card p-4 flex flex-col items-center justify-center text-center">
          <span className="text-3xl font-mono font-bold text-primary-900">{grns.length}</span>
          <span className="text-xs font-bold text-text-secondary uppercase tracking-wider mt-1">Total GRNs</span>
        </div>
        <div className="enterprise-card p-4 flex flex-col items-center justify-center text-center">
          <span className="text-3xl font-mono font-bold text-warning-800">{pendingCount}</span>
          <span className="text-xs font-bold text-text-secondary uppercase tracking-wider mt-1">Pending Verification</span>
        </div>
        <div className="enterprise-card p-4 flex flex-col items-center justify-center text-center">
          <span className="text-3xl font-mono font-bold text-success">{verifiedCount}</span>
          <span className="text-xs font-bold text-text-secondary uppercase tracking-wider mt-1">Verified</span>
        </div>
        <div className="enterprise-card p-4 flex flex-col items-center justify-center text-center">
          <span className="text-3xl font-mono font-bold text-danger">{flaggedCount}</span>
          <span className="text-xs font-bold text-text-secondary uppercase tracking-wider mt-1">Flagged</span>
        </div>
      </div>

      {/* Main table */}
      <div className="enterprise-card flex flex-col min-h-[400px]">
        {/* Toolbar */}
        <div className="p-4 border-b border-border bg-primary-50/30 flex flex-col sm:flex-row justify-between gap-4">
          <div className="flex bg-surface border border-border rounded-sm p-1 shadow-sm overflow-x-auto gap-0.5">
            {(["All", "Pending", "Verified", "Flagged"] as Tab[]).map((t) => {
              const count =
                t === "All"      ? grns.length :
                t === "Pending"  ? pendingCount :
                t === "Verified" ? verifiedCount : flaggedCount;
              const active =
                t === "All"      ? "bg-primary-900 text-white shadow-sm" :
                t === "Pending"  ? "bg-warning text-white shadow-sm" :
                t === "Verified" ? "bg-success text-white shadow-sm" :
                                   "bg-danger text-white shadow-sm";
              const inactive =
                t === "All"      ? "text-text-secondary hover:text-primary-900" :
                t === "Pending"  ? "text-warning-800 hover:text-warning" :
                t === "Verified" ? "text-success hover:text-success/80" :
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
              placeholder="Search GRN ID, PO, Vendor, Challan…"
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
              <p className="text-sm">No GRNs found.</p>
            </div>
          ) : (
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="text-[11px] text-text-secondary bg-surface border-b border-border uppercase tracking-wider sticky top-0">
                <tr>
                  <th className="px-4 py-3 font-semibold">GRN ID</th>
                  <th className="px-4 py-3 font-semibold">PO Ref</th>
                  <th className="px-4 py-3 font-semibold">Vendor</th>
                  <th className="px-4 py-3 font-semibold">Site</th>
                  <th className="px-4 py-3 font-semibold">Date</th>
                  <th className="px-4 py-3 font-semibold">Challan No.</th>
                  <th className="px-4 py-3 font-semibold">Received By</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  {canVerify && <th className="px-4 py-3 font-semibold w-24"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((g) => (
                  <tr key={g.grn_id} className="hover:bg-primary-50/20 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs font-bold text-primary-700">{g.grn_id}</td>
                    <td className="px-4 py-3 font-mono text-xs text-text-secondary">{g.po_id}</td>
                    <td className="px-4 py-3 text-xs font-medium text-primary-900 max-w-[180px] truncate" title={g.vendor_name}>{g.vendor_name}</td>
                    <td className="px-4 py-3 text-xs text-text-secondary">{g.site}</td>
                    <td className="px-4 py-3 text-xs text-text-secondary">{fmtDate(g.grn_date)}</td>
                    <td className="px-4 py-3 font-mono text-xs text-text-secondary">{g.challan_no}</td>
                    <td className="px-4 py-3 text-xs text-text-secondary">{g.received_by}</td>
                    <td className="px-4 py-3"><StatusBadge status={g.status} /></td>
                    {canVerify && (
                      <td className="px-4 py-3">
                        {g.status === "PENDING" && (
                          <button
                            onClick={() => router.push(`/receipts/grn/verify?grn_id=${g.grn_id}`)}
                            className="inline-flex items-center gap-1 text-[10px] font-bold text-primary-700 hover:text-primary-900 bg-primary-50 hover:bg-primary-100 border border-primary-200 px-2 py-1 rounded-sm transition-colors"
                          >
                            Verify <ChevronRight className="w-3 h-3" />
                          </button>
                        )}
                      </td>
                    )}
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
