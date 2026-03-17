"use client";

import { useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Briefcase,
  UploadCloud,
  AlertTriangle,
  Sparkles,
  Save,
  Send,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { useCurrentUser } from "@/components/auth/AuthProvider";
import VendorSelect from "@/components/ui/VendorSelect";

type ServiceCategory = "One_Time" | "Recurring_AMC" | "Project" | "Professional_Services" | "";

const SUBCATEGORY_MAP: Record<string, string[]> = {
  One_Time:             ["Repair", "Event", "Urgent", "Other"],
  Recurring_AMC:        ["Housekeeping", "Security", "IT", "PestControl", "Equipment"],
  Project:              ["Civil", "Electrical", "IT_Impl", "Consulting"],
  Professional_Services:["Retainer", "Per_Engagement"],
};

export default function NewSPR() {
  const router = useRouter();
  const { user } = useCurrentUser();
  const CURRENT_USER = {
    id:   user?.userId ?? "",
    name: user?.name   ?? "",
    site: user?.site   ?? "",
  };

  // ── Header fields ──────────────────────────────────────────────────────────
  const [serviceCategory, setServiceCategory] = useState<ServiceCategory>("");
  const [serviceSubcategory, setServiceSubcategory] = useState("");
  const [serviceDescription, setServiceDescription] = useState("");
  const [servicePurpose, setServicePurpose] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("Standard");
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
  const [deliveryLocation, setDeliveryLocation] = useState("");
  const [siteOptions, setSiteOptions] = useState<{ value: string; label: string }[]>([]);

  useEffect(() => {
    console.log("[NewSPR] Fetching sites...");
    fetch("/api/dropdowns?list=SITE")
      .then((r) => r.json())
      .then((d) => {
        console.log("[NewSPR] API Data:", d);
        if (d.options?.length) {
          setSiteOptions(d.options);
          setDeliveryLocation((prev) => prev || d.options[0].value);
        }
      })
      .catch((err) => {
        console.error("[NewSPR] Dropdown fetch error:", err);
      });
  }, []);

  // ── Line (single for SPR) ──────────────────────────────────────────────────
  const [qty, setQty] = useState("1");
  const [rate, setRate] = useState("");
  const [gstPercent, setGstPercent] = useState("18");

  // ── Files ──────────────────────────────────────────────────────────────────
  const [quotationFile, setQuotationFile] = useState<File | null>(null);
  const [scopeDocFile, setScopeDocFile] = useState<File | null>(null);
  const quotationRef = useRef<HTMLInputElement>(null);
  const scopeDocRef  = useRef<HTMLInputElement>(null);

  // ── UI state ───────────────────────────────────────────────────────────────
  const [submitting, setSubmitting]   = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [error, setError]             = useState("");
  const [successId, setSuccessId]     = useState("");
  const [draftSaved, setDraftSaved]   = useState("");
  const [autoFilling, setAutoFilling] = useState(false);

  // ── Totals ─────────────────────────────────────────────────────────────────
  const qtyN  = parseFloat(qty)  || 0;
  const rateN = parseFloat(rate) || 0;
  const gstN  = parseFloat(gstPercent) || 0;
  const subtotal   = qtyN * rateN;
  const totalGst   = (subtotal * gstN) / 100;
  const grandTotal = subtotal + totalGst;

  const fmt = (n: number) =>
    n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // ── Auto-fill from quotation ───────────────────────────────────────────────
  async function handleAutoFill() {
    if (!quotationFile) {
      setError("Upload a vendor quotation first to use auto-fill.");
      return;
    }
    setAutoFilling(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", quotationFile);
      const res = await fetch("/api/invoices/extract-quotation", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Auto-fill failed");
      // Populate first line if available
      const lines: Array<{ item_description?: string; qty?: string | number; rate?: string | number; gst_percent?: string | number; sac_code?: string }> = json.lines ?? [];
      if (lines.length > 0) {
        const l = lines[0];
        if (l.item_description) setServiceDescription(l.item_description);
        if (l.qty)  setQty(String(l.qty));
        if (l.rate) setRate(String(l.rate));
        if (l.gst_percent) setGstPercent(String(l.gst_percent));
        if (l.sac_code)    setSacCode(l.sac_code);
      }
      if (json.vendor_name) setVendorName(json.vendor_name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Auto-fill failed");
    } finally {
      setAutoFilling(false);
    }
  }

  // ── Save Draft ─────────────────────────────────────────────────────────────
  async function handleSaveDraft() {
    setError("");
    setSavingDraft(true);
    try {
      const payload = {
        requestor_user_id: CURRENT_USER.id,
        requestor_name:    CURRENT_USER.name,
        requestor_site:    CURRENT_USER.site,
        service_category:     serviceCategory,
        service_subcategory:  serviceSubcategory,
        service_description:  serviceDescription,
        service_purpose:      servicePurpose,
        vendor_id:            vendorId,
        vendor_name:          vendorName,
        payment_terms:        paymentTerms,
        contract_start_date:  contractStart,
        contract_end_date:    contractEnd,
        amc_value:            amcValue || 0,
        amc_scope:            amcScope,
        project_code:         projectCode,
        milestone_tags:       milestoneTags,
        payment_linked_to_milestones: milestoneLinked ? "Y" : "N",
        consultant_name:      consultantName,
        engagement_type:      engagementType,
        sac_code:             sacCode,
        tds_applicable:       tdsApplicable ? "Y" : "N",
        tds_section:          tdsSection,
        delivery_location:    deliveryLocation,
        quantity:             qty,
        rate,
        gst_percent:          gstPercent,
        draft:                true,
      };

      const fd = new FormData();
      fd.append("data", JSON.stringify(payload));
      if (quotationFile) fd.append("quotation", quotationFile);
      if (scopeDocFile)  fd.append("scope_doc", scopeDocFile);

      const res = await fetch("/api/pr/spr", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to save draft");

      setDraftSaved(json.spr_id);
      setTimeout(() => router.push("/pr/list"), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save draft");
    } finally {
      setSavingDraft(false);
    }
  }

  // ── Submit ─────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    setError("");
    if (!serviceCategory) { setError("Service Category is required."); return; }
    if (!serviceDescription.trim()) { setError("Service Description is required."); return; }
    if (!rate) { setError("Rate is required."); return; }
    if (!quotationFile) { setError("Vendor Quotation is mandatory (SOP §5.2)."); return; }

    setSubmitting(true);
    try {
      const payload = {
        requestor_user_id: CURRENT_USER.id,
        requestor_name:    CURRENT_USER.name,
        requestor_site:    CURRENT_USER.site,
        service_category:     serviceCategory,
        service_subcategory:  serviceSubcategory,
        service_description:  serviceDescription,
        service_purpose:      servicePurpose,
        vendor_id:            vendorId,
        vendor_name:          vendorName,
        payment_terms:        paymentTerms,
        contract_start_date:  contractStart,
        contract_end_date:    contractEnd,
        amc_value:            amcValue || 0,
        amc_scope:            amcScope,
        project_code:         projectCode,
        milestone_tags:       milestoneTags,
        payment_linked_to_milestones: milestoneLinked ? "Y" : "N",
        consultant_name:      consultantName,
        engagement_type:      engagementType,
        sac_code:             sacCode,
        tds_applicable:       tdsApplicable ? "Y" : "N",
        tds_section:          tdsSection,
        delivery_location:    deliveryLocation,
        quantity:             qty,
        rate,
        gst_percent:          gstPercent,
      };

      const fd = new FormData();
      fd.append("data", JSON.stringify(payload));
      fd.append("quotation", quotationFile);
      if (scopeDocFile) fd.append("scope_doc", scopeDocFile);

      const res = await fetch("/api/pr/spr", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Submission failed");

      setSuccessId(json.spr_id);
      setTimeout(() => router.push("/pr/list"), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Draft saved screen ─────────────────────────────────────────────────────
  if (draftSaved) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Save className="w-16 h-16 text-warning" />
        <h2 className="text-2xl font-bold text-primary-900">Draft Saved</h2>
        <p className="text-text-secondary">
          <span className="font-mono font-bold text-primary-700">{draftSaved}</span> has been saved as a draft.
        </p>
        <p className="text-xs text-text-secondary">Redirecting to PR list…</p>
      </div>
    );
  }

  // ── Success screen ─────────────────────────────────────────────────────────
  if (successId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <CheckCircle2 className="w-16 h-16 text-success" />
        <h2 className="text-2xl font-bold text-primary-900">SPR Submitted</h2>
        <p className="text-text-secondary">
          <span className="font-mono font-bold text-primary-700">{successId}</span> has been submitted for approval.
        </p>
        <p className="text-xs text-text-secondary">Redirecting to PR list…</p>
      </div>
    );
  }

  const subcategories = serviceCategory ? (SUBCATEGORY_MAP[serviceCategory] ?? []) : [];

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-20">

      {/* Header */}
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
          <button
            onClick={handleSaveDraft}
            disabled={submitting || savingDraft}
            className="h-9 px-4 bg-surface hover:bg-primary-50 text-primary-700 text-sm font-medium rounded-sm border border-primary-200 transition-colors shadow-sm flex items-center gap-2 disabled:opacity-50"
          >
            {savingDraft ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : <><Save className="w-4 h-4" /> Save Draft</>}
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="h-9 px-4 bg-primary-900 hover:bg-primary-800 text-white text-sm font-medium rounded-sm border border-primary-950 transition-colors shadow-sm flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Submit SPR
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="bg-danger/10 border border-danger/30 text-danger text-sm p-3 rounded-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Hidden file inputs */}
      <input
        ref={quotationRef}
        type="file"
        accept=".pdf,.doc,.docx"
        className="hidden"
        onChange={(e) => setQuotationFile(e.target.files?.[0] ?? null)}
      />
      <input
        ref={scopeDocRef}
        type="file"
        accept=".pdf,.doc,.docx"
        className="hidden"
        onChange={(e) => setScopeDocFile(e.target.files?.[0] ?? null)}
      />

      {/* Main Form */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">

        {/* Left Column */}
        <div className="xl:col-span-1 space-y-6">
          <div className="enterprise-card p-4 space-y-4">
            <h2 className="text-sm font-bold text-primary-900 uppercase tracking-wide border-b border-border pb-2">SPR Header</h2>

            {/* Auto-filled Read Only */}
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
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">
                  Service Category <span className="text-danger">*</span>
                </label>
                <select
                  className="enterprise-input"
                  value={serviceCategory}
                  onChange={(e) => {
                    setServiceCategory(e.target.value as ServiceCategory);
                    setServiceSubcategory("");
                  }}
                >
                  <option value="">Select Category</option>
                  <option value="One_Time">One-Time Service</option>
                  <option value="Recurring_AMC">Recurring / AMC</option>
                  <option value="Project">Project</option>
                  <option value="Professional_Services">Professional Services</option>
                </select>
              </div>

              {subcategories.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">Sub-category</label>
                  <select
                    className="enterprise-input"
                    value={serviceSubcategory}
                    onChange={(e) => setServiceSubcategory(e.target.value)}
                  >
                    <option value="">Select…</option>
                    {subcategories.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Preferred Service Provider</label>
                <VendorSelect
                  value={vendorName}
                  onChange={({ vendor_id, vendor_name }) => {
                    setVendorId(vendor_id);
                    setVendorName(vendor_name);
                  }}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Delivery Location</label>
                <select 
                  className="enterprise-input" 
                  value={deliveryLocation} 
                  onChange={(e) => setDeliveryLocation(e.target.value)}
                >
                  {siteOptions.length === 0 && <option value="">Loading sites...</option>}
                  {siteOptions.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>

              {(serviceCategory === "Recurring_AMC" || serviceCategory === "Project") && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1">
                      Contract Start Date <span className="text-danger">*</span>
                    </label>
                    <input
                      type="date"
                      className="enterprise-input"
                      value={contractStart}
                      onChange={(e) => setContractStart(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1">
                      Contract End Date <span className="text-danger">*</span>
                    </label>
                    <input
                      type="date"
                      className="enterprise-input"
                      value={contractEnd}
                      onChange={(e) => setContractEnd(e.target.value)}
                    />
                  </div>
                </>
              )}

              {serviceCategory === "Recurring_AMC" && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1">AMC Value (₹)</label>
                    <input
                      type="number"
                      className="enterprise-input"
                      placeholder="Annual contract value"
                      value={amcValue}
                      onChange={(e) => setAmcValue(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1">AMC Scope</label>
                    <input
                      type="text"
                      className="enterprise-input"
                      placeholder="Brief scope"
                      value={amcScope}
                      onChange={(e) => setAmcScope(e.target.value)}
                    />
                  </div>
                </>
              )}

              {serviceCategory === "Project" && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1">Project Code</label>
                    <input
                      type="text"
                      className="enterprise-input"
                      placeholder="e.g. PROJ-2503"
                      value={projectCode}
                      onChange={(e) => setProjectCode(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1">Milestone Tags</label>
                    <input
                      type="text"
                      className="enterprise-input"
                      placeholder="M1,M2,M3"
                      value={milestoneTags}
                      onChange={(e) => setMilestoneTags(e.target.value)}
                    />
                  </div>
                  <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
                    <input
                      type="checkbox"
                      checked={milestoneLinked}
                      onChange={(e) => setMilestoneLinked(e.target.checked)}
                      className="rounded"
                    />
                    Payment linked to milestones
                  </label>
                </>
              )}

              {serviceCategory === "Professional_Services" && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1">Consultant Name</label>
                    <input
                      type="text"
                      className="enterprise-input"
                      placeholder="Individual / Firm"
                      value={consultantName}
                      onChange={(e) => setConsultantName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1">Engagement Type</label>
                    <select
                      className="enterprise-input"
                      value={engagementType}
                      onChange={(e) => setEngagementType(e.target.value)}
                    >
                      <option value="">Select…</option>
                      <option value="Retainer">Retainer</option>
                      <option value="Per_Engagement">Per Engagement</option>
                    </select>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
                    <input
                      type="checkbox"
                      checked={tdsApplicable}
                      onChange={(e) => setTdsApplicable(e.target.checked)}
                      className="rounded"
                    />
                    TDS Applicable
                  </label>
                  {tdsApplicable && (
                    <input
                      type="text"
                      className="enterprise-input"
                      placeholder="TDS Section (e.g. 194J)"
                      value={tdsSection}
                      onChange={(e) => setTdsSection(e.target.value)}
                    />
                  )}
                </>
              )}
            </div>

            {/* Payment Terms */}
            <div className="space-y-3 pt-4 border-t border-border mt-4">
              <h3 className="text-xs font-bold text-primary-900 uppercase">Payment Terms</h3>
              <div className="bg-warning/10 border border-warning/20 p-2 rounded-sm flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                <span className="text-[10px] text-warning-800 font-bold uppercase tracking-wider">MSME — 45-day SLA applies</span>
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">
                  Payment Term Type <span className="text-danger">*</span>
                </label>
                <select
                  className="enterprise-input"
                  value={paymentTerms}
                  onChange={(e) => setPaymentTerms(e.target.value)}
                >
                  <option value="Standard">Standard (30 days from invoice verif.)</option>
                  <option value="Advance">Advance</option>
                  <option value="Milestone-linked">Milestone-linked</option>
                </select>
              </div>
              <div className="bg-primary-50 border border-primary-200 text-primary-700 text-[10px] p-2 rounded-sm">
                Payment terms are locked at PR stage and carried through to WO. Any variation requires Procurement Head approval.
              </div>
            </div>
          </div>

          {/* Documents */}
          <div className="enterprise-card p-4 space-y-4">
            <h2 className="text-sm font-bold text-primary-900 uppercase tracking-wide border-b border-border pb-2">Documents</h2>
            <p className="text-xs text-text-secondary">Vendor Quotation mandatory per SOP-PROC-001 §5.2. Scope of Work optional if detailed in Quotation.</p>

            <button
              type="button"
              onClick={() => quotationRef.current?.click()}
              className="w-full flex flex-col items-center justify-center p-4 border-2 border-dashed border-primary-300 rounded-sm bg-primary-50/30 hover:bg-primary-50 transition-colors cursor-pointer group"
            >
              {quotationFile ? (
                <>
                  <CheckCircle2 className="w-6 h-6 text-success mb-2" />
                  <span className="text-xs font-bold text-success truncate max-w-full px-2">{quotationFile.name}</span>
                  <span className="text-[10px] text-text-secondary mt-1">Click to change</span>
                </>
              ) : (
                <>
                  <UploadCloud className="w-6 h-6 text-primary-400 group-hover:text-primary-600 mb-2" />
                  <span className="text-xs font-bold text-primary-700">Upload Vendor Quotation *</span>
                  <span className="text-[10px] text-text-secondary mt-1">PDF / DOCX up to 5MB</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => scopeDocRef.current?.click()}
              className="w-full flex flex-col items-center justify-center p-4 border border-dashed border-primary-300 rounded-sm bg-primary-50/30 hover:bg-primary-50 transition-colors cursor-pointer group"
            >
              {scopeDocFile ? (
                <>
                  <CheckCircle2 className="w-5 h-5 text-success mb-2" />
                  <span className="text-[10px] font-bold text-success truncate max-w-full px-2">{scopeDocFile.name}</span>
                  <span className="text-[10px] text-text-secondary mt-1">Click to change</span>
                </>
              ) : (
                <>
                  <UploadCloud className="w-5 h-5 text-primary-400 group-hover:text-primary-600 mb-2" />
                  <span className="text-[10px] font-bold text-primary-700">Upload Scope of Work (Optional)</span>
                  <span className="text-[10px] text-text-secondary mt-1">PDF / DOCX up to 5MB</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleAutoFill}
              disabled={autoFilling || !quotationFile}
              className="w-full h-8 flex items-center justify-center gap-2 bg-gradient-to-r from-accent-600 to-accent-500 hover:from-accent-500 hover:to-accent-400 text-white text-xs font-bold rounded-sm transition-colors shadow-sm mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {autoFilling ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Extracting…</>
              ) : (
                <><Sparkles className="w-3.5 h-3.5" /> Auto-fill from Quotation</>
              )}
            </button>
          </div>
        </div>

        {/* Right Column */}
        <div className="xl:col-span-3 space-y-6">

          {/* Service Description */}
          <div className="enterprise-card p-4 space-y-4">
            <h2 className="text-sm font-bold text-primary-900 uppercase tracking-wide border-b border-border pb-2">Service Details</h2>

            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">
                Service Description <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                className="enterprise-input"
                placeholder="Describe the service clearly…"
                value={serviceDescription}
                onChange={(e) => setServiceDescription(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Service Purpose / Justification</label>
              <input
                type="text"
                className="enterprise-input"
                placeholder="Business justification for this service"
                value={servicePurpose}
                onChange={(e) => setServicePurpose(e.target.value)}
              />
            </div>

            {/* Commercials */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2 border-t border-border">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Quantity / Units</label>
                <input
                  type="number"
                  className="enterprise-input text-right"
                  placeholder="1"
                  min="0"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Rate (₹) <span className="text-danger">*</span></label>
                <input
                  type="number"
                  className="enterprise-input text-right"
                  placeholder="0.00"
                  min="0"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">GST %</label>
                <select
                  className="enterprise-input"
                  value={gstPercent}
                  onChange={(e) => setGstPercent(e.target.value)}
                >
                  <option value="0">0%</option>
                  <option value="5">5%</option>
                  <option value="12">12%</option>
                  <option value="18">18%</option>
                  <option value="28">28%</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">SAC Code</label>
                <input
                  type="text"
                  className="enterprise-input"
                  placeholder="e.g. 9983"
                  value={sacCode}
                  onChange={(e) => setSacCode(e.target.value)}
                />
              </div>
            </div>

            {/* Totals */}
            <div className="flex flex-col items-end pt-4 border-t border-border">
              <div className="w-64 space-y-2 text-sm">
                <div className="flex justify-between text-text-secondary">
                  <span>Subtotal:</span>
                  <span className="font-mono">₹ {fmt(subtotal)}</span>
                </div>
                <div className="flex justify-between text-text-secondary">
                  <span>Total GST ({gstPercent}%):</span>
                  <span className="font-mono">₹ {fmt(totalGst)}</span>
                </div>
                <div className="flex justify-between text-primary-900 font-bold border-t border-border pt-2 mt-2 text-base">
                  <span>Grand Total:</span>
                  <span className="font-mono">₹ {fmt(grandTotal)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Detailed Scope */}
          <div className="enterprise-card p-0">
            <div className="p-4 border-b border-border bg-primary-50/50">
              <h2 className="text-sm font-bold text-primary-900 uppercase tracking-wide">Detailed Scope of Work & Deliverables</h2>
              <p className="text-[10px] text-text-secondary mt-1">
                Clearly define expected outputs to ensure smooth Work Order execution and Certification.
              </p>
            </div>
            <div className="p-4">
              <textarea
                className="w-full flex min-h-[150px] rounded-sm p-3 text-sm border border-border focus:ring-1 focus:ring-primary-600 outline-none transition-colors resize-y bg-surface"
                placeholder="E.g. The contractor is responsible for casting 4 columns on the ground floor including centering and shuttering… Delivery timeline: 10 days from WO date."
                value={servicePurpose}
                onChange={(e) => setServicePurpose(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 space-y-2">
        <div className="bg-primary-50 border border-primary-200 text-primary-700 text-[11px] font-bold tracking-wide uppercase p-2 rounded-sm flex items-center justify-center text-center">
          ⚑ Segregation Control: You cannot approve your own submission. — SOP §15.1
        </div>
        <p className="text-center text-xs text-text-secondary">
          Per Crystal Group SOP-PROC-001 Version 1.1 | SOP-PROC-001
        </p>
      </div>
    </div>
  );
}
