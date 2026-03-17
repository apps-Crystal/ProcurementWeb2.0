"use client";

import { useState, FormEvent } from "react";
import { Loader2, AlertTriangle, ArrowLeft, MailCheck, ShieldCheck } from "lucide-react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail]     = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent]       = useState(false);
  const [devLink, setDevLink] = useState("");
  const [error, setError]     = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();
      setSent(true);
      if (data.dev_reset_link) setDevLink(data.dev_reset_link);
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
          <h1 className="text-xl font-bold tracking-tight">Password Recovery</h1>
          <p className="text-xs text-primary-300 mt-1">We will send a secure reset link to your work email.</p>
        </div>

        <div className="px-8 py-6">
          {sent ? (
            <div className="space-y-4 text-center">
              <MailCheck className="w-12 h-12 text-success mx-auto" />
              <div>
                <p className="text-sm font-semibold text-text-primary">Reset link sent</p>
                <p className="text-xs text-text-secondary mt-1">
                  If <span className="font-mono text-primary-700">{email}</span> exists in our system,
                  a reset link valid for <strong>1 hour</strong> has been dispatched.
                </p>
              </div>

              {/* Dev mode: show link directly */}
              {devLink && (
                <div className="bg-warning/10 border border-warning/30 rounded-sm p-3 text-left">
                  <p className="text-[10px] font-bold text-warning uppercase tracking-wide mb-1">
                    Development mode — reset link:
                  </p>
                  <a
                    href={devLink}
                    className="text-xs font-mono text-primary-700 break-all hover:underline"
                  >
                    {devLink}
                  </a>
                </div>
              )}

              <Link
                href="/auth/login"
                className="inline-flex items-center gap-1 text-xs text-primary-600 hover:underline"
              >
                <ArrowLeft className="w-3 h-3" /> Back to Sign In
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
                  Work Email
                </label>
                <input
                  type="email"
                  autoComplete="email"
                  required
                  className="enterprise-input"
                  placeholder="you@crystalgroup.in"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full h-10 bg-primary-900 hover:bg-primary-800 text-white text-sm font-semibold rounded-sm border border-primary-950 transition-colors shadow-sm flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</> : "Send Reset Link"}
              </button>

              <Link
                href="/auth/login"
                className="flex items-center justify-center gap-1 text-xs text-text-secondary hover:text-text-primary transition-colors"
              >
                <ArrowLeft className="w-3 h-3" /> Back to Sign In
              </Link>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
