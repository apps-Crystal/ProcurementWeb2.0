"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  MapPin,
  Banknote,
  FileText,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  Loader2,
  AlertTriangle,
  ShieldCheck,
  UserCheck,
  MessageSquare,
  Ban,
} from "lucide-react";
import { useCurrentUser } from "@/components/auth/AuthProvider";

type Vendor = Record<string, string>;

function StatusBadge({ status }: { status: string }) {
  if (status === "ACTIVE")
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-800 border border-green-200">
        <CheckCircle2 className="w-3 h-3" /> ACTIVE
      </span>
    );
  if (status === "DEACTIVATED")
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-800 border border-red-200">
        <XCircle className="w-3 h-3" /> DEACTIVATED
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-yellow-100 text-yellow-800 border border-yellow-200">
      <Clock className="w-3 h-3" /> PENDING KYC
    </span>
  );
}

function RefVerifiedBadge({ value }: { value: string }) {
  if (value === "Y")
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-800 border border-green-200">
        <CheckCircle2 className="w-3 h-3" /> Verified
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-yellow-100 text-yellow-800 border border-yellow-200">
      <Clock className="w-3 h-3" /> Pending
    </span>
  );
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
  if (!url) {
    return (
      <div className="flex items-center justify-between p-2.5 border border-border rounded-sm bg-surface/50">
        <span className="text-xs font-medium text-primary-800">{label}</span>
        <span className="text-[10px] text-text-secondary italic">Not uploaded</span>
      </div>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-between p-2.5 border border-primary-200 rounded-sm bg-primary-50/60 hover:bg-primary-100 transition-colors group"
    >
      <span className="text-xs font-medium text-primary-800">{label}</span>
      <ExternalLink className="w-3.5 h-3.5 text-primary-500 group-hover:text-primary-700" />
    </a>
  );
}

