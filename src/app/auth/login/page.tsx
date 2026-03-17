"use client";

import { useState, FormEvent, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, AlertTriangle, Eye, EyeOff, ShieldCheck } from "lucide-react";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="w-full max-w-md animate-pulse h-96" />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const redirectTo = params.get("from") ?? "/";

  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw]     = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [warning, setWarning]   = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setWarning("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Login failed. Please try again.");
        return;
      }

      if (data.passwordWarning) {
        setWarning(data.passwordWarning);
        // Small delay to show the warning before redirect
        await new Promise((r) => setTimeout(r, 2000));
      }

      router.push(redirectTo);
      router.refresh();
    } catch {
      setError("Unable to connect to server. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md">
      {/* Card */}
      <div className="bg-surface border border-border rounded-sm shadow-lg overflow-hidden">

        {/* Header */}
        <div className="bg-primary-900 px-8 py-6 text-white">
          <div className="flex items-center gap-3 mb-1">
            <ShieldCheck className="w-7 h-7 text-accent-400" />
            <span className="text-xs font-bold tracking-widest uppercase text-primary-300">
              Crystal Group
            </span>
          </div>
          <h1 className="text-xl font-bold tracking-tight">Integrated Procurement System</h1>
          <p className="text-xs text-primary-300 mt-1">SOP-PROC-001 v1.1 — Authorised Access Only</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-8 py-6 space-y-5">
          {error && (
            <div className="flex items-start gap-2 text-sm text-danger bg-danger/10 border border-danger/30 rounded-sm px-3 py-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {warning && (
            <div className="flex items-start gap-2 text-sm text-warning bg-warning/10 border border-warning/30 rounded-sm px-3 py-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{warning}</span>
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

          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide">
                Password
              </label>
              <a
                href="/auth/forgot-password"
                className="text-xs text-primary-600 hover:text-primary-800 hover:underline"
              >
                Forgot password?
              </a>
            </div>
            <div className="relative">
              <input
                type={showPw ? "text" : "password"}
                autoComplete="current-password"
                required
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

          <button
            type="submit"
            disabled={loading}
            className="w-full h-10 bg-primary-900 hover:bg-primary-800 text-white text-sm font-semibold rounded-sm border border-primary-950 transition-colors shadow-sm flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Signing in…</> : "Sign In"}
          </button>
        </form>

        <div className="px-8 pb-5 text-center">
          <p className="text-[10px] text-text-secondary">
            Access is restricted to authorised Crystal Group personnel only.<br />
            Account issues? Contact your System Administrator.
          </p>
        </div>
      </div>

      <p className="text-center text-[10px] text-primary-400 mt-4">
        © Crystal Group · Procurement v2.0 · All rights reserved
      </p>
    </div>
  );
}
