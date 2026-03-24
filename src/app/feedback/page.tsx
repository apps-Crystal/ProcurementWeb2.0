"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  MessageSquareWarning,
  Search,
  ChevronRight,
  Loader2,
  XCircle,
  CheckCircle2,
  Plus,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { fmtDate } from "@/lib/utils";
import { useCurrentUser } from "@/components/auth/AuthProvider";

type FeedbackStatus   = "Open" | "Acknowledged" | "In_Progress" | "Resolved" | "Closed" | "Wont_Fix";
type FeedbackSeverity = "Critical" | "High" | "Medium" | "Low";
type FeedbackType     = "Bug" | "Feature_Request" | "UI_Issue" | "General";

interface FeedbackRow {
  FEEDBACK_ID:         string;
  FEEDBACK_DATE:       string;
  TYPE:                FeedbackType;
  CATEGORY:            string;
  TITLE:               string;
  SEVERITY:            FeedbackSeverity;
  STATUS:              FeedbackStatus;
  REPORTED_BY_NAME:    string;
  REPORTED_BY_USER_ID: string;
  ASSIGNED_TO_NAME:    string;
  ASSIGNED_TO_USER_ID: string;
  CREATED_DATE:        string;
}

const CATEGORIES  = ["PR", "PO", "GRN", "Payments", "Vendors", "Invoices", "Reports", "Login", "Other"] as const;
const TYPES       = ["Bug", "Feature_Request", "UI_Issue", "General"] as const;
const SEVERITIES  = ["Critical", "High", "Medium", "Low"] as const;
const ADMIN_ROLES = ["System_Admin", "Management"];

function getSeverityStyle(s: string) {
  if (s === "Critical") return "bg-danger/10 text-danger border-danger/20";
  if (s === "High")     return "bg-orange-50 text-orange-700 border-orange-200";
  if (s === "Medium")   return "bg-warning/10 text-warning-800 border-warning/20";
  return "bg-primary-50 text-primary-600 border-primary-200";
}

function getTypeStyle(t: string) {
  if (t === "Bug")             return "bg-danger/10 text-danger border-danger/20";
  if (t === "Feature_Request") return "bg-blue-50 text-blue-700 border-blue-200";
  if (t === "UI_Issue")        return "bg-warning/10 text-warning-800 border-warning/20";
  return "bg-primary-50 text-primary-600 border-primary-200";
}

function getStatusStyle(s: string) {
  if (s === "Open")         return "text-danger";
  if (s === "Acknowledged") return "text-orange-600";
  if (s === "In_Progress")  return "text-warning-800";
  if (s === "Resolved")     return "text-success";
  if (s === "Closed")       return "text-primary-600";
  return "text-text-secondary";
}

