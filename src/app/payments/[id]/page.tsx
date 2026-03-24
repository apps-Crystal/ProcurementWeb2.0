"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useParams, useRouter, notFound } from "next/navigation";
import {
  CreditCard, ArrowLeft, Loader2, CheckCircle2, Clock, AlertCircle,
  ShieldAlert, XCircle, Building2, FileText, Package, Receipt,
  ExternalLink, ChevronRight, AlertTriangle, BadgeCheck, Lock,
} from "lucide-react";
import { useCurrentUser } from "@/components/auth/AuthProvider";
import { fmtDate } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type DBStatus =
  | "SUBMITTED" | "PROCUREMENT_VERIFIED" | "ACCOUNTS_VERIFIED"
  | "MANAGEMENT_APPROVED" | "RELEASED" | "HELD" | "REJECTED";

type StageKey = "L1" | "L2" | "L3" | "L4" | "L5";

interface DetailData {
  payment:    Record<string, string>;
  stages:     Record<string, string>[];
  po:         Record<string, string> | null;
  invoice:    Record<string, string> | null;
  grn:        Record<string, string> | null;
  match:      Record<string, string> | null;
  vendor:     Record<string, string> | null;
  subProfile: Record<string, string> | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtAmt(v: string | number | undefined) {
  const n = parseFloat(String(v ?? "0"));
  if (isNaN(n) || !v) return "—";
  return "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const STATUS_LABEL: Record<string, string> = {
  SUBMITTED:            "Submitted",
  PROCUREMENT_VERIFIED: "Procurement Verified",
  ACCOUNTS_VERIFIED:    "Accounts Verified",
  MANAGEMENT_APPROVED:  "Management Approved",
  RELEASED:             "Released",
  HELD:                 "On Hold",
  REJECTED:             "Rejected",
};

const STATUS_COLOR: Record<string, string> = {
  SUBMITTED:            "bg-primary-100 text-primary-700 border-primary-200",
  PROCUREMENT_VERIFIED: "bg-warning/10 text-warning-800 border-warning/30",
  ACCOUNTS_VERIFIED:    "bg-warning/10 text-warning-800 border-warning/30",
  MANAGEMENT_APPROVED:  "bg-success/10 text-success border-success/30",
  RELEASED:             "bg-success/10 text-success border-success/30",
  HELD:                 "bg-danger/10 text-danger border-danger/30",
  REJECTED:             "bg-danger/10 text-danger border-danger/30",
};

const STATUS_TO_STAGE: Record<string, StageKey> = {
  SUBMITTED: "L1", PROCUREMENT_VERIFIED: "L2", ACCOUNTS_VERIFIED: "L3",
  MANAGEMENT_APPROVED: "L4", RELEASED: "L5", HELD: "L1", REJECTED: "L1",
};

// ── Stage Progress Bar ─────────────────────────────────────────────────────────

function StageBar({ status, realStatus }: { status: DBStatus; realStatus?: DBStatus }) {
  const stages: { key: StageKey; label: string }[] = [
    { key: "L1", label: "Submitted" },
    { key: "L2", label: "Proc. Verified" },
    { key: "L3", label: "Accts. Verified" },
    { key: "L4", label: "Mgmt. Approved" },
    { key: "L5", label: "Finance Released" },
  ];
  const current: StageKey = STATUS_TO_STAGE[status] ?? "L1";
  const ci = ["L1","L2","L3","L4","L5"].indexOf(current);
  const actual = realStatus ?? status;
  const isHeld = actual === "HELD";
  const isRej  = actual === "REJECTED";

  return (
    <div className="flex items-center justify-between w-full relative">
      {stages.map(({ key, label }, i) => {
        const ti = i;
        let icon = <Clock className="w-4 h-4" />;
        let cls  = "border-border bg-surface text-text-secondary";
        if (ti < ci) { icon = <CheckCircle2 className="w-4 h-4" />; cls = "border-success bg-success/10 text-success"; }
        else if (ti === ci && !isHeld && !isRej) { icon = <AlertCircle className="w-4 h-4" />; cls = "border-warning bg-warning/10 text-warning-800 ring-2 ring-warning/30"; }
        else if (ti === ci && isHeld) { icon = <AlertTriangle className="w-4 h-4" />; cls = "border-danger bg-danger/10 text-danger ring-2 ring-danger/30"; }
        else if (ti === ci && isRej)  { icon = <XCircle className="w-4 h-4" />; cls = "border-danger bg-danger/10 text-danger ring-2 ring-danger/30"; }
        return (
          <div key={key} className="flex flex-col items-center flex-1 relative">
            {i < 4 && (
              <div className={`absolute top-4 left-1/2 w-full h-[2px] z-0 ${ti < ci ? "bg-success" : "bg-border"}`} />
            )}
            <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center z-10 ${cls}`}>
              {icon}
            </div>
            <span className={`text-[9px] mt-1 uppercase tracking-wider text-center leading-tight ${ti === ci && !isHeld && !isRej ? "font-bold text-warning-800" : ti < ci ? "text-success font-bold" : "text-text-secondary"}`}>
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Full & Final Checklist ────────────────────────────────────────────────────

function FFChecklist({ po }: { po: Record<string, string> | null }) {
  if (!po) return null;
  const items: { field: string; label: string }[] = [
    { field: "FF_ALL_GRNS_CLOSED",         label: "All GRNs closed" },
    { field: "FF_NO_OPEN_FLAGS",            label: "No open flags" },
    { field: "FF_WARRANTY_CONFIRMED",       label: "Warranty confirmed" },
    { field: "FF_ADVANCE_ADJUSTED",         label: "Advance fully adjusted" },
    { field: "FF_NO_PENDING_DEBIT_NOTES",   label: "No pending debit notes" },
    { field: "FF_GST_ITC_CONFIRMED",        label: "GST ITC confirmed" },
    { field: "FF_TDS_CONFIRMED",            label: "TDS correctly deducted" },
    { field: "FF_CHECKLIST_COMPLETE",       label: "Checklist complete" },
  ];
  const allOk = items.every((it) => po[it.field] === "Y");
  return (
    <div className="enterprise-card p-4 border-l-4 border-l-warning space-y-3">
      <div className="flex items-center gap-2">
        <BadgeCheck className="w-4 h-4 text-warning-800" />
        <p className="text-xs font-bold text-primary-900 uppercase tracking-wide">Full & Final Payment Checklist</p>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {items.map((it) => {
          const ok = po[it.field] === "Y";
          return (
            <div key={it.field} className={`flex items-center gap-1.5 text-xs ${ok ? "text-success" : "text-danger"}`}>
              {ok ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <XCircle className="w-3.5 h-3.5 shrink-0" />}
              <span>{it.label}</span>
            </div>
          );
        })}
      </div>
      {!allOk && (
        <p className="text-[10px] text-danger font-bold bg-danger/10 border border-danger/20 rounded-sm px-2 py-1">
          All checklist items must be confirmed before management approval can proceed.
        </p>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function PaymentDetailWrapper() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary-400" /></div>}>
      <PaymentDetailPage />
    </Suspense>
  );
}

function PaymentDetailPage() {
  const { id }   = useParams<{ id: string }>();
  const router   = useRouter();
  const { user } = useCurrentUser();

  const [data, setData]       = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  // Action panel state
  const [utr, setUtr]               = useState("");
  const [paymentMode, setPaymentMode] = useState("");
  const [voucher, setVoucher]       = useState("");
  const [remarks, setRemarks]       = useState("");
  const [advDed, setAdvDed]         = useState("");
  const [crdDed, setCrdDed]         = useState("");
  const [dbtDed, setDbtDed]         = useState("");
  const [tdsDed, setTdsDed]         = useState("");
  const [acting, setActing]         = useState(false);
  const [actionErr, setActionErr]   = useState("");
  const [actionOk, setActionOk]     = useState("");

  const loadData = useCallback(() => {
    if (!id) return;
    setLoading(true);
    setError("");
    fetch(`/api/payments/${id}`)
      .then((r) => { if (r.status === 404) { notFound(); return null; } return r.ok ? r.json() : null; })
      .then((d) => { if (!d) return; if (d.error) { setError(d.error); return; } setData(d); })
      .catch(() => setError("Failed to load payment details."))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { loadData(); }, [loadData]);

  // Pre-populate deduction fields when data loads
  useEffect(() => {
    if (!data) return;
    setAdvDed(data.payment.ADVANCE_DEDUCTION     || "0");
    setCrdDed(data.payment.CREDIT_NOTE_DEDUCTION || "0");
    setDbtDed(data.payment.DEBIT_NOTE_DEDUCTION  || "0");
    setTdsDed(data.payment.TDS_DEDUCTION         || "0");
  }, [data]);

  async function doAction(action: string) {
    if (!user) return;
    setActing(true); setActionErr(""); setActionOk("");
    try {
      const body: Record<string, unknown> = { action, approved_by: user.userId, remarks };
      if (action === "FINANCE_RELEASE") { body.utr_number = utr; body.voucher_number = voucher; body.payment_mode = paymentMode; }
      if (action === "ACCOUNTS_VERIFY") {
        body.advance_deduction = parseFloat(advDed || "0");
        body.credit_note_deduction = parseFloat(crdDed || "0");
        body.debit_note_deduction  = parseFloat(dbtDed || "0");
        body.tds_deduction         = parseFloat(tdsDed || "0");
      }
      const res  = await fetch(`/api/payments/${id}/approve`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      setActionOk(`Action successful — new status: ${json.status}`);
      loadData();
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setActing(false);
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary-400" /></div>;
  }

  if (error || !data) {
    return (
      <div className="max-w-5xl mx-auto space-y-4">
        <button onClick={() => router.back()} className="text-sm text-text-secondary hover:text-primary-900 flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="enterprise-card p-8 text-center">
          <XCircle className="w-10 h-10 mx-auto mb-3 text-danger opacity-40" />
          <p className="text-sm text-text-secondary">{error || "Payment not found."}</p>
        </div>
      </div>
    );
  }

  const { payment, stages, po, invoice, grn, subProfile } = data;
  const status      = payment.STATUS as DBStatus;
  const isMsme      = payment.IS_MSME === "Y";
  const isFinal     = payment.IS_FINAL_PAYMENT === "Y";
  const isTerminal  = status === "RELEASED" || status === "REJECTED";

  const gross  = parseFloat(payment.GROSS_AMOUNT            || "0");
  const adv    = parseFloat(payment.ADVANCE_DEDUCTION        || "0");
  const crd    = parseFloat(payment.CREDIT_NOTE_DEDUCTION   || "0");
  const dbt    = parseFloat(payment.DEBIT_NOTE_DEDUCTION    || "0");
  const tds    = parseFloat(payment.TDS_DEDUCTION           || "0");
  const net    = parseFloat(payment.NET_PAYABLE             || "0");

  // Determine what action panel to show based on role + status
  const role = user?.role ?? "";
  const HOLD_RESUME_ROLES = ["Accounts", "Finance", "Management", "System_Admin"];
  type ActionPanel = "PROCUREMENT" | "ACCOUNTS" | "MANAGEMENT" | "FINANCE" | "HELD" | "NONE";
  let actionPanel: ActionPanel = "NONE";
  if (!isTerminal) {
    if (status === "SUBMITTED"            && role === "Procurement_Team")       actionPanel = "PROCUREMENT";
    if (status === "PROCUREMENT_VERIFIED" && role === "Accounts")               actionPanel = "ACCOUNTS";
    if (status === "ACCOUNTS_VERIFIED"    && role === "Management")             actionPanel = "MANAGEMENT";
    if (status === "MANAGEMENT_APPROVED"  && role === "Finance")                actionPanel = "FINANCE";
    if (status === "HELD"                 && HOLD_RESUME_ROLES.includes(role))  actionPanel = "HELD";
  }

  // For HELD / REJECTED, derive the stage the payment was at before the hold/reject
  // by finding the highest non-empty STAGE_NUMBER in the stage history.
  const STAGE_NUM_TO_STATUS: Record<string, DBStatus> = {
    "1": "SUBMITTED", "2": "PROCUREMENT_VERIFIED",
    "3": "ACCOUNTS_VERIFIED", "4": "MANAGEMENT_APPROVED", "5": "RELEASED",
  };
  let barStatus: DBStatus = status;
  if (status === "HELD" || status === "REJECTED") {
    const formalStages = stages.filter((s) =>
      ["SUBMITTED", "PROCUREMENT_VERIFIED", "ACCOUNTS_VERIFIED", "MANAGEMENT_APPROVED", "RELEASED"].includes(s.ACTION)
    );
    const maxN = formalStages.reduce((mx, s) => Math.max(mx, parseInt(s.STAGE_NUMBER || "0")), 0);
    if (maxN > 0) barStatus = STAGE_NUM_TO_STATUS[String(maxN)] ?? status;
  }

  // FF checklist gate for management
  const ffItems = ["FF_ALL_GRNS_CLOSED","FF_NO_OPEN_FLAGS","FF_WARRANTY_CONFIRMED","FF_ADVANCE_ADJUSTED","FF_NO_PENDING_DEBIT_NOTES","FF_GST_ITC_CONFIRMED","FF_TDS_CONFIRMED","FF_CHECKLIST_COMPLETE"];
  const ffAllOk = !isFinal || !po || ffItems.every((f) => po[f] === "Y");

  // Due-date countdown
  const due     = payment.PAYMENT_DUE_DATE ? new Date(payment.PAYMENT_DUE_DATE) : null;
  const daysLeft = due ? Math.ceil((due.getTime() - Date.now()) / 86_400_000) : null;

  return (
    <div className="space-y-5 max-w-5xl mx-auto pb-20">

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border pb-4">
        <div className="flex items-start gap-3">
          <button onClick={() => router.push("/payments/queue")} className="mt-1 text-text-secondary hover:text-primary-900 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-primary-900 tracking-tight flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-primary-600" /> {payment.PAYMENT_ID}
            </h1>
            <p className="text-xs text-text-secondary mt-0.5">
              {payment.VENDOR_NAME || "—"} · {payment.PAYMENT_TYPE || "Invoice Payment"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isMsme && (
            <span className="inline-flex items-center text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-sm border bg-danger/10 text-danger border-danger/20">
              MSME
            </span>
          )}
          <span className={`inline-flex items-center text-xs font-bold uppercase tracking-wide px-3 py-1 rounded-sm border ${STATUS_COLOR[status] ?? "bg-primary-100 text-primary-700 border-primary-200"}`}>
            {STATUS_LABEL[status] ?? status}
          </span>
        </div>
      </div>

      {/* Hold / Rejected banner */}
      {status === "HELD" && (
        <div className="flex items-center gap-2 p-3 bg-danger/10 border border-danger/30 rounded-sm text-xs text-danger font-bold">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          HELD: {payment.HOLD_REASON || "Payment is on hold. Contact Accounts team."}
        </div>
      )}
      {status === "REJECTED" && (
        <div className="flex items-center gap-2 p-3 bg-danger/10 border border-danger/30 rounded-sm text-xs text-danger font-bold">
          <XCircle className="w-4 h-4 shrink-0" />
          REJECTED — {stages.find((s) => s.ACTION === "REJECTED")?.REMARKS || "No reason provided."}
        </div>
      )}

      {/* Stage progress */}
      <div className="enterprise-card p-6">
        <p className="text-[10px] text-text-secondary uppercase tracking-widest mb-4 font-bold">Approval Progress — SOP §9.2</p>
        <StageBar status={barStatus} realStatus={status} />
      </div>

      {/* Full & Final checklist */}
      {isFinal && <FFChecklist po={po} />}

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Payment Summary */}
        <div className="enterprise-card p-5 space-y-4">
          <p className="text-[10px] text-text-secondary uppercase tracking-widest font-bold">Amount Breakdown</p>

          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-text-secondary">Gross Invoice Amount</span>
              <span className="font-mono font-medium text-primary-900">{fmtAmt(gross)}</span>
            </div>
            {adv > 0 && (
              <div className="flex justify-between text-danger">
                <span>(-) Advance Deduction</span>
                <span className="font-mono font-medium">- {fmtAmt(adv)}</span>
              </div>
            )}
            {crd > 0 && (
              <div className="flex justify-between text-danger">
                <span>(-) Credit Notes</span>
                <span className="font-mono font-medium">- {fmtAmt(crd)}</span>
              </div>
            )}
            {dbt > 0 && (
              <div className="flex justify-between text-warning-800">
                <span>(+) Debit Notes</span>
                <span className="font-mono font-medium">+ {fmtAmt(dbt)}</span>
              </div>
            )}
            {tds > 0 && (
              <div className="flex justify-between text-danger">
                <span>(-) TDS Deduction</span>
                <span className="font-mono font-medium">- {fmtAmt(tds)}</span>
              </div>
            )}
            <div className="border-t border-border pt-2 flex justify-between font-bold text-primary-900">
              <span className="text-base">Net Payable</span>
              <span className="text-xl font-mono text-success">{fmtAmt(net)}</span>
            </div>
          </div>

          {/* Due date */}
          {due && (
            <div className={`flex items-center justify-between text-xs p-2 rounded-sm border ${daysLeft !== null && daysLeft < 0 ? "bg-danger/10 border-danger/20 text-danger" : daysLeft !== null && daysLeft <= 3 ? "bg-warning/10 border-warning/20 text-warning-800" : "bg-surface border-border text-text-secondary"}`}>
              <span className="font-medium">Payment Due Date</span>
              <span className="font-mono font-bold">
                {fmtDate(payment.PAYMENT_DUE_DATE)}
                {daysLeft !== null && (
                  <span className="ml-2">
                    {daysLeft < 0 ? `(${Math.abs(daysLeft)}d overdue)` : daysLeft === 0 ? "(due today)" : `(${daysLeft}d remaining)`}
                  </span>
                )}
              </span>
            </div>
          )}

          {/* Payment mode if released */}
          {status === "RELEASED" && (
            <div className="text-xs space-y-1 p-3 bg-success/5 border border-success/20 rounded-sm">
              <div className="flex justify-between"><span className="text-text-secondary">Payment Mode</span><span className="font-medium">{payment.PAYMENT_MODE || "—"}</span></div>
              <div className="flex justify-between"><span className="text-text-secondary">UTR Number</span><span className="font-mono font-bold">{payment.UTR_NUMBER || "—"}</span></div>
              <div className="flex justify-between"><span className="text-text-secondary">Voucher</span><span className="font-mono">{payment.PAYMENT_VOUCHER_NUMBER || "—"}</span></div>
              <div className="flex justify-between"><span className="text-text-secondary">Released Date</span><span className="font-medium">{fmtDate(payment.PAYMENT_DATE)}</span></div>
            </div>
          )}
        </div>

        {/* References + Bank Details */}
        <div className="space-y-4">

          {/* Document References */}
          <div className="enterprise-card p-4 space-y-2">
            <p className="text-[10px] text-text-secondary uppercase tracking-widest font-bold mb-2">Document References</p>
            {[
              { label: "PO",     value: payment.PO_ID,     href: payment.PO_ID     ? `/po/${payment.PO_ID}`                   : null, icon: <FileText className="w-3.5 h-3.5" /> },
              { label: "GRN",    value: payment.GRN_ID,    href: payment.GRN_ID    ? `/receipts/grn/${payment.GRN_ID}`        : null, icon: <Package className="w-3.5 h-3.5" /> },
              { label: "SRN",    value: payment.SRN_ID,    href: payment.SRN_ID    ? `/receipts/srn`                          : null, icon: <Package className="w-3.5 h-3.5" /> },
              { label: "Non-PO", value: payment.NON_PO_ID, href: null,                                                                icon: <FileText className="w-3.5 h-3.5" /> },
              { label: "Invoice",value: payment.INVOICE_ID,href: null,                                                                icon: <Receipt className="w-3.5 h-3.5" /> },
              { label: "Match",  value: payment.MATCH_ID,  href: payment.MATCH_ID  ? `/invoices/match/${payment.MATCH_ID}`    : null, icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
            ].map((ref) => ref.value ? (
              <div key={ref.label} className="flex items-center justify-between text-xs">
                <span className="text-text-secondary flex items-center gap-1">{ref.icon} {ref.label}</span>
                <span className="font-mono font-bold text-primary-700 flex items-center gap-1">
                  {ref.value}
                  {ref.href && (
                    <a href={ref.href} className="text-primary-400 hover:text-primary-700">
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </span>
              </div>
            ) : null)}
          </div>

          {/* Vendor Bank Details */}
          <div className="enterprise-card p-4 space-y-2">
            <p className="text-[10px] text-text-secondary uppercase tracking-widest font-bold mb-2 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5" /> Vendor Bank Details
            </p>
            <div className="text-xs space-y-1.5">
              <div className="flex justify-between"><span className="text-text-secondary">Bank Name</span><span className="font-medium">{subProfile?.BANK_NAME || "—"}</span></div>
              <div className="flex justify-between"><span className="text-text-secondary">Account No.</span><span className="font-mono font-bold">{subProfile?.ACCOUNT_NUMBER || payment.BANK_ACCOUNT_NUMBER || "—"}</span></div>
              <div className="flex justify-between"><span className="text-text-secondary">IFSC Code</span><span className="font-mono">{subProfile?.IFSC_CODE || payment.IFSC_CODE || "—"}</span></div>
              <div className="flex justify-between"><span className="text-text-secondary">GSTIN</span><span className="font-mono text-[10px]">{subProfile?.GSTIN || "—"}</span></div>
              {invoice && (
                <div className={`flex items-center gap-1 mt-1 text-[10px] font-bold ${subProfile?.GSTIN && invoice.VENDOR_GSTIN && subProfile.GSTIN !== invoice.VENDOR_GSTIN ? "text-danger" : "text-success"}`}>
                  {subProfile?.GSTIN && invoice.VENDOR_GSTIN && subProfile.GSTIN !== invoice.VENDOR_GSTIN
                    ? <><AlertTriangle className="w-3 h-3" /> GSTIN mismatch — flag required</>
                    : <><CheckCircle2 className="w-3 h-3" /> GSTIN verified</>}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Action Panel */}
      {actionPanel !== "NONE" && !actionOk && (
        <div className="enterprise-card p-5 border-t-4 border-t-primary-900 space-y-4">
          <p className="text-xs font-bold text-primary-900 uppercase tracking-wide flex items-center gap-2">
            <Lock className="w-3.5 h-3.5" /> Your Action Required
          </p>

          {actionErr && (
            <div className="flex items-center gap-2 p-3 bg-danger/10 border border-danger/30 rounded-sm text-xs text-danger">
              <XCircle className="w-4 h-4" /> {actionErr}
            </div>
          )}

          {/* ACCOUNTS_VERIFY: editable deductions */}
          {actionPanel === "ACCOUNTS" && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Advance Deduction", val: advDed, set: setAdvDed },
                { label: "Credit Notes",      val: crdDed, set: setCrdDed },
                { label: "Debit Notes",       val: dbtDed, set: setDbtDed },
                { label: "TDS Deduction",     val: tdsDed, set: setTdsDed },
              ].map((f) => (
                <div key={f.label}>
                  <label className="block text-[10px] font-medium text-text-secondary mb-1">{f.label}</label>
                  <input type="number" min="0" className="enterprise-input font-mono text-xs"
                    value={f.val} onChange={(e) => f.set(e.target.value)} />
                </div>
              ))}
              <div className="col-span-2 sm:col-span-4 text-xs text-text-secondary font-medium">
                Net Payable after adjustments: <span className="font-mono font-bold text-success">
                  {fmtAmt(Math.max(0, gross - parseFloat(advDed||"0") - parseFloat(crdDed||"0") - parseFloat(dbtDed||"0") - parseFloat(tdsDed||"0")))}
                </span>
              </div>
            </div>
          )}

          {/* FINANCE_RELEASE: UTR + mode fields */}
          {actionPanel === "FINANCE" && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">UTR Number <span className="text-danger">*</span></label>
                <input type="text" className="enterprise-input font-mono" placeholder="HDFCR52026..." value={utr} onChange={(e) => setUtr(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Payment Mode</label>
                <select className="enterprise-input" value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)}>
                  <option value="">Select…</option>
                  <option>NEFT</option><option>RTGS</option><option>Cheque</option><option>Cash</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Voucher Number</label>
                <input type="text" className="enterprise-input font-mono" placeholder="VCH-..." value={voucher} onChange={(e) => setVoucher(e.target.value)} />
              </div>
            </div>
          )}

          {/* Remarks */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">Remarks</label>
            <textarea rows={2} className="enterprise-input resize-none" placeholder="Add remarks..."
              value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 flex-wrap">
            {actionPanel === "HELD" ? (
              <>
                <button onClick={() => doAction("RESUME_HOLD")} disabled={acting}
                  className="h-9 px-4 bg-success hover:bg-success/80 text-white text-xs font-bold rounded-sm transition-colors disabled:opacity-50 flex items-center gap-1.5">
                  {acting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  Resume Payment
                </button>
                <button onClick={() => doAction("REJECT")} disabled={acting}
                  className="h-9 px-4 border border-danger text-danger hover:bg-danger/10 text-xs font-bold rounded-sm transition-colors disabled:opacity-50">
                  Reject
                </button>
              </>
            ) : (
              <>
                {actionPanel === "PROCUREMENT" && (
                  <button onClick={() => doAction("PROCUREMENT_VERIFY")} disabled={acting}
                    className="h-9 px-4 bg-primary-900 hover:bg-primary-800 text-white text-xs font-bold rounded-sm transition-colors disabled:opacity-50 flex items-center gap-1.5">
                    {acting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    Verify (Procurement)
                  </button>
                )}
                {actionPanel === "ACCOUNTS" && (
                  <button onClick={() => doAction("ACCOUNTS_VERIFY")} disabled={acting}
                    className="h-9 px-4 bg-primary-900 hover:bg-primary-800 text-white text-xs font-bold rounded-sm transition-colors disabled:opacity-50 flex items-center gap-1.5">
                    {acting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    Verify (Accounts)
                  </button>
                )}
                {actionPanel === "MANAGEMENT" && (
                  <button onClick={() => doAction("MANAGEMENT_APPROVE")} disabled={acting || !ffAllOk}
                    className="h-9 px-4 bg-primary-900 hover:bg-primary-800 text-white text-xs font-bold rounded-sm transition-colors disabled:opacity-50 flex items-center gap-1.5">
                    {acting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                    Approve
                  </button>
                )}
                {actionPanel === "FINANCE" && (
                  <button onClick={() => doAction("FINANCE_RELEASE")} disabled={acting || !utr.trim()}
                    className="h-9 px-4 bg-success hover:bg-success/80 text-white text-xs font-bold rounded-sm transition-colors disabled:opacity-50 flex items-center gap-1.5">
                    {acting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    Release Payment
                  </button>
                )}
                <button onClick={() => doAction("HOLD")} disabled={acting}
                  className="h-9 px-3 border border-warning text-warning-800 hover:bg-warning/10 text-xs font-bold rounded-sm transition-colors disabled:opacity-50">
                  Hold
                </button>
                <button onClick={() => doAction("REJECT")} disabled={acting}
                  className="h-9 px-3 border border-danger text-danger hover:bg-danger/10 text-xs font-bold rounded-sm transition-colors disabled:opacity-50">
                  Reject
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {actionOk && (
        <div className="flex items-center gap-2 p-3 bg-success/10 border border-success/30 rounded-sm text-xs text-success font-bold">
          <CheckCircle2 className="w-4 h-4" /> {actionOk}
        </div>
      )}

      {/* Approval History Timeline */}
      <div className="enterprise-card overflow-hidden">
        <div className="bg-primary-50 border-b border-border px-5 py-3">
          <p className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">Approval History</p>
        </div>
        {stages.length === 0 ? (
          <p className="px-5 py-4 text-xs text-text-secondary italic">No approval history yet.</p>
        ) : (
          <div className="divide-y divide-border/60">
            {stages.map((s, i) => {
              const slaBreach = s.SLA_DUE_TIMESTAMP && s.ACTION_TIMESTAMP > s.SLA_DUE_TIMESTAMP;
              return (
                <div key={i} className="px-5 py-4 flex items-start gap-3">
                  <div className="w-7 h-7 rounded-full bg-success/10 border border-success/20 flex items-center justify-center shrink-0 mt-0.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-bold text-primary-900">{s.STAGE_NAME || `Stage ${s.STAGE_NUMBER}`}</p>
                      <span className="text-[10px] text-text-secondary font-mono shrink-0">{fmtDate(s.ACTION_TIMESTAMP)}</span>
                    </div>
                    <p className="text-[11px] text-text-secondary mt-0.5">
                      {s.ACTOR_NAME || s.ACTOR_USER_ID} · <span className="italic">{s.ACTOR_ROLE}</span>
                    </p>
                    {s.REMARKS && <p className="text-xs text-primary-700 mt-1 italic">"{s.REMARKS}"</p>}
                    {slaBreach && (
                      <span className="inline-flex items-center gap-1 text-[9px] font-bold text-danger mt-1">
                        <AlertTriangle className="w-3 h-3" /> SLA Breached
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* GRN / Invoice quick refs */}
      {(grn || invoice) && (
        <div className="enterprise-card p-4">
          <p className="text-[10px] font-bold text-text-secondary uppercase tracking-widest mb-3">Linked Documents</p>
          <div className="flex flex-wrap gap-3 text-xs">
            {invoice?.INVOICE_PDF_URL && (
              <a href={invoice.INVOICE_PDF_URL} target="_blank" rel="noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-50 border border-primary-200 rounded-sm text-primary-700 hover:bg-primary-100 transition-colors">
                <Receipt className="w-3.5 h-3.5" /> Invoice PDF <ExternalLink className="w-3 h-3 opacity-60" />
              </a>
            )}
            {grn && (
              <a href={`/receipts/grn/${payment.GRN_ID}`}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-50 border border-primary-200 rounded-sm text-primary-700 hover:bg-primary-100 transition-colors">
                <Package className="w-3.5 h-3.5" /> GRN {payment.GRN_ID} <ExternalLink className="w-3 h-3 opacity-60" />
              </a>
            )}
            {payment.MATCH_ID && (
              <a href={`/invoices/match/${payment.MATCH_ID}`}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-50 border border-primary-200 rounded-sm text-primary-700 hover:bg-primary-100 transition-colors">
                <ShieldAlert className="w-3.5 h-3.5" /> Match Verification <ExternalLink className="w-3 h-3 opacity-60" />
              </a>
            )}
          </div>
        </div>
      )}

      {/* Audit note */}
      <div className="bg-primary-50 border border-primary-200 text-primary-700 text-[11px] font-bold tracking-wide uppercase p-2 rounded-sm flex items-center justify-center">
        ⚑ All payment actions are logged per SOP §9.2 and §15.1
      </div>
    </div>
  );
}
