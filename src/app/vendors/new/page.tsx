"use client";

import { useRef, useState } from "react";
import { useDropdowns, opts } from "@/hooks/useDropdowns";
import { useRouter } from "next/navigation";
import {
  Users, UploadCloud, Save, Send, Building2, MapPin,
  Banknote, FileQuestion, Briefcase, CheckCircle2, AlertTriangle, Loader2,
} from "lucide-react";
import { useCurrentUser } from "@/components/auth/AuthProvider";

type DocKey = "cancelled_cheque" | "gst_cert" | "pan_copy" | "msme_cert";

const DOC_SLOTS: { key: DocKey; label: string; required: boolean; hint: string }[] = [
  { key: "pan_copy",         label: "PAN Card Copy",         required: true,  hint: "PDF / JPG up to 5 MB" },
  { key: "gst_cert",         label: "GST Registration Copy", required: true,  hint: "PDF up to 5 MB — for primary GST number" },
  { key: "cancelled_cheque", label: "Cancelled Cheque",      required: true,  hint: "PDF / JPG — for primary bank account" },
  { key: "msme_cert",        label: "MSME Certificate",      required: false, hint: "Required if MSME" },
];

export default function VendorRegistration() {
  const router = useRouter();
  const { user } = useCurrentUser();

  // Company
  const [companyName, setCompanyName]   = useState("");
  const [tradeName, setTradeName]       = useState("");
  const [entityType, setEntityType]     = useState("");
  const [vendorType, setVendorType]     = useState("");
  const [pan, setPan]                   = useState("");
  const [isMsme, setIsMsme]             = useState("Non-MSME");
  const [udyam, setUdyam]               = useState("");
  const [tdsCategory, setTdsCategory]   = useState("Not Applicable");

  // Address
  const [address, setAddress]     = useState("");
  const [city, setCity]           = useState("");
  const [stateVal, setStateVal]   = useState("");
  const [pinCode, setPinCode]     = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [designation, setDesignation]     = useState("");
  const [email, setEmail]                 = useState("");
  const [phone, setPhone]                 = useState("");

  // Primary Sub-Profile (Financial)
  const [subProfileLabel, setSubProfileLabel]     = useState("Primary");
  const [gstin, setGstin]                         = useState("");
  const [billingAddressSame, setBillingAddressSame] = useState(true);
  const [billingAddress, setBillingAddress]         = useState("");
  const [billingState, setBillingState]             = useState("");
  const [beneficiaryName, setBeneficiaryName]       = useState("");
  const [bankName, setBankName]                     = useState("");
  const [branchName, setBranchName]                 = useState("");
  const [accountNumber, setAccountNumber]           = useState("");
  const [confirmAccount, setConfirmAccount]         = useState("");
  const [ifscCode, setIfscCode]                     = useState("");
  const [accountType, setAccountType]               = useState("Current");

  // Experience
  const [yearsInBusiness, setYearsInBusiness] = useState("");
  const [keyClients, setKeyClients]           = useState("");
  const [workNotes, setWorkNotes]             = useState("");
  const [capacityScale, setCapacityScale]     = useState("");

  const [docs, setDocs] = useState<Record<DocKey, File | null>>({
    cancelled_cheque: null, gst_cert: null, pan_copy: null, msme_cert: null,
  });
  const chequeRef = useRef<HTMLInputElement>(null);
  const gstRef    = useRef<HTMLInputElement>(null);
  const panRef    = useRef<HTMLInputElement>(null);
  const msmeRef   = useRef<HTMLInputElement>(null);
  const refMap: Record<DocKey, React.RefObject<HTMLInputElement | null>> = {
    cancelled_cheque: chequeRef, gst_cert: gstRef, pan_copy: panRef, msme_cert: msmeRef,
  };

  const dropdowns = useDropdowns("VENDOR_TYPE", "TDS_CATEGORY", "ACCOUNT_TYPE");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState("");
  const [successId, setSuccessId]   = useState("");
  const [duplicate, setDuplicate]   = useState<{ vendor_id: string; company_name: string; status: string } | null>(null);

  // Validation regex constants
  const PAN_REGEX    = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
  const GSTIN_REGEX  = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
  const UDYAM_REGEX  = /^UDYAM-[A-Z]{2}-[0-9]{2}-[0-9]{7}$/;
  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

  function handleDocChange(key: DocKey, file: File | null) {
    if (file && file.size > MAX_FILE_SIZE) {
      setError(`${file.name}: File size exceeds 5 MB limit. Please upload a smaller file.`);
      return;
    }
    setDocs((p) => ({ ...p, [key]: file }));
  }

  async function handleSubmit() {
    setError("");
    setDuplicate(null);
    if (!companyName.trim())   { setError("Legal Company Name is required."); return; }
    if (!vendorType)           { setError("Vendor Type is required."); return; }

    // BUG-017: PAN format validation
    if (!pan.trim())           { setError("PAN Number is required."); return; }
    if (!PAN_REGEX.test(pan))  { setError("Invalid PAN format. Must be 5 letters, 4 digits, 1 letter (e.g. ABCDE1234F)."); return; }

    // BUG-018: Udyam mandatory for MSME + format validation
    if (isMsme !== "Non-MSME") {
      if (!udyam.trim()) { setError("Udyam Registration Number is mandatory for MSME vendors."); return; }
      if (!UDYAM_REGEX.test(udyam)) { setError("Invalid Udyam format. Expected: UDYAM-XX-00-0000000 (e.g. UDYAM-MH-12-0001234)."); return; }
    }

    // BUG-013: GSTIN format validation
    if (!gstin.trim())         { setError("GSTIN is required."); return; }
    if (!GSTIN_REGEX.test(gstin)) { setError("Invalid GSTIN format. Expected 15-character GST Identification Number (e.g. 22AAAAA0000A1Z5)."); return; }

    if (!contactPerson.trim()) { setError("Contact Person is required."); return; }
    if (!email.trim())         { setError("Email is required."); return; }
    if (!phone.trim())         { setError("Phone is required."); return; }
    if (!bankName.trim())      { setError("Bank Name is required."); return; }
    if (!accountNumber.trim()) { setError("Account Number is required."); return; }
    if (accountNumber !== confirmAccount) { setError("Account numbers do not match."); return; }
    if (!ifscCode.trim())      { setError("IFSC Code is required."); return; }

    // BUG-015: Minimum 2 key client references
    const clientLines = keyClients.split("\n").map((s) => s.trim()).filter(Boolean);
    if (clientLines.length < 2) { setError("At least 2 key client references are required (SOP §11). Please enter one client per line."); return; }

    if (!docs.pan_copy)         { setError("PAN Card Copy is mandatory."); return; }
    if (!docs.gst_cert)         { setError("GST Registration Copy is mandatory."); return; }
    if (!docs.cancelled_cheque) { setError("Cancelled Cheque is mandatory."); return; }
    if (isMsme !== "Non-MSME" && !docs.msme_cert) { setError("MSME Certificate required."); return; }

    setSubmitting(true);
    try {
      const payload = {
        company_name: companyName, trade_name: tradeName, entity_type: entityType,
        vendor_type: vendorType, pan: pan.toUpperCase(),
        is_msme: isMsme === "Non-MSME" ? "N" : "Y", udyam_reg_number: udyam, tds_category: tdsCategory,
        address, city, state: stateVal, pin_code: pinCode,
        contact_person: contactPerson, designation, email, phone,
        // Primary sub-profile
        sub_profile_label: subProfileLabel,
        gstin: gstin.toUpperCase(),
        billing_address: billingAddressSame ? "" : billingAddress,
        billing_state:   billingAddressSame ? "" : billingState,
        beneficiary_name: beneficiaryName, bank_name: bankName, branch_name: branchName,
        account_number: accountNumber, ifsc_code: ifscCode.toUpperCase(), account_type: accountType,
        // Experience
        years_in_business: yearsInBusiness, key_client_1: clientLines[0] ?? "", key_client_2: clientLines[1] ?? "",
        work_experience_notes: workNotes, capacity_scale: capacityScale,
        registered_by: user?.userId ?? "SYSTEM",
      };

      const fd = new FormData();
      fd.append("data", JSON.stringify(payload));
      fd.append("pan_copy",         docs.pan_copy!);
      fd.append("gst_cert",         docs.gst_cert!);
      fd.append("cancelled_cheque", docs.cancelled_cheque!);
      if (docs.msme_cert) fd.append("msme_cert", docs.msme_cert);

      const res  = await fetch("/api/vendors", { method: "POST", body: fd });
      const json = await res.json();
      if (res.status === 409 && json.duplicate) {
        setError(json.error);
        setDuplicate(json.duplicate);
        return;
      }
      if (!res.ok) throw new Error(json.error ?? "Submission failed");
      setSuccessId(json.ven_id);
      setTimeout(() => router.push("/vendors"), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (successId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <CheckCircle2 className="w-16 h-16 text-success" />
        <h2 className="text-2xl font-bold text-primary-900">Vendor Submitted for KYC</h2>
        <p className="text-text-secondary">
          Vendor ID <span className="font-mono font-bold text-primary-700">{successId}</span> created.
          KYC documents uploaded to Google Drive under <span className="font-mono">ROOT/VENDORS/{successId}/</span>
        </p>
        <p className="text-xs text-text-secondary">Redirecting to vendor list…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-20">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-bold text-primary-900 tracking-tight flex items-center gap-2">
            <Users className="w-6 h-6 text-primary-600" /> Vendor Registration (F7)
          </h1>
          <p className="text-sm text-text-secondary mt-1">Onboard a new supplier or service contractor into the master database.</p>
        </div>
        <div className="flex items-center gap-2">
          <button disabled className="h-9 px-4 bg-surface text-primary-700 text-sm font-medium rounded-sm border border-primary-200 shadow-sm flex items-center gap-2 opacity-50 cursor-not-allowed">
            <Save className="w-4 h-4" /> Save Draft
          </button>
          <button onClick={handleSubmit} disabled={submitting}
            className="h-9 px-4 bg-primary-900 hover:bg-primary-800 text-white text-sm font-medium rounded-sm border border-primary-950 shadow-sm flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed transition-colors">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Submit for KYC
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 text-sm text-danger bg-danger/10 border border-danger/30 rounded-sm px-3 py-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
        </div>
      )}
      {duplicate && (
        <div className="flex items-center justify-between gap-3 text-sm bg-yellow-50 border border-yellow-300 rounded-sm px-3 py-2">
          <span className="text-yellow-800">
            <strong>{duplicate.company_name}</strong> — Status: {duplicate.status}
          </span>
          <a href={`/vendors/${duplicate.vendor_id}`} target="_blank" rel="noopener noreferrer"
            className="shrink-0 text-xs font-medium text-white bg-yellow-600 hover:bg-yellow-700 px-3 py-1 rounded">
            View Vendor
          </a>
        </div>
      )}

      {/* Hidden file inputs */}
      <input ref={panRef}    type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={(e) => handleDocChange("pan_copy",         e.target.files?.[0] ?? null)} />
      <input ref={gstRef}    type="file" accept=".pdf"                 className="hidden" onChange={(e) => handleDocChange("gst_cert",         e.target.files?.[0] ?? null)} />
      <input ref={chequeRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={(e) => handleDocChange("cancelled_cheque", e.target.files?.[0] ?? null)} />
      <input ref={msmeRef}   type="file" accept=".pdf"                 className="hidden" onChange={(e) => handleDocChange("msme_cert",        e.target.files?.[0] ?? null)} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">

          {/* 1. Company */}
          <div className="enterprise-card p-0">
            <div className="p-3 border-b border-border bg-primary-50/50 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-primary-700" />
              <h2 className="text-sm font-bold text-primary-900 uppercase tracking-wide">1. Company Profile</h2>
            </div>
            <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-primary-900 mb-1">Legal Company Name <span className="text-danger">*</span></label>
                <input type="text" className="enterprise-input" placeholder="As per GST/PAN registration" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-bold text-primary-900 mb-1">Trade Name / DBA</label>
                <input type="text" className="enterprise-input" placeholder="If different from legal name" value={tradeName} onChange={(e) => setTradeName(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-bold text-primary-900 mb-1">Entity Type</label>
                <select className="enterprise-input" value={entityType} onChange={(e) => setEntityType(e.target.value)}>
                  <option value="">Select...</option>
                  <option>Private Limited</option><option>Public Limited</option>
                  <option>Partnership / LLP</option><option>Proprietorship</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-primary-900 mb-1">Vendor Type <span className="text-danger">*</span></label>
                <select className="enterprise-input" value={vendorType} onChange={(e) => setVendorType(e.target.value)}>
                  <option value="">Select...</option>
                  {opts(dropdowns, "VENDOR_TYPE", [
                    { value: "Supplier", label: "Supplier" },
                    { value: "Contractor", label: "Contractor" },
                    { value: "Consultant", label: "Consultant" },
                  ]).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-primary-900 mb-1">PAN Number <span className="text-danger">*</span></label>
                <input type="text" className={`enterprise-input font-mono uppercase ${pan && !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(pan) ? "border-danger" : ""}`} placeholder="ABCDE1234F" maxLength={10} value={pan} onChange={(e) => setPan(e.target.value.toUpperCase())} />
                {pan && !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(pan) && (
                  <p className="text-[11px] text-danger mt-1">Format: 5 letters + 4 digits + 1 letter (e.g. ABCDE1234F)</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-bold text-primary-900 mb-1">MSME Status</label>
                <select className="enterprise-input" value={isMsme} onChange={(e) => setIsMsme(e.target.value)}>
                  <option>Non-MSME</option><option>Micro</option><option>Small</option><option>Medium</option>
                </select>
              </div>
              {isMsme !== "Non-MSME" && (
                <div>
                  <label className="block text-xs font-bold text-primary-900 mb-1">
                    Udyam Registration No. <span className="text-danger">*</span>
                  </label>
                  <input type="text" className={`enterprise-input font-mono uppercase ${udyam && !/^UDYAM-[A-Z]{2}-[0-9]{2}-[0-9]{7}$/.test(udyam) ? "border-danger" : ""}`} placeholder="UDYAM-MH-12-0001234" value={udyam} onChange={(e) => setUdyam(e.target.value.toUpperCase())} />
                  {udyam && !/^UDYAM-[A-Z]{2}-[0-9]{2}-[0-9]{7}$/.test(udyam) && (
                    <p className="text-[11px] text-danger mt-1">Format: UDYAM-XX-00-0000000 (e.g. UDYAM-MH-12-0001234)</p>
                  )}
                  {!udyam && <p className="text-[11px] text-warning mt-1">Required for MSME vendors</p>}
                </div>
              )}
              <div>
                <label className="block text-xs font-bold text-primary-900 mb-1">TDS Category <span className="text-danger">*</span></label>
                <select className="enterprise-input" value={tdsCategory} onChange={(e) => setTdsCategory(e.target.value)}>
                  {opts(dropdowns, "TDS_CATEGORY", [
                    { value: "Not Applicable", label: "Not Applicable" },
                    { value: "194C", label: "194C - Contractor" },
                    { value: "194J", label: "194J - Professional" },
                    { value: "194I", label: "194I - Rent" },
                    { value: "Other", label: "Other" },
                  ]).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* 2. Address */}
          <div className="enterprise-card p-0">
            <div className="p-3 border-b border-border bg-primary-50/50 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary-700" />
              <h2 className="text-sm font-bold text-primary-900 uppercase tracking-wide">2. Address & Communication</h2>
            </div>
            <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-primary-900 mb-1">Registered Address <span className="text-danger">*</span></label>
                <input type="text" className="enterprise-input mb-2" placeholder="Street Address / Building" value={address} onChange={(e) => setAddress(e.target.value)} />
                <div className="grid grid-cols-3 gap-2">
                  <input type="text" className="enterprise-input" placeholder="City" value={city} onChange={(e) => setCity(e.target.value)} />
                  <input type="text" className="enterprise-input" placeholder="State" value={stateVal} onChange={(e) => setStateVal(e.target.value)} />
                  <input type="text" className="enterprise-input font-mono" placeholder="PIN" maxLength={6} value={pinCode} onChange={(e) => setPinCode(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-primary-900 mb-1">Contact Person <span className="text-danger">*</span></label>
                <input type="text" className="enterprise-input" placeholder="Full Name" value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-bold text-primary-900 mb-1">Designation</label>
                <input type="text" className="enterprise-input" placeholder="e.g. Sales Manager" value={designation} onChange={(e) => setDesignation(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-bold text-primary-900 mb-1">Email <span className="text-danger">*</span></label>
                <input type="email" className="enterprise-input" placeholder="contact@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-bold text-primary-900 mb-1">Phone <span className="text-danger">*</span></label>
                <input type="tel" className="enterprise-input font-mono" placeholder="+91" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
            </div>
          </div>

          {/* 3. Primary Bank Account & GST */}
          <div className="enterprise-card p-0">
            <div className="p-3 border-b border-border bg-primary-50/50 flex items-center gap-2">
              <Banknote className="w-4 h-4 text-primary-700" />
              <h2 className="text-sm font-bold text-primary-900 uppercase tracking-wide">3. Primary Bank Account & GST</h2>
              <span className="ml-auto text-[10px] text-text-secondary border border-border px-2 py-0.5 rounded-sm">
                Additional accounts can be added later from vendor details
              </span>
            </div>
            <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-primary-900 mb-1">Sub-Profile Label <span className="text-danger">*</span></label>
                <input type="text" className="enterprise-input" placeholder='e.g. "Primary", "HO - Maharashtra"' value={subProfileLabel} onChange={(e) => setSubProfileLabel(e.target.value)} />
                <p className="text-[10px] text-text-secondary mt-1">A name to identify this bank account / GST registration.</p>
              </div>
              <div>
                <label className="block text-xs font-bold text-primary-900 mb-1">GSTIN <span className="text-danger">*</span></label>
                <input type="text" className={`enterprise-input font-mono uppercase ${gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gstin) ? "border-danger" : gstin.length === 15 ? "border-success" : ""}`} placeholder="22AAAAA0000A1Z5" maxLength={15} value={gstin} onChange={(e) => setGstin(e.target.value.toUpperCase())} />
                {gstin.length === 15 && /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gstin) && (
                  <p className="text-[11px] text-success mt-1 flex items-center gap-1">✓ Valid GSTIN format</p>
                )}
                {gstin && gstin.length > 0 && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gstin) && gstin.length === 15 && (
                  <p className="text-[11px] text-danger mt-1">Invalid GSTIN format (e.g. 22AAAAA0000A1Z5)</p>
                )}
                {gstin && gstin.length < 15 && (
                  <p className="text-[11px] text-text-secondary mt-1">{15 - gstin.length} characters remaining</p>
                )}
              </div>

              {/* Billing address — toggle */}
              <div className="sm:col-span-2">
                <label className="flex items-center gap-2 cursor-pointer mb-2">
                  <input type="checkbox" checked={billingAddressSame} onChange={(e) => setBillingAddressSame(e.target.checked)} className="rounded" />
                  <span className="text-xs font-bold text-primary-900">Billing address same as registered address</span>
                </label>
                {!billingAddressSame && (
                  <div className="grid grid-cols-2 gap-2">
                    <input type="text" className="enterprise-input sm:col-span-2" placeholder="Billing Street Address" value={billingAddress} onChange={(e) => setBillingAddress(e.target.value)} />
                    <input type="text" className="enterprise-input" placeholder="Billing State" value={billingState} onChange={(e) => setBillingState(e.target.value)} />
                  </div>
                )}
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-primary-900 mb-1">Beneficiary Account Name <span className="text-danger">*</span></label>
                <input type="text" className="enterprise-input" placeholder="Must match Legal Name exactly" value={beneficiaryName} onChange={(e) => setBeneficiaryName(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-bold text-primary-900 mb-1">Bank Name <span className="text-danger">*</span></label>
                <input type="text" className="enterprise-input" placeholder="e.g. HDFC Bank Ltd" value={bankName} onChange={(e) => setBankName(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-bold text-primary-900 mb-1">Branch Name</label>
                <input type="text" className="enterprise-input" placeholder="e.g. MG Road Branch" value={branchName} onChange={(e) => setBranchName(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-bold text-primary-900 mb-1">Account Number <span className="text-danger">*</span></label>
                <input type="password" className="enterprise-input font-mono" placeholder="Enter Account No" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-bold text-primary-900 mb-1">Confirm Account Number <span className="text-danger">*</span></label>
                <input type="text"
                  className={`enterprise-input font-mono ${confirmAccount && confirmAccount !== accountNumber ? "border-danger" : ""}`}
                  placeholder="Re-enter Account No" value={confirmAccount} onChange={(e) => setConfirmAccount(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-bold text-primary-900 mb-1">IFSC Code <span className="text-danger">*</span></label>
                <input type="text" className="enterprise-input font-mono uppercase" placeholder="HDFC0000123" maxLength={11} value={ifscCode} onChange={(e) => setIfscCode(e.target.value.toUpperCase())} />
              </div>
              <div>
                <label className="block text-xs font-bold text-primary-900 mb-1">Account Type</label>
                <select className="enterprise-input" value={accountType} onChange={(e) => setAccountType(e.target.value)}>
                  {opts(dropdowns, "ACCOUNT_TYPE", [
                    { value: "Current", label: "Current" },
                    { value: "Savings", label: "Savings" },
                  ]).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* 4. Experience */}
          <div className="enterprise-card p-0">
            <div className="p-3 border-b border-border bg-primary-50/50 flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-primary-700" />
              <h2 className="text-sm font-bold text-primary-900 uppercase tracking-wide">4. Work Experience & References</h2>
            </div>
            <div className="p-5 grid grid-cols-1 gap-4">
              <div className="sm:w-1/2">
                <label className="block text-xs font-bold text-primary-900 mb-1">Years in Business <span className="text-danger">*</span></label>
                <input type="number" min="0" className="enterprise-input" placeholder="e.g. 5" value={yearsInBusiness} onChange={(e) => setYearsInBusiness(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-bold text-primary-900 mb-1">Key Clients <span className="text-danger">*</span></label>
                <textarea className="w-full min-h-[80px] rounded-sm p-3 text-sm border border-border focus:border-primary-600 focus:ring-1 focus:ring-primary-600 outline-none resize-none"
                  placeholder="One client per line — minimum 2 required" value={keyClients} onChange={(e) => setKeyClients(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-bold text-primary-900 mb-1">Previous Similar Work / Project Examples</label>
                <textarea className="w-full min-h-[80px] rounded-sm p-3 text-sm border border-border focus:border-primary-600 focus:ring-1 focus:ring-primary-600 outline-none resize-none"
                  placeholder="Describe recent relevant projects" value={workNotes} onChange={(e) => setWorkNotes(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-bold text-primary-900 mb-1">Capacity / Scale of Operations</label>
                <textarea className="w-full min-h-[60px] rounded-sm p-3 text-sm border border-border focus:border-primary-600 focus:ring-1 focus:ring-primary-600 outline-none resize-none"
                  placeholder="e.g. annual turnover, production capacity" value={capacityScale} onChange={(e) => setCapacityScale(e.target.value)} />
              </div>
              <div className="bg-primary-50 border border-primary-200 text-primary-700 text-xs p-3 rounded-sm">
                Per SOP-PROC-001 §11, Procurement team validates all references before vendor activation.
              </div>
            </div>
          </div>
        </div>

        {/* Right: Documents */}
        <div className="space-y-6">
          <div className="enterprise-card p-0">
            <div className="p-3 border-b border-border bg-primary-50/50 flex items-center gap-2">
              <FileQuestion className="w-4 h-4 text-primary-700" />
              <h2 className="text-sm font-bold text-primary-900 uppercase tracking-wide">Mandatory Documents</h2>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-xs text-text-secondary">
                Uploaded to Google Drive at <span className="font-mono text-primary-700">ROOT/VENDORS/&lt;VEN_ID&gt;/</span>
              </p>
              {DOC_SLOTS.map((slot) => {
                const file = docs[slot.key];
                return (
                  <div key={slot.key} className="p-3 border border-border rounded-sm hover:border-primary-300 transition-colors bg-surface">
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-xs font-bold text-primary-900">
                        {slot.label} {slot.required && <span className="text-danger">*</span>}
                      </span>
                      {slot.required
                        ? <span className="text-[10px] text-danger bg-danger/10 px-1 py-0.5 rounded-sm">Required</span>
                        : <span className="text-[10px] text-text-secondary border border-border px-1 py-0.5 rounded-sm">Optional</span>
                      }
                    </div>
                    <button type="button" onClick={() => refMap[slot.key].current?.click()}
                      className={`w-full flex items-center justify-center gap-2 h-8 border border-dashed rounded-sm text-[10px] font-bold uppercase tracking-wider transition-colors ${
                        file ? "border-success bg-success/10 text-success" : "border-primary-300 bg-primary-50/50 hover:bg-primary-100 text-primary-700"
                      }`}>
                      {file
                        ? <><CheckCircle2 className="w-3.5 h-3.5" /> {file.name.length > 24 ? file.name.slice(0, 24) + "…" : file.name}</>
                        : <><UploadCloud className="w-3.5 h-3.5" /> {slot.hint}</>
                      }
                    </button>
                    <p className="text-[10px] text-text-secondary mt-1">{slot.hint}</p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="enterprise-card bg-primary-900 text-white p-4 border-l-4 border-l-accent-500">
            <h3 className="text-xs font-bold uppercase tracking-wider text-accent-400 mb-2">KYC Advisory</h3>
            <p className="text-xs text-primary-100 leading-relaxed">
              As per SOP-PROC-001 §6.2, Vendor onboarding takes 24–48 hours. Accounts will perform Penny Drop
              Verification and GST Portal sync before activating the Vendor ID. Do <strong>NOT</strong> raise PRs until the ID is active.
            </p>
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
