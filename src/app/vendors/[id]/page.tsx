"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Building2, MapPin, Banknote, FileText,
  CheckCircle2, XCircle, Clock, ExternalLink, Loader2,
  AlertTriangle, ShieldCheck, UserCheck, MessageSquare, Ban,
  Plus, CreditCard, Upload,
} from "lucide-react";
import { useCurrentUser } from "@/components/auth/AuthProvider";
import { fmtDate } from "@/lib/utils";

type Vendor = Record<string, string>;
type SubProfile = Record<string, string>;

function StatusBadge({ status }: { status: string }) {
  if (status === "ACTIVE")
    return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-800 border border-green-200"><CheckCircle2 className="w-3 h-3" /> ACTIVE</span>;
  if (status === "DEACTIVATED")
    return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-800 border border-red-200"><XCircle className="w-3 h-3" /> DEACTIVATED</span>;
  return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-yellow-100 text-yellow-800 border border-yellow-200"><Clock className="w-3 h-3" /> PENDING KYC</span>;
}

function RefVerifiedBadge({ value }: { value: string }) {
  if (value === "Y")
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-800 border border-green-200"><CheckCircle2 className="w-3 h-3" /> Verified</span>;
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-yellow-100 text-yellow-800 border border-yellow-200"><Clock className="w-3 h-3" /> Pending</span>;
}

function InfoRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wider font-bold text-text-secondary">{label}</span>
      <span className="text-sm text-primary-900 font-medium">{value || "—"}</span>
    </div>
  );
}

function DocLink({ label, url }: { label: string; url?: string }) {
  if (!url)
    return (
      <div className="flex items-center justify-between p-2.5 border border-border rounded-sm bg-surface/50">
        <span className="text-xs font-medium text-primary-800">{label}</span>
        <span className="text-[10px] text-text-secondary italic">Not uploaded</span>
      </div>
    );
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      className="flex items-center justify-between p-2.5 border border-primary-200 rounded-sm bg-primary-50/60 hover:bg-primary-100 transition-colors group">
      <span className="text-xs font-medium text-primary-800">{label}</span>
      <ExternalLink className="w-3.5 h-3.5 text-primary-500 group-hover:text-primary-700" />
    </a>
  );
}

