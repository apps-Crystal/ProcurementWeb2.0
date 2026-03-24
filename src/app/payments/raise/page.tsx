"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CreditCard,
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
  Loader2,
  XCircle,
  ShieldAlert,
} from "lucide-react";
import { useCurrentUser } from "@/components/auth/AuthProvider";

interface Vendor {
  VENDOR_ID: string;
  COMPANY_NAME: string;
  IS_MSME: string;
}

interface Invoice {
  INV_ID: string;
  VENDOR_ID: string;
  VENDOR_NAME: string;
  TOTAL_PAYABLE: string;
  PO_ID: string;
  GRN_ID: string;
  STATUS: string;
}

const ALLOWED_ROLES = ["Accounts", "Finance", "System_Admin"];

export default function RaisePaymentPage() {
  const router = useRouter();
  const { user } = useCurrentUser();

  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loadingVendors, setLoadingVendors] = useState(true);

  // Form fields
  const [vendorId, setVendorId] = useState("");
  const [invId, setInvId] = useState("");
  const [poId, setPoId] = useState("");
  const [grnId, setGrnId] = useState("");
  const [grossAmount, setGrossAmount] = useState("");
  const [tdsAmount, setTdsAmount] = useState("0");
  const [advancePaid, setAdvancePaid] = useState("0");
  const [creditNotes, setCreditNotes] = useState("0");
  const [debitNotes, setDebitNotes] = useState("0");
  const [paymentType, setPaymentType] = useState("Manual");
  const [paymentDueDate, setPaymentDueDate] = useState("");
  const [isMsme, setIsMsme] = useState(false);
  const [remarks, setRemarks] = useState("");

  const [matchId, setMatchId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/vendors").then((r) => r.json()),
      fetch("/api/invoices").then((r) => r.json()),
    ])
      .then(([vData, iData]) => {
        setVendors(vData.vendors ?? []);
        setInvoices((iData.invoices ?? []).filter((i: Invoice) => i.STATUS !== "PAID"));
      })
      .catch(() => {})
      .finally(() => setLoadingVendors(false));
  }, []);

  // Auto-fill from selected invoice
  async function handleInvoiceSelect(id: string) {
    setInvId(id);
    setMatchId("");
    if (!id) return;
    const inv = invoices.find((i) => i.INV_ID === id);
    if (!inv) return;
    setVendorId(inv.VENDOR_ID);
    setGrossAmount(inv.TOTAL_PAYABLE ?? "");
    setPoId(inv.PO_ID ?? "");
    setGrnId(inv.GRN_ID ?? "");
    // Auto-set MSME flag from vendor
    const v = vendors.find((v) => v.VENDOR_ID === inv.VENDOR_ID);
    setIsMsme(v?.IS_MSME === "Y");
    // Look up MATCH_ID if this invoice has a three-way match record
    try {
      const res = await fetch(`/api/match?inv_id=${id}`);
      if (res.ok) {
        const data = await res.json();
        setMatchId(data.match?.MATCH_ID ?? "");
      }
    } catch { /* non-critical — proceed without match_id */ }
  }

  // Auto-set MSME when vendor changes
  function handleVendorSelect(id: string) {
    setVendorId(id);
    const v = vendors.find((v) => v.VENDOR_ID === id);
    setIsMsme(v?.IS_MSME === "Y");
  }

  const gross = parseFloat(grossAmount || "0") || 0;
  const tds = parseFloat(tdsAmount || "0") || 0;
  const advance = parseFloat(advancePaid || "0") || 0;
  const credit = parseFloat(creditNotes || "0") || 0;
  const debit = parseFloat(debitNotes || "0") || 0;
  const netPayable = gross - advance - credit - debit - tds;

  const isAllowed = ALLOWED_ROLES.includes(user?.role ?? "");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!vendorId || !grossAmount) {
      setError("Vendor and gross amount are required.");
      return;
    }
    if (netPayable < 0) {
      setError("Net payable cannot be negative. Check deductions.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inv_id: invId,
          po_id: poId,
          grn_id: grnId,
          match_id: matchId,
          vendor_id: vendorId,
          vendor_name: vendors.find((v) => v.VENDOR_ID === vendorId)?.COMPANY_NAME ?? "",
          gross_amount: gross,
          tds_amount: tds,
          advance_paid: advance,
          credit_notes: credit,
          debit_notes: debit,
          payment_type: paymentType,
          payment_due_date: paymentDueDate || undefined,
          is_msme: isMsme ? "Y" : "N",
          created_by: user?.userId,
          remarks,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to create payment");
      setSuccess(`Payment ${json.pay_id} created successfully.`);
      setTimeout(() => router.push(`/payments/${json.pay_id}`), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create payment");
    } finally {
      setSubmitting(false);
    }
  }

  if (!isAllowed) {
    return (
      <div className="max-w-xl mx-auto py-20 text-center">
        <ShieldAlert className="w-10 h-10 text-danger mx-auto mb-3" />
        <h2 className="text-lg font-bold text-primary-900 mb-1">Access Restricted</h2>
        <p className="text-sm text-text-secondary">
          Only Accounts and Finance roles may raise manual payments. — SOP §9.2
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-20">
      {/* Header */}
      <div className="flex items-start gap-3 border-b border-border pb-4">
        <button
          onClick={() => router.back()}
          className="mt-1 p-1.5 rounded-sm text-text-secondary hover:text-primary-900 hover:bg-primary-50 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-primary-900 tracking-tight flex items-center gap-2">
            <CreditCard className="w-6 h-6 text-primary-600" /> Raise Manual Payment
          </h1>
          <p className="text-sm text-text-secondary mt-0.5">
            Create a payment entry for Accounts verification — SOP §9.2
          </p>
        </div>
      </div>

      {/* MSME alert */}
      {isMsme && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-warning/10 border border-warning/30 rounded-sm text-xs font-bold text-warning-800">
          <AlertCircle className="w-4 h-4 shrink-0" />
          MSME Vendor — Payment must be released within 45 days (MSMED Act). High priority flag will be set automatically.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Alerts */}
        {error && (
          <div className="flex items-center gap-2 p-3 bg-danger/10 border border-danger/30 rounded-sm text-sm text-danger">
            <XCircle className="w-4 h-4 shrink-0" /> {error}
          </div>
        )}
        {success && (
          <div className="flex items-center gap-2 p-3 bg-success/10 border border-success/30 rounded-sm text-sm text-success">
            <CheckCircle2 className="w-4 h-4 shrink-0" /> {success}
          </div>
        )}

        {/* Section: Link Invoice (optional) */}
        <div className="enterprise-card p-5 space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-text-secondary">
            Link Invoice (Optional)
          </h2>
          <div>
            <label className="block text-xs font-semibold text-text-secondary mb-1">
              Invoice ID
            </label>
            {loadingVendors ? (
              <div className="enterprise-input flex items-center gap-2 text-text-secondary text-xs">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
              </div>
            ) : (
              <select
                value={invId}
                onChange={(e) => handleInvoiceSelect(e.target.value)}
                className="enterprise-input"
              >
                <option value="">— Select Invoice (auto-fills vendor &amp; amount) —</option>
                {invoices.map((i) => (
                  <option key={i.INV_ID} value={i.INV_ID}>
                    {i.INV_ID} — {i.VENDOR_NAME} — ₹{parseFloat(i.TOTAL_PAYABLE || "0").toLocaleString("en-IN")}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Section: Vendor & Document */}
        <div className="enterprise-card p-5 space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-text-secondary">
            Vendor &amp; Documents
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1">
                Vendor <span className="text-danger">*</span>
              </label>
              <select
                value={vendorId}
                onChange={(e) => handleVendorSelect(e.target.value)}
                className="enterprise-input"
                required
              >
                <option value="">— Select Vendor —</option>
                {vendors.map((v) => (
                  <option key={v.VENDOR_ID} value={v.VENDOR_ID}>
                    {v.COMPANY_NAME} {v.IS_MSME === "Y" ? "(MSME)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1">
                Payment Type
              </label>
              <select
                value={paymentType}
                onChange={(e) => setPaymentType(e.target.value)}
                className="enterprise-input"
              >
                <option value="Manual">Manual</option>
                <option value="Advance">Advance</option>
                <option value="Milestone">Milestone</option>
                <option value="Final">Final &amp; Full</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1">PO ID</label>
              <input
                type="text"
                value={poId}
                onChange={(e) => setPoId(e.target.value)}
                placeholder="PO-XXXX-XXXX"
                className="enterprise-input"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1">GRN / SRN ID</label>
              <input
                type="text"
                value={grnId}
                onChange={(e) => setGrnId(e.target.value)}
                placeholder="GRN-XXXX-XXXX"
                className="enterprise-input"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1">
                Payment Due Date
              </label>
              <input
                type="date"
                value={paymentDueDate}
                onChange={(e) => setPaymentDueDate(e.target.value)}
                className="enterprise-input"
              />
            </div>
            <div className="flex items-center gap-2 mt-5">
              <input
                id="isMsme"
                type="checkbox"
                checked={isMsme}
                onChange={(e) => setIsMsme(e.target.checked)}
                className="h-4 w-4 rounded border-border text-primary-600 focus:ring-primary-500"
              />
              <label htmlFor="isMsme" className="text-xs font-semibold text-text-secondary cursor-pointer">
                MSME Vendor (45-day rule applies)
              </label>
            </div>
          </div>
        </div>

        {/* Section: Amount */}
        <div className="enterprise-card p-5 space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-text-secondary">
            Amount Breakdown
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1">
                Gross Invoice Amount (₹) <span className="text-danger">*</span>
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={grossAmount}
                onChange={(e) => setGrossAmount(e.target.value)}
                placeholder="0.00"
                className="enterprise-input font-mono"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1">
                TDS Deduction (₹)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={tdsAmount}
                onChange={(e) => setTdsAmount(e.target.value)}
                className="enterprise-input font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1">
                Advance Already Paid (₹)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={advancePaid}
                onChange={(e) => setAdvancePaid(e.target.value)}
                className="enterprise-input font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1">
                Credit Note Deductions (₹)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={creditNotes}
                onChange={(e) => setCreditNotes(e.target.value)}
                className="enterprise-input font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1">
                Debit Note Deductions (₹)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={debitNotes}
                onChange={(e) => setDebitNotes(e.target.value)}
                className="enterprise-input font-mono"
              />
            </div>
          </div>

          {/* Net payable summary */}
          <div className="bg-primary-50/50 border border-primary-200 rounded-sm p-4 mt-2">
            <div className="flex justify-between text-xs text-text-secondary mb-1">
              <span>Gross Amount</span>
              <span className="font-mono">₹{gross.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
            </div>
            {advance > 0 && (
              <div className="flex justify-between text-xs text-text-secondary mb-1">
                <span>− Advance Paid</span>
                <span className="font-mono text-danger">−₹{advance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
              </div>
            )}
            {credit > 0 && (
              <div className="flex justify-between text-xs text-text-secondary mb-1">
                <span>− Credit Notes</span>
                <span className="font-mono text-danger">−₹{credit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
              </div>
            )}
            {debit > 0 && (
              <div className="flex justify-between text-xs text-text-secondary mb-1">
                <span>− Debit Notes</span>
                <span className="font-mono text-danger">−₹{debit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
              </div>
            )}
            {tds > 0 && (
              <div className="flex justify-between text-xs text-text-secondary mb-1">
                <span>− TDS</span>
                <span className="font-mono text-danger">−₹{tds.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
              </div>
            )}
            <div className="border-t border-primary-200 mt-2 pt-2 flex justify-between text-sm font-bold">
              <span className="text-primary-900">Net Payable</span>
              <span className={`font-mono text-base ${netPayable < 0 ? "text-danger" : "text-success"}`}>
                ₹{netPayable.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>

        {/* Remarks */}
        <div className="enterprise-card p-5">
          <label className="block text-xs font-semibold text-text-secondary mb-1">
            Remarks / Justification
          </label>
          <textarea
            rows={3}
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="Reason for manual payment, reference to PO/GRN, or any notes for the Accounts team…"
            className="enterprise-input resize-none"
          />
        </div>

        {/* Submit */}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="px-5 py-2 text-sm font-medium text-text-secondary border border-border rounded-sm hover:bg-primary-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 px-6 py-2 text-sm font-bold text-white bg-primary-700 hover:bg-primary-900 rounded-sm transition-colors disabled:opacity-60 shadow-sm"
          >
            {submitting
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</>
              : <><CreditCard className="w-4 h-4" /> Submit for Approval</>}
          </button>
        </div>
      </form>
    </div>
  );
}
