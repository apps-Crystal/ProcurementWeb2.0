"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  FileText,
  Search,
  Filter,
  PackageCheck,
  Briefcase,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ChevronRight,
  Loader2
} from "lucide-react";

type PRStatus = "SUBMITTED" | "APPROVED" | "REJECTED" | "DRAFT" | "CANCELLED";

interface PRRow {
  PR_ID?: string;
  SPR_ID?: string;
  PR_TYPE: "MPR" | "SPR";
  PR_DATE?: string;
  SPR_DATE?: string;
  CATEGORY?: string;
  SERVICE_CATEGORY?: string;
  PREFERRED_VENDOR_NAME?: string;
  VENDOR_NAME?: string;
  TOTAL_AMOUNT_WITH_GST?: string;
  TOTAL_VALUE?: string;
  STATUS: PRStatus;
  REQUESTOR_SITE?: string;
}

const STATUS_STYLE: Record<PRStatus, string> = {
  SUBMITTED:  "bg-primary-50 text-primary-700 border-primary-200",
  APPROVED:   "bg-success/10 text-success border-success/20",
  REJECTED:   "bg-danger/10 text-danger border-danger/20",
  DRAFT:      "bg-warning/10 text-warning-800 border-warning/20",
  CANCELLED:  "bg-border text-text-secondary border-border",
};

const STATUS_ICON: Record<PRStatus, React.ReactNode> = {
  SUBMITTED:  <Clock className="w-3 h-3" />,
  APPROVED:   <CheckCircle2 className="w-3 h-3" />,
  REJECTED:   <XCircle className="w-3 h-3" />,
  DRAFT:      <AlertCircle className="w-3 h-3" />,
  CANCELLED:  <XCircle className="w-3 h-3" />,
};

type Tab = "All" | "Action" | "Progress" | "Approved";

