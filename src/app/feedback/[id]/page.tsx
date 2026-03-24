"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  MessageSquareWarning,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  MessageSquare,
  Send,
  Loader2,
  User,
  Clock,
  Lock,
  ExternalLink,
} from "lucide-react";
import { fmtDate } from "@/lib/utils";
import { useCurrentUser } from "@/components/auth/AuthProvider";

interface FeedbackDetail {
  FEEDBACK_ID:          string;
  FEEDBACK_DATE:        string;
  TYPE:                 string;
  CATEGORY:             string;
  TITLE:                string;
  DESCRIPTION:          string;
  SCREENSHOT_1_URL:     string;
  SCREENSHOT_2_URL:     string;
  SCREENSHOT_3_URL:     string;
  SEVERITY:             string;
  BROWSER_INFO:         string;
  PAGE_URL:             string;
  REPORTED_BY_USER_ID:  string;
  REPORTED_BY_NAME:     string;
  REPORTED_BY_ROLE:     string;
  STATUS:               string;
  PRIORITY:             string;
  ASSIGNED_TO_USER_ID:  string;
  ASSIGNED_TO_NAME:     string;
  RESOLUTION_NOTES:     string;
  RESOLVED_DATE:        string;
  CREATED_DATE:         string;
}

interface Comment {
  COMMENT_ID:           string;
  COMMENT_DATE:         string;
  COMMENTED_BY_NAME:    string;
  COMMENTED_BY_ROLE:    string;
  COMMENT_TEXT:         string;
  IS_INTERNAL_NOTE:     string;
}

interface UserOption {
  USER_ID:   string;
  FULL_NAME: string;
  ROLE:      string;
}

const STATUSES   = ["Open", "Acknowledged", "In_Progress", "Resolved", "Closed", "Wont_Fix"] as const;
const PRIORITIES = ["P1", "P2", "P3", "P4"] as const;

function getSeverityStyle(s: string) {
  if (s === "Critical") return "bg-danger/10 text-danger border-danger/20";
  if (s === "High")     return "bg-orange-50 text-orange-700 border-orange-200";
  if (s === "Medium")   return "bg-warning/10 text-warning-800 border-warning/20";
  return "bg-primary-50 text-primary-600 border-primary-200";
}

function getStatusStyle(s: string) {
  if (s === "Open")         return "bg-danger/10 text-danger border-danger/20";
  if (s === "Acknowledged") return "bg-orange-50 text-orange-700 border-orange-200";
  if (s === "In_Progress")  return "bg-warning/10 text-warning-800 border-warning/20";
  if (s === "Resolved" || s === "Closed") return "bg-success/10 text-success border-success/20";
  return "bg-primary-50 text-primary-600 border-primary-200";
}

