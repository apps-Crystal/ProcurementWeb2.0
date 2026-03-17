"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  ClipboardCheck,
  Search,
  PackageCheck,
  Briefcase,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ChevronRight,
  Loader2,
  User,
} from "lucide-react";
import { useCurrentUser } from "@/components/auth/AuthProvider";

interface PRRow {
  PR_ID?: string;
  SPR_ID?: string;
  PR_TYPE: "MPR" | "SPR";
  PR_DATE?: string;
  SPR_DATE?: string;
  CATEGORY?: string;
  SERVICE_CATEGORY?: string;
  REQUESTOR_NAME?: string;
  REQUESTOR_USER_ID?: string;
  REQUESTOR_SITE?: string;
  PREFERRED_VENDOR_NAME?: string;
  VENDOR_NAME?: string;
  TOTAL_AMOUNT_WITH_GST?: string;
  TOTAL_VALUE?: string;
  STATUS: string;
}

export default function PRApprovalsPage() {
  const { user } = useCurrentUser();
  const [prs, setPrs] = useState<PRRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/pr?status=SUBMITTED")
      .then((r) => r.json())
      .then((d) => {
        const all: PRRow[] = d.prs ?? [];
        // SOP §15.1 — exclude PRs submitted by the current user
        const pending = all.filter(
          (r) =>
            r.REQUESTOR_USER_ID !== user?.userId &&
            r.REQUESTOR_NAME !== user?.name
        );
        setPrs(pending);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [user]);

  const filtered = prs.filter((r) => {
    if (!search) return true;
    const id = r.PR_ID ?? r.SPR_ID ?? "";
    const requestor = r.REQUESTOR_NAME ?? "";
    const vendor = r.PREFERRED_VENDOR_NAME ?? r.VENDOR_NAME ?? "";
    return (
      id.toLowerCase().includes(search.toLowerCase()) ||
      requestor.toLowerCase().includes(search.toLowerCase()) ||
      vendor.toLowerCase().includes(search.toLowerCase())
    );
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-20">

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-bold text-primary-900 tracking-tight flex items-center gap-2">
            <ClipboardCheck className="w-6 h-6 text-primary-600" />
            PR Approvals Queue
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Purchase requests awaiting your approval. Click a row to review and act.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-medium text-text-secondary bg-warning/10 border border-warning/30 px-3 py-2 rounded-sm">
          <Clock className="w-4 h-4 text-warning" />
          {prs.length} request{prs.length !== 1 ? "s" : ""} pending
        </div>
      </div>

      <div className="enterprise-card flex flex-col min-h-[500px]">

        {/* Toolbar */}
        <div className="p-4 border-b border-border bg-primary-50/30 flex justify-between items-center gap-4">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2.5 top-2 text-text-secondary" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by PR ID, requestor, or vendor…"
              className="enterprise-input pl-8 w-72"
            />
          </div>
          <span className="text-xs text-text-secondary">
            Showing {filtered.length} of {prs.length}
          </span>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto bg-surface">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
              <span className="ml-3 text-sm text-text-secondary">Loading pending approvals…</span>
            </div>
          ) : (
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="text-[11px] text-text-secondary bg-primary-50/50 sticky top-0 border-b border-border uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3 font-semibold w-36">PR ID</th>
                  <th className="px-6 py-3 font-semibold w-16">Type</th>
                  <th className="px-6 py-3 font-semibold">Date</th>
                  <th className="px-6 py-3 font-semibold">Requestor</th>
                  <th className="px-6 py-3 font-semibold">Site</th>
                  <th className="px-6 py-3 font-semibold">Category</th>
                  <th className="px-6 py-3 font-semibold">Preferred Vendor</th>
                  <th className="px-6 py-3 font-semibold text-right">Value (₹)</th>
                  <th className="px-6 py-3 font-semibold w-12 text-center">Act</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((req) => {
                  const id = req.PR_ID ?? req.SPR_ID ?? "—";
                  const date = req.PR_DATE ?? req.SPR_DATE ?? "—";
                  const category = req.CATEGORY ?? req.SERVICE_CATEGORY ?? "—";
                  const vendor = req.PREFERRED_VENDOR_NAME ?? req.VENDOR_NAME ?? "—";
                  const value = parseFloat(req.TOTAL_AMOUNT_WITH_GST ?? req.TOTAL_VALUE ?? "0");

                  return (
                    <tr
                      key={id}
                      className="hover:bg-primary-50/40 transition-colors cursor-pointer"
                      onClick={() => (window.location.href = `/pr/${id}`)}
                    >
                      <td className="px-6 py-4 font-mono text-primary-700 font-bold text-xs">{id}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-sm border ${
                          req.PR_TYPE === "MPR"
                            ? "bg-accent-50 text-accent-700 border-accent-200"
                            : "bg-primary-50 text-primary-700 border-primary-200"
                        }`}>
                          {req.PR_TYPE === "MPR" ? <PackageCheck className="w-3 h-3" /> : <Briefcase className="w-3 h-3" />}
                          {req.PR_TYPE}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs text-text-secondary">{date}</td>
                      <td className="px-6 py-4 text-xs font-medium text-primary-900 flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-text-secondary flex-shrink-0" />
                        {req.REQUESTOR_NAME ?? "—"}
                      </td>
                      <td className="px-6 py-4 text-xs text-text-secondary">{req.REQUESTOR_SITE ?? "—"}</td>
                      <td className="px-6 py-4 text-xs text-text-primary">{category}</td>
                      <td className="px-6 py-4 text-xs text-text-primary truncate max-w-[180px]">{vendor}</td>
                      <td className="px-6 py-4 font-mono font-bold text-primary-900 text-right text-xs">
                        {value > 0 ? value.toLocaleString("en-IN", { minimumFractionDigits: 2 }) : "—"}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <Link
                          href={`/pr/${id}`}
                          className="p-1.5 text-text-secondary hover:text-primary-900 hover:bg-primary-50 rounded-sm transition-colors inline-flex"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ChevronRight className="w-4 h-4" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
                {!loading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-6 py-16 text-center text-text-secondary">
                      <CheckCircle2 className="w-10 h-10 mx-auto text-success/40 mb-3" />
                      <p className="text-sm font-medium text-success">
                        {prs.length === 0
                          ? "All clear — no pending approvals."
                          : "No results match your search."}
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        <div className="p-3 border-t border-border bg-primary-50/30 text-[11px] text-text-secondary">
          ⚑ SOP §15.1 — PRs you submitted are excluded from this queue.
        </div>
      </div>
    </div>
  );
}
