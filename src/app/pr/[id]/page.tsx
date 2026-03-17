"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  FileText,
  Briefcase,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  ExternalLink,
  ChevronLeft,
  MessageSquare,
  PackageCheck,
  AlertTriangle,
  Send,
  Pencil,
  ShoppingCart,
} from "lucide-react";
import { useCurrentUser } from "@/components/auth/AuthProvider";
import { fmtDate } from "@/lib/utils";

type PRStatus = "SUBMITTED" | "APPROVED" | "REJECTED" | "DRAFT" | "CANCELLED" | "PO_CREATED";

interface PRData {
  PR_ID?: string;
  SPR_ID?: string;
  PR_DATE?: string;
  SPR_DATE?: string;
  REQUESTOR_USER_ID?: string;
  REQUESTOR_NAME?: string;
  REQUESTOR_SITE?: string;
  CATEGORY?: string;
  SERVICE_CATEGORY?: string;
  SERVICE_DESCRIPTION?: string;
  PROCUREMENT_TYPE?: string;
  PURPOSE?: string;
  PREFERRED_VENDOR_NAME?: string;
  PREFERRED_VENDOR_ID?: string;
  VENDOR_NAME?: string;
  DELIVERY_LOCATION?: string;
  EXPECTED_DELIVERY_DATE?: string;
  PAYMENT_TERMS?: string;
  ADVANCE_PERCENT?: string;
  CREDIT_PERIOD_DAYS?: string;
  RETENTION_AMOUNT?: string;
  SUBTOTAL?: string;
  TOTAL_GST?: string;
  TOTAL_AMOUNT_WITH_GST?: string;
  TOTAL_VALUE?: string;
  QUOTATION_URL?: string;
  PROFORMA_URL?: string;
  SUPPORTING_DOC_URL?: string;
  STATUS?: string;
  APPROVER_REMARKS?: string;
  ASSIGNED_APPROVER_NAME?: string;
  APPROVER_ACTION_DATE?: string;
}

interface PRLine {
  LINE_NUMBER?: string;
  ITEM_NAME?: string;
  ITEM_DESCRIPTION?: string;
  SERVICE_DESCRIPTION?: string;
  UNIT_OF_MEASURE?: string;
  QUANTITY?: string;
  RATE?: string;
  GST_PERCENT?: string;
  HSN_CODE?: string;
  SAC_CODE?: string;
  LINE_TOTAL?: string;
  LINE_AMOUNT_BEFORE_GST?: string;
  GST_AMOUNT?: string;
}

const STATUS_BADGE: Record<string, string> = {
  SUBMITTED:  "bg-primary-50 text-primary-700 border-primary-200",
  APPROVED:   "bg-success/10 text-success border-success/20",
  REJECTED:   "bg-danger/10 text-danger border-danger/20",
  DRAFT:      "bg-warning/10 text-warning-800 border-warning/20",
  PO_CREATED: "bg-accent-50 text-accent-700 border-accent-200",
};

