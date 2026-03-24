"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Flag,
  Search,
  AlertTriangle,
  Scale,
  ShieldAlert,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  MessageSquare,
  Loader2,
  XCircle,
} from "lucide-react";
import { fmtDate } from "@/lib/utils";
import { useCurrentUser } from "@/components/auth/AuthProvider";

type FlagSeverity = "High" | "Medium" | "Low";
type FlagStatus   = "OPEN" | "IN_REVIEW" | "RESOLVED";

interface FlagRow {
  id: string;
  date: string;
  type: string;
  docRef: string;
  vendorName: string;
  description: string;
  status: FlagStatus;
  severity: FlagSeverity;
  source: string;
}

const RESOLVE_ROLES = ["Accounts", "Management", "System_Admin"];

function getSeverityStyle(severity: string) {
  if (severity === "High")   return "bg-danger/10 text-danger border-danger/20";
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
  const router      = useRouter();
  const { user }    = useCurrentUser();
  const canResolve  = RESOLVE_ROLES.includes(user?.role ?? "");

  const [flags, setFlags]         = useState<FlagRow[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState("");
  const [activeTab, setActiveTab] = useState<"Open" | "All" | "Resolved">("Open");

  // Resolve panel state
  const [expandedId, setExpandedId]     = useState<string | null>(null);
  const [notes, setNotes]               = useState<Record<string, string>>({});
  const [resolving, setResolving]       = useState<string | null>(null);
  const [resolveError, setResolveError] = useState<Record<string, string>>({});

  useEffect(() => {
    load();
  }, []);

  function load() {
    setLoading(true);
    fetch("/api/flags")
      .then((r) => r.json())
      .then((data) => {
        const rows: Record<string, string>[] = data.flags ?? [];
        setFlags(
          rows.map((r) => ({
            id:          r.FLAG_ID,
            date:        fmtDate(r.DATE),
            type:        r.TYPE,
            docRef:      r.DOC_REF     || "—",
            vendorName:  r.VENDOR_NAME || "—",
            description: r.DESCRIPTION,
            status:      (r.STATUS   ?? "OPEN")   as FlagStatus,
            severity:    (r.SEVERITY ?? "Medium") as FlagSeverity,
            source:      r.SOURCE ?? "",
          }))
        );
      })
      .catch(() => setFlags([]))
      .finally(() => setLoading(false));
  }

  async function handleResolve(flagId: string) {
    if (!user) return;
    const note = notes[flagId]?.trim();
    if (!note) {
      setResolveError((p) => ({ ...p, [flagId]: "Resolution notes are required (SOP §10.2)." }));
      return;
    }
    setResolving(flagId);
    setResolveError((p) => ({ ...p, [flagId]: "" }));
    try {
      const res  = await fetch(`/api/flags/${flagId}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ resolved_by: user.userId, resolution_notes: note }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to resolve flag");
      // Update flag in local state
      setFlags((prev) =>
        prev.map((f) => f.id === flagId ? { ...f, status: "RESOLVED" } : f)
      );
      setExpandedId(null);
    } catch (e) {
      setResolveError((p) => ({ ...p, [flagId]: e instanceof Error ? e.message : "Failed" }));
    } finally {
      setResolving(null);
    }
  }

  const filtered = flags.filter((f) => {
    const matchTab =
      activeTab === "All" ||
      (activeTab === "Open"     && f.status !== "RESOLVED") ||
      (activeTab === "Resolved" && f.status === "RESOLVED");
    const q = search.toLowerCase();
    return (
      matchTab &&
      (!q ||
        f.id.toLowerCase().includes(q) ||
        f.vendorName.toLowerCase().includes(q) ||
        f.type.toLowerCase().includes(q) ||
        f.docRef.toLowerCase().includes(q))
    );
  });

  const openCount     = flags.filter((f) => f.status !== "RESOLVED").length;
  const highCount     = flags.filter((f) => f.severity === "High" && f.status !== "RESOLVED").length;
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
            System-generated flags for Three-Way Match failures, GRN disputes, and compliance alerts.
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
            <input type="text" placeholder="Search Flag ID, Vendor, Doc Ref..." value={search}
              onChange={(e) => setSearch(e.target.value)} className="enterprise-input pl-8 w-64" />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-auto bg-surface divide-y divide-border">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-primary-400" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-6 py-12 text-center text-text-secondary">
              <CheckCircle2 className="w-8 h-8 mx-auto text-success mb-2" />
              <p>No flags found in this category.</p>
            </div>
          ) : (
            filtered.map((flag) => {
              const isExpanded = expandedId === flag.id;
              const isResolved = flag.status === "RESOLVED";
              return (
                <div key={flag.id}>
                  {/* Row */}
                  <div className={`flex items-start gap-4 px-6 py-4 hover:bg-primary-50/20 transition-colors ${isResolved ? "opacity-60" : ""}`}>
                    {/* Severity + type */}
                    <div className="shrink-0 pt-0.5">
                      <span className={`inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-sm border ${getSeverityStyle(flag.severity)}`}>
                        {flag.severity}
                      </span>
                    </div>

                    {/* Main info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span className="font-mono font-bold text-primary-700 text-xs">{flag.id}</span>
                        <span className="flex items-center gap-1 text-xs font-medium text-text-primary">
                          {getTypeIcon(flag.type)} {flag.type}
                        </span>
                        <span className="text-[10px] text-text-secondary">{flag.date}</span>
                      </div>
                      <p className="text-xs text-text-secondary truncate" title={flag.description}>{flag.description}</p>
                      <div className="flex gap-3 mt-1 text-[10px] text-text-secondary">
                        {flag.docRef !== "—" && <span>Doc: <span className="font-mono font-bold text-primary-900">{flag.docRef}</span></span>}
                        {flag.vendorName !== "—" && <span>Vendor: <strong>{flag.vendorName}</strong></span>}
                      </div>
                    </div>

                    {/* Status + action */}
                    <div className="shrink-0 flex items-center gap-2">
                      {isResolved ? (
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

                      <button
                        onClick={() => router.push(`/flags/${flag.id}`)}
                        className="p-1 text-text-secondary hover:text-primary-900 hover:bg-primary-100 rounded-sm transition-colors"
                        title="View flag details"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>

                      {/* Expand to resolve — only for resolvable roles and open flags */}
                      {canResolve && !isResolved && (
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : flag.id)}
                          className="p-1 text-text-secondary hover:text-primary-900 hover:bg-primary-100 rounded-sm transition-colors"
                          title={isExpanded ? "Collapse" : "Resolve this flag"}
                        >
                          {isExpanded
                            ? <ChevronUp className="w-4 h-4" />
                            : <ChevronDown className="w-4 h-4" />}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Resolve panel */}
                  {isExpanded && canResolve && !isResolved && (
                    <div className="px-6 py-4 bg-warning/5 border-t border-warning/20">
                      <p className="text-xs font-bold text-primary-900 mb-2">Resolve Flag — SOP §10.2</p>
                      {resolveError[flag.id] && (
                        <div className="flex items-center gap-2 mb-2 p-2 bg-danger/10 border border-danger/30 rounded-sm text-xs text-danger">
                          <XCircle className="w-3.5 h-3.5 shrink-0" /> {resolveError[flag.id]}
                        </div>
                      )}
                      <div className="flex flex-col sm:flex-row gap-2">
                        <textarea
                          rows={2}
                          value={notes[flag.id] ?? ""}
                          onChange={(e) => setNotes((p) => ({ ...p, [flag.id]: e.target.value }))}
                          placeholder="Enter resolution justification (required — will be written to audit log)…"
                          className="enterprise-input flex-1 resize-none text-xs"
                        />
                        <button
                          onClick={() => handleResolve(flag.id)}
                          disabled={resolving === flag.id}
                          className="shrink-0 inline-flex items-center gap-1.5 text-xs font-bold text-white bg-success hover:bg-success/90 px-4 py-2 rounded-sm transition-colors disabled:opacity-50 self-end"
                        >
                          {resolving === flag.id
                            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Resolving…</>
                            : <><CheckCircle2 className="w-3.5 h-3.5" /> Mark Resolved</>}
                        </button>
                      </div>
                      <p className="text-[10px] text-text-secondary mt-1.5">
                        Resolution will be recorded permanently in the Audit Log.
                      </p>
                    </div>
                  )}
                </div>
              );
            })
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
