"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  History,
  Search,
  Download,
  CreditCard,
  Building2,
  Calendar,
  IndianRupee,
  Loader2,
  CheckCircle2,
  XCircle,
  ChevronRight,
} from "lucide-react";
import { fmtDate } from "@/lib/utils";

interface PaymentRecord {
  id: string;
  paymentDate: string;
  vendor: string;
  netPayable: number;
  paymentMode: string;
  utrNumber: string;
  invoiceId: string;
  poId: string;
  dbStatus: "RELEASED" | "REJECTED";
  isMsme: boolean;
}

type PeriodKey = "Month" | "Quarter" | "FY";

function inPeriod(dateStr: string, period: PeriodKey): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  const yr = now.getFullYear();
  const mo = now.getMonth(); // 0-indexed

  if (period === "Month") {
    return d.getFullYear() === yr && d.getMonth() === mo;
  }
  if (period === "Quarter") {
    const qStart = Math.floor(mo / 3) * 3;
    return d.getFullYear() === yr && d.getMonth() >= qStart && d.getMonth() < qStart + 3;
  }
  // FY: Indian financial year Apr–Mar
  const fyStart = mo >= 3 ? yr : yr - 1;
  const fyStartDate = new Date(fyStart, 3, 1);
  const fyEndDate = new Date(fyStart + 1, 2, 31, 23, 59, 59);
  return d >= fyStartDate && d <= fyEndDate;
}