export default function PRDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useCurrentUser();

  const [pr, setPr] = useState<PRData | null>(null);
  const [lines, setLines] = useState<PRLine[]>([]);
  const [prType, setPrType] = useState<"MPR" | "SPR">("MPR");
  const [loading, setLoading] = useState(true);

  const [action, setAction] = useState<"APPROVED" | "REJECTED" | null>(null);
  const [remarks, setRemarks] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState("");
  const [actionDone, setActionDone] = useState(false);

  const [submittingDraft, setSubmittingDraft] = useState(false);
  const [draftSubmitError, setDraftSubmitError] = useState("");

  useEffect(() => {
    fetch(`/api/pr/${id}`)
      .then((r) => r.json())
      .then((data) => {
        setPr(data.pr);
        setLines(data.lines ?? []);
        setPrType(data.pr_type ?? "MPR");
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  // SOP §15.1 — Requestor cannot be the approver
  const isRequestor = pr
    ? user?.userId === pr.REQUESTOR_USER_ID || user?.name === pr.REQUESTOR_NAME
    : false;

  const canApprove =
    user &&
    !isRequestor &&
    (user.role === "System_Admin" ||
      user.role === "Procurement_Head" ||
      user.isProcurementHead);

  const canCreatePO =
    user &&
    (user.role === "System_Admin" ||
      user.role === "Procurement_Head" ||
      user.isProcurementHead);

  async function handleSubmitDraft() {
    setDraftSubmitError("");
    setSubmittingDraft(true);
    try {
      const res = await fetch(`/api/pr/${id}/submit`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user?.userId }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? "Submit failed");
      setPr((prev) => prev ? { ...prev, STATUS: "SUBMITTED" } : prev);
    } catch (err) {
      setDraftSubmitError(err instanceof Error ? err.message : "Submit failed");
    } finally {
      setSubmittingDraft(false);
    }
  }

  async function handleAction() {
    if (!action || !user) return;
    if (action === "REJECTED" && !remarks.trim()) {
      setActionError("Remarks are required when rejecting.");
      return;
    }
    setSubmitting(true);
    setActionError("");
    try {
      const res = await fetch(`/api/pr/${id}/approve`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          approver_id: user.userId,
          approver_name: user.name,
          remarks,
          pr_type: prType,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? "Action failed");
      setActionDone(true);
      setPr((prev) => prev ? { ...prev, STATUS: action } : prev);
      setAction(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-primary-400" />
      </div>
    );
  }

  if (!pr) {
    return (
      <div className="text-center py-20 text-text-secondary">
        <AlertTriangle className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p>PR not found.</p>
      </div>
    );
  }

  const prId    = pr.PR_ID ?? pr.SPR_ID ?? id;
  const prDate  = pr.PR_DATE ?? pr.SPR_DATE ?? "—";
  const status  = (pr.STATUS ?? "DRAFT") as PRStatus;
  const vendor  = pr.PREFERRED_VENDOR_NAME ?? pr.VENDOR_NAME ?? "—";
  const category = pr.CATEGORY ?? pr.SERVICE_CATEGORY ?? "—";

  // Compute totals from line items (more reliable than sheet-stored totals)
  const computedSubtotal = lines.reduce((sum, l) => sum + parseFloat(l.LINE_AMOUNT_BEFORE_GST ?? "0"), 0);
  const computedGst      = lines.reduce((sum, l) => sum + parseFloat(l.GST_AMOUNT ?? "0"), 0);
  const computedTotal    = lines.reduce((sum, l) => sum + parseFloat(l.LINE_TOTAL ?? "0"), 0);
  const sheetTotal = parseFloat(pr.TOTAL_AMOUNT_WITH_GST ?? pr.TOTAL_VALUE ?? "");
  const total    = (!isNaN(sheetTotal) && sheetTotal > 0) ? sheetTotal : computedTotal;
  const subtotal = computedSubtotal > 0 ? computedSubtotal : parseFloat(pr.SUBTOTAL ?? "0");
  const totalGst = computedGst > 0 ? computedGst : parseFloat(pr.TOTAL_GST ?? "0");

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border pb-4">
        <div>
          <button
            onClick={() => router.back()}
            className="flex items-center gap-1 text-xs text-text-secondary hover:text-primary-900 mb-2 transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Back to list
          </button>
          <h1 className="text-2xl font-bold text-primary-900 tracking-tight flex items-center gap-2">
            {prType === "MPR" ? (
              <FileText className="w-6 h-6 text-primary-600" />
            ) : (
              <Briefcase className="w-6 h-6 text-primary-600" />
            )}
            {prId}
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            {prType === "MPR" ? "Material Purchase Request" : "Service Purchase Request"} · {prDate}
          </p>
        </div>
        <span className={`inline-flex items-center gap-1.5 text-xs font-bold uppercase px-3 py-1.5 rounded-sm border ${STATUS_BADGE[status] ?? STATUS_BADGE.DRAFT}`}>
          {status === "APPROVED" && <CheckCircle2 className="w-3.5 h-3.5" />}
          {status === "REJECTED" && <XCircle className="w-3.5 h-3.5" />}
          {status === "SUBMITTED" && <Clock className="w-3.5 h-3.5" />}
          {status}
        </span>
      </div>

      {actionDone && (
        <div className="flex items-center gap-2 p-3 bg-success/10 border border-success/30 rounded-sm text-sm text-success font-medium">
          <CheckCircle2 className="w-4 h-4" /> PR has been {pr.STATUS?.toLowerCase()}. The requestor will be notified.
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left — PR Info */}
        <div className="xl:col-span-2 space-y-6">
          {/* Details card */}
          <div className="enterprise-card p-5 space-y-4">
            <h2 className="text-sm font-bold text-primary-900 uppercase tracking-wide border-b border-border pb-2">
              Request Details
            </h2>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <div>
                <p className="text-[11px] text-text-secondary uppercase tracking-wider font-medium">Requestor</p>
                <p className="font-medium text-primary-900 mt-0.5">{pr.REQUESTOR_NAME ?? "—"}</p>
              </div>
              <div>
                <p className="text-[11px] text-text-secondary uppercase tracking-wider font-medium">Site</p>
                <p className="font-medium text-primary-900 mt-0.5">{pr.REQUESTOR_SITE ?? "—"}</p>
              </div>
              <div>
                <p className="text-[11px] text-text-secondary uppercase tracking-wider font-medium">Category</p>
                <p className="font-medium text-primary-900 mt-0.5">{category}</p>
              </div>
              <div>
                <p className="text-[11px] text-text-secondary uppercase tracking-wider font-medium">Procurement Type</p>
                <p className="font-medium text-primary-900 mt-0.5">{pr.PROCUREMENT_TYPE ?? "—"}</p>
              </div>
              <div>
                <p className="text-[11px] text-text-secondary uppercase tracking-wider font-medium">Preferred Vendor</p>
                <p className="font-medium text-primary-900 mt-0.5">{vendor}</p>
              </div>
              <div>
                <p className="text-[11px] text-text-secondary uppercase tracking-wider font-medium">Expected Delivery</p>
                <p className="font-medium text-primary-900 mt-0.5">
                  {fmtDate(pr.EXPECTED_DELIVERY_DATE)}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-text-secondary uppercase tracking-wider font-medium">Delivery Location</p>
                <p className="font-medium text-primary-900 mt-0.5">{pr.DELIVERY_LOCATION ?? "—"}</p>
              </div>
              <div>
                <p className="text-[11px] text-text-secondary uppercase tracking-wider font-medium">Payment Terms</p>
                <p className="font-medium text-primary-900 mt-0.5">{pr.PAYMENT_TERMS ?? "—"}</p>
              </div>
              <div className="col-span-2">
                <p className="text-[11px] text-text-secondary uppercase tracking-wider font-medium">Purpose / Justification</p>
                <p className="text-primary-900 mt-0.5 text-xs leading-relaxed">
                  {pr.PURPOSE ?? pr.SERVICE_DESCRIPTION ?? "—"}
                </p>
              </div>
            </div>
          </div>

          {/* Line Items */}
          <div className="enterprise-card overflow-hidden">
            <div className="p-4 border-b border-border bg-primary-50/50">
              <h2 className="text-sm font-bold text-primary-900 uppercase tracking-wide">Line Items</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-[11px] text-text-secondary bg-surface border-b border-border uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3 font-semibold w-8">#</th>
                    <th className="px-4 py-3 font-semibold">Description</th>
                    <th className="px-4 py-3 font-semibold w-20 text-center">UOM</th>
                    <th className="px-4 py-3 font-semibold w-20 text-right">Qty</th>
                    <th className="px-4 py-3 font-semibold w-28 text-right">Rate (₹)</th>
                    <th className="px-4 py-3 font-semibold w-16 text-center">GST%</th>
                    <th className="px-4 py-3 font-semibold w-32 text-right">Amount (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {lines.map((l, i) => {
                    const qty  = parseFloat(l.QUANTITY ?? "0");
                    const rate = parseFloat(l.RATE ?? "0");
                    const gst  = parseFloat(l.GST_PERCENT ?? "0");
                    const lineAmt = parseFloat(l.LINE_TOTAL ?? l.LINE_AMOUNT_BEFORE_GST ?? String(qty * rate));
                    return (
                      <tr key={i} className="hover:bg-primary-50/20">
                        <td className="px-4 py-3 text-xs text-text-secondary text-center">{l.LINE_NUMBER ?? i + 1}</td>
                        <td className="px-4 py-3 text-xs font-medium text-primary-900">
                          {l.ITEM_NAME ?? l.ITEM_DESCRIPTION ?? l.SERVICE_DESCRIPTION ?? "—"}
                          {(l.HSN_CODE || l.SAC_CODE) && (
                            <span className="ml-1.5 font-mono text-[10px] text-text-secondary">
                              {l.HSN_CODE ?? l.SAC_CODE}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-text-secondary text-center">{l.UNIT_OF_MEASURE ?? "—"}</td>
                        <td className="px-4 py-3 text-xs text-right font-mono">{qty}</td>
                        <td className="px-4 py-3 text-xs text-right font-mono">{rate.toLocaleString("en-IN")}</td>
                        <td className="px-4 py-3 text-xs text-center">{gst}%</td>
                        <td className="px-4 py-3 text-xs text-right font-mono font-semibold text-primary-900">
                          {lineAmt.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-primary-50/50 border-t border-border">
                  <tr>
                    <td colSpan={6} className="px-4 py-3 text-xs font-bold text-right text-primary-900 uppercase tracking-wide">
                      Grand Total (incl. GST)
                    </td>
                    <td className="px-4 py-3 text-sm font-bold text-right font-mono text-primary-900">
                      ₹{total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Documents */}
          {(pr.QUOTATION_URL || pr.PROFORMA_URL || pr.SUPPORTING_DOC_URL) && (
            <div className="enterprise-card p-5 space-y-3">
              <h2 className="text-sm font-bold text-primary-900 uppercase tracking-wide border-b border-border pb-2">
                Attached Documents
              </h2>
              <div className="flex flex-wrap gap-2">
                {pr.QUOTATION_URL && (
                  <a href={pr.QUOTATION_URL} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-primary-700 bg-primary-50 border border-primary-200 px-3 py-1.5 rounded-sm hover:bg-primary-100 transition-colors">
                    <ExternalLink className="w-3.5 h-3.5" /> Quotation
                  </a>
                )}
                {pr.PROFORMA_URL && (
                  <a href={pr.PROFORMA_URL} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-primary-700 bg-primary-50 border border-primary-200 px-3 py-1.5 rounded-sm hover:bg-primary-100 transition-colors">
                    <ExternalLink className="w-3.5 h-3.5" /> Proforma Invoice
                  </a>
                )}
                {pr.SUPPORTING_DOC_URL && (
                  <a href={pr.SUPPORTING_DOC_URL} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-primary-700 bg-primary-50 border border-primary-200 px-3 py-1.5 rounded-sm hover:bg-primary-100 transition-colors">
                    <ExternalLink className="w-3.5 h-3.5" /> Supporting Docs
                  </a>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right — Action Panel */}
        <div className="space-y-4">
          {/* SOP §15.1 — Requestor cannot approve own PR */}
          {isRequestor && status === "SUBMITTED" && (
            <div className="enterprise-card p-4 bg-warning/5 border border-warning/30">
              <p className="text-xs text-warning-800 font-semibold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-warning" />
                SOP §15.1 — You submitted this PR and cannot approve it.
              </p>
              <p className="text-[11px] text-text-secondary mt-1">
                Awaiting review by Procurement Approver.
              </p>
            </div>
          )}

          {/* Approval action */}
          {canApprove && status === "SUBMITTED" && !actionDone && (
            <div className="enterprise-card p-5 space-y-4 border-t-4 border-t-primary-900">
              <h2 className="text-sm font-bold text-primary-900 uppercase tracking-wide">
                Procurement Head Action
              </h2>

              <div className="flex gap-2">
                <button
                  onClick={() => setAction(action === "APPROVED" ? null : "APPROVED")}
                  className={`flex-1 flex items-center justify-center gap-1.5 h-9 text-xs font-bold rounded-sm border transition-colors ${
                    action === "APPROVED"
                      ? "bg-success text-white border-success"
                      : "bg-surface text-success border-success/40 hover:bg-success/10"
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4" /> Approve
                </button>
                <button
                  onClick={() => setAction(action === "REJECTED" ? null : "REJECTED")}
                  className={`flex-1 flex items-center justify-center gap-1.5 h-9 text-xs font-bold rounded-sm border transition-colors ${
                    action === "REJECTED"
                      ? "bg-danger text-white border-danger"
                      : "bg-surface text-danger border-danger/40 hover:bg-danger/10"
                  }`}
                >
                  <XCircle className="w-4 h-4" /> Reject
                </button>
              </div>

              {action && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1">
                      Remarks {action === "REJECTED" && <span className="text-danger">*</span>}
                    </label>
                    <textarea
                      value={remarks}
                      onChange={(e) => setRemarks(e.target.value)}
                      rows={3}
                      placeholder={action === "APPROVED" ? "Optional comments…" : "Reason for rejection (required)…"}
                      className="w-full rounded-sm border border-border focus:ring-1 focus:ring-primary-600 text-xs p-2 outline-none resize-none"
                    />
                  </div>

                  {actionError && (
                    <p className="text-xs text-danger flex items-center gap-1">
                      <XCircle className="w-3.5 h-3.5" /> {actionError}
                    </p>
                  )}

                  <button
                    onClick={handleAction}
                    disabled={submitting}
                    className={`w-full h-9 flex items-center justify-center gap-2 text-sm font-bold rounded-sm transition-colors disabled:opacity-50 ${
                      action === "APPROVED"
                        ? "bg-success hover:bg-success/90 text-white"
                        : "bg-danger hover:bg-danger/90 text-white"
                    }`}
                  >
                    {submitting ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Processing…</>
                    ) : action === "APPROVED" ? (
                      <><CheckCircle2 className="w-4 h-4" /> Confirm Approval</>
                    ) : (
                      <><XCircle className="w-4 h-4" /> Confirm Rejection</>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* PO already created */}
          {status === "PO_CREATED" && (
            <div className="enterprise-card p-4 border-t-4 border-t-accent-500">
              <div className="flex items-center gap-2 mb-2">
                <ShoppingCart className="w-5 h-5 text-accent-600" />
                <span className="text-sm font-bold text-primary-900">PO Issued</span>
              </div>
              <p className="text-xs text-text-secondary">A Purchase Order has been raised against this PR.</p>
              <button
                onClick={() => router.push("/po/open")}
                className="mt-3 w-full flex items-center justify-center gap-1.5 h-8 text-xs font-bold rounded-sm border border-accent-200 bg-accent-50 text-accent-700 hover:bg-accent-100 transition-colors"
              >
                <ShoppingCart className="w-3.5 h-3.5" /> View Open POs
              </button>
            </div>
          )}

          {/* Already actioned */}
          {(status === "APPROVED" || status === "REJECTED") && (
            <div className={`enterprise-card p-4 border-t-4 ${status === "APPROVED" ? "border-t-success" : "border-t-danger"}`}>
              <div className="flex items-center gap-2 mb-3">
                {status === "APPROVED"
                  ? <CheckCircle2 className="w-5 h-5 text-success" />
                  : <XCircle className="w-5 h-5 text-danger" />}
                <span className="text-sm font-bold text-primary-900">{status === "APPROVED" ? "Approved" : "Rejected"}</span>
              </div>
              {pr.ASSIGNED_APPROVER_NAME && (
                <p className="text-xs text-text-secondary">
                  By: <strong>{pr.ASSIGNED_APPROVER_NAME}</strong>
                </p>
              )}
              {pr.APPROVER_ACTION_DATE && (
                <p className="text-xs text-text-secondary">
                  On: {fmtDate(pr.APPROVER_ACTION_DATE)}
                </p>
              )}
              {pr.APPROVER_REMARKS && (
                <div className="mt-3 p-2 bg-primary-50 border border-border rounded-sm">
                  <p className="text-[10px] text-text-secondary uppercase tracking-wider font-medium mb-1 flex items-center gap-1">
                    <MessageSquare className="w-3 h-3" /> Remarks
                  </p>
                  <p className="text-xs text-primary-900">{pr.APPROVER_REMARKS}</p>
                </div>
              )}
              {status === "APPROVED" && (
                <div className="mt-3 space-y-2">
                  <div className="p-2 bg-success/10 border border-success/20 rounded-sm text-[10px] text-success font-bold uppercase tracking-wider flex items-center gap-1">
                    <PackageCheck className="w-3.5 h-3.5" /> Ready for PO creation
                  </div>
                  {canCreatePO && (
                    <button
                      onClick={() => router.push(`/po/new?pr=${prId}&type=${prType}`)}
                      className="w-full flex items-center justify-center gap-2 h-9 text-xs font-bold rounded-sm bg-primary-900 hover:bg-primary-800 text-white transition-colors"
                    >
                      <ShoppingCart className="w-3.5 h-3.5" /> Create Purchase Order
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* PR not submitted yet — actions for the requestor */}
          {status === "DRAFT" && isRequestor && (
            <div className="enterprise-card p-4 bg-warning/5 border border-warning/20 space-y-3">
              <p className="text-xs text-warning-800 font-medium">This PR is still in Draft and has not been submitted for approval.</p>
              {draftSubmitError && (
                <p className="text-xs text-danger flex items-center gap-1">
                  <XCircle className="w-3.5 h-3.5" /> {draftSubmitError}
                </p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => router.push(`/pr/${prType === "SPR" ? "spr" : "mpr"}/edit/${id}`)}
                  className="flex-1 flex items-center justify-center gap-1.5 h-9 text-xs font-bold rounded-sm border border-primary-200 bg-surface hover:bg-primary-50 text-primary-700 transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" /> Edit Draft
                </button>
                <button
                  onClick={handleSubmitDraft}
                  disabled={submittingDraft}
                  className="flex-1 flex items-center justify-center gap-1.5 h-9 text-xs font-bold rounded-sm bg-primary-900 hover:bg-primary-800 text-white transition-colors disabled:opacity-50"
                >
                  {submittingDraft
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Submitting…</>
                    : <><Send className="w-3.5 h-3.5" /> Submit PR</>}
                </button>
              </div>
            </div>
          )}

          {/* Draft visible to non-requestors (read-only notice) */}
          {status === "DRAFT" && !isRequestor && (
            <div className="enterprise-card p-4 bg-warning/5 border border-warning/20">
              <p className="text-xs text-warning-800 font-medium">This PR is still in Draft and has not been submitted for approval.</p>
            </div>
          )}

          {/* Summary card */}
          <div className="enterprise-card p-4 space-y-2">
            <h3 className="text-xs font-bold text-primary-900 uppercase tracking-wide border-b border-border pb-2">Summary</h3>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-text-secondary">Subtotal</span>
                <span className="font-mono font-medium">₹{subtotal.toLocaleString("en-IN")}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Total GST</span>
                <span className="font-mono font-medium">₹{totalGst.toLocaleString("en-IN")}</span>
              </div>
              <div className="flex justify-between border-t border-border pt-1.5 mt-1">
                <span className="font-bold text-primary-900">Grand Total</span>
                <span className="font-mono font-bold text-primary-900">₹{total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
              </div>
              {pr.ADVANCE_PERCENT && parseFloat(pr.ADVANCE_PERCENT) > 0 && (
                <div className="flex justify-between text-warning-800">
                  <span>Advance</span>
                  <span className="font-mono">{pr.ADVANCE_PERCENT}%</span>
                </div>
              )}
              {pr.CREDIT_PERIOD_DAYS && (
                <div className="flex justify-between text-text-secondary">
                  <span>Credit Period</span>
                  <span>{pr.CREDIT_PERIOD_DAYS} days</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-primary-50 border border-primary-200 text-primary-700 text-[11px] font-bold tracking-wide uppercase p-2 rounded-sm flex items-center justify-center text-center">
        ⚑ Segregation Control: Approver cannot be the same as the requestor. — SOP §15.1
      </div>
    </div>
  );
}
