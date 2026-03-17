"use client";

export const dynamic = "force-dynamic";

import { useState, FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, AlertTriangle, Eye, EyeOff, CheckCircle2, ShieldCheck, X, Check } from "lucide-react";
import Link from "next/link";

function PasswordRule({ met, label }: { met: boolean; label: string }) {
  return (
    <li className={`flex items-center gap-1.5 text-[11px] ${met ? "text-success" : "text-text-secondary"}`}>
      {met ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
      {label}
    </li>
  );
}

export default function ResetPasswordPage() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  const [password, setPassword]   = useState("");
  const [confirm, setConfirm]     = useState("");
  const [showPw, setShowPw]       = useState(false);
  const [loading, setLoading]     = useState(false);
  const [success, setSuccess]     = useState(false);
  const [error, setError]         = useState("");

  const rules = {
    length:    password.length >= 8,
    upper:     /[A-Z]/.test(password),
    digit:     /[0-9]/.test(password),
    match:     password === confirm && password.length > 0,
  };
  const allRulesMet = Object.values(rules).every(Boolean);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (!token) {
      setError("Missing reset token. Please use the link from your email.");
      return;
    }
    if (!allRulesMet) {
      setError("Please satisfy all password requirements.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Reset failed."); return; }

      setSuccess(true);
    } catch {
      setError("Unable to connect. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md">
      <div className="bg-surface border border-border rounded-sm shadow-lg overflow-hidden">

        <div className="bg-primary-900 px-8 py-6 text-white">
          <div className="flex items-center gap-3 mb-1">
            <ShieldCheck className="w-7 h-7 text-accent-400" />
            <span className="text-xs font-bold tracking-widest uppercase text-primary-300">Crystal Group</span>
          </div>
          <h1 className="text-xl font-bold tracking-tight">Set New Password</h1>
          <p className="text-xs text-primary-300 mt-1">Choose a strong password for your account.</p>
        </div>

        <div className="px-8 py-6">
          {!token ? (
            <div className="text-center space-y-3">
              <AlertTriangle className="w-10 h-10 text-danger mx-auto" />
              <p className="text-sm text-danger">Invalid reset link. Please request a new one.</p>
              <Link href="/auth/forgot-password" className="text-xs text-primary-600 hover:underline">
                Request new link
              </Link>
            </div>
          ) : success ? (
            <div className="text-center space-y-4">
              <CheckCircle2 className="w-12 h-12 text-success mx-auto" />
              <div>
                <p className="text-sm font-semibold text-text-primary">Password updated successfully</p>
                <p className="text-xs text-text-secondary mt-1">You can now sign in with your new password.</p>
              </div>
              <Link
                href="/auth/login"
                className="inline-flex items-center justify-center w-full h-10 bg-primary-900 hover:bg-primary-800 text-white text-sm font-semibold rounded-sm transition-colors"
              >
                Sign In
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="flex items-start gap-2 text-sm text-danger bg-danger/10 border border-danger/30 rounded-sm px-3 py-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1.5 uppercase tracking-wide">
                  New Password
                </label>
                <div className="relative">
                  <input
                    type={showPw ? "text" : "password"}
                    className="enterprise-input pr-10"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(!showPw)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary p-1"
                    tabIndex={-1}
                  >
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1.5 uppercase tracking-wide">
                  Confirm Password
                </label>
                <input
                  type={showPw ? "text" : "password"}
                  className={`enterprise-input ${confirm && !rules.match ? "border-danger focus:ring-danger" : ""}`}
                  placeholder="••••••••"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  disabled={loading}
                />
              </div>

              {/* Password rules checklist */}
              <ul className="bg-primary-50/50 border border-border rounded-sm px-3 py-2 space-y-1">
                <PasswordRule met={rules.length} label="At least 8 characters" />
                <PasswordRule met={rules.upper}  label="At least 1 uppercase letter" />
                <PasswordRule met={rules.digit}  label="At least 1 number" />
                <PasswordRule met={rules.match}  label="Passwords match" />
              </ul>

              <button
                type="submit"
                disabled={loading || !allRulesMet}
                className="w-full h-10 bg-primary-900 hover:bg-primary-800 text-white text-sm font-semibold rounded-sm border border-primary-950 transition-colors shadow-sm flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Updating…</> : "Update Password"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
