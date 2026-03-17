"use client";

import { useEffect, useState } from "react";
import {
  CreditCard,
  Search,
  CheckCircle2,
  Clock,
  AlertCircle,
  ChevronRight,
  ShieldAlert,
  Loader2,
} from "lucide-react";
import { fmtDate } from "@/lib/utils";

type DBStatus =
  | "SUBMITTED"
  | "PROCUREMENT_VERIFIED"
  | "ACCOUNTS_VERIFIED"
  | "MANAGEMENT_APPROVED"
  | "RELEASED"
  | "HELD"
  | "REJECTED";

type StageKey = "L1" | "L2" | "L3" | "L4" | "L5";

interface PaymentRow {
  id: string;
  vendor: string;
  amount: string;
  dueDate: string;
  stage: StageKey;
  isMsme: boolean;
  priority: "High" | "Normal";
  dbStatus: DBStatus;
}

const STATUS_TO_STAGE: Record<string, StageKey> = {
  SUBMITTED: "L1",
  PROCUREMENT_VERIFIED: "L2",
  ACCOUNTS_VERIFIED: "L3",
  MANAGEMENT_APPROVED: "L4",
  RELEASED: "L5",
  HELD: "L1",
  REJECTED: "L1",
};

function computePriority(dueDate: string, isMsme: boolean): "High" | "Normal" {
  if (isMsme) return "High";
  if (!dueDate) return "Normal";
  const due = new Date(dueDate);
  const days = Math.floor((due.getTime() - Date.now()) / 86_400_000);
  return days <= 3 ? "High" : "Normal";
}