function exportCsv(rows: PaymentRecord[]) {
  const header = ["Payment ID", "Payment Date", "Vendor", "Net Amount", "Mode", "UTR / Ref", "Invoice", "PO", "Status"];
  const lines = rows.map((r) =>
    [
      r.id,
      r.paymentDate,
      `"${r.vendor}"`,
      r.netPayable.toFixed(2),
      r.paymentMode,
      r.utrNumber,
      r.invoiceId,
      r.poId,
      r.dbStatus,
    ].join(",")
  );
  const csv = [header.join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `payment-history-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function getFyLabel(): string {
  const now = new Date();
  const fyStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return `FY ${String(fyStart).slice(2)}-${String(fyStart + 1).slice(2)}`;
}

export default function PaymentHistory() {
  const router = useRouter();
  const [all, setAll] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodKey>("Month");
  const [activeTab, setActiveTab] = useState<"released" | "rejected">("released");
  const [search, setSearch] = useState("");

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch("/api/payments?status=RELEASED").then((r) => r.json()),
      fetch("/api/payments?status=REJECTED").then((r) => r.json()),
    ])
      .then(([rel, rej]) => {
        const map = (rows: Record<string, string>[], status: "RELEASED" | "REJECTED"): PaymentRecord[] =>
          rows.map((r) => ({
            id: r.PAYMENT_ID,
            paymentDate: r.PAYMENT_DATE ?? r.CREATED_DATE ?? "",
            vendor: r.VENDOR_NAME || "—",
            netPayable: parseFloat(r.NET_PAYABLE ?? "0") || 0,
            paymentMode: r.PAYMENT_MODE ?? "—",
            utrNumber: r.UTR_NUMBER ?? "—",
            invoiceId: r.INVOICE_ID ?? "",
            poId: r.PO_ID ?? "",
            dbStatus: status,
            isMsme: r.IS_MSME === "Y",
          }));
        setAll([...map(rel.payments ?? [], "RELEASED"), ...map(rej.payments ?? [], "REJECTED")]);
      })
      .catch(() => setAll([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return all.filter((r) => {
      if (r.dbStatus !== (activeTab === "released" ? "RELEASED" : "REJECTED")) return false;
      if (!inPeriod(r.paymentDate, period)) return false;
      if (q && !r.id.toLowerCase().includes(q) && !r.vendor.toLowerCase().includes(q) && !r.utrNumber.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [all, activeTab, period, search]);

  const stats = useMemo(() => {
    const released = all.filter((r) => r.dbStatus === "RELEASED" && inPeriod(r.paymentDate, period));
    const totalPaid = released.reduce((s, r) => s + r.netPayable, 0);
    const uniqueVendors = new Set(released.map((r) => r.vendor)).size;
    const dates = released.map((r) => r.paymentDate).filter(Boolean).sort();
    const dateRange = dates.length
      ? `${fmtDate(dates[0])} – ${fmtDate(dates[dates.length - 1])}`
      : "—";
    return { totalPaid, txCount: released.length, uniqueVendors, dateRange };
  }, [all, period]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-bold text-primary-900 tracking-tight flex items-center gap-2">
            <History className="w-6 h-6 text-success" />
            Payment History Register
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Completed transactions, UTR numbers, and payment receipts.
          </p>
        </div>
        <button
          onClick={() => exportCsv(filtered)}
          className="h-9 px-4 bg-surface hover:bg-primary-50 text-primary-700 text-sm font-medium rounded-sm border border-primary-200 transition-colors shadow-sm flex items-center gap-2"
        >
          <Download className="w-4 h-4" /> Export CSV
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="enterprise-card p-4 flex items-center gap-4 border-l-4 border-l-success">
          <div className="p-3 bg-success/10 text-success rounded-full">
            <IndianRupee className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-text-secondary font-medium uppercase tracking-wider">Total Paid</p>
            <p className="text-lg font-bold text-primary-900 font-mono mt-0.5">
              ₹{(stats.totalPaid / 100000).toFixed(2)}L
            </p>
          </div>
        </div>
        <div className="enterprise-card p-4 flex items-center gap-4 border-l-4 border-l-warning">
          <div className="p-3 bg-warning/10 text-warning-800 rounded-full">
            <CreditCard className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-text-secondary font-medium uppercase tracking-wider">Transactions</p>
            <p className="text-lg font-bold text-primary-900 font-mono mt-0.5">{stats.txCount}</p>
          </div>
        </div>
        <div className="enterprise-card p-4 flex items-center gap-4 border-l-4 border-l-primary-600">
          <div className="p-3 bg-primary-100 text-primary-700 rounded-full">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-text-secondary font-medium uppercase tracking-wider">Unique Vendors</p>
            <p className="text-lg font-bold text-primary-900 font-mono mt-0.5">{stats.uniqueVendors}</p>
          </div>
        </div>
        <div className="enterprise-card p-4 flex items-center gap-4">
          <div className="p-3 bg-accent-100 text-accent-700 rounded-full">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-text-secondary font-medium uppercase tracking-wider">Date Range</p>
            <p className="text-sm font-bold text-primary-900 mt-1">{stats.dateRange}</p>
          </div>
        </div>
      </div>

      {/* Main */}
      <div className="enterprise-card flex flex-col min-h-[500px]">
        {/* Toolbar */}
        <div className="p-4 border-b border-border bg-primary-50/30 flex flex-col sm:flex-row justify-between gap-4">
          <div className="flex gap-2 flex-wrap">
            {/* Released / Rejected tabs */}
            <div className="flex bg-surface border border-border rounded-sm p-1 shadow-sm">
              <button
                onClick={() => setActiveTab("released")}
                className={`px-4 py-1.5 text-xs font-bold rounded-sm transition-colors ${activeTab === "released" ? "bg-primary-900 text-white shadow-sm" : "text-text-secondary hover:text-primary-900"}`}
              >
                Released
              </button>
              <button
                onClick={() => setActiveTab("rejected")}
                className={`px-4 py-1.5 text-xs font-bold rounded-sm transition-colors ${activeTab === "rejected" ? "bg-primary-900 text-white shadow-sm" : "text-text-secondary hover:text-primary-900"}`}
              >
                Rejected
              </button>
            </div>
            {/* Period filter */}
            <div className="flex bg-surface border border-border rounded-sm p-1 shadow-sm">
              {(["Month", "Quarter", "FY"] as PeriodKey[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-sm transition-colors ${period === p ? "bg-primary-700 text-white shadow-sm" : "text-text-secondary hover:text-primary-900"}`}
                >
                  {p === "FY" ? getFyLabel() : p === "Quarter" ? "This Quarter" : "This Month"}
                </button>
              ))}
            </div>
          </div>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2.5 top-2 text-text-secondary" />
            <input
              type="text"
              placeholder="Search Vendor, ID or UTR..."
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
          ) : (
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="text-[11px] text-text-secondary bg-primary-50/50 sticky top-0 border-b border-border uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3 font-semibold">Payment ID</th>
                  <th className="px-6 py-3 font-semibold">Date</th>
                  <th className="px-6 py-3 font-semibold">Vendor</th>
                  <th className="px-6 py-3 font-semibold text-right">Net Amount</th>
                  <th className="px-6 py-3 font-semibold text-center">Mode</th>
                  <th className="px-6 py-3 font-semibold">UTR / Ref No.</th>
                  <th className="px-6 py-3 font-semibold text-center">Status</th>
                  <th className="px-6 py-3 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((pay) => (
                  <tr
                    key={pay.id}
                    onClick={() => router.push(`/payments/${pay.id}`)}
                    className="hover:bg-primary-50/30 transition-colors cursor-pointer"
                  >
                    <td className="px-6 py-4 font-mono text-primary-700 font-bold">
                      {pay.id}
                      {pay.isMsme && (
                        <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded-sm text-[9px] font-bold bg-warning/10 text-warning-800 border border-warning/20 uppercase tracking-widest">
                          MSME
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-xs font-medium text-text-secondary">
                      {fmtDate(pay.paymentDate)}
                    </td>
                    <td className="px-6 py-4 font-medium text-text-primary">{pay.vendor}</td>
                    <td className="px-6 py-4 font-mono font-bold text-right">
                      <span className={pay.dbStatus === "RELEASED" ? "text-success" : "text-danger"}>
                        ₹{pay.netPayable.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="inline-flex items-center text-[10px] font-bold uppercase tracking-wider bg-surface border border-border px-2 py-0.5 rounded-sm">
                        {pay.paymentMode}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-text-secondary">{pay.utrNumber}</td>
                    <td className="px-6 py-4 text-center">
                      {pay.dbStatus === "RELEASED" ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-success/10 text-success px-2 py-0.5 rounded-sm border border-success/20">
                          <CheckCircle2 className="w-3 h-3" /> Released
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-danger/10 text-danger px-2 py-0.5 rounded-sm border border-danger/20">
                          <XCircle className="w-3 h-3" /> Rejected
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button className="inline-flex items-center text-xs font-bold text-primary-600 hover:text-primary-900 transition-colors">
                        View <ChevronRight className="w-3 h-3 ml-0.5" />
                      </button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-text-secondary">
                      <CheckCircle2 className="w-8 h-8 mx-auto text-success mb-2" />
                      <p>No records found for the selected period.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-border bg-primary-50/30 text-xs text-text-secondary flex justify-between items-center">
          <span>Showing {filtered.length} of {all.filter((r) => r.dbStatus === (activeTab === "released" ? "RELEASED" : "REJECTED")).length} records.</span>
          <span className="text-[10px] uppercase tracking-wider font-medium">SOP §9.2 — Payment Lifecycle</span>
        </div>
      </div>
    </div>
  );
}