export default function FeedbackPage() {
  const router   = useRouter();
  const { user } = useCurrentUser();
  const isAdmin  = ADMIN_ROLES.includes(user?.role ?? "");

  const [feedback, setFeedback]   = useState<FeedbackRow[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState("");
  const [activeTab, setActiveTab] = useState<"mine" | "all">(isAdmin ? "all" : "mine");
  const [showForm, setShowForm]   = useState(false);
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  // Form state
  const [fTitle,       setFTitle]       = useState("");
  const [fType,        setFType]        = useState<string>("Bug");
  const [fCategory,    setFCategory]    = useState<string>("Other");
  const [fSeverity,    setFSeverity]    = useState<string>("Medium");
  const [fDescription, setFDescription] = useState("");
  const [fPageUrl,     setFPageUrl]     = useState("");
  const [fScreenshot1, setFScreenshot1] = useState<File | null>(null);
  const [fScreenshot2, setFScreenshot2] = useState<File | null>(null);
  const [fScreenshot3, setFScreenshot3] = useState<File | null>(null);
  const s1Ref = useRef<HTMLInputElement>(null);
  const s2Ref = useRef<HTMLInputElement>(null);
  const s3Ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user) {
      setActiveTab(isAdmin ? "all" : "mine");
      setFPageUrl(typeof window !== "undefined" ? window.location.origin : "");
    }
  }, [user, isAdmin]);

  function load() {
    setLoading(true);
    fetch("/api/feedback")
      .then((r) => r.json())
      .then((data) => setFeedback(data.feedback ?? []))
      .catch(() => setFeedback([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  async function handleSubmit() {
    if (!fTitle.trim())       { setFormError("Title is required."); return; }
    if (!fDescription.trim()) { setFormError("Description is required."); return; }
    setSubmitting(true);
    setFormError("");
    try {
      const form = new FormData();
      form.append("data", JSON.stringify({
        type:         fType,
        category:     fCategory,
        title:        fTitle,
        description:  fDescription,
        severity:     fSeverity,
        page_url:     fPageUrl,
        browser_info: typeof navigator !== "undefined" ? navigator.userAgent : "",
      }));
      if (fScreenshot1) form.append("screenshot_1", fScreenshot1);
      if (fScreenshot2) form.append("screenshot_2", fScreenshot2);
      if (fScreenshot3) form.append("screenshot_3", fScreenshot3);

      const res  = await fetch("/api/feedback", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to submit feedback");

      // Reset form
      setFTitle(""); setFType("Bug"); setFCategory("Other"); setFSeverity("Medium");
      setFDescription(""); setFPageUrl(""); setFScreenshot1(null); setFScreenshot2(null); setFScreenshot3(null);
      if (s1Ref.current) s1Ref.current.value = "";
      if (s2Ref.current) s2Ref.current.value = "";
      if (s3Ref.current) s3Ref.current.value = "";
      setShowForm(false);
      setSuccessMsg(`Feedback submitted — ${json.feedback_id}`);
      setTimeout(() => setSuccessMsg(""), 5000);
      load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  }

  const openCount     = feedback.filter((f) => f.STATUS === "Open").length;
  const inProgCount   = feedback.filter((f) => f.STATUS === "Acknowledged" || f.STATUS === "In_Progress").length;
  const resolvedCount = feedback.filter((f) => f.STATUS === "Resolved" || f.STATUS === "Closed").length;

  const myItems = feedback.filter(
    (f) => f.REPORTED_BY_USER_ID === user?.userId || f.ASSIGNED_TO_USER_ID === user?.userId
  );

  const displayList = feedback.filter((f) => {
    if (activeTab === "mine" && f.REPORTED_BY_USER_ID !== user?.userId && f.ASSIGNED_TO_USER_ID !== user?.userId) return false;
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      f.FEEDBACK_ID.toLowerCase().includes(q) ||
      f.TITLE.toLowerCase().includes(q) ||
      f.CATEGORY.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-bold text-primary-900 tracking-tight flex items-center gap-2">
            <MessageSquareWarning className="w-6 h-6 text-primary-600" /> Feedback &amp; Bugs
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Report issues, suggest improvements, track resolutions.
          </p>
        </div>
        <button
          onClick={() => { setShowForm((v) => !v); setFormError(""); }}
          className="inline-flex items-center gap-1.5 text-sm font-bold text-white bg-primary-700 hover:bg-primary-900 px-4 py-2 rounded-sm transition-colors"
        >
          {showForm ? <ChevronUp className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showForm ? "Cancel" : "Report Issue"}
        </button>
      </div>

      {/* Success toast */}
      {successMsg && (
        <div className="flex items-center gap-2 p-3 bg-success/10 border border-success/30 rounded-sm text-sm text-success font-medium">
          <CheckCircle2 className="w-4 h-4 shrink-0" /> {successMsg}
        </div>
      )}

      {/* Inline create form */}
      {showForm && (
        <div className="enterprise-card p-5 border-l-4 border-l-primary-500">
          <h2 className="text-sm font-bold text-primary-900 mb-4">Report an Issue</h2>
          {formError && (
            <div className="flex items-center gap-2 mb-3 p-2 bg-danger/10 border border-danger/30 rounded-sm text-xs text-danger">
              <XCircle className="w-3.5 h-3.5 shrink-0" /> {formError}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Title */}
            <div className="sm:col-span-2">
              <label className="block text-[10px] uppercase tracking-wider font-semibold text-text-secondary mb-1">Title <span className="text-danger">*</span></label>
              <input
                type="text" maxLength={200} value={fTitle}
                onChange={(e) => setFTitle(e.target.value)}
                placeholder="Brief summary of the issue"
                className="enterprise-input w-full"
              />
            </div>

            {/* Type */}
            <div>
              <label className="block text-[10px] uppercase tracking-wider font-semibold text-text-secondary mb-1">Type</label>
              <select value={fType} onChange={(e) => setFType(e.target.value)} className="enterprise-input w-full">
                {TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
              </select>
            </div>

            {/* Category */}
            <div>
              <label className="block text-[10px] uppercase tracking-wider font-semibold text-text-secondary mb-1">Category</label>
              <select value={fCategory} onChange={(e) => setFCategory(e.target.value)} className="enterprise-input w-full">
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {/* Severity */}
            <div>
              <label className="block text-[10px] uppercase tracking-wider font-semibold text-text-secondary mb-1">Severity</label>
              <select value={fSeverity} onChange={(e) => setFSeverity(e.target.value)} className="enterprise-input w-full">
                {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            {/* Page URL */}
            <div>
              <label className="block text-[10px] uppercase tracking-wider font-semibold text-text-secondary mb-1">Page URL</label>
              <input
                type="text" value={fPageUrl}
                onChange={(e) => setFPageUrl(e.target.value)}
                placeholder="https://..."
                className="enterprise-input w-full"
              />
            </div>

            {/* Description */}
            <div className="sm:col-span-2">
              <label className="block text-[10px] uppercase tracking-wider font-semibold text-text-secondary mb-1">Description <span className="text-danger">*</span></label>
              <textarea
                rows={4} value={fDescription}
                onChange={(e) => setFDescription(e.target.value)}
                placeholder="Describe the issue in detail — steps to reproduce, expected vs actual behaviour…"
                className="enterprise-input w-full resize-none"
              />
            </div>

            {/* Screenshots */}
            <div>
              <label className="block text-[10px] uppercase tracking-wider font-semibold text-text-secondary mb-1">Screenshot 1 (optional)</label>
              <input ref={s1Ref} type="file" accept="image/*,.pdf" className="enterprise-input w-full text-xs"
                onChange={(e) => setFScreenshot1(e.target.files?.[0] ?? null)} />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider font-semibold text-text-secondary mb-1">Screenshot 2 (optional)</label>
              <input ref={s2Ref} type="file" accept="image/*,.pdf" className="enterprise-input w-full text-xs"
                onChange={(e) => setFScreenshot2(e.target.files?.[0] ?? null)} />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider font-semibold text-text-secondary mb-1">Screenshot 3 (optional)</label>
              <input ref={s3Ref} type="file" accept="image/*,.pdf" className="enterprise-input w-full text-xs"
                onChange={(e) => setFScreenshot3(e.target.files?.[0] ?? null)} />
            </div>

            <div className="sm:col-span-2 flex justify-end">
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="inline-flex items-center gap-1.5 text-sm font-bold text-white bg-primary-700 hover:bg-primary-900 px-5 py-2 rounded-sm transition-colors disabled:opacity-50"
              >
                {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</> : "Submit Report"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="enterprise-card p-4 flex flex-col items-center justify-center text-center">
          <span className="text-3xl font-mono font-bold text-danger">{openCount}</span>
          <span className="text-xs font-bold text-text-secondary uppercase tracking-wider mt-1">Open Issues</span>
        </div>
        <div className="enterprise-card p-4 flex flex-col items-center justify-center text-center">
          <span className="text-3xl font-mono font-bold text-warning-800">{inProgCount}</span>
          <span className="text-xs font-bold text-text-secondary uppercase tracking-wider mt-1">In Progress</span>
        </div>
        <div className="enterprise-card p-4 flex flex-col items-center justify-center text-center">
          <span className="text-3xl font-mono font-bold text-success">{resolvedCount}</span>
          <span className="text-xs font-bold text-text-secondary uppercase tracking-wider mt-1">Resolved</span>
        </div>
      </div>

      {/* Main content card */}
      <div className="enterprise-card flex flex-col min-h-[400px]">
        {/* Toolbar */}
        <div className="p-4 border-b border-border bg-primary-50/30 flex flex-col sm:flex-row justify-between gap-4">
          <div className="flex bg-surface border border-border rounded-sm p-1 shadow-sm overflow-x-auto">
            <button onClick={() => setActiveTab("mine")}
              className={`px-4 py-1.5 text-xs font-bold rounded-sm transition-colors whitespace-nowrap ${activeTab === "mine" ? "bg-primary-700 text-white shadow-sm" : "text-text-secondary hover:text-primary-900"}`}>
              My Items ({myItems.length})
            </button>
            {isAdmin && (
              <button onClick={() => setActiveTab("all")}
                className={`px-4 py-1.5 text-xs font-bold rounded-sm transition-colors whitespace-nowrap ${activeTab === "all" ? "bg-primary-900 text-white shadow-sm" : "text-text-secondary hover:text-primary-900"}`}>
                All Issues ({feedback.length})
              </button>
            )}
          </div>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2.5 top-2 text-text-secondary" />
            <input type="text" placeholder="Search ID, title, category…" value={search}
              onChange={(e) => setSearch(e.target.value)} className="enterprise-input pl-8 w-64" />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-auto bg-surface divide-y divide-border">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-primary-400" />
            </div>
          ) : displayList.length === 0 ? (
            <div className="px-6 py-12 text-center text-text-secondary">
              <MessageSquareWarning className="w-8 h-8 mx-auto text-primary-300 mb-2" />
              <p>No feedback items found.</p>
            </div>
          ) : (
            displayList.map((item) => (
              <div
                key={item.FEEDBACK_ID}
                className="flex items-start gap-4 px-6 py-4 hover:bg-primary-50/20 transition-colors cursor-pointer"
                onClick={() => router.push(`/feedback/${item.FEEDBACK_ID}`)}
              >
                {/* Severity badge */}
                <div className="shrink-0 pt-0.5">
                  <span className={`inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-sm border ${getSeverityStyle(item.SEVERITY)}`}>
                    {item.SEVERITY}
                  </span>
                </div>

                {/* Main info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <span className="font-mono font-bold text-primary-700 text-xs">{item.FEEDBACK_ID}</span>
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-sm border ${getTypeStyle(item.TYPE)}`}>
                      {item.TYPE.replace(/_/g, " ")}
                    </span>
                    <span className="text-[10px] text-text-secondary font-mono bg-primary-50 px-1.5 py-0.5 rounded-sm border border-primary-100">
                      {item.CATEGORY}
                    </span>
                    <span className="text-[10px] text-text-secondary">{fmtDate(item.FEEDBACK_DATE || item.CREATED_DATE)}</span>
                  </div>
                  <p className="text-sm font-medium text-text-primary truncate">{item.TITLE}</p>
                  <div className="flex gap-3 mt-0.5 text-[10px] text-text-secondary">
                    {item.REPORTED_BY_NAME && <span>By: <strong>{item.REPORTED_BY_NAME}</strong></span>}
                    {item.ASSIGNED_TO_NAME && <span>Assigned: <strong>{item.ASSIGNED_TO_NAME}</strong></span>}
                  </div>
                </div>

                {/* Status + arrow */}
                <div className="shrink-0 flex items-center gap-2">
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${getStatusStyle(item.STATUS)}`}>
                    {item.STATUS.replace(/_/g, " ")}
                  </span>
                  <ChevronRight className="w-4 h-4 text-text-secondary" />
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