export default function MyRequestsList() {
  const [prs, setPrs] = useState<PRRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("All");
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/pr")
      .then((r) => r.json())
      .then((d) => setPrs(d.prs ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = prs.filter((r) => {
    const id = r.PR_ID ?? r.SPR_ID ?? "";
    const vendor = r.PREFERRED_VENDOR_NAME ?? r.VENDOR_NAME ?? "";
    const matchesSearch =
      !search ||
      id.toLowerCase().includes(search.toLowerCase()) ||
      vendor.toLowerCase().includes(search.toLowerCase());

    const matchesTab =
      activeTab === "All" ||
      (activeTab === "Action"   && r.STATUS === "REJECTED") ||
      (activeTab === "Progress" && r.STATUS === "SUBMITTED") ||
      (activeTab === "Approved" && r.STATUS === "APPROVED");

    return matchesSearch && matchesTab;
  });

  const counts = {
    all:      prs.length,
    action:   prs.filter((r) => r.STATUS === "REJECTED").length,
    progress: prs.filter((r) => r.STATUS === "SUBMITTED").length,
    approved: prs.filter((r) => r.STATUS === "APPROVED").length,
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-20">

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-bold text-primary-900 tracking-tight flex items-center gap-2">
            <FileText className="w-6 h-6 text-primary-600" />
            My Purchase Requests
          </h1>
          <p className="text-sm text-text-secondary mt-1">Unified view of all your Material (MPR) and Service (SPR) requests.</p>
        </div>
        <div className="flex items-center gap-2">
          <a href="/pr/mpr/new" className="h-9 px-4 bg-primary-900 hover:bg-primary-800 text-white text-sm font-medium rounded-sm border border-primary-950 transition-colors shadow-sm flex items-center gap-2">
            <PackageCheck className="w-4 h-4" /> Raise MPR
          </a>
          <a href="/pr/spr/new" className="h-9 px-4 bg-surface hover:bg-primary-50 text-primary-700 text-sm font-medium rounded-sm border border-primary-200 transition-colors shadow-sm flex items-center gap-2">
            <Briefcase className="w-4 h-4" /> Raise SPR
          </a>
        </div>
      </div>

      <div className="enterprise-card flex flex-col min-h-[600px]">

        {/* Toolbar */}
        <div className="p-4 border-b border-border bg-primary-50/30 flex flex-col sm:flex-row justify-between gap-4">
          <div className="flex bg-surface border border-border rounded-sm p-1 inline-flex shadow-sm overflow-x-auto">
            {(["All", "Action", "Progress", "Approved"] as Tab[]).map((tab) => {
              const count = tab === "All" ? counts.all : tab === "Action" ? counts.action : tab === "Progress" ? counts.progress : counts.approved;
              const isActive = activeTab === tab;
              const danger = tab === "Action";
              const success = tab === "Approved";
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-1.5 text-xs font-bold rounded-sm transition-colors whitespace-nowrap ${
                    isActive
                      ? danger ? "bg-danger text-white shadow-sm"
                        : success ? "bg-success text-white shadow-sm"
                        : "bg-primary-900 text-white shadow-sm"
                      : danger ? "text-danger hover:text-danger/80"
                      : success ? "text-text-secondary hover:text-success"
                      : "text-text-secondary hover:text-primary-900"
                  }`}
                >
                  {tab === "All" ? "All Requests" : tab === "Action" ? "Needs Attention" : tab === "Progress" ? "In Progress" : "Approved"} ({count})
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2.5 top-2 text-text-secondary" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search ID or Vendor..."
                className="enterprise-input pl-8 w-64"
              />
            </div>
            <button className="h-9 px-3 bg-surface border border-border text-text-secondary hover:text-primary-900 hover:border-primary-300 rounded-sm transition-colors shadow-sm flex items-center gap-2">
              <Filter className="w-4 h-4" /> Filter
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto bg-surface">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
              <span className="ml-3 text-sm text-text-secondary">Loading requests...</span>
            </div>
          ) : (
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="text-[11px] text-text-secondary bg-primary-50/50 sticky top-0 border-b border-border uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3 font-semibold w-36">Req. ID</th>
                  <th className="px-6 py-3 font-semibold w-20">Type</th>
                  <th className="px-6 py-3 font-semibold">Date</th>
                  <th className="px-6 py-3 font-semibold">Category</th>
                  <th className="px-6 py-3 font-semibold">Preferred Vendor</th>
                  <th className="px-6 py-3 font-semibold text-right">Est. Value</th>
                  <th className="px-6 py-3 font-semibold w-40 text-center">Status</th>
                  <th className="px-6 py-3 font-semibold w-12 text-center">Act</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((req) => {
                  const id = req.PR_ID ?? req.SPR_ID ?? "—";
                  const date = req.PR_DATE ?? req.SPR_DATE ?? "—";
                  const category = req.CATEGORY ?? req.SERVICE_CATEGORY ?? "—";
                  const vendor = req.PREFERRED_VENDOR_NAME ?? req.VENDOR_NAME ?? "—";
                  const value = req.TOTAL_AMOUNT_WITH_GST ?? req.TOTAL_VALUE ?? "0";
                  const status = (req.STATUS ?? "DRAFT") as PRStatus;

                  return (
                    <tr key={id} className="hover:bg-primary-50/30 transition-colors cursor-pointer" onClick={() => window.location.href = `/pr/${id}`}>
                      <td className="px-6 py-4 font-mono text-primary-700 font-bold text-xs">{id}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-sm border ${req.PR_TYPE === "MPR" ? "bg-accent-50 text-accent-700 border-accent-200" : "bg-primary-50 text-primary-700 border-primary-200"}`}>
                          {req.PR_TYPE === "MPR" ? <PackageCheck className="w-3 h-3" /> : <Briefcase className="w-3 h-3" />}
                          {req.PR_TYPE}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs font-medium text-text-secondary">{date}</td>
                      <td className="px-6 py-4 text-xs text-text-primary">{category}</td>
                      <td className="px-6 py-4 font-medium text-text-primary truncate max-w-[200px] text-xs">{vendor}</td>
                      <td className="px-6 py-4 font-mono font-bold text-primary-900 text-right text-xs">
                        ₹{parseFloat(value).toLocaleString("en-IN")}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase py-1 px-2.5 rounded-sm border ${STATUS_STYLE[status] ?? STATUS_STYLE.DRAFT}`}>
                          {STATUS_ICON[status]} {status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <Link href={`/pr/${id}`} className="p-1.5 text-text-secondary hover:text-primary-900 hover:bg-primary-50 rounded-sm transition-colors inline-flex">
                          <ChevronRight className="w-4 h-4" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
                {!loading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-text-secondary">
                      <AlertCircle className="w-8 h-8 mx-auto text-primary-200 mb-2" />
                      <p className="text-sm">{prs.length === 0 ? "No purchase requests yet. Raise your first MPR." : "No requests match this filter."}</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        <div className="p-3 border-t border-border bg-primary-50/30 text-xs text-text-secondary flex justify-between items-center">
          <span>Showing {filtered.length} of {prs.length} requests.</span>
        </div>
      </div>
    </div>
  );
}
