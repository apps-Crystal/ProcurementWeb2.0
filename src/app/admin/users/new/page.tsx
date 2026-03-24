"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  UserPlus,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { useCurrentUser } from "@/components/auth/AuthProvider";
import { useDropdowns, opts } from "@/hooks/useDropdowns";

const ROLES = [
  "Requestor", "Procurement_Team", "Procurement_Head",
  "Accounts", "Finance", "Management",
  "Warehouse", "Site_Head", "Designated_Approver", "System_Admin",
];

export default function NewUserPage() {
  const { user: me } = useCurrentUser();
  const router = useRouter();
  const dropdowns = useDropdowns("SITE");
  const siteOpts  = opts(dropdowns, "SITE", []);

  const [fullName,    setFullName]    = useState("");
  const [email,       setEmail]       = useState("");
  const [phone,       setPhone]       = useState("");
  const [department,  setDepartment]  = useState("");
  const [site,        setSite]        = useState("");
  const [role,        setRole]        = useState("Requestor");
  const [password,    setPassword]    = useState("");
  const [isProcHead,  setIsProcHead]  = useState(false);
  const [isFinHead,   setIsFinHead]   = useState(false);
  const [isSiteHead,  setIsSiteHead]  = useState(false);
  const [approvalSites, setApprovalSites] = useState("");
  const [payLimit,    setPayLimit]    = useState("");

  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState("");
  const [success, setSuccess] = useState("");

  // Inline field errors
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function setFieldError(field: string, msg: string) {
    setFieldErrors((prev) => ({ ...prev, [field]: msg }));
  }
  function clearFieldError(field: string) {
    setFieldErrors((prev) => { const n = { ...prev }; delete n[field]; return n; });
  }

  // Email validation on blur
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  function handleEmailBlur() {
    const v = email.trim();
    if (v && !EMAIL_RE.test(v)) setFieldError("email", "Invalid email format");
    else clearFieldError("email");
  }

  // Password strength
  function pwStrength(pw: string): { score: number; label: string; color: string } {
    if (!pw) return { score: 0, label: "", color: "" };
    let s = 0;
    if (pw.length >= 8)        s++;
    if (/[A-Z]/.test(pw))      s++;
    if (/[a-z]/.test(pw))      s++;
    if (/\d/.test(pw))         s++;
    if (/[^A-Za-z0-9]/.test(pw)) s++;
    if (s <= 1) return { score: s, label: "Very weak", color: "bg-red-500" };
    if (s === 2) return { score: s, label: "Weak",      color: "bg-orange-400" };
    if (s === 3) return { score: s, label: "Fair",      color: "bg-yellow-400" };
    if (s === 4) return { score: s, label: "Strong",    color: "bg-blue-500" };
    return { score: s, label: "Very strong", color: "bg-green-500" };
  }
  const pwInfo = pwStrength(password);

  if (me && me.role !== "System_Admin") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-text-secondary">
        <ShieldCheck className="w-12 h-12 opacity-30" />
        <p className="text-sm font-medium">Access restricted to System Admins only.</p>
      </div>
    );
  }

  const showHeadFlags =
    role === "System_Admin" ||
    role === "Procurement_Head" ||
    role === "Finance" ||
    role === "Site_Head";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    const newFieldErrors: Record<string, string> = {};
    if (!fullName.trim() || fullName.trim().length < 2)
      newFieldErrors.fullName = "Full name must be at least 2 characters.";
    const emailVal = email.trim();
    if (!emailVal) newFieldErrors.email = "Email is required.";
    else if (!EMAIL_RE.test(emailVal)) newFieldErrors.email = "Invalid email format.";
    if (!password) newFieldErrors.password = "Password is required.";
    else if (pwInfo.score < 5) newFieldErrors.password = "Password does not meet complexity requirements.";
    if (Object.keys(newFieldErrors).length) {
      setFieldErrors(newFieldErrors);
      setError("Please fix the highlighted errors before submitting.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName:             fullName.trim(),
          email:                email.trim(),
          phone:                phone.trim(),
          department:           department.trim(),
          site,
          role,
          password,
          isProcurementHead:    isProcHead ? "Y" : "N",
          isFinanceHead:        isFinHead  ? "Y" : "N",
          isSiteHead:           isSiteHead ? "Y" : "N",
          approvalSites:        approvalSites.trim(),
          paymentApprovalLimit: payLimit || "0",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create user.");
        return;
      }

      setSuccess(`User created successfully (${data.userId}). Redirecting…`);
      setTimeout(() => router.push(`/admin/users/${data.userId}`), 1500);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto pb-20">
      {/* Header */}
      <div className="border-b border-border pb-4">
        <h1 className="text-2xl font-bold text-primary-900 tracking-tight flex items-center gap-2">
          <UserPlus className="w-6 h-6 text-primary-600" /> Create New User
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          Provision a new system user and assign their role.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 px-4 py-3 rounded-sm bg-red-50 border border-red-200 text-red-700 text-sm">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="flex items-start gap-2 px-4 py-3 rounded-sm bg-green-50 border border-green-200 text-green-700 text-sm">
          <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{success}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Info */}
        <div className="enterprise-card p-6 space-y-4">
          <h2 className="text-sm font-bold text-primary-900 uppercase tracking-wider border-b border-border pb-2">
            Basic Information
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-primary-700">Full Name <span className="text-danger">*</span></label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => { setFullName(e.target.value); clearFieldError("fullName"); }}
                className={`enterprise-input${fieldErrors.fullName ? " border-red-400" : ""}`}
                placeholder="e.g. Rahul Sharma"
                required
              />
              {fieldErrors.fullName && <p className="text-[11px] text-red-600">{fieldErrors.fullName}</p>}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-primary-700">Email <span className="text-danger">*</span></label>
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); clearFieldError("email"); }}
                onBlur={handleEmailBlur}
                className={`enterprise-input${fieldErrors.email ? " border-red-400" : ""}`}
                placeholder="rahul@crystalgroup.in"
                required
              />
              {fieldErrors.email && <p className="text-[11px] text-red-600">{fieldErrors.email}</p>}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-primary-700">Phone</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="enterprise-input"
                placeholder="+91 9XXXXXXXXX"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-primary-700">Department</label>
              <input
                type="text"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="enterprise-input"
                placeholder="e.g. Finance, Procurement"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-primary-700">Primary Site</label>
              <select value={site} onChange={(e) => setSite(e.target.value)} className="enterprise-input">
                <option value="">— Select Site —</option>
                {siteOpts.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-primary-700">Initial Password <span className="text-danger">*</span></label>
              <input
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); clearFieldError("password"); }}
                className={`enterprise-input${fieldErrors.password ? " border-red-400" : ""}`}
                placeholder="Min 8 chars, upper, lower, digit, symbol"
                required
              />
              {password && (
                <div className="mt-1 space-y-1">
                  <div className="flex gap-1 h-1.5">
                    {[1,2,3,4,5].map((i) => (
                      <div key={i} className={`flex-1 rounded-full transition-colors ${pwInfo.score >= i ? pwInfo.color : "bg-gray-200"}`} />
                    ))}
                  </div>
                  <p className={`text-[11px] font-medium ${pwInfo.score <= 2 ? "text-red-500" : pwInfo.score === 3 ? "text-yellow-600" : pwInfo.score === 4 ? "text-blue-600" : "text-green-600"}`}>
                    {pwInfo.label} — must include uppercase, lowercase, digit &amp; special character
                  </p>
                </div>
              )}
              {fieldErrors.password && <p className="text-[11px] text-red-600">{fieldErrors.password}</p>}
            </div>
          </div>
        </div>

        {/* Role & Permissions */}
        <div className="enterprise-card p-6 space-y-4">
          <h2 className="text-sm font-bold text-primary-900 uppercase tracking-wider border-b border-border pb-2">
            Role &amp; Permissions
          </h2>

          <div className="flex flex-col gap-1 max-w-xs">
            <label className="text-xs font-semibold text-primary-700">Role <span className="text-danger">*</span></label>
            <select
              value={role}
              onChange={(e) => { setRole(e.target.value); setIsProcHead(false); setIsFinHead(false); setIsSiteHead(false); }}
              className="enterprise-input"
              required
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>{r.replace(/_/g, " ")}</option>
              ))}
            </select>
          </div>

          {showHeadFlags && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              {(role === "System_Admin" || role === "Procurement_Head") && (
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isProcHead}
                    onChange={(e) => setIsProcHead(e.target.checked)}
                    className="w-4 h-4 accent-primary-700"
                  />
                  <span className="text-xs font-medium text-primary-800">Is Procurement Head</span>
                </label>
              )}
              {(role === "System_Admin" || role === "Finance") && (
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isFinHead}
                    onChange={(e) => setIsFinHead(e.target.checked)}
                    className="w-4 h-4 accent-primary-700"
                  />
                  <span className="text-xs font-medium text-primary-800">Is Finance Head</span>
                </label>
              )}
              {(role === "System_Admin" || role === "Site_Head") && (
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isSiteHead}
                    onChange={(e) => setIsSiteHead(e.target.checked)}
                    className="w-4 h-4 accent-primary-700"
                  />
                  <span className="text-xs font-medium text-primary-800">Is Site Head</span>
                </label>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-primary-700">Approval Sites</label>
              <input
                type="text"
                value={approvalSites}
                onChange={(e) => setApprovalSites(e.target.value)}
                className="enterprise-input"
                placeholder="Noida,Mumbai,HO"
              />
              <p className="text-[11px] text-text-secondary">Comma-separated list of sites this user can approve for.</p>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-primary-700">Payment Approval Limit (₹)</label>
              <input
                type="number"
                min="0"
                value={payLimit}
                onChange={(e) => setPayLimit(e.target.value)}
                className="enterprise-input"
                placeholder="e.g. 500000"
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="h-9 px-4 text-sm font-medium text-primary-700 border border-border rounded-sm hover:bg-primary-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 h-9 px-5 bg-primary-900 hover:bg-primary-800 text-white text-sm font-medium rounded-sm border border-primary-950 shadow-sm transition-colors disabled:opacity-60"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            {saving ? "Creating…" : "Create User"}
          </button>
        </div>
      </form>
    </div>
  );
}