export default function VendorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useCurrentUser();

  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");

  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const [infoRemarks, setInfoRemarks] = useState("");
  const [deactivateReason, setDeactivateReason] = useState("");

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetch(`/api/vendors/${id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.vendor) setVendor(data.vendor);
        else setFetchError(data.error ?? "Failed to load vendor");
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
        APPROVE: "Vendor approved and set to ACTIVE.",
        REQUEST_INFO: "Information request recorded.",
        DEACTIVATE: "Vendor has been deactivated.",
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  if (fetchError || !vendor) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
        <AlertTriangle className="w-10 h-10 text-danger" />
        <p className="text-danger font-medium">{fetchError || "Vendor not found"}</p>
        <button onClick={() => router.back()} className="text-sm text-primary-600 underline">
          Go back
        </button>
      </div>
    );
  }

  const isPendingKyc = vendor.STATUS === "PENDING_KYC";
  const isActive = vendor.STATUS === "ACTIVE";
  const refVerified = vendor.REFERENCE_VERIFIED === "Y";

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/vendors")}
            className="p-1.5 rounded-sm border border-border hover:bg-surface text-text-secondary hover:text-primary-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs bg-primary-100 text-primary-700 px-2 py-0.5 rounded-sm border border-primary-200">
                {vendor.VENDOR_ID}
              </span>
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

      {/* Toast messages */}
      {successMsg && (
        <div className="flex items-center gap-2 text-sm text-green-800 bg-green-50 border border-green-200 rounded-sm px-3 py-2">
          <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
          {successMsg}
        </div>
      )}
      {actionError && (
        <div className="flex items-center gap-2 text-sm text-danger bg-danger/10 border border-danger/30 rounded-sm px-3 py-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {actionError}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: detail cards */}
        <div className="lg:col-span-2 space-y-5">

          {/* Company Details */}
          <div className="enterprise-card p-0">
            <div className="p-3 border-b border-border bg-primary-50/50 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-primary-700" />
              <h2 className="text-sm font-bold text-primary-900 uppercase tracking-wide">Company Details</h2>
            </div>
            <div className="p-5 grid grid-cols-2 sm:grid-cols-3 gap-4">
              <InfoRow label="Company Name" value={vendor.COMPANY_NAME} />
              <InfoRow label="Vendor Type" value={vendor.VENDOR_TYPE} />
              <InfoRow label="GSTIN" value={vendor.GSTIN} />
              <InfoRow label="PAN" value={vendor.PAN} />
              <InfoRow label="MSME Status" value={vendor.IS_MSME === "Y" ? "Yes" : "No"} />
              <InfoRow label="Udyam Reg No." value={vendor.UDYAM_REG_NUMBER} />
              <InfoRow label="TDS Category" value={vendor.TDS_CATEGORY} />
              <InfoRow label="Years in Business" value={vendor.YEARS_IN_BUSINESS} />
              <InfoRow label="Capacity / Scale" value={vendor.CAPACITY_SCALE} />
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
              <InfoRow label="Email" value={vendor.EMAIL} />
              <InfoRow label="Phone" value={vendor.PHONE} />
              <InfoRow label="Address" value={vendor.ADDRESS} />
              <InfoRow label="City" value={vendor.CITY} />
              <InfoRow label="State" value={vendor.STATE} />
            </div>
          </div>

          {/* Banking Details */}
          <div className="enterprise-card p-0">
            <div className="p-3 border-b border-border bg-primary-50/50 flex items-center gap-2">
              <Banknote className="w-4 h-4 text-primary-700" />
              <h2 className="text-sm font-bold text-primary-900 uppercase tracking-wide">Banking Details</h2>
            </div>
            <div className="p-5 grid grid-cols-2 sm:grid-cols-3 gap-4">
              <InfoRow label="Bank Name" value={vendor.BANK_NAME} />
              <InfoRow label="Account Number" value={vendor.ACCOUNT_NUMBER ? "••••" + vendor.ACCOUNT_NUMBER.slice(-4) : "—"} />
              <InfoRow label="IFSC Code" value={vendor.IFSC_CODE} />
              <InfoRow label="Account Type" value={vendor.ACCOUNT_TYPE} />
            </div>
          </div>

          {/* KYC Documents */}
          <div className="enterprise-card p-0">
            <div className="p-3 border-b border-border bg-primary-50/50 flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary-700" />
              <h2 className="text-sm font-bold text-primary-900 uppercase tracking-wide">KYC Documents</h2>
            </div>
            <div className="p-5 space-y-2.5">
              <DocLink label="GST Registration Certificate" url={vendor.KYC_GST_CERT_URL} />
              <DocLink label="PAN Card Copy" url={vendor.KYC_PAN_COPY_URL} />
              <DocLink label="Cancelled Cheque" url={vendor.KYC_CANCELLED_CHEQUE_URL} />
              <DocLink label="MSME Certificate" url={vendor.KYC_MSME_CERT_URL} />
            </div>
          </div>

          {/* Remarks / Audit trail */}
          {vendor.REMARKS && (
            <div className="enterprise-card p-4">
              <p className="text-xs font-bold text-primary-900 uppercase tracking-wide mb-2">Remarks / Notes</p>
              <p className="text-sm text-text-secondary whitespace-pre-wrap">{vendor.REMARKS}</p>
            </div>
          )}

          {/* Meta */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <InfoRow label="Registered By" value={vendor.REGISTERED_BY} />
            <InfoRow label="Registered Date" value={vendor.REGISTERED_DATE ? new Date(vendor.REGISTERED_DATE).toLocaleDateString() : "—"} />
            <InfoRow label="Approved By" value={vendor.APPROVED_BY} />
            <InfoRow label="Approved Date" value={vendor.APPROVED_DATE ? new Date(vendor.APPROVED_DATE).toLocaleDateString() : "—"} />
          </div>
        </div>

        {/* Right: Action Panel */}
        <div className="space-y-4">
          <div className="enterprise-card p-0">
            <div className="p-3 border-b border-border bg-primary-50/50">
              <h2 className="text-sm font-bold text-primary-900 uppercase tracking-wide">Actions</h2>
            </div>
            <div className="p-4 space-y-4">

              {/* Verify References — only show when PENDING_KYC and not yet verified */}
              {isPendingKyc && !refVerified && (
                <div>
                  <button
                    onClick={() => callAction("VERIFY_REFERENCES")}
                    disabled={actionLoading}
                    className="w-full flex items-center justify-center gap-2 h-9 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-sm border border-green-700 shadow-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {actionLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <ShieldCheck className="w-4 h-4" />
                    )}
                    Verify References
                  </button>
                  <p className="text-[10px] text-text-secondary mt-1">
                    Marks references as verified. Required before approval.
                  </p>
                </div>
              )}

              {/* Approve — only show when PENDING_KYC and references verified */}
              {isPendingKyc && refVerified && (
                <div>
                  <button
                    onClick={() => callAction("APPROVE")}
                    disabled={actionLoading}
                    className="w-full flex items-center justify-center gap-2 h-9 bg-primary-900 hover:bg-primary-800 text-white text-sm font-medium rounded-sm border border-primary-950 shadow-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {actionLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <UserCheck className="w-4 h-4" />
                    )}
                    Approve Vendor
                  </button>
                  <p className="text-[10px] text-text-secondary mt-1">
                    Sets vendor status to ACTIVE.
                  </p>
                </div>
              )}

              {/* Request More Info — always available */}
              <div className="border border-border rounded-sm p-3 space-y-2">
                <div className="flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-primary-600" />
                  <span className="text-xs font-bold text-primary-900">Request More Information</span>
                </div>
                <textarea
                  value={infoRemarks}
                  onChange={(e) => setInfoRemarks(e.target.value)}
                  placeholder="Describe what additional info is needed…"
                  rows={3}
                  className="w-full rounded-sm p-2 text-xs border border-border focus:border-primary-600 focus:ring-1 focus:ring-primary-600 outline-none resize-none"
                />
                <button
                  onClick={() => {
                    if (!infoRemarks.trim()) return;
                    callAction("REQUEST_INFO", infoRemarks);
                  }}
                  disabled={actionLoading || !infoRemarks.trim()}
                  className="w-full h-8 border border-primary-300 hover:bg-primary-50 text-primary-900 text-xs font-medium rounded-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Send Request
                </button>
              </div>

              {/* Deactivate — only show when ACTIVE */}
              {isActive && (
                <div className="border border-red-200 rounded-sm p-3 space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Ban className="w-3.5 h-3.5 text-red-600" />
                    <span className="text-xs font-bold text-red-700">Deactivate Vendor</span>
                  </div>
                  <textarea
                    value={deactivateReason}
                    onChange={(e) => setDeactivateReason(e.target.value)}
                    placeholder="Reason for deactivation…"
                    rows={3}
                    className="w-full rounded-sm p-2 text-xs border border-red-200 focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none resize-none"
                  />
                  <button
                    onClick={() => {
                      if (!deactivateReason.trim()) return;
                      callAction("DEACTIVATE", deactivateReason);
                    }}
                    disabled={actionLoading || !deactivateReason.trim()}
                    className="w-full h-8 border border-red-300 hover:bg-red-50 text-red-700 text-xs font-medium rounded-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
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
