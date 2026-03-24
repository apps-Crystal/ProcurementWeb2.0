"use client";

import { useRef, useState, useEffect } from "react";
import { useDropdowns, opts } from "@/hooks/useDropdowns";
import { useRouter } from "next/navigation";
import {
  Briefcase, UploadCloud, AlertTriangle, Sparkles, Save, Send,
  CheckCircle2, Loader2, Plus, Trash2, CalendarClock, XCircle,
} from "lucide-react";
import { useCurrentUser } from "@/components/auth/AuthProvider";
import VendorSelect from "@/components/ui/VendorSelect";

// ── Types ──────────────────────────────────────────────────────────────────

type ServiceCategory = "One_Time" | "Recurring_AMC" | "Project" | "Professional_Services" | "";

const SUBCATEGORY_MAP: Record<string, string[]> = {
  One_Time: ["Repair", "Event", "Urgent", "Other"],
  Recurring_AMC: ["Housekeeping", "Security", "IT", "PestControl", "Equipment"],
  Project: ["Civil", "Electrical", "IT_Impl", "Consulting"],
  Professional_Services: ["Retainer", "Per_Engagement"],
};

interface PaymentTranche {
  id: number;
  tranche_name: string;
  trigger_event: string;
  milestone_tag: string;
  percent: number;
  due_days_after_trigger: number;
}

const TRIGGER_LABELS: Record<string, string> = {
  PO_ACCEPTANCE: "On PO Acceptance by Vendor",
  GRN_PARTIAL: "On Partial GRN Approval",
  GRN_FINAL: "On Final GRN Approval",
  MILESTONE: "On Milestone Confirmation (SRN)",
  INVOICE: "On Invoice Verification",
  MANUAL: "Manual (Finance triggered)",
};

const DEFAULT_TRANCHE_NAMES = ["Advance", "Running", "Milestone", "Final", "Custom"];

const TRIGGER_TO_TRANCHE: Record<string, string> = {
  PO_ACCEPTANCE: "Advance",
  GRN_PARTIAL:   "Running",
  GRN_FINAL:     "Final",
  MILESTONE:     "Milestone",
  INVOICE:       "Final",
  MANUAL:        "Custom",
};

// ── Component ──────────────────────────────────────────────────────────────