export default function FeedbackDetailPage() {
  const { id }   = useParams<{ id: string }>();
  const router   = useRouter();
  const { user } = useCurrentUser();
  const isAdmin  = user?.role === "System_Admin";
  const canView  = isAdmin || user?.role === "Management";

  const [feedback,  setFeedback]  = useState<FeedbackDetail | null>(null);
  const [comments,  setComments]  = useState<Comment[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState("");

  // Comment form
  const [commentText,    setCommentText]    = useState("");
  const [isInternal,     setIsInternal]     = useState(false);
  const [submitting,     setSubmitting]     = useState(false);
  const [commentError,   setCommentError]   = useState("");

  // Admin actions
  const [adminStatus,   setAdminStatus]   = useState("");
  const [adminPriority, setAdminPriority] = useState("");
  const [adminAssignee, setAdminAssignee] = useState("");
  const [adminNotes,    setAdminNotes]    = useState("");
  const [users,         setUsers]         = useState<UserOption[]>([]);
  const [updating,      setUpdating]      = useState(false);
  const [updateError,   setUpdateError]   = useState("");
  const [updateSuccess, setUpdateSuccess] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res  = await fetch(`/api/feedback/${id}`);
      if (!res.ok) throw new Error((await res.json()).error ?? "Not found");
      const data = await res.json();
      setFeedback(data.feedback);
      setComments(data.comments ?? []);
      // Pre-fill admin form
      setAdminStatus(data.feedback.STATUS ?? "");
      setAdminPriority(data.feedback.PRIORITY ?? "");
      setAdminAssignee(data.feedback.ASSIGNED_TO_USER_ID ?? "");
      setAdminNotes(data.feedback.RESOLUTION_NOTES ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (isAdmin) {
      fetch("/api/admin/users")
        .then((r) => r.json())
        .then((d) => setUsers(d.users ?? []))
        .catch(() => {});
    }
  }, [isAdmin]);

  async function handleComment() {
    const text = commentText.trim();
    if (!text) { setCommentError("Comment cannot be empty."); return; }
    setSubmitting(true);
    setCommentError("");
    try {
      const res = await fetch(`/api/feedback/${id}/comments`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ comment_text: text, is_internal_note: isInternal ? "Y" : "N" }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      setCommentText("");
      setIsInternal(false);
      await load();
    } catch (e) {
      setCommentError(e instanceof Error ? e.message : "Failed to post comment");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAdminUpdate() {
    setUpdating(true);
    setUpdateError("");
    setUpdateSuccess("");
    try {
      const body: Record<string, string> = {};
      if (adminStatus)   body.status   = adminStatus;
      if (adminPriority) body.priority = adminPriority;
      if (adminAssignee) body.assigned_to_user_id = adminAssignee;
      if (adminNotes)    body.resolution_notes    = adminNotes;

      const res  = await fetch(`/api/feedback/${id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to update");
      setUpdateSuccess("Updated successfully.");
      setTimeout(() => setUpdateSuccess(""), 4000);
      await load();
    } catch (e) {
      setUpdateError(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setUpdating(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-8 h-8 animate-spin text-primary-400" />
      </div>
    );
  }

  if (error || !feedback) {
    return (
      <div className="max-w-3xl mx-auto py-12 text-center">
        <XCircle className="w-10 h-10 text-danger mx-auto mb-3" />
        <p className="text-danger font-medium">{error || "Feedback not found."}</p>
        <button onClick={() => router.back()} className="mt-4 text-sm text-primary-600 hover:underline">
          Go back
        </button>
      </div>
    );
  }

  const isResolved = feedback.STATUS === "Resolved" || feedback.STATUS === "Closed";
  const isReporter = feedback.REPORTED_BY_USER_ID === user?.userId;
  const isAssignee = feedback.ASSIGNED_TO_USER_ID === user?.userId;
  const canComment = isAdmin || canView || isReporter || isAssignee;

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start gap-4 border-b border-border pb-4">
        <div className="flex items-start gap-3">
          <button
            onClick={() => router.back()}
            className="mt-1 p-1.5 rounded-sm text-text-secondary hover:text-primary-900 hover:bg-primary-50 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-primary-900 tracking-tight flex items-center gap-2">
              <MessageSquareWarning className="w-6 h-6 text-primary-600" />
              Feedback Detail
            </h1>
            <p className="text-sm text-text-secondary mt-0.5">
              <span className="font-mono font-bold text-primary-700">{feedback.FEEDBACK_ID}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-sm border ${getSeverityStyle(feedback.SEVERITY)}`}>
            {feedback.SEVERITY}
          </span>
          <span className={`inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-sm border ${getStatusStyle(feedback.STATUS)}`}>
            {feedback.STATUS.replace(/_/g, " ")}
          </span>
        </div>
      </div>

      {/* Detail card */}
      <div className="enterprise-card p-6 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
          {[
            ["Type",        feedback.TYPE.replace(/_/g, " ")],
            ["Category",    feedback.CATEGORY],
            ["Severity",    feedback.SEVERITY],
            ["Priority",    feedback.PRIORITY || "—"],
            ["Status",      feedback.STATUS.replace(/_/g, " ")],
            ["Reported By", feedback.REPORTED_BY_NAME || "—"],
            ["Created",     fmtDate(feedback.CREATED_DATE || feedback.FEEDBACK_DATE)],
            ["Assigned To", feedback.ASSIGNED_TO_NAME || "—"],
          ].map(([label, value]) => (
            <div key={label}>
              <p className="text-[10px] uppercase tracking-wider font-semibold text-text-secondary mb-0.5">{label}</p>
              <p className="font-medium text-text-primary">{value}</p>
            </div>
          ))}
          {feedback.PAGE_URL && (
            <div>
              <p className="text-[10px] uppercase tracking-wider font-semibold text-text-secondary mb-0.5">Page URL</p>
              <a href={feedback.PAGE_URL} target="_blank" rel="noreferrer"
                className="text-xs text-primary-600 hover:underline flex items-center gap-1 truncate">
                {feedback.PAGE_URL} <ExternalLink className="w-3 h-3 shrink-0" />
              </a>
            </div>
          )}
        </div>

        {/* Title */}
        <div>
          <p className="text-[10px] uppercase tracking-wider font-semibold text-text-secondary mb-1">Title</p>
          <p className="text-base font-semibold text-text-primary">{feedback.TITLE}</p>
        </div>

        {/* Description */}
        <div>
          <p className="text-[10px] uppercase tracking-wider font-semibold text-text-secondary mb-1">Description</p>
          <p className="text-sm text-text-primary bg-primary-50/40 border border-border rounded-sm p-3 whitespace-pre-wrap">
            {feedback.DESCRIPTION || "—"}
          </p>
        </div>

        {/* Reporter */}
        {feedback.REPORTED_BY_NAME && (
          <div className="flex items-center gap-2 text-xs text-text-secondary">
            <User className="w-3.5 h-3.5" />
            Reported by <span className="font-medium text-text-primary">{feedback.REPORTED_BY_NAME}</span>
            {feedback.REPORTED_BY_ROLE && <span>({feedback.REPORTED_BY_ROLE})</span>}
            {feedback.CREATED_DATE && (
              <><Clock className="w-3 h-3 ml-1" />{fmtDate(feedback.CREATED_DATE)}</>
            )}
          </div>
        )}

        {/* Screenshots */}
        {(feedback.SCREENSHOT_1_URL || feedback.SCREENSHOT_2_URL || feedback.SCREENSHOT_3_URL) && (
          <div>
            <p className="text-[10px] uppercase tracking-wider font-semibold text-text-secondary mb-2">Screenshots</p>
            <div className="flex flex-wrap gap-3">
              {[feedback.SCREENSHOT_1_URL, feedback.SCREENSHOT_2_URL, feedback.SCREENSHOT_3_URL]
                .filter(Boolean)
                .map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noreferrer"
                    className="flex items-center gap-1.5 text-xs text-primary-600 hover:underline border border-primary-200 bg-primary-50 px-3 py-1.5 rounded-sm">
                    <ExternalLink className="w-3.5 h-3.5" /> Screenshot {i + 1}
                  </a>
                ))}
            </div>
          </div>
        )}

        {/* Resolution notes */}
        {isResolved && feedback.RESOLUTION_NOTES && (
          <div className="bg-success/5 border border-success/20 rounded-sm p-4 space-y-1">
            <p className="text-xs font-bold text-success uppercase tracking-wider flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" /> Resolution
            </p>
            <p className="text-sm text-text-primary">{feedback.RESOLUTION_NOTES}</p>
            {feedback.RESOLVED_DATE && (
              <p className="text-xs text-text-secondary">
                Resolved by <strong>{feedback.ASSIGNED_TO_NAME || "Admin"}</strong> on {fmtDate(feedback.RESOLVED_DATE)}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Admin actions panel */}
      {isAdmin && (
        <div className="enterprise-card p-5 border-l-4 border-l-primary-500">
          <h2 className="text-sm font-bold text-primary-900 mb-4">Admin Actions</h2>
          {updateError && (
            <div className="flex items-center gap-2 mb-3 p-2 bg-danger/10 border border-danger/30 rounded-sm text-xs text-danger">
              <XCircle className="w-3.5 h-3.5 shrink-0" /> {updateError}
            </div>
          )}
          {updateSuccess && (
            <div className="flex items-center gap-2 mb-3 p-2 bg-success/10 border border-success/30 rounded-sm text-xs text-success">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> {updateSuccess}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] uppercase tracking-wider font-semibold text-text-secondary mb-1">Status</label>
              <select value={adminStatus} onChange={(e) => setAdminStatus(e.target.value)} className="enterprise-input w-full">
                {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider font-semibold text-text-secondary mb-1">Priority</label>
              <select value={adminPriority} onChange={(e) => setAdminPriority(e.target.value)} className="enterprise-input w-full">
                <option value="">— None —</option>
                {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider font-semibold text-text-secondary mb-1">Assign To</label>
              <select value={adminAssignee} onChange={(e) => setAdminAssignee(e.target.value)} className="enterprise-input w-full">
                <option value="">— Unassigned —</option>
                {users.map((u) => (
                  <option key={u.USER_ID} value={u.USER_ID}>{u.FULL_NAME} ({u.ROLE})</option>
                ))}
              </select>
            </div>
            {(adminStatus === "Resolved" || adminStatus === "Closed") && (
              <div className="sm:col-span-2">
                <label className="block text-[10px] uppercase tracking-wider font-semibold text-text-secondary mb-1">
                  Resolution Notes <span className="text-danger">*</span>
                </label>
                <textarea
                  rows={3} value={adminNotes} onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder="Describe how the issue was resolved…"
                  className="enterprise-input w-full resize-none"
                />
              </div>
            )}
            <div className="sm:col-span-2 flex justify-end">
              <button
                onClick={handleAdminUpdate}
                disabled={updating}
                className="inline-flex items-center gap-1.5 text-sm font-bold text-white bg-primary-700 hover:bg-primary-900 px-5 py-2 rounded-sm transition-colors disabled:opacity-50"
              >
                {updating ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Comments thread */}
      <div className="enterprise-card flex flex-col">
        <div className="px-5 py-3 border-b border-border bg-primary-50/30">
          <h2 className="text-sm font-bold text-primary-900 flex items-center gap-1.5">
            <MessageSquare className="w-4 h-4" /> Comments
            {comments.length > 0 && (
              <span className="ml-1 text-xs font-medium text-text-secondary">({comments.length})</span>
            )}
          </h2>
        </div>

        <div className="flex-1 divide-y divide-border">
          {comments.length === 0 ? (
            <div className="px-5 py-8 text-center text-xs text-text-secondary">
              No comments yet.
            </div>
          ) : (
            comments.map((c) => (
              <div key={c.COMMENT_ID} className={`px-5 py-4 ${c.IS_INTERNAL_NOTE === "Y" ? "bg-yellow-50/50" : ""}`}>
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <span className="text-xs font-bold text-text-primary">{c.COMMENTED_BY_NAME || "System"}</span>
                  {c.COMMENTED_BY_ROLE && (
                    <span className="text-[10px] text-text-secondary border border-border px-1.5 py-0.5 rounded-sm">
                      {c.COMMENTED_BY_ROLE}
                    </span>
                  )}
                  {c.IS_INTERNAL_NOTE === "Y" && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-yellow-700 border border-yellow-300 bg-yellow-100 px-1.5 py-0.5 rounded-sm">
                      <Lock className="w-2.5 h-2.5" /> Internal
                    </span>
                  )}
                  <span className="text-[10px] text-text-secondary ml-auto">{fmtDate(c.COMMENT_DATE)}</span>
                </div>
                <p className="text-sm text-text-primary whitespace-pre-wrap">{c.COMMENT_TEXT}</p>
              </div>
            ))
          )}
        </div>

        {/* Add comment */}
        {canComment && (
          <div className="px-5 py-4 border-t border-border bg-primary-50/20">
            {commentError && (
              <div className="mb-2 p-2 bg-danger/10 border border-danger/30 rounded-sm text-xs text-danger flex items-center gap-1.5">
                <XCircle className="w-3.5 h-3.5 shrink-0" /> {commentError}
              </div>
            )}
            <div className="flex gap-2 flex-col sm:flex-row">
              <div className="flex-1 space-y-2">
                <textarea
                  rows={2} value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Add a note or update…"
                  className="enterprise-input w-full resize-none text-xs"
                />
                {(isAdmin || canView) && (
                  <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
                    <input
                      type="checkbox" checked={isInternal}
                      onChange={(e) => setIsInternal(e.target.checked)}
                      className="rounded border-border"
                    />
                    <Lock className="w-3 h-3" /> Mark as internal note (not visible to reporter)
                  </label>
                )}
              </div>
              <button
                onClick={handleComment}
                disabled={submitting}
                className="shrink-0 inline-flex items-center gap-1.5 text-xs font-bold text-white bg-primary-700 hover:bg-primary-900 px-3 py-2 rounded-sm transition-colors disabled:opacity-50 self-end"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
