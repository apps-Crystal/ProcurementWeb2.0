"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Flag,
  ArrowLeft,
  AlertTriangle,
  ShieldAlert,
  Scale,
  CheckCircle2,
  XCircle,
  MessageSquare,
  Send,
  Loader2,
  User,
  Clock,
} from "lucide-react";
import { fmtDate } from "@/lib/utils";
import { useCurrentUser } from "@/components/auth/AuthProvider";

interface FlagDetail {
  FLAG_ID: string;
  FLAG_DATE: string;
  FLAG_TYPE: string;
  FLAG_DESCRIPTION: string;
  SOURCE_TYPE: string;
  SOURCE_ID: string;
  PAYMENT_ID: string;
  VENDOR_ID: string;
  RAISED_BY_NAME: string;
  RAISED_BY_ROLE: string;
  RAISED_DATE: string;
  REVIEWED_BY_NAME: string;
  REVIEW_DATE: string;
  REVIEW_COMMENTS: string;
  RESOLUTION: string;
  RESOLUTION_DATE: string;
  STATUS: string;
}

interface Comment {
  COMMENT_ID: string;
  COMMENT_DATE: string;
  COMMENTED_BY_NAME: string;
  COMMENTED_BY_ROLE: string;
  COMMENT_TEXT: string;
  IS_RESOLUTION_COMMENT: string;
}

const RESOLVE_ROLES = ["Accounts", "Management", "System_Admin"];

function getSeverityFromType(type: string) {
  if (["Price Mismatch", "Quantity Mismatch", "Fraud Risk", "Missing GRN"].includes(type))
    return "High";
  return "Medium";
}

function getTypeIcon(type: string) {
  if (type === "Price Mismatch" || type === "Quantity Mismatch")
    return <Scale className="w-4 h-4" />;
  if (type === "Vendor Compliance" || type === "Fraud Risk")
    return <ShieldAlert className="w-4 h-4" />;
  return <AlertTriangle className="w-4 h-4" />;
}