export default function NewSPR() {
  const router = useRouter();
  const { user } = useCurrentUser();
  const CURRENT_USER = { id: user?.userId ?? "", name: user?.name ?? "", site: user?.site ?? "" };

  // ── Header fields ─────────────────────────────────────────────────────────
  const [serviceCategory, setServiceCategory] = useState<ServiceCategory>("");
  const [serviceSubcategory, setServiceSubcategory] = useState("");
  const [serviceDescription, setServiceDescription] = useState("");
  const [servicePurpose, setServicePurpose] = useState("");
  const [scopeOfWork, setScopeOfWork] = useState("");         // separate from purpose (bug fix)
  const [vendorId, setVendorId] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [deliveryLocation, setDeliveryLocation] = useState("");

  // ── Payment fields ─────────────────────────────────────────────────────────
  const [paymentScheduleType, setPaymentScheduleType] = useState<"Simple" | "Structured">("Simple");
  const [paymentTerms, setPaymentTerms] = useState("Standard");
  const [advancePercent, setAdvancePercent] = useState(0);
  const [creditDays, setCreditDays] = useState(30);
  const [retentionAmount, setRetentionAmount] = useState(0);
  const [amcBillingFreq, setAmcBillingFreq] = useState("");

  // ── Category-specific fields ──────────────────────────────────────────────
  const [contractStart, setContractStart] = useState("");
  const [contractEnd, setContractEnd] = useState("");
  const [amcValue, setAmcValue] = useState("");
  const [amcScope, setAmcScope] = useState("");
  const [projectCode, setProjectCode] = useState("");
  const [milestoneTags, setMilestoneTags] = useState("");
  const [milestoneLinked, setMilestoneLinked] = useState(false);
  const [consultantName, setConsultantName] = useState("");
  const [engagementType, setEngagementType] = useState("");
  const [sacCode, setSacCode] = useState("");
  const [tdsApplicable, setTdsApplicable] = useState(false);
  const [tdsSection, setTdsSection] = useState("");

  // ── Commercials ────────────────────────────────────────────────────────────
  const [qty, setQty] = useState("1");
  const [rate, setRate] = useState("");
  const [gstPercent, setGstPercent] = useState("18");

  // ── Structured tranches ────────────────────────────────────────────────────
  const [tranches, setTranches] = useState<PaymentTranche[]>([
    { id: 1, tranche_name: "Advance", trigger_event: "PO_ACCEPTANCE", milestone_tag: "", percent: 30, due_days_after_trigger: 7 },
    { id: 2, tranche_name: "Running", trigger_event: "MILESTONE", milestone_tag: "M1", percent: 50, due_days_after_trigger: 15 },
    { id: 3, tranche_name: "Final", trigger_event: "MILESTONE", milestone_tag: "M2", percent: 20, due_days_after_trigger: 30 },
  ]);

  const totalTranchePercent = tranches.reduce((s, t) => s + t.percent, 0);
  const isTrancheValid = totalTranchePercent === 100;

  const addTranche = () => setTranches(prev => [...prev, {
    id: Date.now(), tranche_name: "Milestone", trigger_event: "MILESTONE",
    milestone_tag: "", percent: 0, due_days_after_trigger: 30,
  }]);

  const removeTranche = (id: number) => {
    if (tranches.length > 1) setTranches(prev => prev.filter(t => t.id !== id));
  };

  const updateTranche = (id: number, field: keyof PaymentTranche, value: string | number) => {
    setTranches(prev => prev.map(t => {
      if (t.id !== id) return t;
      const updated = { ...t, [field]: value };
      if (field === "trigger_event") {
        const suggested = TRIGGER_TO_TRANCHE[value as string];
        if (suggested && DEFAULT_TRANCHE_NAMES.includes(t.tranche_name)) {
          updated.tranche_name = suggested;
        }
      }
      return updated;
    }));
  };

  const dropdowns = useDropdowns(
    "SITE", "SERVICE_CATEGORY", "ENGAGEMENT_TYPE", "PAYMENT_TERMS",
    "GST_PERCENT", "PAYMENT_TRIGGER", "AMC_BILLING_FREQ"
  );

  useEffect(() => {
    const siteOpts = dropdowns["SITE"];
    if (siteOpts?.length) setDeliveryLocation((prev) => prev || siteOpts[0].value);
  }, [dropdowns]);

  // ── Files ─────────────────────────────────────────────────────────────────
  const [quotationFile, setQuotationFile] = useState<File | null>(null);
  const [scopeDocFile, setScopeDocFile] = useState<File | null>(null);
  const quotationRef = useRef<HTMLInputElement>(null);
  const scopeDocRef = useRef<HTMLInputElement>(null);

  // ── UI state ──────────────────────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [error, setError] = useState("");
  const [successId, setSuccessId] = useState("");
  const [draftSaved, setDraftSaved] = useState("");
  const [autoFilling, setAutoFilling] = useState(false);

  // ── Totals ────────────────────────────────────────────────────────────────
  const qtyN = parseFloat(qty) || 0;
  const rateN = parseFloat(rate) || 0;
  const gstN = parseFloat(gstPercent) || 0;
  const subtotal = qtyN * rateN;
  const totalGst = (subtotal * gstN) / 100;
  const grandTotal = subtotal + totalGst;
  const fmt = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // ── Auto-fill ─────────────────────────────────────────────────────────────
  async function handleAutoFill() {
    if (!quotationFile) { setError("Upload a vendor quotation first."); return; }
    setAutoFilling(true); setError("");
    try {
      const fd = new FormData();
      fd.append("file", quotationFile);
      const res = await fetch("/api/invoices/extract-quotation", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Auto-fill failed");
      const lines: any[] = json.lines ?? [];
      if (lines.length > 0) {
        const l = lines[0];
        if (l.item_description) setServiceDescription(l.item_description);
        if (l.qty) setQty(String(l.qty));
        if (l.rate) setRate(String(l.rate));
        if (l.gst_percent) setGstPercent(String(l.gst_percent));
        if (l.sac_code) setSacCode(l.sac_code);
      }
      if (json.vendor_name) setVendorName(json.vendor_name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Auto-fill failed");
    } finally { setAutoFilling(false); }
  }

  // ── Build payload ─────────────────────────────────────────────────────────
  const buildPayload = (draft = false) => ({
    requestor_user_id: CURRENT_USER.id,
    requestor_name: CURRENT_USER.name,
    requestor_site: CURRENT_USER.site,
    service_category: serviceCategory,
    service_subcategory: serviceSubcategory,
    service_description: serviceDescription,
    service_purpose: servicePurpose,
    scope_of_work: scopeOfWork,
    vendor_id: vendorId,
    vendor_name: vendorName,
    payment_terms: paymentTerms,
    payment_schedule_type: paymentScheduleType,
    advance_percent: paymentScheduleType === "Simple" ? advancePercent : 0,
    credit_period_days: creditDays,
    retention_amount: retentionAmount,
    amc_billing_frequency: amcBillingFreq,
    payment_schedule: paymentScheduleType === "Structured" ? JSON.stringify(tranches) : "",
    contract_start_date: contractStart,
    contract_end_date: contractEnd,
    amc_value: amcValue || 0,
    amc_scope: amcScope,
    project_code: projectCode,
    milestone_tags: milestoneTags,
    payment_linked_to_milestones: (paymentScheduleType === "Structured" || milestoneLinked) ? "Y" : "N",
    consultant_name: consultantName,
    engagement_type: engagementType,
    sac_code: sacCode,
    tds_applicable: tdsApplicable ? "Y" : "N",
    tds_section: tdsSection,
    delivery_location: deliveryLocation,
    quantity: qty,
    rate,
    gst_percent: gstPercent,
    draft,
  });

  // ── Save Draft ────────────────────────────────────────────────────────────
  async function handleSaveDraft() {
    setError(""); setSavingDraft(true);
    try {
      const fd = new FormData();
      fd.append("data", JSON.stringify(buildPayload(true)));
      if (quotationFile) fd.append("quotation", quotationFile);
      if (scopeDocFile) fd.append("scope_doc", scopeDocFile);
      const res = await fetch("/api/pr/spr", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to save draft");
      setDraftSaved(json.spr_id);
      setTimeout(() => router.push("/pr/list"), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save draft");
    } finally { setSavingDraft(false); }
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    setError("");
    if (!serviceCategory) return setError("Service Category is required.");
    if (!serviceDescription.trim()) return setError("Service Description is required.");
    if (!rate) return setError("Rate is required.");
    if (!quotationFile) return setError("Vendor Quotation is mandatory (SOP §5.2).");
    if (paymentScheduleType === "Structured" && !isTrancheValid)
      return setError(`Payment schedule must total 100%. Currently: ${totalTranchePercent}%.`);

    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("data", JSON.stringify(buildPayload(false)));
      fd.append("quotation", quotationFile);
      if (scopeDocFile) fd.append("scope_doc", scopeDocFile);
      const res = await fetch("/api/pr/spr", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Submission failed");
      setSuccessId(json.spr_id);
      setTimeout(() => router.push("/pr/list"), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submission failed");
    } finally { setSubmitting(false); }
  }

  // ── Success screens ───────────────────────────────────────────────────────
  if (draftSaved) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <Save className="w-16 h-16 text-warning" />
      <h2 className="text-2xl font-bold text-primary-900">Draft Saved</h2>
      <p className="text-text-secondary"><span className="font-mono font-bold text-primary-700">{draftSaved}</span> saved as draft.</p>
      <p className="text-xs text-text-secondary">Redirecting to PR list…</p>
    </div>
  );

  if (successId) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <CheckCircle2 className="w-16 h-16 text-success" />
      <h2 className="text-2xl font-bold text-primary-900">SPR Submitted</h2>
      <p className="text-text-secondary"><span className="font-mono font-bold text-primary-700">{successId}</span> submitted for approval.</p>
      <p className="text-xs text-text-secondary">Redirecting to PR list…</p>
    </div>
  );

  const subcategories = serviceCategory ? (SUBCATEGORY_MAP[serviceCategory] ?? []) : [];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-20">

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-bold text-primary-900 tracking-tight flex items-center gap-2">
            <Briefcase className="w-6 h-6 text-primary-600" />
            New Service Purchase Request (F2)
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Raise a new request for consultancy, AMC, IT services, or civil/mechanical works.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleSaveDraft} disabled={submitting || savingDraft}
            className="h-9 px-4 bg-surface hover:bg-primary-50 text-primary-700 text-sm font-medium rounded-sm border border-primary-200 transition-colors shadow-sm flex items-center gap-2 disabled:opacity-50">
            {savingDraft ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : <><Save className="w-4 h-4" /> Save Draft</>}
          </button>
          <button onClick={handleSubmit} disabled={submitting}
            className="h-9 px-4 bg-primary-900 hover:bg-primary-800 text-white text-sm font-medium rounded-sm border border-primary-950 transition-colors shadow-sm flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Submit SPR
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-danger/10 border border-danger/30 text-danger text-sm p-3 rounded-sm flex items-center gap-2">
          <XCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {/* Hidden file inputs */}
      <input ref={quotationRef} type="file" accept=".pdf,.doc,.docx" className="hidden"
        onChange={(e) => setQuotationFile(e.target.files?.[0] ?? null)} />
      <input ref={scopeDocRef} type="file" accept=".pdf,.doc,.docx" className="hidden"
        onChange={(e) => setScopeDocFile(e.target.files?.[0] ?? null)} />

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">

        {/* ── LEFT COLUMN ──────────────────────────────────────────────── */}
        <div className="xl:col-span-1 space-y-6">
          <div className="enterprise-card p-4 space-y-4">
            <h2 className="text-sm font-bold text-primary-900 uppercase tracking-wide border-b border-border pb-2">SPR Header</h2>

            <div className="space-y-3 bg-primary-50/50 p-3 rounded-sm border border-border/50">
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
              {/* Service Category */}
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Service Category <span className="text-danger">*</span></label>
                <select className="enterprise-input" value={serviceCategory}
                  onChange={(e) => { setServiceCategory(e.target.value as ServiceCategory); setServiceSubcategory(""); }}>
                  <option value="">Select Category</option>
                  {opts(dropdowns, "SERVICE_CATEGORY", [
                    { value: "One_Time", label: "One-Time Service" },
                    { value: "Recurring_AMC", label: "Recurring / AMC" },
                    { value: "Project", label: "Project" },
                    { value: "Professional_Services", label: "Professional Services" },
                  ]).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>

              {/* Sub-category */}
              {subcategories.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">Sub-category</label>
                  <select className="enterprise-input" value={serviceSubcategory} onChange={(e) => setServiceSubcategory(e.target.value)}>
                    <option value="">Select…</option>
                    {subcategories.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              )}

              {/* Vendor */}
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Preferred Service Provider</label>
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

              {/* AMC / Project dates */}
              {(serviceCategory === "Recurring_AMC" || serviceCategory === "Project") && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1">Contract Start Date <span className="text-danger">*</span></label>
                    <input type="date" className="enterprise-input" value={contractStart} onChange={(e) => setContractStart(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1">Contract End Date <span className="text-danger">*</span></label>
                    <input type="date" className="enterprise-input" value={contractEnd} onChange={(e) => setContractEnd(e.target.value)} />
                  </div>
                </>
              )}

              {/* AMC fields */}
              {serviceCategory === "Recurring_AMC" && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1">AMC Value (₹)</label>
                    <input type="number" className="enterprise-input" placeholder="Annual contract value"
                      value={amcValue} onChange={(e) => setAmcValue(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1">AMC Scope</label>
                    <input type="text" className="enterprise-input" placeholder="Brief scope"
                      value={amcScope} onChange={(e) => setAmcScope(e.target.value)} />
                  </div>
                </>
              )}

              {/* Project fields */}
              {serviceCategory === "Project" && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1">Project Code</label>
                    <input type="text" className="enterprise-input" placeholder="e.g. PROJ-2503"
                      value={projectCode} onChange={(e) => setProjectCode(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1">Milestone Tags</label>
                    <input type="text" className="enterprise-input" placeholder="M1,M2,M3"
                      value={milestoneTags} onChange={(e) => setMilestoneTags(e.target.value)} />
                    <p className="text-[10px] text-text-secondary mt-1">Comma-separated. Used in payment schedule milestone triggers.</p>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
                    <input type="checkbox" checked={milestoneLinked} onChange={(e) => setMilestoneLinked(e.target.checked)} className="rounded" />
                    Payment linked to milestones
                  </label>
                </>
              )}

              {/* Professional Services fields */}
              {serviceCategory === "Professional_Services" && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1">Consultant Name</label>
                    <input type="text" className="enterprise-input" placeholder="Individual / Firm"
                      value={consultantName} onChange={(e) => setConsultantName(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1">Engagement Type</label>
                    <select className="enterprise-input" value={engagementType} onChange={(e) => setEngagementType(e.target.value)}>
                      <option value="">Select…</option>
                      {opts(dropdowns, "ENGAGEMENT_TYPE", [
                        { value: "Retainer", label: "Retainer" },
                        { value: "Per_Engagement", label: "Per Engagement" },
                      ]).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
                    <input type="checkbox" checked={tdsApplicable} onChange={(e) => setTdsApplicable(e.target.checked)} className="rounded" />
                    TDS Applicable
                  </label>
                  {tdsApplicable && (
                    <input type="text" className="enterprise-input" placeholder="TDS Section (e.g. 194J)"
                      value={tdsSection} onChange={(e) => setTdsSection(e.target.value)} />
                  )}
                </>
              )}
            </div>

            {/* ── PAYMENT TERMS ─────────────────────────────────────────── */}
            <div className="space-y-3 pt-4 border-t border-border mt-4">
              <h3 className="text-xs font-bold text-primary-900 uppercase flex items-center gap-1.5">
                <CalendarClock className="w-3.5 h-3.5 text-primary-600" />
                Payment Terms
              </h3>

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
                  {paymentScheduleType === "Structured"
                    ? "Multi-tranche: e.g. 30% advance, 50% on milestone, 20% final."
                    : "Single advance % + standard credit period."}
                </p>
              </div>

              {/* SIMPLE mode */}
              {paymentScheduleType === "Simple" && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1">Payment Term Type <span className="text-danger">*</span></label>
                    <select className="enterprise-input" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)}>
                      {opts(dropdowns, "PAYMENT_TERMS", [
                        { value: "Standard", label: "Standard (30 days from invoice verif.)" },
                        { value: "Advance", label: "Advance" },
                        { value: "Milestone-linked", label: "Milestone-linked" },
                      ]).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  {paymentTerms === "Advance" && (
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

              {/* AMC Billing Frequency */}
              {serviceCategory === "Recurring_AMC" && (
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">
                    AMC Billing Frequency <span className="text-danger">*</span>
                  </label>
                  <select className="enterprise-input" value={amcBillingFreq} onChange={(e) => setAmcBillingFreq(e.target.value)}>
                    <option value="">Select frequency…</option>
                    {opts(dropdowns, "AMC_BILLING_FREQ", [
                      { value: "Monthly", label: "Monthly" },
                      { value: "Quarterly", label: "Quarterly" },
                      { value: "Half-Yearly", label: "Half-Yearly" },
                      { value: "Annual", label: "Annual" },
                    ]).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              )}

              <div className="bg-primary-50 border border-primary-200 text-primary-700 text-[10px] p-2 rounded-sm">
                Payment terms locked at PR stage and carried through to WO. Variation requires Procurement Head approval.
              </div>
            </div>
          </div>

          {/* Documents Card */}
          <div className="enterprise-card p-4 space-y-4">
            <h2 className="text-sm font-bold text-primary-900 uppercase tracking-wide border-b border-border pb-2">Documents</h2>
            <p className="text-xs text-text-secondary">Vendor Quotation mandatory per SOP §5.2.</p>

            <button type="button" onClick={() => quotationRef.current?.click()}
              className="w-full flex flex-col items-center justify-center p-4 border-2 border-dashed border-primary-300 rounded-sm bg-primary-50/30 hover:bg-primary-50 transition-colors cursor-pointer group">
              {quotationFile ? (
                <><CheckCircle2 className="w-6 h-6 text-success mb-2" />
                  <span className="text-xs font-bold text-success truncate max-w-full px-2">{quotationFile.name}</span>
                  <span className="text-[10px] text-text-secondary mt-1">Click to change</span></>
              ) : (
                <><UploadCloud className="w-6 h-6 text-primary-400 group-hover:text-primary-600 mb-2" />
                  <span className="text-xs font-bold text-primary-700">Upload Vendor Quotation *</span>
                  <span className="text-[10px] text-text-secondary mt-1">PDF / DOCX up to 5MB</span></>
              )}
            </button>

            <button type="button" onClick={() => scopeDocRef.current?.click()}
              className="w-full flex flex-col items-center justify-center p-4 border border-dashed border-primary-300 rounded-sm bg-primary-50/30 hover:bg-primary-50 transition-colors cursor-pointer group">
              {scopeDocFile ? (
                <><CheckCircle2 className="w-5 h-5 text-success mb-2" />
                  <span className="text-[10px] font-bold text-success truncate max-w-full px-2">{scopeDocFile.name}</span>
                  <span className="text-[10px] text-text-secondary mt-1">Click to change</span></>
              ) : (
                <><UploadCloud className="w-5 h-5 text-primary-400 group-hover:text-primary-600 mb-2" />
                  <span className="text-[10px] font-bold text-primary-700">Upload Scope of Work (Optional)</span>
                  <span className="text-[10px] text-text-secondary mt-1">PDF / DOCX up to 5MB</span></>
              )}
            </button>

            <button type="button" onClick={handleAutoFill} disabled={autoFilling || !quotationFile}
              className="w-full h-8 flex items-center justify-center gap-2 bg-gradient-to-r from-accent-600 to-accent-500 hover:from-accent-500 hover:to-accent-400 text-white text-xs font-bold rounded-sm transition-colors shadow-sm mt-2 disabled:opacity-50 disabled:cursor-not-allowed">
              {autoFilling ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Extracting…</> : <><Sparkles className="w-3.5 h-3.5" /> Auto-fill from Quotation</>}
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
                  All tranches must sum to 100%. Currently {totalTranchePercent}% —{" "}
                  {totalTranchePercent < 100 ? `${100 - totalTranchePercent}% unallocated.` : `${totalTranchePercent - 100}% over-allocated.`}
                </div>
              )}

              {isTrancheValid && (
                <div className="flex items-center gap-2 px-4 py-2 bg-success/10 border-b border-success/20 text-xs text-success font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> Schedule totals 100% — valid.
                </div>
              )}

              <div className="divide-y divide-border">
                {tranches.map((tranche, index) => {
                  const trancheAmount = grandTotal > 0 ? (grandTotal * tranche.percent) / 100 : 0;
                  return (
                    <div key={tranche.id} className="p-4 hover:bg-primary-50/30 transition-colors">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="w-6 h-6 rounded-full bg-primary-900 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                          {index + 1}
                        </span>
                        <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-3">
                          {/* Tranche Name */}
                          <div>
                            <label className="block text-[10px] font-medium text-text-secondary mb-1">Tranche Name</label>
                            <select className="enterprise-input text-xs" value={DEFAULT_TRANCHE_NAMES.includes(tranche.tranche_name) ? tranche.tranche_name : "Custom"}
                              onChange={(e) => updateTranche(tranche.id, "tranche_name", e.target.value)}>
                              {DEFAULT_TRANCHE_NAMES.map(n => <option key={n} value={n}>{n}</option>)}
                            </select>
                          </div>
                          {/* Trigger Event */}
                          <div>
                            <label className="block text-[10px] font-medium text-text-secondary mb-1">Trigger Event</label>
                            <select className="enterprise-input text-xs" value={tranche.trigger_event}
                              onChange={(e) => updateTranche(tranche.id, "trigger_event", e.target.value)}>
                              {opts(dropdowns, "PAYMENT_TRIGGER", Object.entries(TRIGGER_LABELS).map(([v, l]) => ({ value: v, label: l }))).map(o =>
                                <option key={o.value} value={o.value}>{o.label}</option>
                              )}
                            </select>
                          </div>
                          {/* Percent */}
                          <div>
                            <label className="block text-[10px] font-medium text-text-secondary mb-1">% of WO Value</label>
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
                            <input type="number" min="0" className="enterprise-input text-xs" placeholder="e.g. 7"
                              value={tranche.due_days_after_trigger || ""}
                              onChange={(e) => updateTranche(tranche.id, "due_days_after_trigger", Number(e.target.value))} />
                          </div>
                        </div>
                        <button onClick={() => removeTranche(tranche.id)} disabled={tranches.length === 1}
                          className="p-1.5 text-text-secondary hover:text-danger hover:bg-danger/10 rounded-sm transition-colors disabled:opacity-30 shrink-0">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      {/* Milestone tag */}
                      {tranche.trigger_event === "MILESTONE" && (
                        <div className="ml-8 mt-1">
                          <div className="flex items-center gap-2">
                            <label className="text-[10px] font-medium text-text-secondary shrink-0">Milestone Tag:</label>
                            <input type="text" className="enterprise-input text-xs h-7 w-28"
                              placeholder="e.g. M1" value={tranche.milestone_tag}
                              onChange={(e) => updateTranche(tranche.id, "milestone_tag", e.target.value)} />
                            <span className="text-[10px] text-text-secondary">Must match SRN milestone confirmation tag</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Progress bar */}
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
              </div>

              {/* Credit period + Retention in structured mode */}
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

          {/* ── SERVICE DETAILS ─────────────────────────────────────────── */}
          <div className="enterprise-card p-4 space-y-4">
            <h2 className="text-sm font-bold text-primary-900 uppercase tracking-wide border-b border-border pb-2">Service Details</h2>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Service Description <span className="text-danger">*</span></label>
              <input type="text" className="enterprise-input" placeholder="Describe the service clearly…"
                value={serviceDescription} onChange={(e) => setServiceDescription(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Purpose / Justification</label>
              <input type="text" className="enterprise-input" placeholder="Business justification for this service"
                value={servicePurpose} onChange={(e) => setServicePurpose(e.target.value)} />
            </div>

            {/* Commercials */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2 border-t border-border">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Quantity / Units</label>
                <input type="number" className="enterprise-input text-right" placeholder="1" min="0"
                  value={qty} onChange={(e) => setQty(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Rate (₹) <span className="text-danger">*</span></label>
                <input type="number" className="enterprise-input text-right" placeholder="0.00" min="0"
                  value={rate} onChange={(e) => setRate(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">GST %</label>
                <select className="enterprise-input" value={gstPercent} onChange={(e) => setGstPercent(e.target.value)}>
                  {opts(dropdowns, "GST_PERCENT", [
                    { value: "0", label: "0%" }, { value: "5", label: "5%" },
                    { value: "12", label: "12%" }, { value: "18", label: "18%" }, { value: "28", label: "28%" },
                  ]).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">SAC Code</label>
                <input type="text" className="enterprise-input" placeholder="e.g. 9983"
                  value={sacCode} onChange={(e) => setSacCode(e.target.value)} />
              </div>
            </div>

            {/* Totals */}
            <div className="flex flex-col items-end pt-4 border-t border-border">
              <div className="w-64 space-y-2 text-sm">
                <div className="flex justify-between text-text-secondary">
                  <span>Subtotal:</span><span className="font-mono">₹ {fmt(subtotal)}</span>
                </div>
                <div className="flex justify-between text-text-secondary">
                  <span>Total GST ({gstPercent}%):</span><span className="font-mono">₹ {fmt(totalGst)}</span>
                </div>
                <div className="flex justify-between text-primary-900 font-bold border-t border-border pt-2 mt-2 text-base">
                  <span>Grand Total:</span><span className="font-mono">₹ {fmt(grandTotal)}</span>
                </div>
                {/* Structured: tranche breakdown */}
                {paymentScheduleType === "Structured" && grandTotal > 0 && (
                  <div className="border-t border-border pt-2 space-y-1">
                    <p className="text-[10px] font-bold text-text-secondary uppercase tracking-wide">Tranche Breakdown</p>
                    {tranches.map((t, i) => (
                      <div key={t.id} className="flex justify-between text-[11px]">
                        <span className="text-text-secondary">{i + 1}. {t.tranche_name} ({t.percent}%)</span>
                        <span className="font-mono text-primary-700">₹{((grandTotal * t.percent) / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── SCOPE OF WORK ────────────────────────────────────────────── */}
          <div className="enterprise-card p-0">
            <div className="p-4 border-b border-border bg-primary-50/50">
              <h2 className="text-sm font-bold text-primary-900 uppercase tracking-wide">Detailed Scope of Work & Deliverables</h2>
              <p className="text-[10px] text-text-secondary mt-1">Clearly define expected outputs to ensure smooth WO execution and certification.</p>
            </div>
            <div className="p-4">
              <textarea className="w-full flex min-h-[150px] rounded-sm p-3 text-sm border border-border focus:ring-1 focus:ring-primary-600 outline-none transition-colors resize-y bg-surface"
                placeholder="E.g. The contractor is responsible for casting 4 columns on the ground floor including centering and shuttering… Delivery timeline: 10 days from WO date."
                value={scopeOfWork} onChange={(e) => setScopeOfWork(e.target.value)} />
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-8 space-y-2">
        <div className="bg-primary-50 border border-primary-200 text-primary-700 text-[11px] font-bold tracking-wide uppercase p-2 rounded-sm flex items-center justify-center text-center">
          ⚑ Segregation Control: You cannot approve your own submission. — SOP §15.1
        </div>
        <p className="text-center text-xs text-text-secondary">Per Crystal Group SOP-PROC-001 Version 1.1 | SOP-PROC-001</p>
      </div>
    </div>
  );
}
