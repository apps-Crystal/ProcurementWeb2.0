"use client";

import { useState, useRef, useEffect } from "react";
import { useDropdowns, opts } from "@/hooks/useDropdowns";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "@/components/auth/AuthProvider";
import VendorSelect from "@/components/ui/VendorSelect";
import {
  FileText,
  UploadCloud,
  Plus,
  Trash2,
  AlertTriangle,
  Sparkles,
  Save,
  Send,
  CheckCircle2,
  Loader2,
  XCircle,
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
}

export default function NewMPR() {
  const router = useRouter();
  const { user } = useCurrentUser();
  const CURRENT_USER = {
    id:   user?.userId ?? "",
    name: user?.name   ?? "",
    site: user?.site   ?? "",
  };

  const [category, setCategory]             = useState("");
  const [procurementType, setProcurementType] = useState("Standard");
  const [purpose, setPurpose]               = useState("");
  const [vendorId, setVendorId]             = useState("");
  const [vendorName, setVendorName]         = useState("");
  const [deliveryLocation, setDeliveryLocation] = useState("");
  const dropdowns = useDropdowns("SITE", "UOM", "MPR_CATEGORY", "PROCUREMENT_TYPE", "PAYMENT_TERMS", "GST_PERCENT");

  useEffect(() => {
    const siteOpts = dropdowns["SITE"];
    if (siteOpts?.length) setDeliveryLocation((prev) => prev || siteOpts[0].value);
  }, [dropdowns]);
  const [deliveryDate, setDeliveryDate]     = useState("");
  const [paymentType, setPaymentType]       = useState("Standard");
  const [advancePercent, setAdvancePercent] = useState(0);
  const [creditDays, setCreditDays]         = useState(30);
  const [retentionAmount, setRetentionAmount] = useState(0);

  const [lines, setLines] = useState<LineItem[]>([
    { id: 1, item_description: "", uom: "Nos", qty: 0, rate: 0, gst_percent: 18, hsn_code: "", item_purpose: "", last_purchase_price: 0 }
  ]);

  const [quotationFile, setQuotationFile]   = useState<File | null>(null);
  const [proformaFile, setProformaFile]     = useState<File | null>(null);
  const [supportingFile, setSupportingFile] = useState<File | null>(null);
  const quotationRef   = useRef<HTMLInputElement>(null);
  const proformaRef    = useRef<HTMLInputElement>(null);
  const supportingRef  = useRef<HTMLInputElement>(null);

  const [submitting, setSubmitting]       = useState(false);
  const [savingDraft, setSavingDraft]     = useState(false);
  const [autoFilling, setAutoFilling]     = useState(false);
  const [aiExtracted, setAiExtracted]     = useState(false);
  const [submitError, setSubmitError]     = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");
  const [draftSaved, setDraftSaved]       = useState("");

  const addLine = () => setLines([...lines, {
    id: Date.now(), item_description: "", uom: "Nos",
    qty: 0, rate: 0, gst_percent: 18, hsn_code: "",
    item_purpose: "", last_purchase_price: 0
  }]);

  const removeLine = (id: number) => {
    if (lines.length > 1) setLines(lines.filter((l) => l.id !== id));
  };

  const updateLine = (id: number, field: keyof LineItem, value: string | number) => {
    setLines(lines.map((l) => l.id === id ? { ...l, [field]: value } : l));
  };

  const subtotal   = lines.reduce((s, l) => s + l.qty * l.rate, 0);
  const totalGst   = lines.reduce((s, l) => s + (l.qty * l.rate * l.gst_percent) / 100, 0);
  const grandTotal = subtotal + totalGst;

  const handleAutoFill = async () => {
    if (!quotationFile) { setSubmitError("Upload a Vendor Quotation first to use auto-fill."); return; }
    setAutoFilling(true);
    setSubmitError("");
    try {
      const fd = new FormData();
      fd.append("file", quotationFile);
      const res  = await fetch("/api/invoices/extract-quotation", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const { extracted } = data;
      if (extracted.lines?.length) {
        setLines(extracted.lines.map((l: any, i: number) => ({
          id: i + 1,
          item_description: l.description ?? "",
          uom: l.uom ?? "Nos",
          qty: l.qty ?? 0,
          rate: l.rate ?? 0,
          gst_percent: l.gst_percent ?? 18,
          hsn_code: l.hsn_code ?? "",
          item_purpose: "",
          last_purchase_price: 0,
        })));
        setAiExtracted(true);
      } else {
        setSubmitError("AI could not extract line items. Please enter them manually.");
      }
      if (extracted.vendor_name && !vendorName) {
        setVendorName(extracted.vendor_name);
        setVendorId("");
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Auto-fill failed. Please enter items manually.");
    } finally {
      setAutoFilling(false);
    }
  };

  const handleClearAiExtract = () => {
    setAiExtracted(false);
    setLines([{ id: 1, item_description: "", uom: "Nos", qty: 0, rate: 0, gst_percent: 18, hsn_code: "", item_purpose: "", last_purchase_price: 0 }]);
  };

  const handleSaveDraft = async () => {
    setSubmitError("");
    setSavingDraft(true);
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
        lines: lines.map(({ id: _id, ...l }) => l),
        draft: true,
        ai_extracted: aiExtracted,
      }));
      if (quotationFile) fd.append("quotation", quotationFile);
      if (proformaFile)  fd.append("proforma", proformaFile);
      if (supportingFile) fd.append("supporting", supportingFile);

      const res  = await fetch("/api/pr/mpr", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setDraftSaved(data.pr_id);
      setTimeout(() => router.push("/pr/list"), 2000);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to save draft");
    } finally {
      setSavingDraft(false);
    }
  };

  const handleSubmit = async () => {
    setSubmitError("");
    if (!category)      return setSubmitError("Category is required.");
    if (!purpose)       return setSubmitError("Purpose / Justification is required.");
    if (!deliveryDate)  return setSubmitError("Expected Delivery Date is required.");
    if (!quotationFile) return setSubmitError("Vendor Quotation is mandatory (SOP §5.1).");
    if (!proformaFile)  return setSubmitError("Proforma Invoice is mandatory (SOP §5.1).");
    if (lines.some((l) => !l.item_description || l.qty <= 0 || l.rate <= 0))
      return setSubmitError("All line items must have a description, quantity, and rate.");

    setSubmitting(true);
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
        lines: lines.map(({ id: _id, ...l }) => l),
        ai_extracted: aiExtracted,
      }));
      fd.append("quotation", quotationFile);
      fd.append("proforma", proformaFile);
      if (supportingFile) fd.append("supporting", supportingFile);

      const res  = await fetch("/api/pr/mpr", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setSubmitSuccess(data.pr_id);
      setTimeout(() => router.push("/pr/list"), 2000);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (draftSaved) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <Save className="w-16 h-16 text-warning" />
        <h2 className="text-xl font-bold text-primary-900">Draft Saved</h2>
        <p className="text-sm text-text-secondary font-mono">{draftSaved}</p>
        <p className="text-xs text-text-secondary">Redirecting to PR list...</p>
      </div>
    );
  }

  if (submitSuccess) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <CheckCircle2 className="w-16 h-16 text-success" />
        <h2 className="text-xl font-bold text-primary-900">PR Submitted Successfully</h2>
        <p className="text-sm text-text-secondary font-mono">{submitSuccess}</p>
        <p className="text-xs text-text-secondary">Redirecting to PR list...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-20">

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-bold text-primary-900 tracking-tight flex items-center gap-2">
            <FileText className="w-6 h-6 text-primary-600" />
            New Material Purchase Request (F1)
          </h1>
          <p className="text-sm text-text-secondary mt-1">Raise a new request for raw materials, consumables, or equipment.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleSaveDraft} disabled={submitting || savingDraft} className="h-9 px-4 bg-surface hover:bg-primary-50 text-primary-700 text-sm font-medium rounded-sm border border-primary-200 transition-colors shadow-sm flex items-center gap-2 disabled:opacity-50">
            {savingDraft ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : <><Save className="w-4 h-4" /> Save Draft</>}
          </button>
          <button onClick={handleSubmit} disabled={submitting} className="h-9 px-4 bg-primary-900 hover:bg-primary-800 text-white text-sm font-medium rounded-sm border border-primary-950 transition-colors shadow-sm flex items-center gap-2 disabled:opacity-50">
            {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting...</> : <><Send className="w-4 h-4" /> Submit PR</>}
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
                <label className="block text-xs font-medium text-text-secondary mb-1">Procurement Type <span className="text-danger">*</span></label>
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
                <textarea className="enterprise-input h-20 py-2 resize-none" placeholder="Explain why this purchase is needed..." value={purpose} onChange={(e) => setPurpose(e.target.value)} />
              </div>

              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Preferred Vendor</label>
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
                <select className="enterprise-input" value={deliveryLocation} onChange={(e) => setDeliveryLocation(e.target.value)}>
                  {!dropdowns["SITE"]?.length && <option value="">Loading sites...</option>}
                  {opts(dropdowns, "SITE", []).map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
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
                  <input type="number" className="enterprise-input" placeholder="e.g. 30" value={advancePercent || ""} onChange={(e) => setAdvancePercent(Number(e.target.value))} />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Credit Period (Days)</label>
                <input type="number" className="enterprise-input" value={creditDays} onChange={(e) => setCreditDays(Number(e.target.value))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Retention Amount (₹)</label>
                <input type="number" className="enterprise-input" placeholder="If applicable" value={retentionAmount || ""} onChange={(e) => setRetentionAmount(Number(e.target.value))} />
              </div>
              <div className="bg-primary-50 border border-primary-200 text-primary-700 text-[10px] p-2 rounded-sm">
                Payment terms are locked at PR stage. Any variation requires Procurement Head approval.
              </div>
            </div>
          </div>

          {/* Documents */}
          <div className="enterprise-card p-4 space-y-4">
            <h2 className="text-sm font-bold text-primary-900 uppercase tracking-wide border-b border-border pb-2">Documents</h2>
            <p className="text-xs text-text-secondary">Mandatory per SOP §5.1. Files saved to Google Drive under PR folder.</p>

            <input ref={quotationRef} type="file" accept=".pdf,.jpg,.png" className="hidden" onChange={(e) => setQuotationFile(e.target.files?.[0] ?? null)} />
            <button onClick={() => quotationRef.current?.click()} className={`w-full flex flex-col items-center justify-center p-4 border-2 border-dashed rounded-sm transition-colors cursor-pointer group ${quotationFile ? "border-success bg-success/5" : "border-primary-300 bg-primary-50/30 hover:bg-primary-50"}`}>
              {quotationFile ? <CheckCircle2 className="w-5 h-5 text-success mb-1" /> : <UploadCloud className="w-6 h-6 text-primary-400 group-hover:text-primary-600 mb-2" />}
              <span className="text-xs font-bold text-primary-700">{quotationFile ? quotationFile.name : "Upload Quotation *"}</span>
              {!quotationFile && <span className="text-[10px] text-text-secondary mt-1">PDF up to 5MB</span>}
            </button>

            <input ref={proformaRef} type="file" accept=".pdf,.jpg,.png" className="hidden" onChange={(e) => setProformaFile(e.target.files?.[0] ?? null)} />
            <button onClick={() => proformaRef.current?.click()} className={`w-full flex flex-col items-center justify-center p-4 border-2 border-dashed rounded-sm transition-colors cursor-pointer group ${proformaFile ? "border-success bg-success/5" : "border-primary-300 bg-primary-50/30 hover:bg-primary-50"}`}>
              {proformaFile ? <CheckCircle2 className="w-5 h-5 text-success mb-1" /> : <UploadCloud className="w-6 h-6 text-primary-400 group-hover:text-primary-600 mb-2" />}
              <span className="text-xs font-bold text-primary-700">{proformaFile ? proformaFile.name : "Upload Proforma Invoice *"}</span>
              {!proformaFile && <span className="text-[10px] text-text-secondary mt-1">PDF up to 5MB</span>}
            </button>

            <input ref={supportingRef} type="file" accept=".pdf,.jpg,.png" className="hidden" onChange={(e) => setSupportingFile(e.target.files?.[0] ?? null)} />
            <button onClick={() => supportingRef.current?.click()} className="w-full flex flex-col items-center justify-center p-3 border border-dashed border-border rounded-sm bg-surface hover:bg-primary-50/30 transition-colors cursor-pointer">
              <span className="text-xs text-text-secondary">{supportingFile ? supportingFile.name : "Supporting Docs (optional)"}</span>
            </button>

            <button onClick={handleAutoFill} disabled={!quotationFile || autoFilling} className="w-full h-8 flex items-center justify-center gap-2 bg-gradient-to-r from-accent-600 to-accent-500 hover:from-accent-500 hover:to-accent-400 text-white text-xs font-bold rounded-sm transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">
              {autoFilling ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Extracting...</> : <><Sparkles className="w-3.5 h-3.5" /> Auto-fill from Quotation</>}
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
              <div className="flex items-center gap-2">
                {aiExtracted ? (
                  <button onClick={handleClearAiExtract} className="h-7 px-3 bg-surface border border-warning/40 text-warning-800 hover:bg-warning/10 text-xs font-semibold rounded-sm transition-colors flex items-center gap-1">
                    <RotateCcw className="w-3 h-3" /> Enter Manually
                  </button>
                ) : (
                  <button onClick={addLine} disabled={!quotationFile} className="h-7 px-3 bg-surface border border-primary-200 text-primary-700 hover:bg-primary-50 text-xs font-semibold rounded-sm transition-colors flex items-center gap-1 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed">
                    <Plus className="w-3.5 h-3.5" /> Add Row
                  </button>
                )}
              </div>
            </div>

            {/* Gate: require quotation before line items */}
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
                      ? ((line.rate - line.last_purchase_price) / line.last_purchase_price) * 100
                      : 0;
                    return (
                      <tr key={line.id} className="hover:bg-primary-50/30 transition-colors focus-within:bg-primary-50/30">
                        <td className="px-3 py-2 text-xs font-medium text-text-secondary text-center">{index + 1}</td>
                        <td className="px-3 py-2">
                          <input type="text" className="w-full bg-transparent border-0 focus:ring-1 focus:ring-primary-500 rounded-sm px-1 py-1 text-xs" placeholder="Describe item..." value={line.item_description} onChange={(e) => updateLine(line.id, "item_description", e.target.value)} />
                          {deviation > 15 && (
                            <div className="flex items-center gap-1 text-[9px] text-warning mt-1 px-1 font-medium bg-warning/10 w-fit rounded-sm border border-warning/20">
                              <AlertTriangle className="w-2.5 h-2.5" /> +{deviation.toFixed(0)}% above last price
                            </div>
                          )}
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
                          <input
                            type="number"
                            readOnly={aiExtracted}
                            className={`w-full border rounded-sm px-2 py-1 text-xs text-right ${aiExtracted ? "bg-primary-50/80 border-transparent text-primary-700 font-semibold pointer-events-none" : "bg-surface border-border focus:ring-1 focus:ring-primary-500"}`}
                            value={line.qty || ""}
                            onChange={(e) => !aiExtracted && updateLine(line.id, "qty", parseFloat(e.target.value) || 0)}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            readOnly={aiExtracted}
                            className={`w-full border rounded-sm px-2 py-1 text-xs text-right ${aiExtracted ? "bg-primary-50/80 border-transparent text-primary-700 font-semibold pointer-events-none" : "bg-surface border-border focus:ring-1 focus:ring-primary-500"}`}
                            value={line.rate || ""}
                            onChange={(e) => !aiExtracted && updateLine(line.id, "rate", parseFloat(e.target.value) || 0)}
                          />
                        </td>
                        <td className="px-3 py-2">
                          {aiExtracted ? (
                            <input readOnly className="w-full bg-primary-50/80 border-transparent text-primary-700 font-semibold pointer-events-none rounded-sm px-1 py-1 text-xs text-center" value={`${line.gst_percent}%`} />
                          ) : (
                            <select className="w-full bg-surface border border-border focus:ring-1 focus:ring-primary-500 rounded-sm px-1 py-1 text-xs" value={line.gst_percent} onChange={(e) => updateLine(line.id, "gst_percent", parseFloat(e.target.value))}>
                              {opts(dropdowns, "GST_PERCENT", [
                                { value: "0", label: "0" }, { value: "5", label: "5" },
                                { value: "12", label: "12" }, { value: "18", label: "18" }, { value: "28", label: "28" },
                              ]).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <input type="text" className="w-full bg-surface border border-border focus:ring-1 focus:ring-primary-500 rounded-sm px-2 py-1 text-xs" placeholder="e.g. 8471" value={line.hsn_code} onChange={(e) => updateLine(line.id, "hsn_code", e.target.value)} />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input readOnly className="w-full bg-primary-50/50 border border-transparent font-medium rounded-sm px-2 py-1 text-xs text-right text-primary-900 pointer-events-none" value={lineAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })} />
                        </td>
                        <td className="px-3 py-2 text-center">
                          {!aiExtracted && (
                            <button onClick={() => removeLine(line.id)} className="p-1 text-text-secondary hover:text-danger hover:bg-danger/10 rounded-sm transition-colors">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

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
