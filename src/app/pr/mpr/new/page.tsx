"use client";

import { useState, useRef, useEffect } from "react";
import { useDropdowns, opts } from "@/hooks/useDropdowns";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "@/components/auth/AuthProvider";
import VendorSelect from "@/components/ui/VendorSelect";
import {
  FileText, UploadCloud, Plus, Trash2, AlertTriangle,
  Sparkles, Save, Send, CheckCircle2, Loader2, XCircle,
  Lock, RotateCcw, CalendarClock, ChevronDown, ChevronUp,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────

interface LineItem {
  id: number;
  item_description: string;
  uom: string;
  qty: number;
  rate: number;
  gst_percent: number;
  hsn_code: string;
  item_purpose: string;
  last_purchase_price: number;
  _aiOriginal?: { qty: number; rate: number; gst_percent: number; item_description: string; hsn_code: string; uom: string };
  _aiOverridden?: boolean;
}

interface PaymentTranche {
  id: number;
  tranche_name: string;       // "Advance" | "Running" | "Milestone" | "Final" | custom
  trigger_event: string;      // "PO_ACCEPTANCE" | "GRN_PARTIAL" | "GRN_FINAL" | "MILESTONE" | "INVOICE"
  milestone_tag: string;      // only when trigger = MILESTONE
  percent: number;            // e.g. 30
  due_days_after_trigger: number; // net days
}

const TRIGGER_LABELS: Record<string, string> = {
  PO_ACCEPTANCE: "On PO Acceptance by Vendor",
  GRN_PARTIAL: "On Partial GRN Approval",
  GRN_FINAL: "On Final GRN Approval",
  MILESTONE: "On Milestone Confirmation",
  INVOICE: "On Invoice Verification",
  MANUAL: "Manual (Finance triggered)",
};

const DEFAULT_TRANCHE_NAMES = ["Advance", "Running", "Milestone", "Final", "Custom"];

// ── Component ──────────────────────────────────────────────────────────────

export default function NewMPR() {
  const router = useRouter();
  const { user } = useCurrentUser();
  const CURRENT_USER = {
    id: user?.userId ?? "",
    name: user?.name ?? "",
    site: user?.site ?? "",
  };

  // Header fields
  const [category, setCategory] = useState("");
  const [procurementType, setProcurementType] = useState("Standard");
  const [purpose, setPurpose] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [deliveryLocation, setDeliveryLocation] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");

  const dropdowns = useDropdowns(
    "SITE", "UOM", "MPR_CATEGORY", "PROCUREMENT_TYPE",
    "PAYMENT_TERMS", "GST_PERCENT", "PAYMENT_TRIGGER", "AMC_BILLING_FREQ"
  );

  useEffect(() => {
    const siteOpts = dropdowns["SITE"];
    if (siteOpts?.length) setDeliveryLocation((prev) => prev || siteOpts[0].value);
  }, [dropdowns]);

  // ── Payment Terms ─────────────────────────────────────────────────────────
  const [paymentScheduleType, setPaymentScheduleType] = useState<"Simple" | "Structured">("Simple");
  const [paymentType, setPaymentType] = useState("Standard");
  const [advancePercent, setAdvancePercent] = useState(0);
  const [creditDays, setCreditDays] = useState(30);
  const [retentionAmount, setRetentionAmount] = useState(0);
  const [amcBillingFreq, setAmcBillingFreq] = useState("");

  // ── Structured payment tranches ───────────────────────────────────────────
  const [tranches, setTranches] = useState<PaymentTranche[]>([
    { id: 1, tranche_name: "Advance", trigger_event: "PO_ACCEPTANCE", milestone_tag: "", percent: 30, due_days_after_trigger: 7 },
    { id: 2, tranche_name: "Running", trigger_event: "GRN_PARTIAL", milestone_tag: "", percent: 50, due_days_after_trigger: 15 },
    { id: 3, tranche_name: "Final", trigger_event: "GRN_FINAL", milestone_tag: "", percent: 20, due_days_after_trigger: 30 },
  ]);

  const totalTranchePercent = tranches.reduce((s, t) => s + t.percent, 0);
  const isTrancheValid = totalTranchePercent === 100;

  const addTranche = () => {
    setTranches(prev => [...prev, {
      id: Date.now(),
      tranche_name: "Custom",
      trigger_event: "INVOICE",
      milestone_tag: "",
      percent: 0,
      due_days_after_trigger: 30,
    }]);
  };

  const removeTranche = (id: number) => {
    if (tranches.length > 1) setTranches(prev => prev.filter(t => t.id !== id));
  };

  const updateTranche = (id: number, field: keyof PaymentTranche, value: string | number) => {
    setTranches(prev => prev.map(t => t.id === id ? { ...t, [field]: value } : t));
  };

  // ── Line items ────────────────────────────────────────────────────────────
  const [lines, setLines] = useState<LineItem[]>([{
    id: 1, item_description: "", uom: "Nos", qty: 0,
    rate: 0, gst_percent: 18, hsn_code: "", item_purpose: "", last_purchase_price: 0,
  }]);

  const [quotationFile, setQuotationFile] = useState<File | null>(null);
  const [proformaFile, setProformaFile] = useState<File | null>(null);
  const [supportingFile, setSupportingFile] = useState<File | null>(null);
  const quotationRef = useRef<HTMLInputElement>(null);
  const proformaRef = useRef<HTMLInputElement>(null);
  const supportingRef = useRef<HTMLInputElement>(null);

  const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB (BUG-019)
  function handleFileChange(setter: (f: File | null) => void, file: File | null) {
    if (file && file.size > MAX_FILE_BYTES) {
      setSubmitError(`${file.name}: File size exceeds the 5 MB limit. Please compress or split the file.`);
      return;
    }
    setter(file);
  }

  const [submitting, setSubmitting] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [autoFilling, setAutoFilling] = useState(false);
  const [aiExtracted, setAiExtracted] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");
  const [draftSaved, setDraftSaved] = useState("");

  const addLine = () => setLines([...lines, {
    id: Date.now(), item_description: "", uom: "Nos", qty: 0,
    rate: 0, gst_percent: 18, hsn_code: "", item_purpose: "", last_purchase_price: 0,
  }]);

  const removeLine = (id: number) => {
    if (lines.length > 1) setLines(lines.filter((l) => l.id !== id));
  };

  const updateLine = (id: number, field: keyof LineItem, value: string | number) => {
    setLines(lines.map((l) => {
      if (l.id !== id) return l;
      const updated = { ...l, [field]: value };
      if (updated._aiOriginal) {
        const o = updated._aiOriginal;
        updated._aiOverridden =
          String(updated.qty) !== String(o.qty) ||
          String(updated.rate) !== String(o.rate) ||
          String(updated.gst_percent) !== String(o.gst_percent) ||
          updated.item_description !== o.item_description ||
          updated.hsn_code !== o.hsn_code ||
          updated.uom !== o.uom;
      }
      return updated;
    }));
  };

  const subtotal = lines.reduce((s, l) => s + l.qty * l.rate, 0);
  const totalGst = lines.reduce((s, l) => s + (l.qty * l.rate * l.gst_percent) / 100, 0);
  const grandTotal = subtotal + totalGst;

  // BUG-011: Price deviation alert — lines where rate > last_purchase_price * 1.15
  const deviationLines = lines.filter(
    (l) => l.last_purchase_price > 0 && l.rate > l.last_purchase_price * 1.15
  );

  // ── Auto-fill ─────────────────────────────────────────────────────────────
  const handleAutoFill = async () => {
    if (!quotationFile) { setSubmitError("Upload a Vendor Quotation first to use auto-fill."); return; }
    setAutoFilling(true); setSubmitError("");
    try {
      const fd = new FormData();
      fd.append("file", quotationFile);
      const res = await fetch("/api/invoices/extract-quotation", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const { extracted } = data;
      if (extracted.lines?.length) {
        setLines(extracted.lines.map((l: any, i: number) => {
          const lineData = {
            id: i + 1, item_description: l.description ?? "", uom: l.uom ?? "Nos",
            qty: l.qty ?? 0, rate: l.rate ?? 0, gst_percent: l.gst_percent ?? 18,
            hsn_code: l.hsn_code ?? "", item_purpose: "", last_purchase_price: 0,
          };
          return {
            ...lineData,
            _aiOriginal: { qty: lineData.qty, rate: lineData.rate, gst_percent: lineData.gst_percent, item_description: lineData.item_description, hsn_code: lineData.hsn_code, uom: lineData.uom },
            _aiOverridden: false,
          };
        }));
        setAiExtracted(true);
      } else {
        setSubmitError("AI could not extract line items. Please enter them manually.");
      }
      if (extracted.vendor_name && !vendorName) { setVendorName(extracted.vendor_name); setVendorId(""); }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Auto-fill failed.");
    } finally {
      setAutoFilling(false);
    }
  };

  const handleClearAiExtract = () => {
    setAiExtracted(false);
    setLines([{ id: 1, item_description: "", uom: "Nos", qty: 0, rate: 0, gst_percent: 18, hsn_code: "", item_purpose: "", last_purchase_price: 0 }]);
  };

  // ── Build payload ─────────────────────────────────────────────────────────
  const buildPayload = (draft = false) => ({
    requestor_user_id: CURRENT_USER.id,
    requestor_name: CURRENT_USER.name,
    requestor_site: CURRENT_USER.site,
    category, purpose,
    procurement_type: procurementType,
    delivery_location: deliveryLocation,
    expected_delivery_date: deliveryDate,
    preferred_vendor_id: vendorId,
    preferred_vendor_name: vendorName,
    payment_terms: paymentType,
    payment_schedule_type: paymentScheduleType,
    advance_percent: paymentScheduleType === "Simple" ? advancePercent : 0,
    credit_period_days: creditDays,
    retention_amount: retentionAmount,
    amc_billing_frequency: amcBillingFreq,
    payment_linked_to_milestone: paymentScheduleType === "Structured" ? "Y" : "N",
    // Structured schedule serialised as JSON string for the API
    payment_schedule: paymentScheduleType === "Structured" ? JSON.stringify(tranches) : "",
    lines: lines.map(({ id: _id, _aiOriginal, _aiOverridden, ...l }) => ({
      ...l,
      ai_overridden: _aiOverridden ? "Y" : "",
    })),
    draft,
    ai_extracted: !aiExtracted ? "N" : lines.some(l => l._aiOverridden) ? "OVERRIDDEN" : "Y",
  });

  // ── Save Draft ────────────────────────────────────────────────────────────
  const handleSaveDraft = async () => {
    setSubmitError("");
    // Validate line data even for drafts (if lines are filled in)
    const hasAnyLineData = lines.some(l => l.item_description || l.qty > 0 || l.rate > 0);
    if (hasAnyLineData) {
      const lineErr = validateLines(true); // forDraft=true: HSN not required
      if (lineErr) return setSubmitError(lineErr);
    }
    setSavingDraft(true);
    try {
      const fd = new FormData();
      fd.append("data", JSON.stringify(buildPayload(true)));
      if (quotationFile) fd.append("quotation", quotationFile);
      if (proformaFile) fd.append("proforma", proformaFile);
      if (supportingFile) fd.append("supporting", supportingFile);
      const res = await fetch("/api/pr/mpr", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDraftSaved(data.pr_id);
      setTimeout(() => router.push("/pr/list"), 2000);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to save draft");
    } finally { setSavingDraft(false); }
  };

  // ── Shared line-item validation (mirrors API rules) ───────────────────────
  const VALID_GST_RATES = [0, 5, 12, 18, 28];
  const MAX_QTY  = 1_000_000;
  const MAX_RATE = 100_000_000;

  const validateLines = (forDraft = false): string | null => {
    for (const [i, l] of lines.entries()) {
      const ln = i + 1;
      const desc = (l.item_description ?? "").trim();
      const hsn  = (l.hsn_code ?? "").trim();

      if (desc.length < 3)
        return `Line ${ln}: item description is required (minimum 3 characters).`;

      if (!Number.isFinite(l.qty) || l.qty <= 0)
        return `Line ${ln}: quantity must be a positive number.`;
      if (l.qty > MAX_QTY)
        return `Line ${ln}: quantity exceeds maximum of ${MAX_QTY.toLocaleString("en-IN")}.`;

      if (!Number.isFinite(l.rate) || l.rate <= 0)
        return `Line ${ln}: rate must be a positive number.`;
      if (l.rate > MAX_RATE)
        return `Line ${ln}: rate exceeds maximum of ₹${MAX_RATE.toLocaleString("en-IN")}.`;

      if (Number.isFinite(l.qty) && Number.isFinite(l.rate) && l.qty * l.rate > 1_000_000_000)
        return `Line ${ln}: line total exceeds ₹100 crore limit.`;

      if (!VALID_GST_RATES.includes(l.gst_percent))
        return `Line ${ln}: GST must be 0%, 5%, 12%, 18%, or 28% (got ${l.gst_percent}%).`;

      if (!forDraft && (!hsn || !/^\d{4,8}$/.test(hsn)))
        return `Line ${ln}: HSN/SAC code is required (4–8 digit number).`;
    }
    return null;
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setSubmitError("");
    if (!category) return setSubmitError("Category is required.");
    if (!purpose) return setSubmitError("Purpose / Justification is required.");
    if (!deliveryDate) return setSubmitError("Expected Delivery Date is required.");
    if (!quotationFile) return setSubmitError("Vendor Quotation is mandatory (SOP §5.1).");
    if (!proformaFile) return setSubmitError("Proforma Invoice is mandatory (SOP §5.1).");
    const lineErr = validateLines(false);
    if (lineErr) return setSubmitError(lineErr);
    if (paymentScheduleType === "Structured" && !isTrancheValid)
      return setSubmitError(`Payment schedule tranches must total 100%. Currently: ${totalTranchePercent}%.`);

    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("data", JSON.stringify(buildPayload(false)));
      fd.append("quotation", quotationFile);
      fd.append("proforma", proformaFile);
      if (supportingFile) fd.append("supporting", supportingFile);
      const res = await fetch("/api/pr/mpr", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSubmitSuccess(data.pr_id);
      setTimeout(() => router.push("/pr/list"), 2000);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Submission failed");
    } finally { setSubmitting(false); }
  };

  // ── Success / Draft screens ───────────────────────────────────────────────
  if (draftSaved) return (
    <div className="flex flex-col items-center justify-center h-96 gap-4">
      <Save className="w-16 h-16 text-warning" />
      <h2 className="text-xl font-bold text-primary-900">Draft Saved</h2>
      <p className="text-sm text-text-secondary font-mono">{draftSaved}</p>
      <p className="text-xs text-text-secondary">Redirecting to PR list...</p>
    </div>
  );

  if (submitSuccess) return (
    <div className="flex flex-col items-center justify-center h-96 gap-4">
      <CheckCircle2 className="w-16 h-16 text-success" />
      <h2 className="text-xl font-bold text-primary-900">PR Submitted Successfully</h2>
      <p className="text-sm text-text-secondary font-mono">{submitSuccess}</p>
      <p className="text-xs text-text-secondary">Redirecting to PR list...</p>
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-20">

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-bold text-primary-900 tracking-tight flex items-center gap-2">
            <FileText className="w-6 h-6 text-primary-600" />
            New Material Purchase Request (F1)
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Raise a new request for raw materials, consumables, or equipment.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleSaveDraft} disabled={submitting || savingDraft}
            className="h-9 px-4 bg-surface hover:bg-primary-50 text-primary-700 text-sm font-medium rounded-sm border border-primary-200 transition-colors shadow-sm flex items-center gap-2 disabled:opacity-50">
            {savingDraft ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : <><Save className="w-4 h-4" /> Save Draft</>}
          </button>
          <button onClick={handleSubmit} disabled={submitting}
            className="h-9 px-4 bg-primary-900 hover:bg-primary-800 text-white text-sm font-medium rounded-sm border border-primary-950 transition-colors shadow-sm flex items-center gap-2 disabled:opacity-50">
            {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting...</> : <><Send className="w-4 h-4" /> Submit PR</>}
          </button>
        </div>
      </div>

      {submitError && (
        <div className="flex items-center gap-2 p-3 bg-danger/10 border border-danger/30 rounded-sm text-sm text-danger font-medium">
          <XCircle className="w-4 h-4 shrink-0" /> {submitError}
        </div>
      )}

      {/* BUG-011: Price Deviation Alert Banner */}
      {deviationLines.length > 0 && (
        <div className="flex items-start gap-3 p-4 bg-warning/10 border border-warning/40 rounded-sm">
          <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-bold text-warning">Price Deviation Alert — SOP §6.3</p>
            <p className="text-xs text-text-secondary mt-0.5">
              {deviationLines.length} line item{deviationLines.length > 1 ? "s" : ""} exceed{deviationLines.length === 1 ? "s" : ""} the last purchase price by more than 15%.
              Justification must be provided in the Purpose field before submission.
            </p>
            <ul className="mt-2 space-y-1">
              {deviationLines.map((l, i) => {
                const dev = ((l.rate - l.last_purchase_price) / l.last_purchase_price * 100).toFixed(1);
                return (
                  <li key={i} className="text-xs font-medium text-warning/90">
                    • {l.item_description || `Line ${lines.indexOf(l) + 1}`}: ₹{l.rate.toLocaleString("en-IN")} vs last ₹{l.last_purchase_price.toLocaleString("en-IN")} (+{dev}%)
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">

        {/* ── LEFT COLUMN ──────────────────────────────────────────────── */}
        <div className="xl:col-span-1 space-y-6">

          {/* PR Header Card */}
          <div className="enterprise-card p-4 space-y-4">
            <h2 className="text-sm font-bold text-primary-900 uppercase tracking-wide border-b border-border pb-2">PR Header</h2>
            <div className="space-y-3 bg-primary-50/50 p-3 rounded-sm border border-border/50">
              <div className="flex justify-between items-center">
                <span className="text-xs text-text-secondary">PR ID</span>
                <span className="text-xs font-mono font-bold text-primary-900">Auto-generated</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-text-secondary">Requestor</span>
                <span className="text-xs font-medium text-text-primary">{CURRENT_USER.name}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-text-secondary">Site</span>
                <span className="text-xs font-bold text-primary-700">{CURRENT_USER.site}</span>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              {/* Category */}
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Category <span className="text-danger">*</span></label>
                <select className="enterprise-input" value={category} onChange={(e) => setCategory(e.target.value)}>
                  <option value="">Select Category</option>
                  {opts(dropdowns, "MPR_CATEGORY", [
                    { value: "Raw Material", label: "Raw Material" },
                    { value: "Consumable", label: "Consumable" },
                    { value: "Equipment", label: "Equipment" },
                    { value: "IT", label: "IT / Software" },
                    { value: "Other", label: "Other" },
                  ]).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              {/* Procurement Type */}
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Procurement Type <span className="text-danger">*</span></label>
                <select className="enterprise-input" value={procurementType} onChange={(e) => setProcurementType(e.target.value)}>
                  {opts(dropdowns, "PROCUREMENT_TYPE", [
                    { value: "Standard", label: "Standard" },
                    { value: "Emergency", label: "Emergency" },
                    { value: "Repeat", label: "Repeat" },
                  ]).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              {/* Purpose */}
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Purpose / Justification <span className="text-danger">*</span></label>
                <textarea className="enterprise-input h-20 py-2 resize-none" placeholder="Explain why this purchase is needed..."
                  value={purpose} onChange={(e) => setPurpose(e.target.value)} />
              </div>
              {/* Vendor */}
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Preferred Vendor</label>
                <VendorSelect value={vendorName} onChange={({ vendor_id, vendor_name }) => { setVendorId(vendor_id); setVendorName(vendor_name); }} />
              </div>
              {/* Delivery Location */}
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Delivery Location</label>
                <select className="enterprise-input" value={deliveryLocation} onChange={(e) => setDeliveryLocation(e.target.value)}>
                  {!dropdowns["SITE"]?.length && <option value="">Loading sites...</option>}
                  {opts(dropdowns, "SITE", []).map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              {/* Delivery Date */}
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Expected Delivery Date <span className="text-danger">*</span></label>
                <input type="date" className="enterprise-input" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
              </div>
            </div>

            {/* ── PAYMENT TERMS ─────────────────────────────────────────── */}
            <div className="space-y-3 pt-4 border-t border-border mt-4">
              <h3 className="text-xs font-bold text-primary-900 uppercase flex items-center gap-1.5">
                <CalendarClock className="w-3.5 h-3.5 text-primary-600" />
                Payment Terms
              </h3>

              {/* MSME Banner */}
              <div className="bg-warning/10 border border-warning/20 p-2 rounded-sm flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                <span className="text-[10px] text-warning-800 font-bold uppercase tracking-wider">MSME — 45-day SLA applies</span>
              </div>

              {/* Schedule Type Toggle */}
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Schedule Type <span className="text-danger">*</span></label>
                <div className="grid grid-cols-2 gap-1.5">
                  {(["Simple", "Structured"] as const).map((type) => (
                    <button key={type} type="button"
                      onClick={() => setPaymentScheduleType(type)}
                      className={`h-8 text-xs font-semibold rounded-sm border transition-colors ${paymentScheduleType === type
                          ? "bg-primary-900 text-white border-primary-950"
                          : "bg-surface text-text-secondary border-border hover:bg-primary-50"
                        }`}>
                      {type === "Simple" ? "Simple" : "Structured ✦"}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-text-secondary mt-1">
                  {paymentScheduleType === "Simple"
                    ? "Single advance % + standard credit period."
                    : "Multi-tranche: define % per trigger event (e.g. 30% advance, 50% on GRN, 20% final)."}
                </p>
              </div>

              {/* ── SIMPLE mode fields ─────────────────────────────────── */}
              {paymentScheduleType === "Simple" && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1">Payment Term Type <span className="text-danger">*</span></label>
                    <select className="enterprise-input" value={paymentType} onChange={(e) => setPaymentType(e.target.value)}>
                      {opts(dropdowns, "PAYMENT_TERMS", [
                        { value: "Standard", label: "Standard (30 days from invoice verif.)" },
                        { value: "Advance", label: "Advance" },
                        { value: "Milestone-linked", label: "Milestone-linked" },
                      ]).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  {paymentType === "Advance" && (
                    <div>
                      <label className="block text-xs font-medium text-text-secondary mb-1">Advance % <span className="text-danger">*</span></label>
                      <div className="relative">
                        <input type="number" min="0" max="100" className="enterprise-input pr-8"
                          placeholder="e.g. 30" value={advancePercent || ""}
                          onChange={(e) => setAdvancePercent(Math.min(100, Number(e.target.value)))} />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-secondary font-bold">%</span>
                      </div>
                      {advancePercent > 50 && (
                        <p className="text-[10px] text-warning mt-1 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> Advance &gt;50% requires Management approval.
                        </p>
                      )}
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1">Credit Period (Days)</label>
                    <input type="number" className="enterprise-input" value={creditDays}
                      onChange={(e) => setCreditDays(Number(e.target.value))} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1">Retention Amount (₹)</label>
                    <input type="number" className="enterprise-input" placeholder="If applicable"
                      value={retentionAmount || ""} onChange={(e) => setRetentionAmount(Number(e.target.value))} />
                  </div>
                </div>
              )}

              {/* AMC Billing Frequency (always shown) */}
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">AMC Billing Frequency</label>
                <select className="enterprise-input" value={amcBillingFreq} onChange={(e) => setAmcBillingFreq(e.target.value)}>
                  <option value="">N/A</option>
                  {opts(dropdowns, "AMC_BILLING_FREQ", [
                    { value: "Monthly", label: "Monthly" },
                    { value: "Quarterly", label: "Quarterly" },
                    { value: "Half-Yearly", label: "Half-Yearly" },
                    { value: "Annual", label: "Annual" },
                  ]).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>

              <div className="bg-primary-50 border border-primary-200 text-primary-700 text-[10px] p-2 rounded-sm">
                Payment terms are locked at PR stage. Any variation requires Procurement Head approval.
              </div>
            </div>
          </div>

          {/* Documents Card */}
          <div className="enterprise-card p-4 space-y-4">
            <h2 className="text-sm font-bold text-primary-900 uppercase tracking-wide border-b border-border pb-2">Documents</h2>
            <p className="text-xs text-text-secondary">Mandatory per SOP §5.1. Files saved to Google Drive under PR folder.</p>

            <input ref={quotationRef} type="file" accept=".pdf,.jpg,.png" className="hidden"
              onChange={(e) => handleFileChange(setQuotationFile, e.target.files?.[0] ?? null)} />
            <button onClick={() => quotationRef.current?.click()}
              className={`w-full flex flex-col items-center justify-center p-4 border-2 border-dashed rounded-sm transition-colors cursor-pointer group ${quotationFile ? "border-success bg-success/5" : "border-primary-300 bg-primary-50/30 hover:bg-primary-50"}`}>
              {quotationFile ? <CheckCircle2 className="w-5 h-5 text-success mb-1" /> : <UploadCloud className="w-6 h-6 text-primary-400 group-hover:text-primary-600 mb-2" />}
              <span className="text-xs font-bold text-primary-700">{quotationFile ? quotationFile.name : "Upload Quotation *"}</span>
              {!quotationFile && <span className="text-[10px] text-text-secondary mt-1">PDF up to 5MB</span>}
            </button>

            <input ref={proformaRef} type="file" accept=".pdf,.jpg,.png" className="hidden"
              onChange={(e) => handleFileChange(setProformaFile, e.target.files?.[0] ?? null)} />
            <button onClick={() => proformaRef.current?.click()}
              className={`w-full flex flex-col items-center justify-center p-4 border-2 border-dashed rounded-sm transition-colors cursor-pointer group ${proformaFile ? "border-success bg-success/5" : "border-primary-300 bg-primary-50/30 hover:bg-primary-50"}`}>
              {proformaFile ? <CheckCircle2 className="w-5 h-5 text-success mb-1" /> : <UploadCloud className="w-6 h-6 text-primary-400 group-hover:text-primary-600 mb-2" />}
              <span className="text-xs font-bold text-primary-700">{proformaFile ? proformaFile.name : "Upload Proforma Invoice *"}</span>
              {!proformaFile && <span className="text-[10px] text-text-secondary mt-1">PDF up to 5MB</span>}
            </button>

            <input ref={supportingRef} type="file" accept=".pdf,.jpg,.png" className="hidden"
              onChange={(e) => handleFileChange(setSupportingFile, e.target.files?.[0] ?? null)} />
            <button onClick={() => supportingRef.current?.click()}
              className="w-full flex flex-col items-center justify-center p-3 border border-dashed border-border rounded-sm bg-surface hover:bg-primary-50/30 transition-colors cursor-pointer">
              <span className="text-xs text-text-secondary">{supportingFile ? supportingFile.name : "Supporting Docs (optional)"}</span>
            </button>

            <button onClick={handleAutoFill} disabled={!quotationFile || autoFilling}
              className="w-full h-8 flex items-center justify-center gap-2 bg-gradient-to-r from-accent-600 to-accent-500 hover:from-accent-500 hover:to-accent-400 text-white text-xs font-bold rounded-sm transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">
              {autoFilling ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Extracting...</> : <><Sparkles className="w-3.5 h-3.5" /> Auto-fill from Quotation</>}
            </button>
          </div>
        </div>

        {/* ── RIGHT COLUMN ─────────────────────────────────────────────── */}
        <div className="xl:col-span-3 space-y-6">

          {/* ── STRUCTURED PAYMENT SCHEDULE ────────────────────────────── */}
          {paymentScheduleType === "Structured" && (
            <div className="enterprise-card overflow-hidden">
              <div className="p-4 border-b border-border bg-primary-900 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CalendarClock className="w-4 h-4 text-accent-400" />
                  <h2 className="text-sm font-bold text-white uppercase tracking-wide">Payment Schedule</h2>
                  {/* Live % indicator */}
                  <span className={`ml-2 text-xs font-mono font-bold px-2 py-0.5 rounded-sm ${isTrancheValid ? "bg-success/20 text-green-300" : "bg-danger/20 text-red-300"
                    }`}>
                    {totalTranchePercent}% / 100%
                  </span>
                </div>
                <button onClick={addTranche}
                  className="h-7 px-3 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold rounded-sm border border-white/20 transition-colors flex items-center gap-1">
                  <Plus className="w-3.5 h-3.5" /> Add Tranche
                </button>
              </div>

              {!isTrancheValid && (
                <div className="flex items-center gap-2 px-4 py-2 bg-danger/10 border-b border-danger/20 text-xs text-danger font-medium">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  All tranches must sum to exactly 100%. Currently {totalTranchePercent}% —{" "}
                  {totalTranchePercent < 100 ? `${100 - totalTranchePercent}% unallocated.` : `${totalTranchePercent - 100}% over-allocated.`}
                </div>
              )}

              {isTrancheValid && (
                <div className="flex items-center gap-2 px-4 py-2 bg-success/10 border-b border-success/20 text-xs text-success font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> Schedule totals 100% — valid.
                </div>
              )}

              {/* Tranche rows */}
              <div className="divide-y divide-border">
                {tranches.map((tranche, index) => {
                  const trancheAmount = grandTotal > 0 ? (grandTotal * tranche.percent) / 100 : 0;
                  return (
                    <div key={tranche.id} className="p-4 hover:bg-primary-50/30 transition-colors">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="w-6 h-6 rounded-full bg-primary-900 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                          {index + 1}
                        </span>
                        <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-3">

                          {/* Tranche Name */}
                          <div>
                            <label className="block text-[10px] font-medium text-text-secondary mb-1">Tranche Name</label>
                            <select className="enterprise-input text-xs"
                              value={DEFAULT_TRANCHE_NAMES.includes(tranche.tranche_name) ? tranche.tranche_name : "Custom"}
                              onChange={(e) => updateTranche(tranche.id, "tranche_name", e.target.value)}>
                              {DEFAULT_TRANCHE_NAMES.map(n => <option key={n} value={n}>{n}</option>)}
                            </select>
                          </div>

                          {/* Trigger Event */}
                          <div>
                            <label className="block text-[10px] font-medium text-text-secondary mb-1">Trigger Event</label>
                            <select className="enterprise-input text-xs"
                              value={tranche.trigger_event}
                              onChange={(e) => updateTranche(tranche.id, "trigger_event", e.target.value)}>
                              {opts(dropdowns, "PAYMENT_TRIGGER", Object.entries(TRIGGER_LABELS).map(([v, l]) => ({ value: v, label: l }))).map(o =>
                                <option key={o.value} value={o.value}>{o.label}</option>
                              )}
                            </select>
                          </div>

                          {/* Percent */}
                          <div>
                            <label className="block text-[10px] font-medium text-text-secondary mb-1">
                              % of PO Value
                            </label>
                            <div className="relative">
                              <input type="number" min="0" max="100" className="enterprise-input text-xs text-right pr-7"
                                value={tranche.percent || ""}
                                onChange={(e) => updateTranche(tranche.id, "percent", Math.min(100, Number(e.target.value)))} />
                              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-text-secondary">%</span>
                            </div>
                            {grandTotal > 0 && (
                              <p className="text-[10px] font-mono text-primary-700 mt-0.5 text-right">
                                ≈ ₹{trancheAmount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                              </p>
                            )}
                          </div>

                          {/* Due Days */}
                          <div>
                            <label className="block text-[10px] font-medium text-text-secondary mb-1">Due Days After Trigger</label>
                            <input type="number" min="0" className="enterprise-input text-xs"
                              placeholder="e.g. 7"
                              value={tranche.due_days_after_trigger || ""}
                              onChange={(e) => updateTranche(tranche.id, "due_days_after_trigger", Number(e.target.value))} />
                          </div>
                        </div>

                        {/* Remove button */}
                        <button onClick={() => removeTranche(tranche.id)} disabled={tranches.length === 1}
                          className="p-1.5 text-text-secondary hover:text-danger hover:bg-danger/10 rounded-sm transition-colors disabled:opacity-30 shrink-0">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Milestone tag — only when trigger = MILESTONE */}
                      {tranche.trigger_event === "MILESTONE" && (
                        <div className="ml-8 mt-1">
                          <div className="flex items-center gap-2">
                            <label className="text-[10px] font-medium text-text-secondary shrink-0">Milestone Tag:</label>
                            <input type="text" className="enterprise-input text-xs h-7 w-32"
                              placeholder="e.g. M1" value={tranche.milestone_tag}
                              onChange={(e) => updateTranche(tranche.id, "milestone_tag", e.target.value)} />
                            <span className="text-[10px] text-text-secondary">Links to SRN milestone confirmation</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Visual progress bar */}
              <div className="p-3 border-t border-border bg-surface">
                <p className="text-[10px] text-text-secondary mb-1.5 font-medium uppercase tracking-wide">Allocation</p>
                <div className="flex h-3 rounded-sm overflow-hidden gap-0.5">
                  {tranches.map((t, i) => {
                    const colors = ["bg-primary-700", "bg-primary-500", "bg-accent-500", "bg-primary-300", "bg-primary-200"];
                    return (
                      <div key={t.id} style={{ width: `${t.percent}%` }}
                        className={`${colors[i % colors.length]} transition-all duration-300 flex items-center justify-center`}
                        title={`${t.tranche_name}: ${t.percent}%`}>
                        {t.percent > 8 && <span className="text-white text-[8px] font-bold">{t.percent}%</span>}
                      </div>
                    );
                  })}
                  {totalTranchePercent < 100 && (
                    <div style={{ width: `${100 - totalTranchePercent}%` }} className="bg-danger/20 border border-dashed border-danger/40" />
                  )}
                </div>
                <div className="flex justify-between mt-1">
                  {tranches.map((t) => (
                    <span key={t.id} className="text-[9px] text-text-secondary truncate">{t.tranche_name}</span>
                  ))}
                </div>
              </div>

              {/* Credit period + Retention still apply even in structured mode */}
              <div className="p-4 border-t border-border bg-primary-50/30 grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-medium text-text-secondary mb-1">Credit Period (Days)</label>
                  <input type="number" className="enterprise-input text-xs" value={creditDays}
                    onChange={(e) => setCreditDays(Number(e.target.value))} />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-text-secondary mb-1">Retention Amount (₹)</label>
                  <input type="number" className="enterprise-input text-xs" placeholder="If applicable"
                    value={retentionAmount || ""} onChange={(e) => setRetentionAmount(Number(e.target.value))} />
                </div>
              </div>
            </div>
          )}

          {/* ── LINE ITEMS ──────────────────────────────────────────────── */}
          <div className="enterprise-card flex flex-col min-h-[500px]">
            <div className="p-4 border-b border-border bg-primary-50/50 flex justify-between items-center gap-2">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-primary-900 uppercase tracking-wide">Line Items</h2>
                {aiExtracted && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-accent-700 bg-accent-50 border border-accent-200 px-2 py-0.5 rounded-sm uppercase tracking-wider">
                    <Lock className="w-2.5 h-2.5" /> AI Extracted
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {aiExtracted && (
                  <button onClick={handleClearAiExtract}
                    className="h-7 px-3 bg-surface border border-warning/40 text-warning-800 hover:bg-warning/10 text-xs font-semibold rounded-sm transition-colors flex items-center gap-1">
                    <RotateCcw className="w-3 h-3" /> Enter Manually
                  </button>
                )}
                <button onClick={addLine} disabled={!quotationFile}
                  className="h-7 px-3 bg-surface border border-primary-200 text-primary-700 hover:bg-primary-50 text-xs font-semibold rounded-sm transition-colors flex items-center gap-1 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed">
                  <Plus className="w-3.5 h-3.5" /> Add Row
                </button>
              </div>
            </div>
            {aiExtracted && lines.some(l => l._aiOverridden) && (
              <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border-b border-amber-200 text-xs text-amber-800 font-medium">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-500" />
                You have edited AI-extracted data on {lines.filter(l => l._aiOverridden).length} line(s). The approver will be notified.
              </div>
            )}

            {!quotationFile && (
              <div className="flex flex-col items-center justify-center gap-2 py-12 text-text-secondary">
                <UploadCloud className="w-8 h-8 opacity-30" />
                <p className="text-xs font-medium">Upload Vendor Quotation first, then auto-fill or enter items manually.</p>
              </div>
            )}

            <div className={`flex-1 overflow-x-auto p-0 ${!quotationFile ? "hidden" : ""}`}>
              <table className="w-full text-sm text-left whitespace-nowrap">
                <thead className="text-[11px] text-text-secondary bg-surface sticky top-0 border-b border-border shadow-sm uppercase tracking-wider">
                  <tr>
                    <th className="px-3 py-2 font-semibold w-8">#</th>
                    <th className="px-3 py-2 font-semibold min-w-[200px]">Item Description</th>
                    <th className="px-3 py-2 font-semibold w-24">UOM</th>
                    <th className="px-3 py-2 font-semibold w-24">Qty</th>
                    <th className="px-3 py-2 font-semibold w-28">Rate (₹)</th>
                    <th className="px-3 py-2 font-semibold w-20">GST %</th>
                    <th className="px-3 py-2 font-semibold w-28">HSN</th>
                    <th className="px-3 py-2 font-semibold w-32 text-right">Amount (₹)</th>
                    <th className="px-3 py-2 font-semibold w-12 text-center">Act</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {lines.map((line, index) => {
                    const lineAmount = line.qty * line.rate;
                    const deviation = line.last_purchase_price > 0
                      ? ((line.rate - line.last_purchase_price) / line.last_purchase_price) * 100 : 0;
                    return (
                      <tr key={line.id} className={`transition-colors ${line._aiOverridden ? "border-l-2 border-amber-400 bg-amber-50/40" : "hover:bg-primary-50/30"}`}>
                        <td className="px-3 py-2 text-xs font-medium text-text-secondary text-center">
                          {index + 1}
                          {line._aiOverridden && (
                            <span className="block text-[8px] font-bold text-amber-600 bg-amber-100 rounded-sm px-0.5 mt-0.5 leading-tight">AI Edited</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <input type="text" className="w-full bg-transparent border-0 focus:ring-1 focus:ring-primary-500 rounded-sm px-1 py-1 text-xs"
                            placeholder="Describe item..." value={line.item_description}
                            onChange={(e) => updateLine(line.id, "item_description", e.target.value)} />
                          {deviation > 15 && (
                            <div className="flex items-center gap-1 text-[9px] text-warning mt-1 px-1 font-medium bg-warning/10 w-fit rounded-sm border border-warning/20">
                              <AlertTriangle className="w-2.5 h-2.5" /> +{deviation.toFixed(0)}% above last price
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <select className="w-full bg-surface border border-border focus:ring-1 focus:ring-primary-500 rounded-sm px-1 py-1 text-xs"
                            value={line.uom} onChange={(e) => updateLine(line.id, "uom", e.target.value)}>
                            {opts(dropdowns, "UOM", [
                              { value: "Nos", label: "Nos" }, { value: "Kg", label: "Kg" },
                              { value: "Ltr", label: "Ltr" }, { value: "Box", label: "Box" },
                              { value: "Mtr", label: "Mtr" }, { value: "Set", label: "Set" },
                            ]).map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input type="number"
                            className="w-full border rounded-sm px-2 py-1 text-xs text-right bg-surface border-border focus:ring-1 focus:ring-primary-500"
                            value={line.qty || ""}
                            onChange={(e) => updateLine(line.id, "qty", parseFloat(e.target.value) || 0)} />
                        </td>
                        <td className="px-3 py-2">
                          <input type="number"
                            className="w-full border rounded-sm px-2 py-1 text-xs text-right bg-surface border-border focus:ring-1 focus:ring-primary-500"
                            value={line.rate || ""}
                            onChange={(e) => updateLine(line.id, "rate", parseFloat(e.target.value) || 0)} />
                        </td>
                        <td className="px-3 py-2">
                          <select className="w-full bg-surface border border-border focus:ring-1 focus:ring-primary-500 rounded-sm px-1 py-1 text-xs"
                            value={line.gst_percent} onChange={(e) => updateLine(line.id, "gst_percent", parseFloat(e.target.value))}>
                            {opts(dropdowns, "GST_PERCENT", [
                              { value: "0", label: "0" }, { value: "5", label: "5" },
                              { value: "12", label: "12" }, { value: "18", label: "18" }, { value: "28", label: "28" },
                            ]).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input type="text" className="w-full bg-surface border border-border focus:ring-1 focus:ring-primary-500 rounded-sm px-2 py-1 text-xs"
                            placeholder="e.g. 8471" value={line.hsn_code}
                            onChange={(e) => updateLine(line.id, "hsn_code", e.target.value)} />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input readOnly className="w-full bg-primary-50/50 border border-transparent font-medium rounded-sm px-2 py-1 text-xs text-right text-primary-900 pointer-events-none"
                            value={lineAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })} />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <button onClick={() => removeLine(line.id)}
                            className="p-1 text-text-secondary hover:text-danger hover:bg-danger/10 rounded-sm transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Totals footer */}
            <div className={`p-4 border-t border-border bg-surface mt-auto flex flex-col items-end ${!quotationFile ? "hidden" : ""}`}>
              <div className="w-64 space-y-2 text-sm">
                <div className="flex justify-between text-text-secondary">
                  <span>Subtotal:</span>
                  <span className="font-mono">₹{subtotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between text-text-secondary">
                  <span>Total GST:</span>
                  <span className="font-mono">₹{totalGst.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between text-primary-900 font-bold border-t border-border pt-2 mt-2 text-base">
                  <span>Grand Total:</span>
                  <span className="font-mono">₹{grandTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                </div>
                {/* Structured: show tranche amounts */}
                {paymentScheduleType === "Structured" && grandTotal > 0 && (
                  <div className="border-t border-border pt-2 space-y-1">
                    <p className="text-[10px] font-bold text-text-secondary uppercase tracking-wide">Tranche Breakdown</p>
                    {tranches.map((t, i) => (
                      <div key={t.id} className="flex justify-between text-[11px]">
                        <span className="text-text-secondary">{i + 1}. {t.tranche_name} ({t.percent}%)</span>
                        <span className="font-mono text-primary-700">
                          ₹{((grandTotal * t.percent) / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-8 space-y-2">
        <div className="bg-primary-50 border border-primary-200 text-primary-700 text-[11px] font-bold tracking-wide uppercase p-2 rounded-sm flex items-center justify-center text-center">
          ⚑ Segregation Control: You cannot approve your own submission. — SOP §15.1
        </div>
        <p className="text-center text-xs text-text-secondary">Per Crystal Group SOP-PROC-001 Version 1.1</p>
      </div>
    </div>
  );
}