export default function PaymentQueue() {
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"pending" | "released">("pending");

  useEffect(() => {
    setLoading(true);
    fetch("/api/payments")
      .then((r) => r.json())
      .then((data) => {
        const rows: Record<string, string>[] = data.payments ?? [];
        const mapped: PaymentRow[] = rows.map((r) => {
          const isMsme = r.IS_MSME === "Y";
          return {
            id: r.PAY_ID,
            vendor: r.VENDOR_NAME || "—",
            amount: r.NET_PAYABLE
              ? `₹${parseFloat(r.NET_PAYABLE).toLocaleString("en-IN")}`
              : "—",
            dueDate: fmtDate(r.PAYMENT_DUE_DATE),
            stage: (STATUS_TO_STAGE[r.STATUS] ?? "L1") as StageKey,
            isMsme,
            priority: computePriority(r.PAYMENT_DUE_DATE, isMsme),
            dbStatus: r.STATUS as DBStatus,
          };
        });
        setPayments(mapped);
      })
      .catch(() => setPayments([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = payments.filter((p) => {
    const isTerminal = p.dbStatus === "RELEASED" || p.dbStatus === "REJECTED";
    const matchTab = activeTab === "pending" ? !isTerminal : isTerminal;
    const q = search.toLowerCase();
    return matchTab && (!q || p.id.toLowerCase().includes(q) || p.vendor.toLowerCase().includes(q));
  });

  const pendingCount = payments.filter(
    (p) => p.dbStatus !== "RELEASED" && p.dbStatus !== "REJECTED"
  ).length;

  const overdueAmount = payments
    .filter((p) => p.priority === "High" && p.dbStatus !== "RELEASED")
    .reduce((sum, p) => sum + (parseFloat(p.amount.replace(/[₹,]/g, "")) || 0), 0);

  const renderStage = (current: StageKey, stage: StageKey, label: string) => {
    const stages: StageKey[] = ["L1", "L2", "L3", "L4", "L5"];
    const ci = stages.indexOf(current);
    const ti = stages.indexOf(stage);
    let cls = "text-text-secondary border-border bg-surface";
    let Icon = Clock;
    if (ti < ci) { cls = "text-success border-success bg-success/10"; Icon = CheckCircle2; }
    else if (ti === ci) { cls = "text-warning border-warning bg-warning/10 font-bold ring-2 ring-warning/30"; Icon = AlertCircle; }
    return (
      <div className="flex flex-col items-center relative" key={stage}>
        <div className={`w-6 h-6 rounded-full border flex items-center justify-center mb-1 z-10 ${cls}`}>
          <Icon className="w-3 h-3" />
        </div>
        <span className={`text-[9px] uppercase tracking-wider ${ti === ci ? "font-bold text-warning-800" : "text-text-secondary"}`}>
          {label}
        </span>
        {ti < 4 && (
          <div className={`absolute top-3 left-6 h-[1px] -z-10 ${ti < ci ? "bg-success" : "bg-border"}`}
            style={{ width: "calc(100% + 2rem)" }} />
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-bold text-primary-900 tracking-tight flex items-center gap-2">
            <CreditCard className="w-6 h-6 text-primary-600" /> Payment Processing Queue
          </h1>
          <p className="text-sm text-text-secondary mt-1">Five-Stage Approval Lifecycle — SOP §9.2</p>
        </div>
        {overdueAmount > 0 && (
          <div className="font-mono text-sm bg-danger/10 text-danger px-3 py-1.5 rounded-sm border border-danger/20 flex items-center gap-2 font-bold shadow-sm">
            <ShieldAlert className="w-4 h-4" />
            ₹{(overdueAmount / 100000).toFixed(1)}L <span className="text-xs font-normal">Priority Release</span>
          </div>
        )}
      </div>

      <div className="enterprise-card flex flex-col min-h-[600px]">
        {/* Toolbar */}
        <div className="p-4 border-b border-border bg-primary-50/30 flex flex-col sm:flex-row justify-between gap-4">
          <div className="flex bg-surface border border-border rounded-sm p-1 shadow-sm">
            <button onClick={() => setActiveTab("pending")}
              className={`px-4 py-1.5 text-xs font-bold rounded-sm transition-colors ${activeTab === "pending" ? "bg-primary-900 text-white shadow-sm" : "text-text-secondary hover:text-primary-900"}`}>
              Pending ({pendingCount})
            </button>
            <button onClick={() => setActiveTab("released")}
              className={`px-4 py-1.5 text-xs font-bold rounded-sm transition-colors ${activeTab === "released" ? "bg-primary-900 text-white shadow-sm" : "text-text-secondary hover:text-primary-900"}`}>
              Released / Rejected
            </button>
          </div>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2.5 top-2 text-text-secondary" />
            <input type="text" placeholder="Search Vendor or ID..." value={search}
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
            <table className="w-full text-sm text-left">
              <thead className="text-[11px] text-text-secondary bg-primary-50/50 sticky top-0 border-b border-border uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3 font-semibold">Payment ID</th>
                  <th className="px-6 py-3 font-semibold">Vendor</th>
                  <th className="px-6 py-3 font-semibold text-right">Net Amount</th>
                  <th className="px-6 py-3 font-semibold text-center">Due Date</th>
                  <th className="px-6 py-3 font-semibold w-[420px]">Approval Progress</th>
                  <th className="px-6 py-3 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((req) => (
                  <tr key={req.id} className="hover:bg-primary-50/30 transition-colors cursor-pointer">
                    <td className="px-6 py-4 font-mono text-primary-700 font-medium">
                      {req.id}
                      {req.priority === "High" && (
                        <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded-sm text-[9px] font-bold bg-danger/10 text-danger border border-danger/20 uppercase tracking-widest">
                          {req.isMsme ? "MSME" : "Urgent"}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 font-medium text-text-primary">{req.vendor}</td>
                    <td className="px-6 py-4 font-mono font-bold text-primary-900 text-right">{req.amount}</td>
                    <td className="px-6 py-4 text-center">
                      <span className={`text-xs font-semibold px-2 py-1 rounded-sm ${req.priority === "High" ? "bg-danger/10 text-danger" : "text-text-secondary"}`}>
                        {req.dueDate}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-between items-center w-full px-4">
                        {renderStage(req.stage, "L1", "Submitted")}
                        {renderStage(req.stage, "L2", "Proc. Verified")}
                        {renderStage(req.stage, "L3", "Accts. Verified")}
                        {renderStage(req.stage, "L4", "Mgmt. Approved")}
                        {renderStage(req.stage, "L5", "Finance Released")}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button className="inline-flex items-center text-xs font-bold text-white bg-primary-600 hover:bg-primary-800 px-3 py-1.5 rounded-sm shadow-sm transition-all">
                        Action <ChevronRight className="w-3 h-3 ml-1" />
                      </button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-text-secondary">
                      <CheckCircle2 className="w-8 h-8 mx-auto text-success mb-2" />
                      <p>No payment requests found.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-border bg-primary-50/30 text-xs text-text-secondary flex justify-between items-center">
          <span>Showing {filtered.length} of {payments.length} payment requests.</span>
          <div className="flex gap-4">
            <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-success" /> Cleared Stage</span>
            <span className="flex items-center gap-1"><AlertCircle className="w-3 h-3 text-warning" /> Pending Stage</span>
          </div>
        </div>
      </div>
    </div>
  );
}
