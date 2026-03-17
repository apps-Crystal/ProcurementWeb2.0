"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ClipboardList,
  Search,
  ShoppingCart,
  PackageCheck,
  Briefcase,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  Loader2,
  User,
  Calendar,
  IndianRupee,
} from "lucide-react";

interface PRRow {
  PR_ID?: string;
  SPR_ID?: string;
  PR_TYPE: "MPR" | "SPR";
  PR_DATE?: string;
  SPR_DATE?: string;
  CATEGORY?: string;
  SERVICE_CATEGORY?: string;
  REQUESTOR_NAME?: string;
  REQUESTOR_SITE?: string;
  PREFERRED_VENDOR_NAME?: string;
  VENDOR_NAME?: string;
  EXPECTED_DELIVERY_DATE?: string;
  TOTAL_AMOUNT_WITH_GST?: string;
  TOTAL_VALUE?: string;
  ASSIGNED_APPROVER_NAME?: string;
  APPROVER_ACTION_DATE?: string;
}

export default function POPendingPage() {
  const router = useRouter();
  const [prs, setPrs]       = useState<PRRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"ALL" | "MPR" | "SPR">("ALL");

  useEffect(() => {
    fetch("/api/pr?status=APPROVED")
      .then((r) => r.json())
      .then((d) => setPrs(d.prs ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = prs.filter((r) => {
    const id        = r.PR_ID ?? r.SPR_ID ?? "";
    const requestor = r.REQUESTOR_NAME ?? "";
    const vendor    = r.PREFERRED_VENDOR_NAME ?? r.VENDOR_NAME ?? "";
    const category  = r.CATEGORY ?? r.SERVICE_CATEGORY ?? "";
    const q = search.toLowerCase();

    const matchSearch =
      !q ||
      id.toLowerCase().includes(q) ||
      requestor.toLowerCase().includes(q) ||
      vendor.toLowerCase().includes(q) ||
      category.toLowerCase().includes(q);

    const matchType = typeFilter === "ALL" || r.PR_TYPE === typeFilter;

    return matchSearch && matchType;
  });

  const mprCount = prs.filter((r) => r.PR_TYPE === "MPR").length;
  const sprCount = prs.filter((r) => r.PR_TYPE === "SPR").length;

  function daysSinceApproval(dateStr?: string): number | null {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.floor((today.getTime() - d.getTime()) / 86_400_000);
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-20">

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-bold text-primary-900 tracking-tight flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-primary-600" />
            PO Pending Queue
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Approved purchase requests awaiting Purchase Order creation.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-medium text-text-secondary bg-success/10 border border-success/30 px-3 py-2 rounded-sm">
          <CheckCircle2 className="w-4 h-4 text-success" />
          {prs.length} approved PR{prs.length !== 1 ? "s" : ""} awaiting PO
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="enterprise-card p-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-sm bg-primary-100 flex items-center justify-center">
            <ClipboardList className="w-4 h-4 text-primary-700" />
          </div>
          <div>
            <p className="text-xl font-bold text-primary-900">{prs.length}</p>
            <p className="text-[11px] text-text-secondary uppercase tracking-wider font-medium">Total Pending</p>
          </div>
        </div>
        <div className="enterprise-card p-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-sm bg-accent-50 flex items-center justify-center">
            <PackageCheck className="w-4 h-4 text-accent-700" />
          </div>
          <div>
            <p className="text-xl font-bold text-primary-900">{mprCount}</p>
            <p className="text-[11px] text-text-secondary uppercase tracking-wider font-medium">Material PRs</p>
          </div>
        </div>
        <div className="enterprise-card p-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-sm bg-primary-50 flex items-center justify-center">
            <Briefcase className="w-4 h-4 text-primary-600" />
          </div>
          <div>
            <p className="text-xl font-bold text-primary-900">{sprCount}</p>
            <p className="text-[11px] text-text-secondary uppercase tracking-wider font-medium">Service PRs</p>
          </div>
        </div>
      </div>

      <div className="enterprise-card flex flex-col min-h-[500px]">

        {/* Toolbar */}
        <div className="p-4 border-b border-border bg-primary-50/30 flex flex-col sm:flex-row justify-between items-center gap-4">
          {/* Type tabs */}
          <div className="flex bg-surface border border-border rounded-sm p-1 shadow-sm">
            {(["ALL", "MPR", "SPR"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={`px-4 py-1.5 text-xs font-bold rounded-sm transition-colors whitespace-nowrap ${
                  typeFilter === t
                    ? "bg-primary-900 text-white shadow-sm"
                    : "text-text-secondary hover:text-primary-900"
                }`}
              >
                {t === "ALL" ? `All (${prs.length})` : t === "MPR" ? `Material (${mprCount})` : `Service (${sprCount})`}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search className="w-4 h-4 absolute left-2.5 top-2 text-text-secondary" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search PR ID, requestor, vendor, category…"
              className="enterprise-input pl-8 w-72"
            />
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto bg-surface">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
              <span className="ml-3 text-sm text-text-secondary">Loading approved PRs…</span>
            </div>
          ) : (
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="text-[11px] text-text-secondary bg-primary-50/50 sticky top-0 border-b border-border uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3 font-semibold w-36">PR ID</th>
                  <th className="px-5 py-3 font-semibold w-16">Type</th>
                  <th className="px-5 py-3 font-semibold">Requestor</th>
                  <th className="px-5 py-3 font-semibold">Site</th>
                  <th className="px-5 py-3 font-semibold">Category</th>
                  <th className="px-5 py-3 font-semibold">Preferred Vendor</th>
                  <th className="px-5 py-3 font-semibold text-right">Value (₹)</th>
                  <th className="px-5 py-3 font-semibold w-28 text-center">Approved</th>
                  <th className="px-5 py-3 font-semibold w-36 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((req) => {
                  const id       = req.PR_ID ?? req.SPR_ID ?? "—";
                  const category = req.CATEGORY ?? req.SERVICE_CATEGORY ?? "—";
                  const vendor   = req.PREFERRED_VENDOR_NAME ?? req.VENDOR_NAME ?? "—";
                  const value    = parseFloat(req.TOTAL_AMOUNT_WITH_GST ?? req.TOTAL_VALUE ?? "0");
                  const days     = daysSinceApproval(req.APPROVER_ACTION_DATE);

                  return (
                    <tr
                      key={id}
                      className="hover:bg-primary-50/40 transition-colors cursor-pointer"
                      onClick={() => router.push(`/pr/${id}`)}
                    >
                      <td className="px-5 py-4 font-mono text-primary-700 font-bold text-xs">{id}</td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-sm border ${
                          req.PR_TYPE === "MPR"
                            ? "bg-accent-50 text-accent-700 border-accent-200"
                            : "bg-primary-50 text-primary-700 border-primary-200"
                        }`}>
                          {req.PR_TYPE === "MPR"
                            ? <PackageCheck className="w-3 h-3" />
                            : <Briefcase className="w-3 h-3" />}
                          {req.PR_TYPE}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-xs font-medium text-primary-900">
                        <span className="flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-text-secondary flex-shrink-0" />
                          {req.REQUESTOR_NAME ?? "—"}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-xs text-text-secondary">{req.REQUESTOR_SITE ?? "—"}</td>
                      <td className="px-5 py-4 text-xs text-text-primary">{category}</td>
                      <td className="px-5 py-4 text-xs text-text-primary truncate max-w-[180px]">{vendor}</td>
                      <td className="px-5 py-4 font-mono font-bold text-primary-900 text-right text-xs">
                        <span className="flex items-center justify-end gap-0.5">
                          <IndianRupee className="w-3 h-3" />
                          {value > 0 ? value.toLocaleString("en-IN", { minimumFractionDigits: 2 }) : "—"}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-center">
                        {days !== null ? (
                          <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-sm border ${
                            days > 5
                              ? "bg-danger/10 text-danger border-danger/20"
                              : days > 2
                              ? "bg-warning/10 text-warning-800 border-warning/20"
                              : "bg-success/10 text-success border-success/20"
                          }`}>
                            <Calendar className="w-3 h-3" />
                            {days === 0 ? "Today" : `${days}d ago`}
                          </span>
                        ) : (
                          <span className="text-xs text-text-secondary">—</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => router.push(`/po/new?pr=${id}&type=${req.PR_TYPE}`)}
                          className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-primary-900 hover:bg-primary-800 px-3 py-1.5 rounded-sm transition-colors"
                        >
                          <ShoppingCart className="w-3.5 h-3.5" /> Create PO
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {!loading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-6 py-16 text-center text-text-secondary">
                      <AlertCircle className="w-10 h-10 mx-auto text-primary-200 mb-3" />
                      <p className="text-sm font-medium">
                        {prs.length === 0
                          ? "No approved PRs waiting for PO creation."
                          : "No results match your search or filter."}
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        <div className="p-3 border-t border-border bg-primary-50/30 flex justify-between items-center text-[11px] text-text-secondary">
          <span>Showing {filtered.length} of {prs.length} approved PRs.</span>
          <span className="flex items-center gap-1">
            <ChevronRight className="w-3 h-3" /> Click a row to view PR details · Click "Create PO" to issue the order
          </span>
        </div>
      </div>
    </div>
  );
}
