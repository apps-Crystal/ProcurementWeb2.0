"use client";

import { useEffect, useState } from "react";
import {
  ShoppingCart,
  Search,
  PackageCheck,
  Clock,
  Truck,
  AlertCircle,
  AlertTriangle,
  Loader2,
  Send,
  FileEdit,
} from "lucide-react";
import Link from "next/link";
import { fmtDate } from "@/lib/utils";

type POStatus = "Yet to Dispatch" | "In Transit" | "Partially Received" | "Amendment Pending";

interface OpenPO {
  id: string;
  issueDate: string;
  vendor: string;
  value: string;
  deadline: string;
  daysRemaining: number;
  status: POStatus;
  rawStatus: string;
  version: string;
}

function mapStatus(s: string): POStatus {
  if (s === "ISSUED") return "Yet to Dispatch";
  if (s === "ACKNOWLEDGED") return "In Transit";
  if (s === "AMENDMENT_PENDING") return "Amendment Pending";
  return "Partially Received";
}

function computeDays(deliveryDate: string): number {
  if (!deliveryDate) return 9999;
  const due = new Date(deliveryDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.floor((due.getTime() - today.getTime()) / 86_400_000);
}

export default function OpenPOList() {
  const [pos, setPOs] = useState<OpenPO[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"All" | "Critical" | "Transit" | "Amendment">("All");
  const [search, setSearch] = useState("");
  const [reissuingId, setReissuingId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch("/api/po")
      .then((r) => r.json())
      .then((data) => {
        const rows: Record<string, string>[] = data.pos ?? [];
        const open = rows
          .filter((r) => ["ISSUED", "ACKNOWLEDGED", "ACCEPTED", "AMENDMENT_PENDING"].includes(r.STATUS))
          .map((r) => ({
            id:            r.PO_ID,
            issueDate:     fmtDate(r.PO_DATE),
            vendor:        r.VENDOR_NAME || "—",
            value:         r.GRAND_TOTAL
              ? `₹${parseFloat(r.GRAND_TOTAL).toLocaleString("en-IN")}`
              : "—",
            deadline:      fmtDate(r.DELIVERY_DATE),
            daysRemaining: computeDays(r.DELIVERY_DATE),
            status:        mapStatus(r.STATUS),
            rawStatus:     r.STATUS,
            version:       r.PO_VERSION || "1",
          }));
        setPOs(open);
      })
      .catch(() => setPOs([]))
      .finally(() => setLoading(false));
  }, []);

  const filteredPOs = pos.filter((po) => {
    const matchTab =
      activeTab === "All" ||
      (activeTab === "Critical" && po.daysRemaining <= 3) ||
      (activeTab === "Transit" && po.status === "In Transit") ||
      (activeTab === "Amendment" && po.rawStatus === "AMENDMENT_PENDING");
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      po.id.toLowerCase().includes(q) ||
      po.vendor.toLowerCase().includes(q);
    return matchTab && matchSearch;
  });

  const criticalCount   = pos.filter((p) => p.daysRemaining <= 3).length;
  const transitCount    = pos.filter((p) => p.status === "In Transit").length;
  const amendmentCount  = pos.filter((p) => p.rawStatus === "AMENDMENT_PENDING").length;

  async function handleReissue(id: string) {
    if (!confirm(`Re-issue PO ${id} (v${pos.find(p => p.id === id)?.version}) to vendor?\n\nThis sets status back to ISSUED and vendor must re-acknowledge.`)) return;
    setReissuingId(id);
    try {
      const res = await fetch(`/api/po/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "RE_ISSUE", updated_by: "PROCUREMENT" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Re-issue failed");
      setPOs(prev => prev.map(p => p.id !== id ? p : { ...p, rawStatus: "ISSUED", status: "Yet to Dispatch" }));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Re-issue failed");
    } finally {
      setReissuingId(null);
    }
  }

  const getStatusIcon = (status: POStatus) => {
    if (status === "Yet to Dispatch") return <Clock className="w-3 h-3" />;
    if (status === "In Transit") return <Truck className="w-3 h-3" />;
    if (status === "Amendment Pending") return <FileEdit className="w-3 h-3" />;
    return <PackageCheck className="w-3 h-3" />;
  };

  const getStatusBadge = (po: OpenPO) => {
    const base = "inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-sm border";
    if (po.rawStatus === "AMENDMENT_PENDING")
      return <span className={`${base} bg-warning/10 text-warning-800 border-warning/30`}><FileEdit className="w-3 h-3" /> Amend Pending v{po.version}</span>;
    if (po.status === "Yet to Dispatch")
      return <span className={`${base} bg-primary-50 text-primary-700 border-primary-200`}><Clock className="w-3 h-3" /> Yet to Dispatch</span>;
    if (po.status === "In Transit")
      return <span className={`${base} bg-success/10 text-success border-success/20`}><Truck className="w-3 h-3" /> In Transit</span>;
    return <span className={`${base} bg-surface text-text-secondary border-border`}><PackageCheck className="w-3 h-3" /> Partially Received</span>;
  };

  const getDaysBadge = (days: number) => {
    if (days < 0)
      return (
        <span className="inline-flex items-center gap-1 font-mono text-[10px] bg-danger/10 text-danger border border-danger/20 px-2 py-0.5 rounded-sm font-bold uppercase tracking-wider">
          <AlertCircle className="w-3 h-3" /> Overdue by {Math.abs(days)}d
        </span>
      );
    if (days <= 3)
      return (
        <span className="inline-flex items-center gap-1 font-mono text-[10px] bg-warning/10 text-warning-800 border border-warning/20 px-2 py-0.5 rounded-sm font-bold uppercase tracking-wider">
          <AlertTriangle className="w-3 h-3" /> {days}d left
        </span>
      );
    return (
      <span className="inline-flex items-center gap-1 font-mono text-[10px] bg-surface text-text-secondary border border-border px-2 py-0.5 rounded-sm font-medium uppercase tracking-wider">
        {days}d left
      </span>
    );
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-bold text-primary-900 tracking-tight flex items-center gap-2">
            <ShoppingCart className="w-6 h-6 text-primary-600" />
            Open Purchase Orders
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Track unfulfilled orders and manage expected deliveries.
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="enterprise-card flex flex-col min-h-[600px]">
        {/* Toolbar */}
        <div className="p-4 border-b border-border bg-primary-50/30 flex flex-col sm:flex-row justify-between gap-4">
          {/* Tabs */}
          <div className="flex bg-surface border border-border rounded-sm p-1 shadow-sm overflow-x-auto">
            <button
              onClick={() => setActiveTab("All")}
              className={`px-4 py-1.5 text-xs font-bold rounded-sm transition-colors whitespace-nowrap ${activeTab === "All" ? "bg-primary-900 text-white shadow-sm" : "text-text-secondary hover:text-primary-900"}`}
            >
              All Open ({pos.length})
            </button>
            <button
              onClick={() => setActiveTab("Critical")}
              className={`px-4 py-1.5 text-xs font-bold rounded-sm transition-colors whitespace-nowrap ${activeTab === "Critical" ? "bg-danger text-white shadow-sm" : "text-danger hover:text-danger/80"}`}
            >
              Critical / Overdue ({criticalCount})
            </button>
            <button
              onClick={() => setActiveTab("Transit")}
              className={`px-4 py-1.5 text-xs font-bold rounded-sm transition-colors whitespace-nowrap ${activeTab === "Transit" ? "bg-warning-700 text-white shadow-sm" : "text-warning-800 hover:text-warning-900"}`}
            >
              In Transit ({transitCount})
            </button>
            {amendmentCount > 0 && (
              <button
                onClick={() => setActiveTab("Amendment")}
                className={`px-4 py-1.5 text-xs font-bold rounded-sm transition-colors whitespace-nowrap flex items-center gap-1 ${activeTab === "Amendment" ? "bg-warning text-white shadow-sm" : "text-warning-800 hover:text-warning-900"}`}
              >
                <FileEdit className="w-3 h-3" /> Amend Pending ({amendmentCount})
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2.5 top-2 text-text-secondary" />
              <input
                type="text"
                placeholder="Search Vendor or PO No..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="enterprise-input pl-8 w-64"
              />
            </div>
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
                  <th className="px-6 py-3 font-semibold w-32">PO ID</th>
                  <th className="px-6 py-3 font-semibold w-28">Issue Date</th>
                  <th className="px-6 py-3 font-semibold">Vendor</th>
                  <th className="px-6 py-3 font-semibold text-right">PO Value</th>
                  <th className="px-6 py-3 font-semibold w-32">Delivery DL.</th>
                  <th className="px-6 py-3 font-semibold w-40 text-center">Status</th>
                  <th className="px-4 py-3 font-semibold w-48 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredPOs.map((po) => (
                  <tr key={po.id} className={`hover:bg-primary-50/30 transition-colors group ${po.rawStatus === "AMENDMENT_PENDING" ? "bg-warning/5" : ""}`}>
                    <td className="px-6 py-4 font-mono text-primary-700 font-bold">{po.id}</td>
                    <td className="px-6 py-4 text-xs font-medium text-text-secondary">{po.issueDate}</td>
                    <td className="px-6 py-4 font-medium text-text-primary truncate max-w-[200px]">{po.vendor}</td>
                    <td className="px-6 py-4 font-mono font-bold text-primary-900 text-right">{po.value}</td>
                    <td className="px-6 py-4 text-xs font-medium text-text-secondary">{po.deadline}</td>
                    <td className="px-6 py-4 text-center">{getStatusBadge(po)}</td>
                    <td className="px-4 py-3 text-right">
                      {po.rawStatus === "AMENDMENT_PENDING" ? (
                        <div className="flex flex-col items-end gap-1.5">
                          <button
                            onClick={() => handleReissue(po.id)}
                            disabled={reissuingId === po.id}
                            className="inline-flex items-center text-xs font-bold text-white bg-warning hover:bg-warning/90 px-3 py-1.5 rounded-sm shadow-sm transition-all disabled:opacity-50 w-full justify-center"
                          >
                            {reissuingId === po.id
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                              : <Send className="w-3.5 h-3.5 mr-1" />}
                            Re-issue to Vendor
                          </button>
                          <div className="flex items-center gap-1.5">
                            <Link
                              href={`/po/${po.id}/amend?po=${po.id}`}
                              className="inline-flex items-center text-[10px] font-bold text-warning-800 bg-warning/10 hover:bg-warning/20 border border-warning/30 px-2 py-1 rounded-sm transition-all"
                            >
                              <FileEdit className="w-3 h-3 mr-1" /> Edit Amend
                            </Link>
                            <a
                              href={`/po/${po.id}/print`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center text-[10px] font-bold text-primary-700 bg-primary-50 hover:bg-primary-100 border border-primary-200 px-2 py-1 rounded-sm transition-all"
                            >
                              ⬇ PDF
                            </a>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-2">
                          <a
                            href={`/po/${po.id}/print`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center text-xs font-bold text-primary-700 bg-primary-50 hover:bg-primary-100 border border-primary-200 px-2.5 py-1.5 rounded-sm transition-all"
                            title="View / Download PO as PDF"
                          >
                            ⬇ PDF
                          </a>
                          <Link
                            href={`/receipts/grn/new?po=${po.id}`}
                            className="inline-flex items-center text-xs font-bold text-white bg-success hover:bg-success/90 px-3 py-1.5 rounded-sm shadow-sm transition-all"
                          >
                            <PackageCheck className="w-3.5 h-3.5 mr-1" /> Create GRN
                          </Link>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {filteredPOs.length === 0 && !loading && (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-text-secondary">
                      <AlertCircle className="w-8 h-8 mx-auto text-primary-200 mb-2" />
                      <p>No open purchase orders found in this view.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-border bg-primary-50/30 text-xs text-text-secondary flex justify-between items-center">
          <span>Showing {filteredPOs.length} of {pos.length} open POs.</span>
        </div>
      </div>
    </div>
  );
}
 