export default function FlagDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useCurrentUser();
  const canResolve = RESOLVE_ROLES.includes(user?.role ?? "");

  const [flag, setFlag] = useState<FlagDetail | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Comment form
  const [commentText, setCommentText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [commentError, setCommentError] = useState("");

  // Resolve form
  const [resolveNotes, setResolveNotes] = useState("");
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/flags/${id}`);
      if (!res.ok) throw new Error("Flag not found");
      const data = await res.json();
      setFlag(data.flag);
      setComments(data.comments ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load flag");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function handleComment() {
    if (!user) return;
    const text = commentText.trim();
    if (!text) { setCommentError("Comment cannot be empty."); return; }
    setSubmitting(true);
    setCommentError("");
    try {
      const res = await fetch(`/api/flags/${id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commented_by_user_id: user.userId,
          commented_by_name: user.name,
          commented_by_role: user.role,
          comment_text: text,
        }),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error ?? "Failed to post comment");
      }
      setCommentText("");
      await load();
    } catch (e) {
      setCommentError(e instanceof Error ? e.message : "Failed to post comment");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResolve() {
    if (!user) return;
    const notes = resolveNotes.trim();
    if (!notes) { setResolveError("Resolution notes are required (SOP §10.2)."); return; }
    setResolving(true);
    setResolveError("");
    try {
      const res = await fetch(`/api/flags/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolved_by: user.userId, resolution_notes: notes }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to resolve flag");
      await load();
    } catch (e) {
      setResolveError(e instanceof Error ? e.message : "Failed to resolve");
    } finally {
      setResolving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-8 h-8 animate-spin text-primary-400" />
      </div>
    );
  }

  if (error || !flag) {
    return (
      <div className="max-w-3xl mx-auto py-12 text-center">
        <XCircle className="w-10 h-10 text-danger mx-auto mb-3" />
        <p className="text-danger font-medium">{error || "Flag not found."}</p>
        <button onClick={() => router.back()} className="mt-4 text-sm text-primary-600 hover:underline">
          Go back
        </button>
      </div>
    );
  }

  const isResolved = flag.STATUS === "RESOLVED";
  const severity = getSeverityFromType(flag.FLAG_TYPE);

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
              <Flag className="w-6 h-6 text-danger" />
              Flag Detail
            </h1>
            <p className="text-sm text-text-secondary mt-0.5">
              <span className="font-mono font-bold text-primary-700">{flag.FLAG_ID}</span>
              {" — "}SOP §10.2
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isResolved ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-bold bg-success/10 text-success px-3 py-1.5 rounded-sm border border-success/20">
              <CheckCircle2 className="w-4 h-4" /> Resolved
            </span>
          ) : (
            <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-sm border ${
              severity === "High"
                ? "bg-danger/10 text-danger border-danger/20"
                : "bg-warning/10 text-warning-800 border-warning/20"
            }`}>
              {getTypeIcon(flag.FLAG_TYPE)}
              {severity} — Open
            </span>
          )}
        </div>
      </div>

      {/* Detail card */}
      <div className="enterprise-card p-6 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-[10px] uppercase tracking-wider font-semibold text-text-secondary mb-0.5">Flag Type</p>
            <p className="font-semibold text-text-primary flex items-center gap-1.5">
              {getTypeIcon(flag.FLAG_TYPE)} {flag.FLAG_TYPE}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider font-semibold text-text-secondary mb-0.5">Date Raised</p>
            <p className="font-medium">{fmtDate(flag.FLAG_DATE || flag.RAISED_DATE)}</p>
          </div>
          {flag.SOURCE_ID && (
            <div>
              <p className="text-[10px] uppercase tracking-wider font-semibold text-text-secondary mb-0.5">Source Document</p>
              <p className="font-mono font-medium text-primary-700">{flag.SOURCE_ID}</p>
            </div>
          )}
          {flag.SOURCE_TYPE && (
            <div>
              <p className="text-[10px] uppercase tracking-wider font-semibold text-text-secondary mb-0.5">Source Type</p>
              <p className="font-medium">{flag.SOURCE_TYPE.replace(/_/g, " ")}</p>
            </div>
          )}
          {flag.VENDOR_ID && (
            <div>
              <p className="text-[10px] uppercase tracking-wider font-semibold text-text-secondary mb-0.5">Vendor</p>
              <p className="font-mono font-medium text-primary-700">{flag.VENDOR_ID}</p>
            </div>
          )}
          {flag.PAYMENT_ID && (
            <div>
              <p className="text-[10px] uppercase tracking-wider font-semibold text-text-secondary mb-0.5">Payment</p>
              <button
                onClick={() => router.push(`/payments/${flag.PAYMENT_ID}`)}
                className="font-mono font-medium text-primary-600 hover:underline"
              >
                {flag.PAYMENT_ID}
              </button>
            </div>
          )}
        </div>

        <div>
          <p className="text-[10px] uppercase tracking-wider font-semibold text-text-secondary mb-1">Description</p>
          <p className="text-sm text-text-primary bg-primary-50/40 border border-border rounded-sm p-3">
            {flag.FLAG_DESCRIPTION || "—"}
          </p>
        </div>

        {flag.RAISED_BY_NAME && (
          <div className="flex items-center gap-2 text-xs text-text-secondary">
            <User className="w-3.5 h-3.5" />
            Raised by <span className="font-medium text-text-primary">{flag.RAISED_BY_NAME}</span>
            {flag.RAISED_BY_ROLE && <span>({flag.RAISED_BY_ROLE})</span>}
            {flag.RAISED_DATE && (
              <><Clock className="w-3 h-3 ml-1" />{fmtDate(flag.RAISED_DATE)}</>
            )}
          </div>
        )}

        {isResolved && (
          <div className="bg-success/5 border border-success/20 rounded-sm p-4 space-y-1">
            <p className="text-xs font-bold text-success uppercase tracking-wider">Resolution</p>
            {flag.REVIEW_COMMENTS && (
              <p className="text-sm text-text-primary">{flag.REVIEW_COMMENTS}</p>
            )}
            {flag.REVIEWED_BY_NAME && (
              <p className="text-xs text-text-secondary">
                Resolved by <strong>{flag.REVIEWED_BY_NAME}</strong>
                {flag.RESOLUTION_DATE && ` on ${fmtDate(flag.RESOLUTION_DATE)}`}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Comments thread */}
      <div className="enterprise-card flex flex-col">
        <div className="px-5 py-3 border-b border-border bg-primary-50/30">
          <h2 className="text-sm font-bold text-primary-900 flex items-center gap-1.5">
            <MessageSquare className="w-4 h-4" /> Comments &amp; Notes
            {comments.length > 0 && (
              <span className="ml-1 text-xs font-medium text-text-secondary">({comments.length})</span>
            )}
          </h2>
        </div>

        {/* Thread */}
        <div className="flex-1 divide-y divide-border">
          {comments.length === 0 ? (
            <div className="px-5 py-8 text-center text-xs text-text-secondary">
              No comments yet. Be the first to add a note.
            </div>
          ) : (
            comments.map((c) => (
              <div key={c.COMMENT_ID} className={`px-5 py-4 ${c.IS_RESOLUTION_COMMENT === "Y" ? "bg-success/5" : ""}`}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs font-bold text-text-primary">{c.COMMENTED_BY_NAME || "System"}</span>
                  {c.COMMENTED_BY_ROLE && (
                    <span className="text-[10px] text-text-secondary border border-border px-1.5 py-0.5 rounded-sm">
                      {c.COMMENTED_BY_ROLE}
                    </span>
                  )}
                  {c.IS_RESOLUTION_COMMENT === "Y" && (
                    <span className="text-[10px] font-bold text-success border border-success/30 bg-success/10 px-1.5 py-0.5 rounded-sm">
                      Resolution
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
        {!isResolved && user && (
          <div className="px-5 py-4 border-t border-border bg-primary-50/20">
            {commentError && (
              <div className="mb-2 p-2 bg-danger/10 border border-danger/30 rounded-sm text-xs text-danger flex items-center gap-1.5">
                <XCircle className="w-3.5 h-3.5 shrink-0" /> {commentError}
              </div>
            )}
            <div className="flex gap-2">
              <textarea
                rows={2}
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Add a note or update..."
                className="enterprise-input flex-1 resize-none text-xs"
              />
              <button
                onClick={handleComment}
                disabled={submitting}
                className="shrink-0 inline-flex items-center gap-1.5 text-xs font-bold text-white bg-primary-700 hover:bg-primary-900 px-3 py-2 rounded-sm transition-colors disabled:opacity-50 self-end"
              >
                {submitting
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Send className="w-4 h-4" />}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Resolve panel */}
      {!isResolved && canResolve && (
        <div className="enterprise-card p-5 border-l-4 border-l-warning">
          <h2 className="text-sm font-bold text-primary-900 mb-3 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-success" /> Resolve Flag — SOP §10.2
          </h2>
          <p className="text-xs text-text-secondary mb-3">
            Provide a justification. This will be permanently recorded in the Audit Log.
          </p>
          {resolveError && (
            <div className="mb-3 p-2 bg-danger/10 border border-danger/30 rounded-sm text-xs text-danger flex items-center gap-1.5">
              <XCircle className="w-3.5 h-3.5 shrink-0" /> {resolveError}
            </div>
          )}
          <div className="flex flex-col sm:flex-row gap-2">
            <textarea
              rows={3}
              value={resolveNotes}
              onChange={(e) => setResolveNotes(e.target.value)}
              placeholder="Enter resolution justification (required)..."
              className="enterprise-input flex-1 resize-none text-xs"
            />
            <button
              onClick={handleResolve}
              disabled={resolving}
              className="shrink-0 inline-flex items-center gap-1.5 text-sm font-bold text-white bg-success hover:bg-success/90 px-5 py-2 rounded-sm transition-colors disabled:opacity-50 self-end"
            >
              {resolving
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Resolving…</>
                : <><CheckCircle2 className="w-4 h-4" /> Mark Resolved</>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
