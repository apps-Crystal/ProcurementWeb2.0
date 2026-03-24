"use client";

import { useState, useRef, useEffect } from "react";
import { useDropdowns, opts } from "@/hooks/useDropdowns";
import { useRouter, useParams } from "next/navigation";
import { useCurrentUser } from "@/components/auth/AuthProvider";
import VendorSelect from "@/components/ui/VendorSelect";
import {
  FileText,
  UploadCloud,
  Plus,
  Trash2,
  AlertTriangle,
  Save,
  Send,
  CheckCircle2,
  Loader2,
  XCircle,
  ChevronLeft,
  Lock,
  RotateCcw,
} from "lucide-react";

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
  _aiOverridden?: boolean;
}

export default function EditMPR() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { user } = useCurrentUser();
  const CURRENT_USER = {
    id:   user?.userId ?? "",
    name: user?.name   ?? "",
    site: user?.site   ?? "",
  };

  const [loadingDraft, setLoadingDraft] = useState(true);
  const [category, setCategory]             = useState("");
  const [procurementType, setProcurementType] = useState("Standard");
  const [purpose, setPurpose]               = useState("");
  const [vendorId, setVendorId]             = useState("");
  const [vendorName, setVendorName]         = useState("");
  const [deliveryLocation, setDeliveryLocation] = useState("");
  const dropdowns = useDropdowns("SITE", "UOM", "MPR_CATEGORY", "PROCUREMENT_TYPE", "PAYMENT_TERMS", "GST_PERCENT");
  const [deliveryDate, setDeliveryDate]     = useState("");
  const [paymentType, setPaymentType]       = useState("Standard");
  const [advancePercent, setAdvancePercent] = useState(0);
  const [creditDays, setCreditDays]         = useState(30);
  const [retentionAmount, setRetentionAmount] = useState(0);

  const [lines, setLines] = useState<LineItem[]>([
    { id: 1, item_description: "", uom: "Nos", qty: 0, rate: 0, gst_percent: 18, hsn_code: "", item_purpose: "", last_purchase_price: 0 },
  ]);

  const [quotationFile, setQuotationFile]   = useState<File | null>(null);
  const [proformaFile, setProformaFile]     = useState<File | null>(null);
  const [supportingFile, setSupportingFile] = useState<File | null>(null);
  const quotationRef  = useRef<HTMLInputElement>(null);
  const proformaRef   = useRef<HTMLInputElement>(null);
  const supportingRef = useRef<HTMLInputElement>(null);

  // Existing file URLs from draft
  const [existingQuotationUrl, setExistingQuotationUrl]   = useState("");
  const [existingProformaUrl, setExistingProformaUrl]     = useState("");
  const [existingSupportingUrl, setExistingSupportingUrl] = useState("");

  const [aiExtracted, setAiExtracted]     = useState(false);
  const [submitting, setSubmitting]       = useState(false);
  const [savingDraft, setSavingDraft]     = useState(false);
  const [submitError, setSubmitError]     = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");
  const [draftSaved, setDraftSaved]       = useState("");

  // Load draft data
  useEffect(() => {
    fetch(`/api/pr/${id}`)
      .then((r) => r.json())
      .then(({ pr, lines: rawLines }) => {
        if (!pr) return;
        setCategory(pr.CATEGORY ?? "");
        setProcurementType(pr.PROCUREMENT_TYPE ?? "Standard");
        setPurpose(pr.PURPOSE ?? "");
        setVendorId(pr.PREFERRED_VENDOR_ID ?? "");
        setVendorName(pr.PREFERRED_VENDOR_NAME ?? "");
        setDeliveryLocation(pr.DELIVERY_LOCATION ?? "");
        setDeliveryDate(pr.EXPECTED_DELIVERY_DATE ?? "");
        setPaymentType(pr.PAYMENT_TERMS ?? "Standard");
        setAdvancePercent(parseFloat(pr.ADVANCE_PERCENT ?? "0") || 0);
        setCreditDays(parseFloat(pr.CREDIT_PERIOD_DAYS ?? "30") || 30);
        setRetentionAmount(parseFloat(pr.RETENTION_AMOUNT ?? "0") || 0);
        setExistingQuotationUrl(pr.QUOTATION_URL ?? "");
        setExistingProformaUrl(pr.PROFORMA_INVOICE_URL ?? "");
        setExistingSupportingUrl(pr.SUPPORTING_DOC_URL ?? "");
        setAiExtracted(pr.AI_EXTRACTED === "Y");

        if (rawLines?.length) {
          setLines(rawLines.map((l: any, i: number) => ({
            id: i + 1,
            item_description: l.ITEM_DESCRIPTION ?? l.ITEM_NAME ?? "",
            uom: l.UNIT_OF_MEASURE ?? "Nos",
            qty: parseFloat(l.QUANTITY ?? "0") || 0,
            rate: parseFloat(l.RATE ?? "0") || 0,
            gst_percent: parseFloat(l.GST_PERCENT ?? "18") || 18,
            hsn_code: l.HSN_CODE ?? "",
            item_purpose: l.ITEM_PURPOSE ?? "",
            last_purchase_price: parseFloat(l.LAST_PURCHASE_PRICE ?? "0") || 0,
            _aiOverridden: l.AI_OVERRIDDEN === "Y",
          })));
        }
      })
      .catch(console.error)
      .finally(() => setLoadingDraft(false));

  }, [id]);

  const addLine    = () => setLines([...lines, { id: Date.now(), item_description: "", uom: "Nos", qty: 0, rate: 0, gst_percent: 18, hsn_code: "", item_purpose: "", last_purchase_price: 0 }]);
  const removeLine = (lid: number) => { if (lines.length > 1) setLines(lines.filter((l) => l.id !== lid)); };
  const updateLine = (lid: number, field: keyof LineItem, value: string | number) => setLines(lines.map((l) => l.id === lid ? { ...l, [field]: value } : l));
  const handleClearAiExtract = () => {
    setAiExtracted(false);
    setLines([{ id: 1, item_description: "", uom: "Nos", qty: 0, rate: 0, gst_percent: 18, hsn_code: "", item_purpose: "", last_purchase_price: 0 }]);
  };

  const subtotal   = lines.reduce((s, l) => s + l.qty * l.rate, 0);
  const totalGst   = lines.reduce((s, l) => s + (l.qty * l.rate * l.gst_percent) / 100, 0);
  const grandTotal = subtotal + totalGst;

  async function callUpdate(submit: boolean) {
    if (submit) {
      setSubmitError("");
      if (!category)     return setSubmitError("Category is required.");
      if (!purpose)      return setSubmitError("Purpose / Justification is required.");
      if (!deliveryDate) return setSubmitError("Expected Delivery Date is required.");
      if (!quotationFile && !existingQuotationUrl) return setSubmitError("Vendor Quotation is mandatory (SOP §5.1).");
      if (!proformaFile  && !existingProformaUrl)  return setSubmitError("Proforma Invoice is mandatory (SOP §5.1).");
      if (lines.some((l) => !l.item_description || l.qty <= 0 || l.rate <= 0))
        return setSubmitError("All line items must have a description, quantity, and rate.");
    }

    submit ? setSubmitting(true) : setSavingDraft(true);
    try {
      const fd = new FormData();
      fd.append("data", JSON.stringify({
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
        advance_percent: advancePercent,
        credit_period_days: creditDays,
        retention_amount: retentionAmount,
        lines: lines.map(({ id: _id, _aiOverridden, ...l }) => ({
          ...l,
          ai_overridden: _aiOverridden ? "Y" : "",
        })),
        submit,
        ai_extracted: aiExtracted ? "Y" : "N",
      }));
      if (quotationFile)  fd.append("quotation",  quotationFile);
      if (proformaFile)   fd.append("proforma",   proformaFile);
      if (supportingFile) fd.append("supporting", supportingFile);

      const res  = await fetch(`/api/pr/${id}/update`, { method: "PATCH", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      if (submit) {
        setSubmitSuccess(id);
        setTimeout(() => router.push("/pr/list"), 2000);
      } else {
        setDraftSaved(id);
        setTimeout(() => router.push(`/pr/${id}`), 2000);
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Operation failed");
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
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <Save className="w-16 h-16 text-warning" />
        <h2 className="text-xl font-bold text-primary-900">Draft Saved</h2>
        <p className="text-sm text-text-secondary font-mono">{draftSaved}</p>
        <p className="text-xs text-text-secondary">Returning to PR detail…</p>
      </div>
    );
  }

  if (submitSuccess) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <CheckCircle2 className="w-16 h-16 text-success" />
        <h2 className="text-xl font-bold text-primary-900">PR Submitted Successfully</h2>
        <p className="text-sm text-text-secondary font-mono">{submitSuccess}</p>
        <p className="text-xs text-text-secondary">Redirecting to PR list…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border pb-4">
        <div>
          <button onClick={() => router.back()} className="flex items-center gap-1 text-xs text-text-secondary hover:text-primary-900 mb-2 transition-colors">
            <ChevronLeft className="w-3.5 h-3.5" /> Back
          </button>
          <h1 className="text-2xl font-bold text-primary-900 tracking-tight flex items-center gap-2">
            <FileText className="w-6 h-6 text-primary-600" />
            Edit Draft MPR — {id}
          </h1>
          <p className="text-sm text-text-secondary mt-1">Update and complete your draft material purchase request.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => callUpdate(false)} disabled={submitting || savingDraft} className="h-9 px-4 bg-surface hover:bg-primary-50 text-primary-700 text-sm font-medium rounded-sm border border-primary-200 transition-colors shadow-sm flex items-center gap-2 disabled:opacity-50">
            {savingDraft ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : <><Save className="w-4 h-4" /> Save Draft</>}
          </button>
          <button onClick={() => callUpdate(true)} disabled={submitting || savingDraft} className="h-9 px-4 bg-primary-900 hover:bg-primary-800 text-white text-sm font-medium rounded-sm border border-primary-950 transition-colors shadow-sm flex items-center gap-2 disabled:opacity-50">
            {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</> : <><Send className="w-4 h-4" /> Submit PR</>}
          </button>
        </div>
      </div>

      {submitError && (
        <div className="flex items-center gap-2 p-3 bg-danger/10 border border-danger/30 rounded-sm text-sm text-danger font-medium">
          <XCircle className="w-4 h-4 shrink-0" /> {submitError}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        {/* Left Column */}
        <div className="xl:col-span-1 space-y-6">
          <div className="enterprise-card p-4 space-y-4">
            <h2 className="text-sm font-bold text-primary-900 uppercase tracking-wide border-b border-border pb-2">PR Header</h2>

            <div className="space-y-3 bg-primary-50/50 p-3 rounded-sm border border-border/50">
              <div className="flex justify-between items-center">
                <span className="text-xs text-text-secondary">PR ID</span>
                <span className="text-xs font-mono font-bold text-primary-900">{id}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-text-secondary">Requestor</span>
                <span className="text-xs font-medium text-text-primary">{CURRENT_USER.name}</span>
              </div>
            </div>

            <div className="space-y-3 pt-2">
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

              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Procurement Type</label>
                <select className="enterprise-input" value={procurementType} onChange={(e) => setProcurementType(e.target.value)}>
                  {opts(dropdowns, "PROCUREMENT_TYPE", [
                    { value: "Standard", label: "Standard" },
                    { value: "Emergency", label: "Emergency" },
                    { value: "Repeat", label: "Repeat" },
                  ]).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Purpose / Justification <span className="text-danger">*</span></label>
                <textarea className="enterprise-input h-20 py-2 resize-none" placeholder="Explain why this purchase is needed…" value={purpose} onChange={(e) => setPurpose(e.target.value)} />
              </div>

              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Preferred Vendor</label>
                <VendorSelect value={vendorName} onChange={({ vendor_id, vendor_name }) => { setVendorId(vendor_id); setVendorName(vendor_name); }} />
              </div>

              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Delivery Location</label>
                <select className="enterprise-input" value={deliveryLocation} onChange={(e) => setDeliveryLocation(e.target.value)}>
                  {!dropdowns["SITE"]?.length && <option value="">Loading sites…</option>}
                  {opts(dropdowns, "SITE", []).map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Expected Delivery Date <span className="text-danger">*</span></label>
                <input type="date" className="enterprise-input" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
              </div>
            </div>

            <div className="space-y-3 pt-4 border-t border-border mt-4">
              <h3 className="text-xs font-bold text-primary-900 uppercase">Payment Terms</h3>
              <div className="bg-warning/10 border border-warning/20 p-2 rounded-sm flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                <span className="text-[10px] text-warning-800 font-bold uppercase tracking-wider">MSME — 45-day SLA applies</span>
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Payment Term Type</label>
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
                  <label className="block text-xs font-medium text-text-secondary mb-1">Advance %</label>
                  <input type="number" className="enterprise-input" value={advancePercent || ""} onChange={(e) => setAdvancePercent(Number(e.target.value))} />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Credit Period (Days)</label>
                <input type="number" className="enterprise-input" value={creditDays} onChange={(e) => setCreditDays(Number(e.target.value))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Retention Amount (₹)</label>
                <input type="number" className="enterprise-input" value={retentionAmount || ""} onChange={(e) => setRetentionAmount(Number(e.target.value))} />
              </div>
            </div>
          </div>

          {/* Documents */}
          <div className="enterprise-card p-4 space-y-4">
            <h2 className="text-sm font-bold text-primary-900 uppercase tracking-wide border-b border-border pb-2">Documents</h2>

            {/* Show existing files */}
            {(existingQuotationUrl || existingProformaUrl || existingSupportingUrl) && (
              <div className="space-y-1.5">
                <p className="text-[10px] text-text-secondary uppercase tracking-wider font-medium">Currently attached</p>
                {existingQuotationUrl && (
                  <a href={existingQuotationUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-xs text-primary-700 hover:underline">
                    <CheckCircle2 className="w-3.5 h-3.5 text-success" /> Quotation (uploaded)
                  </a>
                )}
                {existingProformaUrl && (
                  <a href={existingProformaUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-xs text-primary-700 hover:underline">
                    <CheckCircle2 className="w-3.5 h-3.5 text-success" /> Proforma Invoice (uploaded)
                  </a>
                )}
                {existingSupportingUrl && (
                  <a href={existingSupportingUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-xs text-primary-700 hover:underline">
                    <CheckCircle2 className="w-3.5 h-3.5 text-success" /> Supporting Doc (uploaded)
                  </a>
                )}
                <p className="text-[10px] text-text-secondary">Upload a new file below to replace.</p>
              </div>
            )}

            <input ref={quotationRef} type="file" accept=".pdf,.jpg,.png" className="hidden" onChange={(e) => setQuotationFile(e.target.files?.[0] ?? null)} />
            <button onClick={() => quotationRef.current?.click()} className={`w-full flex flex-col items-center justify-center p-4 border-2 border-dashed rounded-sm transition-colors cursor-pointer group ${quotationFile ? "border-success bg-success/5" : "border-primary-300 bg-primary-50/30 hover:bg-primary-50"}`}>
              {quotationFile ? <CheckCircle2 className="w-5 h-5 text-success mb-1" /> : <UploadCloud className="w-6 h-6 text-primary-400 group-hover:text-primary-600 mb-2" />}
              <span className="text-xs font-bold text-primary-700">{quotationFile ? quotationFile.name : (existingQuotationUrl ? "Replace Quotation" : "Upload Quotation *")}</span>
            </button>

            <input ref={proformaRef} type="file" accept=".pdf,.jpg,.png" className="hidden" onChange={(e) => setProformaFile(e.target.files?.[0] ?? null)} />
            <button onClick={() => proformaRef.current?.click()} className={`w-full flex flex-col items-center justify-center p-4 border-2 border-dashed rounded-sm transition-colors cursor-pointer group ${proformaFile ? "border-success bg-success/5" : "border-primary-300 bg-primary-50/30 hover:bg-primary-50"}`}>
              {proformaFile ? <CheckCircle2 className="w-5 h-5 text-success mb-1" /> : <UploadCloud className="w-6 h-6 text-primary-400 group-hover:text-primary-600 mb-2" />}
              <span className="text-xs font-bold text-primary-700">{proformaFile ? proformaFile.name : (existingProformaUrl ? "Replace Proforma Invoice" : "Upload Proforma Invoice *")}</span>
            </button>

            <input ref={supportingRef} type="file" accept=".pdf,.jpg,.png" className="hidden" onChange={(e) => setSupportingFile(e.target.files?.[0] ?? null)} />
            <button onClick={() => supportingRef.current?.click()} className="w-full flex flex-col items-center justify-center p-3 border border-dashed border-border rounded-sm bg-surface hover:bg-primary-50/30 transition-colors cursor-pointer">
              <span className="text-xs text-text-secondary">{supportingFile ? supportingFile.name : "Supporting Docs (optional)"}</span>
            </button>
          </div>
        </div>

        {/* Right Column — Line Items */}
        <div className="xl:col-span-3 space-y-6">
          <div className="enterprise-card flex flex-col h-full min-h-[500px]">
            <div className="p-4 border-b border-border bg-primary-50/50 flex justify-between items-center gap-2">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-primary-900 uppercase tracking-wide">Line Items</h2>
                {aiExtracted && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-accent-700 bg-accent-50 border border-accent-200 px-2 py-0.5 rounded-sm uppercase tracking-wider">
                    <Lock className="w-2.5 h-2.5" /> AI Extracted
                  </span>
                )}
              </div>
              {aiExtracted && (
                <button onClick={handleClearAiExtract} className="h-7 px-3 bg-surface border border-warning/40 text-warning-800 hover:bg-warning/10 text-xs font-semibold rounded-sm transition-colors flex items-center gap-1">
                  <RotateCcw className="w-3 h-3" /> Enter Manually
                </button>
              )}
              <button onClick={addLine} className="h-7 px-3 bg-surface border border-primary-200 text-primary-700 hover:bg-primary-50 text-xs font-semibold rounded-sm transition-colors flex items-center gap-1 shadow-sm">
                <Plus className="w-3.5 h-3.5" /> Add Row
              </button>
            </div>

            <div className="flex-1 overflow-x-auto p-0">
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
                  {lines.map((line, index) => (
                    <tr key={line.id} className={`transition-colors focus-within:bg-primary-50/30 ${line._aiOverridden ? "border-l-2 border-amber-400 bg-amber-50/40" : "hover:bg-primary-50/30"}`}>
                      <td className="px-3 py-2 text-xs font-medium text-text-secondary text-center">
                        {index + 1}
                        {line._aiOverridden && (
                          <span className="block text-[8px] font-bold text-amber-600 bg-amber-100 rounded-sm px-0.5 mt-0.5 leading-tight">AI Edited</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <input type="text" className="w-full bg-transparent border-0 focus:ring-1 focus:ring-primary-500 rounded-sm px-1 py-1 text-xs" placeholder="Describe item…" value={line.item_description} onChange={(e) => updateLine(line.id, "item_description", e.target.value)} />
                      </td>
                      <td className="px-3 py-2">
                        <select className="w-full bg-surface border border-border focus:ring-1 focus:ring-primary-500 rounded-sm px-1 py-1 text-xs" value={line.uom} onChange={(e) => updateLine(line.id, "uom", e.target.value)}>
                          {opts(dropdowns, "UOM", [
                            { value: "Nos", label: "Nos" }, { value: "Kg", label: "Kg" },
                            { value: "Ltr", label: "Ltr" }, { value: "Box", label: "Box" },
                            { value: "Mtr", label: "Mtr" }, { value: "Set", label: "Set" },
                          ]).map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" className="w-full border rounded-sm px-2 py-1 text-xs text-right bg-surface border-border focus:ring-1 focus:ring-primary-500" value={line.qty || ""} onChange={(e) => updateLine(line.id, "qty", parseFloat(e.target.value) || 0)} />
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" className="w-full border rounded-sm px-2 py-1 text-xs text-right bg-surface border-border focus:ring-1 focus:ring-primary-500" value={line.rate || ""} onChange={(e) => updateLine(line.id, "rate", parseFloat(e.target.value) || 0)} />
                      </td>
                      <td className="px-3 py-2">
                        <select className="w-full bg-surface border border-border focus:ring-1 focus:ring-primary-500 rounded-sm px-1 py-1 text-xs" value={line.gst_percent} onChange={(e) => updateLine(line.id, "gst_percent", parseFloat(e.target.value))}>
                          {opts(dropdowns, "GST_PERCENT", [
                            { value: "0", label: "0" }, { value: "5", label: "5" },
                            { value: "12", label: "12" }, { value: "18", label: "18" }, { value: "28", label: "28" },
                          ]).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input type="text" className="w-full bg-surface border border-border focus:ring-1 focus:ring-primary-500 rounded-sm px-2 py-1 text-xs" placeholder="e.g. 8471" value={line.hsn_code} onChange={(e) => updateLine(line.id, "hsn_code", e.target.value)} />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input readOnly className="w-full bg-primary-50/50 border border-transparent font-medium rounded-sm px-2 py-1 text-xs text-right text-primary-900 pointer-events-none" value={(line.qty * line.rate).toLocaleString("en-IN", { minimumFractionDigits: 2 })} />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <button onClick={() => removeLine(line.id)} className="p-1 text-text-secondary hover:text-danger hover:bg-danger/10 rounded-sm transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="p-4 border-t border-border bg-surface mt-auto flex flex-col items-end">
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
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 space-y-2">
        <div className="bg-primary-50 border border-primary-200 text-primary-700 text-[11px] font-bold tracking-wide uppercase p-2 rounded-sm flex items-center justify-center text-center">
          ⚑ Segregation Control: You cannot approve your own submission. — SOP §15.1
        </div>
        <p className="text-center text-xs text-text-secondary">Per Crystal Group SOP-PROC-001 Version 1.1</p>
      </div>
    </div>
  );
}
