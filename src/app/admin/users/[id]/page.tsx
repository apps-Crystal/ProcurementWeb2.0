"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  UserCog,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Lock,
  LockOpen,
  ShieldCheck,
  ArrowLeft,
  Save,
} from "lucide-react";
import { fmtDate, fmtDateTime } from "@/lib/utils";
import { useCurrentUser } from "@/components/auth/AuthProvider";
import { useDropdowns, opts } from "@/hooks/useDropdowns";

type User = Record<string, string>;

const ROLES = [
  "Requestor", "Procurement_Team", "Procurement_Head",
  "Accounts", "Finance", "Management",
  "Warehouse", "Site_Head", "Designated_Approver", "System_Admin",
];

export default function UserDetailPage() {
  const { user: me }   = useCurrentUser();
  const params         = useParams();
  const router         = useRouter();
  const userId         = params.id as string;
  const dropdowns      = useDropdowns("SITE");
  const siteOpts       = opts(dropdowns, "SITE", []);

  const [user,    setUser]    = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState("");
  const [success, setSuccess] = useState("");

  // Editable fields
  const [role,        setRole]        = useState("");
  const [status,      setStatus]      = useState("");
  const [isProcHead,  setIsProcHead]  = useState(false);
  const [isFinHead,   setIsFinHead]   = useState(false);
  const [isSiteHead,  setIsSiteHead]  = useState(false);
  const [approvalSites, setApprovalSites] = useState("");
  const [payLimit,    setPayLimit]    = useState("");
  const [department,  setDepartment]  = useState("");
  const [site,        setSite]        = useState("");
  const [phone,       setPhone]       = useState("");

  useEffect(() => {
    fetch(`/api/admin/users/${userId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.user) {
          const u: User = d.user;
          setUser(u);
          setRole(u.ROLE ?? "");
          setStatus(u.STATUS ?? "ACTIVE");
          setIsProcHead(u.IS_PROCUREMENT_HEAD === "Y");
          setIsFinHead(u.IS_FINANCE_HEAD === "Y");
          setIsSiteHead(u.IS_SITE_HEAD === "Y");
          setApprovalSites(u.APPROVAL_SITES ?? "");
          setPayLimit(u.PAYMENT_APPROVAL_LIMIT_INR ?? "");
          setDepartment(u.DEPARTMENT ?? "");
          setSite(u.SITE ?? "");
          setPhone(u.PHONE ?? "");
        }
      })
      .catch(() => setError("Failed to load user."))
      .finally(() => setLoading(false));
  }, [userId]);

  if (me && me.role !== "System_Admin") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-text-secondary">
        <ShieldCheck className="w-12 h-12 opacity-30" />
        <p className="text-sm font-medium">Access restricted to System Admins only.</p>
      </div>
    );
  }

  async function patch(updates: Record<string, string>, msg?: string) {
    setError("");
    setSuccess("");
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Update failed."); return; }
      setSuccess(msg ?? "Changes saved.");
      // Refresh user data
      const fresh = await fetch(`/api/admin/users/${userId}`).then((r) => r.json());
      if (fresh.user) setUser(fresh.user);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    await patch({
      ROLE:                       role,
      STATUS:                     status,
      IS_PROCUREMENT_HEAD:        isProcHead ? "Y" : "N",
      IS_FINANCE_HEAD:            isFinHead  ? "Y" : "N",
      IS_SITE_HEAD:               isSiteHead ? "Y" : "N",
      APPROVAL_SITES:             approvalSites,
      PAYMENT_APPROVAL_LIMIT_INR: payLimit || "0",
      DEPARTMENT:                 department,
      SITE:                       site,
      PHONE:                      phone,
    }, "User updated successfully.");
  }

  async function handleUnlock() {
    await patch({ ACCOUNT_LOCKED: "N" }, "Account unlocked and login attempts reset.");
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-8 h-8 animate-spin text-primary-400" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-text-secondary">
        <AlertTriangle className="w-10 h-10 opacity-30" />
        <p className="text-sm font-medium">User not found.</p>
      </div>
    );
  }

  const isLocked = user.ACCOUNT_LOCKED === "Y";

  return (
    <div className="space-y-6 max-w-3xl mx-auto pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border pb-4">
        <div>
          <button
            onClick={() => router.push("/admin/users")}
            className="inline-flex items-center gap-1 text-xs text-primary-600 hover:text-primary-900 mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to User List
          </button>
          <h1 className="text-2xl font-bold text-primary-900 tracking-tight flex items-center gap-2">
            <UserCog className="w-6 h-6 text-primary-600" /> {user.FULL_NAME}
          </h1>
          <p className="text-sm text-text-secondary mt-0.5 font-mono">{user.USER_ID}</p>
        </div>
        {isLocked && (
          <button
            onClick={handleUnlock}
            disabled={saving}
            className="inline-flex items-center gap-2 h-9 px-4 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-300 rounded-sm hover:bg-amber-100 transition-colors disabled:opacity-60"
          >
            <LockOpen className="w-4 h-4" /> Unlock Account
          </button>
        )}
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

      {/* Profile (read-only) */}
      <div className="enterprise-card p-6 space-y-4">
        <h2 className="text-sm font-bold text-primary-900 uppercase tracking-wider border-b border-border pb-2">
          Profile
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3 text-sm">
          {[
            ["Email",          user.EMAIL],
            ["Provisioned By", user.PROVISIONED_BY || "—"],
            ["Provisioned On", fmtDate(user.PROVISIONED_DATE)],
            ["Last Login",     fmtDateTime(user.LAST_LOGIN_DATE)],
            ["Pwd Last Changed", fmtDate(user.PASSWORD_LAST_CHANGED)],
            ["Account Locked", isLocked
              ? <span className="inline-flex items-center gap-1 text-red-600 font-semibold"><Lock className="w-3.5 h-3.5" />Yes</span>
              : <span className="text-green-700 font-medium">No</span>
            ],
          ].map(([label, value]) => (
            <div key={String(label)}>
              <p className="text-[11px] font-bold text-primary-600 uppercase tracking-wider">{label}</p>
              <p className="mt-0.5 text-primary-900 break-all">{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Role & Access (editable) */}
      <form onSubmit={handleSave} className="space-y-6">
        <div className="enterprise-card p-6 space-y-4">
          <h2 className="text-sm font-bold text-primary-900 uppercase tracking-wider border-b border-border pb-2">
            Role &amp; Access
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-primary-700">Role</label>
              <select value={role} onChange={(e) => setRole(e.target.value)} className="enterprise-input">
                {ROLES.map((r) => (
                  <option key={r} value={r}>{r.replace(/_/g, " ")}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-primary-700">Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)} className="enterprise-input">
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-primary-700">Primary Site</label>
              <select value={site} onChange={(e) => setSite(e.target.value)} className="enterprise-input">
                <option value="">— Select Site —</option>
                {siteOpts.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-primary-700">Department</label>
              <input
                type="text"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="enterprise-input"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-primary-700">Phone</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="enterprise-input"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-primary-700">Payment Approval Limit (₹)</label>
              <input
                type="number"
                min="0"
                value={payLimit}
                onChange={(e) => setPayLimit(e.target.value)}
                className="enterprise-input"
              />
            </div>
          </div>

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

          {/* Head flags */}
          <div className="pt-2 flex flex-col gap-2">
            <p className="text-xs font-bold text-primary-700 uppercase tracking-wider">Authority Flags</p>
            <div className="flex flex-wrap gap-5">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isProcHead}
                  onChange={(e) => setIsProcHead(e.target.checked)}
                  className="w-4 h-4 accent-primary-700"
                />
                <span className="text-xs font-medium text-primary-800">Procurement Head</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isFinHead}
                  onChange={(e) => setIsFinHead(e.target.checked)}
                  className="w-4 h-4 accent-primary-700"
                />
                <span className="text-xs font-medium text-primary-800">Finance Head</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isSiteHead}
                  onChange={(e) => setIsSiteHead(e.target.checked)}
                  className="w-4 h-4 accent-primary-700"
                />
                <span className="text-xs font-medium text-primary-800">Site Head</span>
              </label>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 h-9 px-5 bg-primary-900 hover:bg-primary-800 text-white text-sm font-medium rounded-sm border border-primary-950 shadow-sm transition-colors disabled:opacity-60"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