function SubProfileCard({ sp }: { sp: SubProfile }) {
  const isPrimary = sp.IS_PRIMARY === "Y";
  return (
    <div className={`border rounded-sm p-4 space-y-3 ${isPrimary ? "border-primary-300 bg-primary-50/40" : "border-border bg-surface"}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-primary-600" />
          <span className="text-sm font-bold text-primary-900">{sp.SUB_PROFILE_LABEL}</span>
          {isPrimary && <span className="text-[10px] font-bold text-white bg-primary-700 px-1.5 py-0.5 rounded-sm">PRIMARY</span>}
        </div>
        <StatusBadge status={sp.STATUS} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
        <InfoRow label="GSTIN" value={sp.GSTIN} />
        <InfoRow label="Bank Name" value={sp.BANK_NAME} />
        <InfoRow label="Account No." value={sp.ACCOUNT_NUMBER ? "••••" + sp.ACCOUNT_NUMBER.slice(-4) : "—"} />
        <InfoRow label="IFSC" value={sp.IFSC_CODE} />
        <InfoRow label="Account Type" value={sp.ACCOUNT_TYPE} />
        {sp.BILLING_STATE && <InfoRow label="Billing State" value={sp.BILLING_STATE} />}
      </div>
      <div className="flex gap-2">
        {sp.KYC_GST_CERT_URL && (
          <a href={sp.KYC_GST_CERT_URL} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-[10px] font-medium text-primary-700 border border-primary-200 bg-primary-50 hover:bg-primary-100 px-2 py-1 rounded-sm transition-colors">
            <ExternalLink className="w-3 h-3" /> GST Cert
          </a>
        )}
        {sp.KYC_CANCELLED_CHEQUE_URL && (
          <a href={sp.KYC_CANCELLED_CHEQUE_URL} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-[10px] font-medium text-primary-700 border border-primary-200 bg-primary-50 hover:bg-primary-100 px-2 py-1 rounded-sm transition-colors">
            <ExternalLink className="w-3 h-3" /> Cancelled Cheque
          </a>
        )}
      </div>
      {sp.BILLING_ADDRESS && (
        <p className="text-[10px] text-text-secondary">Billing: {sp.BILLING_ADDRESS}</p>
      )}
    </div>
  );
}

export default function VendorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router  = useRouter();
  const { user } = useCurrentUser();

  const [vendor, setVendor]           = useState<Vendor | null>(null);
  const [subProfiles, setSubProfiles] = useState<SubProfile[]>([]);
  const [loading, setLoading]         = useState(true);
  const [fetchError, setFetchError]   = useState("");

  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError]     = useState("");
  const [successMsg, setSuccessMsg]       = useState("");

  const [infoRemarks, setInfoRemarks]         = useState("");
  const [deactivateReason, setDeactivateReason] = useState("");

  // Add sub-profile form state
  const [showAddSubProfile, setShowAddSubProfile] = useState(false);
  const [spLabel, setSpLabel]             = useState("");
  const [spGstin, setSpGstin]             = useState("");
  const [spBillingAddress, setSpBillingAddress] = useState("");
  const [spBillingState, setSpBillingState]     = useState("");
  const [spBankName, setSpBankName]       = useState("");
  const [spAccountNumber, setSpAccountNumber] = useState("");
  const [spConfirmAccount, setSpConfirmAccount] = useState("");
  const [spIfscCode, setSpIfscCode]       = useState("");
  const [spAccountType, setSpAccountType] = useState("Current");
  const [spGstFile, setSpGstFile]         = useState<File | null>(null);
  const [spChequeFile, setSpChequeFile]   = useState<File | null>(null);
  const [spSubmitting, setSpSubmitting]   = useState(false);
  const [spError, setSpError]             = useState("");
  const spGstRef    = useRef<HTMLInputElement>(null);
  const spChequeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetch(`/api/vendors/${id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.vendor) {
          setVendor(data.vendor);
          setSubProfiles(data.subProfiles ?? []);
        } else {
          setFetchError(data.error ?? "Failed to load vendor");
        }
      })
      .catch(() => setFetchError("Network error"))
      .finally(() => setLoading(false));
  }, [id]);

  async function callAction(action: string, remarks = "") {
    if (!user?.userId) return;
    setActionLoading(true);
    setActionError("");
    setSuccessMsg("");
    try {
      const res = await fetch(`/api/vendors/${id}/approve`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, remarks, approved_by: user.userId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Action failed");
      setVendor(data.vendor);
      const messages: Record<string, string> = {
        VERIFY_REFERENCES: "References marked as verified.",
        APPROVE:           "Vendor approved and set to ACTIVE.",
        REQUEST_INFO:      "Information request recorded.",
        DEACTIVATE:        "Vendor has been deactivated.",
      };
      setSuccessMsg(messages[action] ?? "Action completed.");
      setInfoRemarks("");
      setDeactivateReason("");
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleAddSubProfile() {
    setSpError("");
    if (!spLabel.trim())         { setSpError("Sub-Profile Label is required."); return; }
    if (!spGstin.trim())         { setSpError("GSTIN is required."); return; }
    if (!spBankName.trim())      { setSpError("Bank Name is required."); return; }
    if (!spAccountNumber.trim()) { setSpError("Account Number is required."); return; }
    if (spAccountNumber !== spConfirmAccount) { setSpError("Account numbers do not match."); return; }
    if (!spIfscCode.trim())      { setSpError("IFSC Code is required."); return; }
    if (!spGstFile)              { setSpError("GST Certificate is required."); return; }
    if (!spChequeFile)           { setSpError("Cancelled Cheque is required."); return; }

    setSpSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("data", JSON.stringify({
        sub_profile_label: spLabel,
        gstin:             spGstin.toUpperCase(),
        billing_address:   spBillingAddress,
        billing_state:     spBillingState,
        bank_name:         spBankName,
        account_number:    spAccountNumber,
        ifsc_code:         spIfscCode.toUpperCase(),
        account_type:      spAccountType,
        added_by:          user?.userId ?? "SYSTEM",
      }));
      fd.append("gst_cert",         spGstFile);
      fd.append("cancelled_cheque", spChequeFile);

      const res  = await fetch(`/api/vendors/${id}/sub-profiles`, { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to add sub-profile");

      // Reload sub-profiles
      const updated = await fetch(`/api/vendors/${id}/sub-profiles`).then(r => r.json());
      setSubProfiles(updated.subProfiles ?? []);
      setSuccessMsg("New bank account / GST registration added successfully.");
      setShowAddSubProfile(false);
      // Reset form
      setSpLabel(""); setSpGstin(""); setSpBillingAddress(""); setSpBillingState("");
      setSpBankName(""); setSpAccountNumber(""); setSpConfirmAccount(""); setSpIfscCode("");
      setSpAccountType("Current"); setSpGstFile(null); setSpChequeFile(null);
    } catch (e) {
      setSpError(e instanceof Error ? e.message : "Failed to add sub-profile");
    } finally {
      setSpSubmitting(false);
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center min-h-[50vh]"><Loader2 className="w-8 h-8 animate-spin text-primary-600" /></div>;
  }

  if (fetchError || !vendor) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
        <AlertTriangle className="w-10 h-10 text-danger" />
        <p className="text-danger font-medium">{fetchError || "Vendor not found"}</p>
        <button onClick={() => router.back()} className="text-sm text-primary-600 underline">Go back</button>
      </div>
    );
  }

  const isPendingKyc = vendor.STATUS === "PENDING_KYC";
  const isActive     = vendor.STATUS === "ACTIVE";
  const refVerified  = vendor.REFERENCE_VERIFIED === "Y";

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/vendors")} className="p-1.5 rounded-sm border border-border hover:bg-surface text-text-secondary hover:text-primary-900 transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs bg-primary-100 text-primary-700 px-2 py-0.5 rounded-sm border border-primary-200">{vendor.VENDOR_ID}</span>
              <h1 className="text-xl font-bold text-primary-900">{vendor.COMPANY_NAME}</h1>
              <StatusBadge status={vendor.STATUS} />
            </div>
            <p className="text-sm text-text-secondary mt-0.5">{vendor.VENDOR_TYPE}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-secondary">References:</span>
          <RefVerifiedBadge value={vendor.REFERENCE_VERIFIED} />
        </div>
      </div>

      {/* Toasts */}
      {successMsg && (
        <div className="flex items-center gap-2 text-sm text-green-800 bg-green-50 border border-green-200 rounded-sm px-3 py-2">
          <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" /> {successMsg}
        </div>
      )}
      {actionError && (
        <div className="flex items-center gap-2 text-sm text-danger bg-danger/10 border border-danger/30 rounded-sm px-3 py-2">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {actionError}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-5">

          {/* Company Details */}
          <div className="enterprise-card p-0">
            <div className="p-3 border-b border-border bg-primary-50/50 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-primary-700" />
              <h2 className="text-sm font-bold text-primary-900 uppercase tracking-wide">Company Details</h2>
            </div>
            <div className="p-5 grid grid-cols-2 sm:grid-cols-3 gap-4">
              <InfoRow label="Company Name" value={vendor.COMPANY_NAME} />
              <InfoRow label="Vendor Type"  value={vendor.VENDOR_TYPE} />
              <InfoRow label="PAN"          value={vendor.PAN} />
              <InfoRow label="MSME Status"  value={vendor.IS_MSME === "Y" ? "Yes" : "No"} />
              <InfoRow label="Udyam Reg No." value={vendor.UDYAM_REG_NUMBER} />
              <InfoRow label="TDS Category" value={vendor.TDS_CATEGORY} />
              <InfoRow label="Years in Business" value={vendor.YEARS_IN_BUSINESS} />
              <InfoRow label="Capacity / Scale"  value={vendor.CAPACITY_SCALE} />
              <div className="col-span-2 sm:col-span-3">
                <InfoRow label="Key Clients" value={[vendor.KEY_CLIENT_1, vendor.KEY_CLIENT_2].filter(Boolean).join(", ")} />
              </div>
              {vendor.WORK_EXPERIENCE_NOTES && (
                <div className="col-span-2 sm:col-span-3">
                  <InfoRow label="Work Experience Notes" value={vendor.WORK_EXPERIENCE_NOTES} />
                </div>
              )}
            </div>
          </div>

          {/* Contact & Address */}
          <div className="enterprise-card p-0">
            <div className="p-3 border-b border-border bg-primary-50/50 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary-700" />
              <h2 className="text-sm font-bold text-primary-900 uppercase tracking-wide">Contact & Address</h2>
            </div>
            <div className="p-5 grid grid-cols-2 sm:grid-cols-3 gap-4">
              <InfoRow label="Contact Person" value={vendor.CONTACT_PERSON} />
              <InfoRow label="Email"          value={vendor.EMAIL} />
              <InfoRow label="Phone"          value={vendor.PHONE} />
              <InfoRow label="Address"        value={vendor.ADDRESS} />
              <InfoRow label="City"           value={vendor.CITY} />
              <InfoRow label="State"          value={vendor.STATE} />
            </div>
          </div>

          {/* Bank Accounts & GST Registrations (Sub-Profiles) */}
          <div className="enterprise-card p-0">
            <div className="p-3 border-b border-border bg-primary-50/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Banknote className="w-4 h-4 text-primary-700" />
                <h2 className="text-sm font-bold text-primary-900 uppercase tracking-wide">Bank Accounts & GST Registrations</h2>
                <span className="text-[10px] text-text-secondary border border-border px-1.5 py-0.5 rounded-sm">{subProfiles.length} profile{subProfiles.length !== 1 ? "s" : ""}</span>
              </div>
              <button onClick={() => { setShowAddSubProfile((v) => !v); setSpError(""); }}
                className="flex items-center gap-1.5 h-7 px-3 text-xs font-medium text-primary-700 border border-primary-300 hover:bg-primary-50 rounded-sm transition-colors">
                <Plus className="w-3.5 h-3.5" /> Add New
              </button>
            </div>

            <div className="p-4 space-y-3">
              {subProfiles.length === 0 && (
                <p className="text-sm text-text-secondary text-center py-4">No sub-profiles found.</p>
              )}
              {subProfiles.map((sp) => (
                <SubProfileCard key={sp.SUB_PROFILE_ID} sp={sp} />
              ))}

              {/* Inline Add Sub-Profile Form */}
              {showAddSubProfile && (
                <div className="border-2 border-dashed border-primary-300 rounded-sm p-4 space-y-4 bg-primary-50/30">
                  <h3 className="text-sm font-bold text-primary-900 flex items-center gap-2">
                    <Plus className="w-4 h-4" /> Add New Bank Account / GST Registration
                  </h3>

                  {spError && (
                    <div className="flex items-start gap-2 text-xs text-danger bg-danger/10 border border-danger/30 rounded-sm px-3 py-2">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {spError}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-primary-900 mb-1">Sub-Profile Label <span className="text-danger">*</span></label>
                      <input type="text" className="enterprise-input" placeholder='e.g. "Branch - Delhi", "New GST Entity"'
                        value={spLabel} onChange={(e) => setSpLabel(e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-primary-900 mb-1">GSTIN <span className="text-danger">*</span></label>
                      <input type="text" className="enterprise-input font-mono uppercase" placeholder="22AAAAA0000A1Z5" maxLength={15}
                        value={spGstin} onChange={(e) => setSpGstin(e.target.value.toUpperCase())} />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-primary-900 mb-1">Billing Address</label>
                      <input type="text" className="enterprise-input" placeholder="If different from registered address"
                        value={spBillingAddress} onChange={(e) => setSpBillingAddress(e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-primary-900 mb-1">Billing State</label>
                      <input type="text" className="enterprise-input" placeholder="e.g. Maharashtra"
                        value={spBillingState} onChange={(e) => setSpBillingState(e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-primary-900 mb-1">Bank Name <span className="text-danger">*</span></label>
                      <input type="text" className="enterprise-input" placeholder="e.g. HDFC Bank Ltd"
                        value={spBankName} onChange={(e) => setSpBankName(e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-primary-900 mb-1">IFSC Code <span className="text-danger">*</span></label>
                      <input type="text" className="enterprise-input font-mono uppercase" placeholder="HDFC0000123" maxLength={11}
                        value={spIfscCode} onChange={(e) => setSpIfscCode(e.target.value.toUpperCase())} />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-primary-900 mb-1">Account Number <span className="text-danger">*</span></label>
                      <input type="password" className="enterprise-input font-mono" placeholder="Enter Account No"
                        value={spAccountNumber} onChange={(e) => setSpAccountNumber(e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-primary-900 mb-1">Confirm Account Number <span className="text-danger">*</span></label>
                      <input type="text"
                        className={`enterprise-input font-mono ${spConfirmAccount && spConfirmAccount !== spAccountNumber ? "border-danger" : ""}`}
                        placeholder="Re-enter Account No"
                        value={spConfirmAccount} onChange={(e) => setSpConfirmAccount(e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-primary-900 mb-1">Account Type</label>
                      <select className="enterprise-input" value={spAccountType} onChange={(e) => setSpAccountType(e.target.value)}>
                        <option>Current</option><option>Savings</option>
                      </select>
                    </div>
                  </div>

                  {/* File uploads */}
                  <div className="grid grid-cols-2 gap-3">
                    <input ref={spGstRef}    type="file" accept=".pdf" className="hidden" onChange={(e) => setSpGstFile(e.target.files?.[0] ?? null)} />
                    <input ref={spChequeRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={(e) => setSpChequeFile(e.target.files?.[0] ?? null)} />
                    {[
                      { label: "GST Certificate *",  file: spGstFile,    ref: spGstRef },
                      { label: "Cancelled Cheque *", file: spChequeFile, ref: spChequeRef },
                    ].map(({ label, file, ref }) => (
                      <button key={label} type="button" onClick={() => ref.current?.click()}
                        className={`flex items-center justify-center gap-2 h-9 border border-dashed rounded-sm text-xs font-medium transition-colors ${
                          file ? "border-success bg-success/10 text-success" : "border-primary-300 bg-primary-50 hover:bg-primary-100 text-primary-700"
                        }`}>
                        {file
                          ? <><CheckCircle2 className="w-3.5 h-3.5" /> {file.name.length > 22 ? file.name.slice(0, 22) + "…" : file.name}</>
                          : <><Upload className="w-3.5 h-3.5" /> {label}</>
                        }
                      </button>
                    ))}
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    <button onClick={() => setShowAddSubProfile(false)}
                      className="h-8 px-4 text-xs font-medium border border-border hover:bg-surface rounded-sm transition-colors">
                      Cancel
                    </button>
                    <button onClick={handleAddSubProfile} disabled={spSubmitting}
                      className="h-8 px-4 text-xs font-medium text-white bg-primary-900 hover:bg-primary-800 rounded-sm border border-primary-950 disabled:opacity-60 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5">
                      {spSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                      Save Sub-Profile
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* KYC Documents */}
          <div className="enterprise-card p-0">
            <div className="p-3 border-b border-border bg-primary-50/50 flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary-700" />
              <h2 className="text-sm font-bold text-primary-900 uppercase tracking-wide">KYC Documents (Vendor Level)</h2>
            </div>
            <div className="p-5 space-y-2.5">
              <DocLink label="PAN Card Copy"    url={vendor.KYC_PAN_COPY_URL} />
              <DocLink label="MSME Certificate" url={vendor.KYC_MSME_CERT_URL} />
              <p className="text-[10px] text-text-secondary">GST certificates and cancelled cheques are stored per bank account above.</p>
            </div>
          </div>

          {vendor.REMARKS && (
            <div className="enterprise-card p-4">
              <p className="text-xs font-bold text-primary-900 uppercase tracking-wide mb-2">Remarks / Notes</p>
              <p className="text-sm text-text-secondary whitespace-pre-wrap">{vendor.REMARKS}</p>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <InfoRow label="Registered By"   value={vendor.REGISTERED_BY} />
            <InfoRow label="Registered Date" value={fmtDate(vendor.REGISTERED_DATE)} />
            <InfoRow label="Approved By"     value={vendor.APPROVED_BY} />
            <InfoRow label="Approved Date"   value={fmtDate(vendor.APPROVED_DATE)} />
          </div>
        </div>

        {/* Right: Action Panel */}
        <div className="space-y-4">
          <div className="enterprise-card p-0">
            <div className="p-3 border-b border-border bg-primary-50/50">
              <h2 className="text-sm font-bold text-primary-900 uppercase tracking-wide">Actions</h2>
            </div>
            <div className="p-4 space-y-4">

              {isPendingKyc && !refVerified && (
                <div>
                  <button onClick={() => callAction("VERIFY_REFERENCES")} disabled={actionLoading}
                    className="w-full flex items-center justify-center gap-2 h-9 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-sm border border-green-700 shadow-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
                    {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                    Verify References
                  </button>
                  <p className="text-[10px] text-text-secondary mt-1">Marks references as verified. Required before approval.</p>
                </div>
              )}

              {isPendingKyc && refVerified && (
                <div>
                  <button onClick={() => callAction("APPROVE")} disabled={actionLoading}
                    className="w-full flex items-center justify-center gap-2 h-9 bg-primary-900 hover:bg-primary-800 text-white text-sm font-medium rounded-sm border border-primary-950 shadow-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
                    {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}
                    Approve Vendor
                  </button>
                  <p className="text-[10px] text-text-secondary mt-1">Sets vendor status to ACTIVE.</p>
                </div>
              )}

              <div className="border border-border rounded-sm p-3 space-y-2">
                <div className="flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-primary-600" />
                  <span className="text-xs font-bold text-primary-900">Request More Information</span>
                </div>
                <textarea value={infoRemarks} onChange={(e) => setInfoRemarks(e.target.value)}
                  placeholder="Describe what additional info is needed…" rows={3}
                  className="w-full rounded-sm p-2 text-xs border border-border focus:border-primary-600 focus:ring-1 focus:ring-primary-600 outline-none resize-none" />
                <button onClick={() => { if (!infoRemarks.trim()) return; callAction("REQUEST_INFO", infoRemarks); }}
                  disabled={actionLoading || !infoRemarks.trim()}
                  className="w-full h-8 border border-primary-300 hover:bg-primary-50 text-primary-900 text-xs font-medium rounded-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                  Send Request
                </button>
              </div>

              {isActive && (
                <div className="border border-red-200 rounded-sm p-3 space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Ban className="w-3.5 h-3.5 text-red-600" />
                    <span className="text-xs font-bold text-red-700">Deactivate Vendor</span>
                  </div>
                  <textarea value={deactivateReason} onChange={(e) => setDeactivateReason(e.target.value)}
                    placeholder="Reason for deactivation…" rows={3}
                    className="w-full rounded-sm p-2 text-xs border border-red-200 focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none resize-none" />
                  <button onClick={() => { if (!deactivateReason.trim()) return; callAction("DEACTIVATE", deactivateReason); }}
                    disabled={actionLoading || !deactivateReason.trim()}
                    className="w-full h-8 border border-red-300 hover:bg-red-50 text-red-700 text-xs font-medium rounded-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                    Deactivate
                  </button>
                </div>
              )}

              <div className="text-[10px] text-text-secondary border-t border-border pt-3">
                Per SOP-PROC-001 §15.1 — You cannot approve your own submission.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
