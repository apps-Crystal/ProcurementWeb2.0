"use client";

import { useRef, useState, useEffect } from "react";
import { useDropdowns, opts } from "@/hooks/useDropdowns";
import { useRouter, useParams } from "next/navigation";
import {
  Briefcase,
  UploadCloud,
  AlertTriangle,
  Save,
  Send,
  CheckCircle2,
  Loader2,
  XCircle,
  ChevronLeft,
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

export default function EditSPR() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { user } = useCurrentUser();
  const CURRENT_USER = {
    id:   user?.userId ?? "",
    name: user?.name   ?? "",
    site: user?.site   ?? "",
  };

  const [loadingDraft, setLoadingDraft] = useState(true);

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
  const dropdowns = useDropdowns("SITE", "SERVICE_CATEGORY", "ENGAGEMENT_TYPE", "PAYMENT_TERMS", "GST_PERCENT");
  const [qty, setQty] = useState("1");
  const [rate, setRate] = useState("");
  const [gstPercent, setGstPercent] = useState("18");

  const [existingQuotationUrl, setExistingQuotationUrl] = useState("");
  const [existingScopeDocUrl, setExistingScopeDocUrl]   = useState("");
  const [quotationFile, setQuotationFile] = useState<File | null>(null);
  const [scopeDocFile, setScopeDocFile]   = useState<File | null>(null);
  const quotationRef = useRef<HTMLInputElement>(null);
  const scopeDocRef  = useRef<HTMLInputElement>(null);

  const [submitting, setSubmitting]   = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [error, setError]             = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");
  const [draftSaved, setDraftSaved]   = useState("");

  const qtyN  = parseFloat(qty)  || 0;
  const rateN = parseFloat(rate) || 0;
  const gstN  = parseFloat(gstPercent) || 0;
  const subtotal   = qtyN * rateN;
  const totalGst   = (subtotal * gstN) / 100;
  const grandTotal = subtotal + totalGst;
  const fmt = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Load draft data
  useEffect(() => {
    fetch(`/api/pr/${id}`)
      .then((r) => r.json())
      .then(({ pr }) => {
        if (!pr) return;
        setServiceCategory((pr.SERVICE_CATEGORY ?? "") as ServiceCategory);
        setServiceSubcategory(pr.SERVICE_SUBCATEGORY ?? "");
        setServiceDescription(pr.SERVICE_DESCRIPTION ?? "");
        setServicePurpose(pr.SERVICE_PURPOSE ?? "");
        setVendorId(pr.VENDOR_ID ?? "");
        setVendorName(pr.VENDOR_NAME ?? "");
        setPaymentTerms(pr.PAYMENT_TERMS ?? "Standard");
        setContractStart(pr.CONTRACT_START_DATE ?? "");
        setContractEnd(pr.CONTRACT_END_DATE ?? "");
        setAmcValue(pr.AMC_VALUE ?? "");
        setAmcScope(pr.AMC_SCOPE ?? "");
        setProjectCode(pr.PROJECT_CODE ?? "");
        setMilestoneTags(pr.MILESTONE_TAGS ?? "");
        setMilestoneLinked(pr.PAYMENT_LINKED_TO_MILESTONES === "Y");
        setConsultantName(pr.CONSULTANT_NAME ?? "");
        setEngagementType(pr.ENGAGEMENT_TYPE ?? "");
        setSacCode(pr.SAC_CODE ?? "");
        setTdsApplicable(pr.TDS_APPLICABLE === "Y");
        setTdsSection(pr.TDS_SECTION ?? "");
        setDeliveryLocation(pr.DELIVERY_LOCATION ?? "");
        setQty(pr.QUANTITY ?? "1");
        setRate(pr.RATE ?? "");
        setGstPercent(pr.GST_PERCENT ?? "18");
        setExistingQuotationUrl(pr.QUOTATION_URL ?? "");
        setExistingScopeDocUrl(pr.SCOPE_DOC_URL ?? "");
      })
      .catch(console.error)
      .finally(() => setLoadingDraft(false));

  }, [id]);

  async function callUpdate(submit: boolean) {
    setError("");
    if (submit) {
      if (!serviceCategory)          { setError("Service Category is required.");   return; }
      if (!serviceDescription.trim()) { setError("Service Description is required."); return; }
      if (!rate)                      { setError("Rate is required.");               return; }
      if (!quotationFile && !existingQuotationUrl) { setError("Vendor Quotation is mandatory (SOP §5.2)."); return; }
    }

    submit ? setSubmitting(true) : setSavingDraft(true);
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
        submit,
      };

      const fd = new FormData();
      fd.append("data", JSON.stringify(payload));
      if (quotationFile) fd.append("quotation", quotationFile);
      if (scopeDocFile)  fd.append("scope_doc", scopeDocFile);

      const res  = await fetch(`/api/pr/${id}/update`, { method: "PATCH", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Operation failed");

      if (submit) {
        setSubmitSuccess(id);
        setTimeout(() => router.push("/pr/list"), 2000);
      } else {
        setDraftSaved(id);
        setTimeout(() => router.push(`/pr/${id}`), 2000);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operation failed");
    } finally {
      submit ? setSubmitting(false) : setSavingDraft(false);
    }
  }

  if (loadingDraft) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-primary-400" />
      </div>
    );
  }

  if (draftSaved) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Save className="w-16 h-16 text-warning" />
        <h2 className="text-2xl font-bold text-primary-900">Draft Saved</h2>
        <p className="text-text-secondary font-mono font-bold text-primary-700">{draftSaved}</p>
        <p className="text-xs text-text-secondary">Returning to PR detail…</p>
      </div>
    );
  }

  if (submitSuccess) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <CheckCircle2 className="w-16 h-16 text-success" />
        <h2 className="text-2xl font-bold text-primary-900">SPR Submitted</h2>
        <p className="text-text-secondary">
          <span className="font-mono font-bold text-primary-700">{submitSuccess}</span> has been submitted for approval.
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
          <button onClick={() => router.back()} className="flex items-center gap-1 text-xs text-text-secondary hover:text-primary-900 mb-2 transition-colors">
            <ChevronLeft className="w-3.5 h-3.5" /> Back
          </button>
          <h1 className="text-2xl font-bold text-primary-900 tracking-tight flex items-center gap-2">
            <Briefcase className="w-6 h-6 text-primary-600" />
            Edit Draft SPR — {id}
          </h1>
          <p className="text-sm text-text-secondary mt-1">Update and complete your draft service purchase request.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => callUpdate(false)} disabled={submitting || savingDraft} className="h-9 px-4 bg-surface hover:bg-primary-50 text-primary-700 text-sm font-medium rounded-sm border border-primary-200 transition-colors shadow-sm flex items-center gap-2 disabled:opacity-50">
            {savingDraft ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : <><Save className="w-4 h-4" /> Save Draft</>}
          </button>
          <button onClick={() => callUpdate(true)} disabled={submitting || savingDraft} className="h-9 px-4 bg-primary-900 hover:bg-primary-800 text-white text-sm font-medium rounded-sm border border-primary-950 transition-colors shadow-sm flex items-center gap-2 disabled:opacity-60">
            {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</> : <><Send className="w-4 h-4" /> Submit SPR</>}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-danger/10 border border-danger/30 text-danger text-sm p-3 rounded-sm flex items-center gap-2">
          <XCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      <input ref={quotationRef} type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={(e) => setQuotationFile(e.target.files?.[0] ?? null)} />
      <input ref={scopeDocRef}  type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={(e) => setScopeDocFile(e.target.files?.[0] ?? null)} />

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        {/* Left Column */}
        <div className="xl:col-span-1 space-y-6">
          <div className="enterprise-card p-4 space-y-4">
            <h2 className="text-sm font-bold text-primary-900 uppercase tracking-wide border-b border-border pb-2">SPR Header</h2>

            <div className="space-y-3 bg-primary-50/50 p-3 rounded-sm border border-border/50">
              <div className="flex justify-between items-center">
                <span className="text-xs text-text-secondary">SPR ID</span>
                <span className="text-xs font-mono font-bold text-primary-900">{id}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-text-secondary">Requestor</span>
                <span className="text-xs font-medium text-text-primary">{CURRENT_USER.name}</span>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Service Category <span className="text-danger">*</span></label>
                <select className="enterprise-input" value={serviceCategory} onChange={(e) => { setServiceCategory(e.target.value as ServiceCategory); setServiceSubcategory(""); }}>
                  <option value="">Select Category</option>
                  {opts(dropdowns, "SERVICE_CATEGORY", [
                    { value: "One_Time", label: "One-Time Service" },
                    { value: "Recurring_AMC", label: "Recurring / AMC" },
                    { value: "Project", label: "Project" },
                    { value: "Professional_Services", label: "Professional Services" },
                  ]).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>

              {subcategories.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">Sub-category</label>
                  <select className="enterprise-input" value={serviceSubcategory} onChange={(e) => setServiceSubcategory(e.target.value)}>
                    <option value="">Select…</option>
                    {subcategories.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Preferred Service Provider</label>
                <VendorSelect value={vendorName} onChange={({ vendor_id, vendor_name }) => { setVendorId(vendor_id); setVendorName(vendor_name); }} />
              </div>

              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Delivery Location</label>
                <select className="enterprise-input" value={deliveryLocation} onChange={(e) => setDeliveryLocation(e.target.value)}>
                  {!dropdowns["SITE"]?.length && <option value="">Loading sites…</option>}
                  {opts(dropdowns, "SITE", []).map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>

              {(serviceCategory === "Recurring_AMC" || serviceCategory === "Project") && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1">Contract Start Date</label>
                    <input type="date" className="enterprise-input" value={contractStart} onChange={(e) => setContractStart(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1">Contract End Date</label>
                    <input type="date" className="enterprise-input" value={contractEnd} onChange={(e) => setContractEnd(e.target.value)} />
                  </div>
                </>
              )}

              {serviceCategory === "Recurring_AMC" && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1">AMC Value (₹)</label>
                    <input type="number" className="enterprise-input" value={amcValue} onChange={(e) => setAmcValue(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1">AMC Scope</label>
                    <input type="text" className="enterprise-input" value={amcScope} onChange={(e) => setAmcScope(e.target.value)} />
                  </div>
                </>
              )}

              {serviceCategory === "Project" && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1">Project Code</label>
                    <input type="text" className="enterprise-input" value={projectCode} onChange={(e) => setProjectCode(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1">Milestone Tags</label>
                    <input type="text" className="enterprise-input" value={milestoneTags} onChange={(e) => setMilestoneTags(e.target.value)} />
                  </div>
                  <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
                    <input type="checkbox" checked={milestoneLinked} onChange={(e) => setMilestoneLinked(e.target.checked)} className="rounded" />
                    Payment linked to milestones
                  </label>
                </>
              )}

              {serviceCategory === "Professional_Services" && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1">Consultant Name</label>
                    <input type="text" className="enterprise-input" value={consultantName} onChange={(e) => setConsultantName(e.target.value)} />
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
                    <input type="text" className="enterprise-input" placeholder="TDS Section (e.g. 194J)" value={tdsSection} onChange={(e) => setTdsSection(e.target.value)} />
                  )}
                </>
              )}
            </div>

            <div className="space-y-3 pt-4 border-t border-border mt-4">
              <h3 className="text-xs font-bold text-primary-900 uppercase">Payment Terms</h3>
              <div className="bg-warning/10 border border-warning/20 p-2 rounded-sm flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                <span className="text-[10px] text-warning-800 font-bold uppercase tracking-wider">MSME — 45-day SLA applies</span>
              </div>
              <select className="enterprise-input" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)}>
                {opts(dropdowns, "PAYMENT_TERMS", [
                  { value: "Standard", label: "Standard (30 days from invoice verif.)" },
                  { value: "Advance", label: "Advance" },
                  { value: "Milestone-linked", label: "Milestone-linked" },
                ]).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          {/* Documents */}
          <div className="enterprise-card p-4 space-y-4">
            <h2 className="text-sm font-bold text-primary-900 uppercase tracking-wide border-b border-border pb-2">Documents</h2>

            {(existingQuotationUrl || existingScopeDocUrl) && (
              <div className="space-y-1.5">
                <p className="text-[10px] text-text-secondary uppercase tracking-wider font-medium">Currently attached</p>
                {existingQuotationUrl && (
                  <a href={existingQuotationUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-xs text-primary-700 hover:underline">
                    <CheckCircle2 className="w-3.5 h-3.5 text-success" /> Quotation (uploaded)
                  </a>
                )}
                {existingScopeDocUrl && (
                  <a href={existingScopeDocUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-xs text-primary-700 hover:underline">
                    <CheckCircle2 className="w-3.5 h-3.5 text-success" /> Scope of Work (uploaded)
                  </a>
                )}
                <p className="text-[10px] text-text-secondary">Upload a new file below to replace.</p>
              </div>
            )}

            <button type="button" onClick={() => quotationRef.current?.click()} className={`w-full flex flex-col items-center justify-center p-4 border-2 border-dashed rounded-sm transition-colors cursor-pointer group ${quotationFile ? "border-success bg-success/5" : "border-primary-300 bg-primary-50/30 hover:bg-primary-50"}`}>
              {quotationFile ? <><CheckCircle2 className="w-6 h-6 text-success mb-2" /><span className="text-xs font-bold text-success">{quotationFile.name}</span></> : <><UploadCloud className="w-6 h-6 text-primary-400 group-hover:text-primary-600 mb-2" /><span className="text-xs font-bold text-primary-700">{existingQuotationUrl ? "Replace Quotation" : "Upload Vendor Quotation *"}</span></>}
            </button>

            <button type="button" onClick={() => scopeDocRef.current?.click()} className={`w-full flex flex-col items-center justify-center p-4 border border-dashed rounded-sm transition-colors cursor-pointer group ${scopeDocFile ? "border-success bg-success/5" : "border-primary-300 bg-primary-50/30 hover:bg-primary-50"}`}>
              {scopeDocFile ? <><CheckCircle2 className="w-5 h-5 text-success mb-1" /><span className="text-[10px] font-bold text-success">{scopeDocFile.name}</span></> : <><UploadCloud className="w-5 h-5 text-primary-400 group-hover:text-primary-600 mb-1" /><span className="text-[10px] font-bold text-primary-700">{existingScopeDocUrl ? "Replace Scope of Work" : "Upload Scope of Work (Optional)"}</span></>}
            </button>
          </div>
        </div>

        {/* Right Column */}
        <div className="xl:col-span-3 space-y-6">
          <div className="enterprise-card p-4 space-y-4">
            <h2 className="text-sm font-bold text-primary-900 uppercase tracking-wide border-b border-border pb-2">Service Details</h2>

            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Service Description <span className="text-danger">*</span></label>
              <input type="text" className="enterprise-input" placeholder="Describe the service clearly…" value={serviceDescription} onChange={(e) => setServiceDescription(e.target.value)} />
            </div>

            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Service Purpose / Justification</label>
              <input type="text" className="enterprise-input" placeholder="Business justification for this service" value={servicePurpose} onChange={(e) => setServicePurpose(e.target.value)} />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2 border-t border-border">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Quantity / Units</label>
                <input type="number" className="enterprise-input text-right" value={qty} onChange={(e) => setQty(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Rate (₹) <span className="text-danger">*</span></label>
                <input type="number" className="enterprise-input text-right" placeholder="0.00" value={rate} onChange={(e) => setRate(e.target.value)} />
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
                <input type="text" className="enterprise-input" placeholder="e.g. 9983" value={sacCode} onChange={(e) => setSacCode(e.target.value)} />
              </div>
            </div>

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

          <div className="enterprise-card p-0">
            <div className="p-4 border-b border-border bg-primary-50/50">
              <h2 className="text-sm font-bold text-primary-900 uppercase tracking-wide">Detailed Scope of Work & Deliverables</h2>
            </div>
            <div className="p-4">
              <textarea className="w-full flex min-h-[150px] rounded-sm p-3 text-sm border border-border focus:ring-1 focus:ring-primary-600 outline-none transition-colors resize-y bg-surface" placeholder="E.g. The contractor is responsible for casting 4 columns…" value={servicePurpose} onChange={(e) => setServicePurpose(e.target.value)} />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 space-y-2">
        <div className="bg-primary-50 border border-primary-200 text-primary-700 text-[11px] font-bold tracking-wide uppercase p-2 rounded-sm flex items-center justify-center text-center">
          ⚑ Segregation Control: You cannot approve your own submission. — SOP §15.1
        </div>
        <p className="text-center text-xs text-text-secondary">Per Crystal Group SOP-PROC-001 Version 1.1 | SOP-PROC-001</p>
      </div>
    </div>
  );
}
