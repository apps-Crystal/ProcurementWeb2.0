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
} from "lucide-react";
import Link from "next/link";

type POStatus = "Yet to Dispatch" | "In Transit" | "Partially Received";

interface OpenPO {
  id: string;
  issueDate: string;
  vendor: string;
  value: string;
  deadline: string;
  daysRemaining: number;
  status: POStatus;
}

function mapStatus(s: string): POStatus {
  if (s === "ISSUED") return "Yet to Dispatch";
  if (s === "ACKNOWLEDGED") return "In Transit";
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
  const [activeTab, setActiveTab] = useState<"All" | "Critical" | "Transit">("All");
  const [search, setSearch] = useState("");

  useEffect(() => {
    setLoading(true);
    fetch("/api/po")
      .then((r) => r.json())
      .then((data) => {
        const rows: Record<string, string>[] = data.pos ?? [];
        const open = rows
          .filter((r) => ["ISSUED", "ACKNOWLEDGED", "ACCEPTED"].includes(r.STATUS))
          .map((r) => ({
            id: r.PO_ID,
            issueDate: r.PO_DATE ? new Date(r.PO_DATE).toLocaleDateString("en-IN") : "—",
            vendor: r.VENDOR_NAME || "—",
            value: r.PO_TOTAL
              ? `₹${parseFloat(r.PO_TOTAL).toLocaleString("en-IN")}`
              : "—",
            deadline: r.DELIVERY_DATE
              ? new Date(r.DELIVERY_DATE).toLocaleDateString("en-IN")
              : "—",
            daysRemaining: computeDays(r.DELIVERY_DATE),
            status: mapStatus(r.STATUS),
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
      (activeTab === "Transit" && po.status === "In Transit");
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      po.id.toLowerCase().includes(q) ||
      po.vendor.toLowerCase().includes(q);
    return matchTab && matchSearch;
  });

  const criticalCount = pos.filter((p) => p.daysRemaining <= 3).length;
  const transitCount = pos.filter((p) => p.status === "In Transit").length;

  const getStatusIcon = (status: POStatus) => {
    if (status === "Yet to Dispatch") return <Clock className="w-3 h-3" />;
    if (status === "In Transit") return <Truck className="w-3 h-3" />;
    return <PackageCheck className="w-3 h-3" />;
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
                  <th className="px-6 py-3 font-semibold w-32 text-center">Remaining</th>
                  <th className="px-6 py-3 font-semibold w-40">Tracking Status</th>
                  <th className="px-6 py-3 font-semibold w-32 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredPOs.map((po) => (
                  <tr key={po.id} className="hover:bg-primary-50/30 transition-colors group">
                    <td className="px-6 py-4 font-mono text-primary-700 font-bold">{po.id}</td>
                    <td className="px-6 py-4 text-xs font-medium text-text-secondary">{po.issueDate}</td>
                    <td className="px-6 py-4 font-medium text-text-primary truncate max-w-[200px]">{po.vendor}</td>
                    <td className="px-6 py-4 font-mono font-bold text-primary-900 text-right">{po.value}</td>
                    <td className="px-6 py-4 text-xs font-medium text-text-secondary">{po.deadline}</td>
                    <td className="px-6 py-4 text-center">{getDaysBadge(po.daysRemaining)}</td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-1.5 text-xs text-text-secondary font-medium">
                        {getStatusIcon(po.status)} {po.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link
                        href={`/receipts/grn/new?po=${po.id}`}
                        className="inline-flex items-center text-xs font-bold text-white bg-success hover:bg-success/90 px-3 py-1.5 rounded-sm shadow-sm transition-all"
                      >
                        <PackageCheck className="w-3.5 h-3.5 mr-1" /> Create GRN
                      </Link>
                    </td>
                  </tr>
                ))}
                {filteredPOs.length === 0 && !loading && (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-text-secondary">
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
