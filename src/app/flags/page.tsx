"use client";

import { useEffect, useState } from "react";
import {
  Flag,
  Search,
  AlertTriangle,
  Scale,
  ShieldAlert,
  CheckCircle2,
  ChevronRight,
  MessageSquare,
  Loader2,
} from "lucide-react";

type FlagSeverity = "High" | "Medium" | "Low";
type FlagStatus = "OPEN" | "IN_REVIEW" | "RESOLVED";

interface FlagRow {
  id: string;
  date: string;
  type: string;
  docRef: string;
  vendorName: string;
  description: string;
  status: FlagStatus;
  severity: FlagSeverity;
}

function getSeverityStyle(severity: string) {
  if (severity === "High") return "bg-danger/10 text-danger border-danger/20";
  if (severity === "Medium") return "bg-warning/10 text-warning-800 border-warning/20";
  return "bg-primary-50 text-primary-700 border-primary-200";
}

function getTypeIcon(type: string) {
  if (type === "Price Mismatch" || type === "Quantity Mismatch")
    return <Scale className="w-3 h-3" />;
  if (type === "Vendor Compliance" || type === "Fraud Risk")
    return <ShieldAlert className="w-3 h-3" />;
  return <AlertTriangle className="w-3 h-3" />;
}

export default function FlagsAndDisputes() {
  const [flags, setFlags] = useState<FlagRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"Open" | "All" | "Resolved">("Open");

  useEffect(() => {
    setLoading(true);
    fetch("/api/flags")
      .then((r) => r.json())
      .then((data) => {
        const rows: Record<string, string>[] = data.flags ?? [];
        setFlags(
          rows.map((r) => ({
            id: r.FLAG_ID,
            date: r.DATE ? new Date(r.DATE).toLocaleDateString("en-IN") : "—",
            type: r.TYPE,
            docRef: r.DOC_REF || "—",
            vendorName: r.VENDOR_NAME || "—",
            description: r.DESCRIPTION,
            status: (r.STATUS ?? "OPEN") as FlagStatus,
            severity: (r.SEVERITY ?? "Medium") as FlagSeverity,
          }))
        );
      })
      .catch(() => setFlags([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = flags.filter((f) => {
    const matchTab =
      activeTab === "All" ||
      (activeTab === "Open" && f.status !== "RESOLVED") ||
      (activeTab === "Resolved" && f.status === "RESOLVED");
    const q = search.toLowerCase();
    return (
      matchTab &&
      (!q ||
        f.id.toLowerCase().includes(q) ||
        f.vendorName.toLowerCase().includes(q) ||
        f.type.toLowerCase().includes(q))
    );
  });

  const openCount = flags.filter((f) => f.status !== "RESOLVED").length;
  const highCount = flags.filter((f) => f.severity === "High" && f.status !== "RESOLVED").length;
  const inReviewCount = flags.filter((f) => f.status === "IN_REVIEW").length;
  const resolvedCount = flags.filter((f) => f.status === "RESOLVED").length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-bold text-primary-900 tracking-tight flex items-center gap-2">
            <Flag className="w-6 h-6 text-danger" /> Flags & Dispute Resolution
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            System-generated flags for Three-Way Match failures, tolerance breaches, and compliance alerts.
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="enterprise-card p-4 flex flex-col items-center justify-center text-center">
          <span className="text-3xl font-mono font-bold text-danger">{highCount}</span>
          <span className="text-xs font-bold text-text-secondary uppercase tracking-wider mt-1">High Severity</span>
        </div>
        <div className="enterprise-card p-4 flex flex-col items-center justify-center text-center">
          <span className="text-3xl font-mono font-bold text-warning-800">{inReviewCount}</span>
          <span className="text-xs font-bold text-text-secondary uppercase tracking-wider mt-1">In Review</span>
        </div>
        <div className="enterprise-card p-4 flex flex-col items-center justify-center text-center">
          <span className="text-3xl font-mono font-bold text-success">{resolvedCount}</span>
          <span className="text-xs font-bold text-text-secondary uppercase tracking-wider mt-1">Resolved</span>
        </div>
      </div>

      {/* Main Content */}
      <div className="enterprise-card flex flex-col min-h-[500px]">
        {/* Toolbar */}
        <div className="p-4 border-b border-border bg-primary-50/30 flex flex-col sm:flex-row justify-between gap-4">
          <div className="flex bg-surface border border-border rounded-sm p-1 shadow-sm overflow-x-auto">
            <button onClick={() => setActiveTab("Open")}
              className={`px-4 py-1.5 text-xs font-bold rounded-sm transition-colors whitespace-nowrap ${activeTab === "Open" ? "bg-danger text-white shadow-sm" : "text-danger hover:text-danger/80"}`}>
              Action Required ({openCount})
            </button>
            <button onClick={() => setActiveTab("All")}
              className={`px-4 py-1.5 text-xs font-bold rounded-sm transition-colors whitespace-nowrap ${activeTab === "All" ? "bg-primary-900 text-white shadow-sm" : "text-text-secondary hover:text-primary-900"}`}>
              All Flags ({flags.length})
            </button>
            <button onClick={() => setActiveTab("Resolved")}
              className={`px-4 py-1.5 text-xs font-bold rounded-sm transition-colors whitespace-nowrap ${activeTab === "Resolved" ? "bg-success text-white shadow-sm" : "text-text-secondary hover:text-success"}`}>
              Resolved ({resolvedCount})
            </button>
          </div>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2.5 top-2 text-text-secondary" />
            <input type="text" placeholder="Search Flag ID, Vendor..." value={search}
              onChange={(e) => setSearch(e.target.value)} className="enterprise-input pl-8 w-64" />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-auto bg-surface">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-primary-400" />
            </div>
          ) : (
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="text-[11px] text-text-secondary bg-primary-50/50 sticky top-0 border-b border-border uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3 font-semibold w-24">Flag ID</th>
                  <th className="px-6 py-3 font-semibold w-28 text-center">Severity</th>
                  <th className="px-6 py-3 font-semibold w-40">Flag Type</th>
                  <th className="px-6 py-3 font-semibold">Description</th>
                  <th className="px-6 py-3 font-semibold w-32">Doc Ref.</th>
                  <th className="px-6 py-3 font-semibold w-40">Vendor</th>
                  <th className="px-6 py-3 font-semibold w-28 text-center">Status</th>
                  <th className="px-6 py-3 font-semibold w-24 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((flag) => (
                  <tr key={flag.id} className="hover:bg-primary-50/30 transition-colors">
                    <td className="px-6 py-4 font-mono text-primary-700 font-bold text-xs">{flag.id}</td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-sm border ${getSeverityStyle(flag.severity)}`}>
                        {flag.severity}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="flex items-center gap-1.5 text-xs font-medium text-text-primary">
                        {getTypeIcon(flag.type)} {flag.type}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-text-secondary truncate max-w-[250px]" title={flag.description}>
                      {flag.description}
                    </td>
                    <td className="px-6 py-4 font-mono text-xs font-bold text-primary-900">{flag.docRef}</td>
                    <td className="px-6 py-4 text-xs font-medium text-text-primary truncate max-w-[150px]">{flag.vendorName}</td>
                    <td className="px-6 py-4 text-center">
                      {flag.status === "RESOLVED" ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-success">
                          <CheckCircle2 className="w-3 h-3" /> Resolved
                        </span>
                      ) : flag.status === "IN_REVIEW" ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-warning-800">
                          <MessageSquare className="w-3 h-3" /> In Review
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-danger uppercase tracking-wider">Open</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button className="p-1.5 text-text-secondary hover:text-primary-900 hover:bg-primary-50 rounded-sm transition-colors">
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-text-secondary">
                      <CheckCircle2 className="w-8 h-8 mx-auto text-success mb-2" />
                      <p>No flags found in this category.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="mt-8 space-y-2">
        <div className="bg-primary-50 border border-primary-200 text-primary-700 text-[11px] font-bold tracking-wide uppercase p-2 rounded-sm flex items-center justify-center text-center">
          ⚑ Audit: All dispute resolutions and manual overrides are logged and require justification. — SOP §10.2
        </div>
      </div>
    </div>
  );
}
