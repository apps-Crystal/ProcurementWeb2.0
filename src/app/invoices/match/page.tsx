"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Receipt,
  FileCheck,
  FileText,
  AlertOctagon,
  CheckCircle2,
  AlertTriangle,
  FileMinus,
  Maximize2,
  Loader2,
  Package
} from "lucide-react";

interface MatchData {
  match: Record<string, string>;
  lines: Record<string, string>[];
}

export default function ThreeWayMatchWrapper() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-96"><Loader2 className="w-8 h-8 animate-spin text-primary-600" /></div>}>
      <ThreeWayMatch />
    </Suspense>
  );
}

function ThreeWayMatch() {
  const searchParams = useSearchParams();
  const matchId = searchParams.get("match_id");
  const invId = searchParams.get("inv_id");

  const [matchData, setMatchData] = useState<MatchData | null>(null);
  const [loading, setLoading] = useState(false);
  const [resolution, setResolution] = useState("");
  const [remarks, setRemarks] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!matchId) return;
    setLoading(true);
    fetch(`/api/match?match_id=${matchId}`)
      .then((r) => r.json())
      .then((d) => setMatchData(d))
      .finally(() => setLoading(false));
  }, [matchId]);

  const handleResolve = async () => {
    if (!resolution || !matchId) return;
    setSubmitting(true);
    await fetch(`/api/match`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ match_id: matchId, resolution_type: resolution, remarks }),
    });
    setSubmitting(false);
    alert("Resolution recorded. Payment queue updated.");
  };

  const matchStatus = matchData?.match?.MATCH_STATUS ?? "PRICE_VARIANCE";
  const isVariance = matchStatus !== "MATCHED";

  // Display IDs — use real data if loaded, fall back to demo labels
  const displayMatchId = matchId ?? matchData?.match?.MATCH_ID ?? "MCH-2503-088";
  const displayPoId = matchData?.match?.PO_ID ?? "PO-2502-044";
  const displayGrnId = matchData?.match?.GRN_ID ?? "GRN-2503-010";
  const displayInvId = invId ?? matchData?.match?.INV_ID ?? "INV-0992";

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
        <span className="ml-3 text-text-secondary">Loading match data...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-full mx-auto pb-10">

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-bold text-primary-900 tracking-tight flex items-center gap-2">
            <AlertOctagon className="w-6 h-6 text-warning" />
            Three-Way Match Verification
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Match ID: {displayMatchId} | Status: {isVariance ? "Pending Resolution" : "Matched"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isVariance && (
            <div className="px-3 py-1.5 bg-danger/10 border border-danger/30 text-danger text-xs font-bold rounded-sm flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" />
              {matchStatus === "PRICE_VARIANCE" && "Price Variance Detected"}
              {matchStatus === "QUANTITY_VARIANCE" && "Quantity Variance Detected"}
              {matchStatus === "FRAUD_RISK" && "Fraud Risk — Low AI Confidence"}
              {matchStatus === "NO_GRN" && "No GRN on File"}
            </div>
          )}
          <button className="h-9 px-4 bg-surface hover:bg-primary-50 text-primary-700 text-sm font-medium rounded-sm border border-primary-200 transition-colors shadow-sm focus:ring-1 focus:ring-primary-500">
            Escalate
          </button>
          <button
            onClick={handleResolve}
            disabled={!resolution || submitting}
            className="h-9 px-4 bg-primary-900 hover:bg-primary-800 text-white text-sm font-medium rounded-sm border border-primary-950 transition-colors shadow-sm focus:ring-1 focus:ring-accent-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Saving..." : "Resolve Match"}
          </button>
        </div>
      </div>

      {/* 3-Column Split View */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-[calc(100vh-200px)] min-h-[600px]">

        {/* Column 1: Purchase Order */}
        <div className="enterprise-card flex flex-col overflow-hidden">
          <div className="p-3 bg-primary-900 text-white border-b border-primary-950 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-accent-400" />
              <span className="text-sm font-bold tracking-wide">{displayPoId}</span>
            </div>
            <span className="text-[10px] font-mono bg-primary-800 px-1.5 py-0.5 rounded-sm">TechFlow Systems</span>
          </div>
          <div className="p-4 bg-surface flex-1 overflow-y-auto custom-scrollbar">
            <div className="grid grid-cols-2 gap-4 text-xs mb-6 pb-4 border-b border-border">
              <div>
                <span className="block text-text-secondary mb-1">Date</span>
                <span className="font-medium text-text-primary">15-Feb-2026</span>
              </div>
              <div>
                <span className="block text-text-secondary mb-1">Terms</span>
                <span className="font-medium text-text-primary">30 Days</span>
              </div>
              <div>
                <span className="block text-text-secondary mb-1">Total Value</span>
                <span className="font-mono font-bold text-primary-900">₹1,18,000.00</span>
              </div>
            </div>
            <div className="space-y-4">
              <div className="p-3 border border-border bg-primary-50/30 rounded-sm">
                <div className="text-xs font-bold text-primary-900 mb-2">1. Developer Laptops (i7, 32GB)</div>
                <div className="flex justify-between text-xs text-text-secondary mb-1">
                  <span>Qty Ordered:</span> <span className="font-mono text-text-primary font-medium">10 Nos</span>
                </div>
                <div className="flex justify-between text-xs text-text-secondary mb-1">
                  <span>Unit Price:</span> <span className="font-mono text-text-primary font-medium">₹1,00,000</span>
                </div>
                <div className="flex justify-between text-xs text-primary-900 font-bold border-t border-border mt-2 pt-2">
                  <span>Line Total:</span> <span className="font-mono">₹10,00,000</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Column 2: GRN */}
        <div className="enterprise-card flex flex-col overflow-hidden">
          <div className="p-3 bg-primary-800 text-white border-b border-primary-900 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-success" />
              <span className="text-sm font-bold tracking-wide">{displayGrnId}</span>
            </div>
            <span className="text-[10px] font-mono bg-primary-700 px-1.5 py-0.5 rounded-sm">HO Site WH</span>
          </div>
          <div className="p-4 bg-surface flex-1 overflow-y-auto custom-scrollbar">
            <div className="grid grid-cols-2 gap-4 text-xs mb-6 pb-4 border-b border-border">
              <div>
                <span className="block text-text-secondary mb-1">Date Received</span>
                <span className="font-medium text-text-primary">01-Mar-2026</span>
              </div>
              <div>
                <span className="block text-text-secondary mb-1">Challan</span>
                <span className="font-medium text-text-primary font-mono">DC-8849</span>
              </div>
              <div>
                <span className="block text-text-secondary mb-1">Verified By</span>
                <span className="font-medium text-primary-900">R. Sharma</span>
              </div>
            </div>
            <div className="space-y-4">
              <div className="p-3 border border-success/30 bg-success/5 rounded-sm relative">
                <CheckCircle2 className="w-4 h-4 text-success absolute top-3 right-3" />
                <div className="text-xs font-bold text-primary-900 mb-2 pr-6">1. Developer Laptops (i7, 32GB)</div>
                <div className="flex justify-between text-xs text-text-secondary mb-1">
                  <span>Qty Received:</span> <span className="font-mono text-text-primary font-medium">10 Nos</span>
                </div>
                <div className="flex justify-between text-xs text-text-secondary mb-1">
                  <span>Qty Accepted:</span> <span className="font-mono text-success font-bold">10 Nos</span>
                </div>
                <div className="flex justify-between text-xs text-text-secondary mb-1">
                  <span>Condition:</span> <span className="text-text-primary font-medium">Good</span>
                </div>
                <div className="mt-2 pt-2 border-t border-success/20">
                  <button className="text-[10px] text-primary-600 font-bold uppercase tracking-wider flex items-center gap-1 hover:text-primary-800">
                    <FileCheck className="w-3 h-3" /> View Inspection Docs
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Column 3: Vendor Invoice (AI Extracted) */}
        <div className={`enterprise-card flex flex-col overflow-hidden ${isVariance ? "border-2 border-warning/50" : "border-2 border-success/40"}`}>
          <div className="p-3 bg-surface border-b border-border flex justify-between items-center relative overflow-hidden">
            <div className={`absolute inset-0 pointer-events-none ${isVariance ? "bg-warning/10" : "bg-success/5"}`}></div>
            <div className="flex items-center gap-2 relative z-10">
              <Receipt className={`w-4 h-4 ${isVariance ? "text-warning" : "text-success"}`} />
              <span className="text-sm font-bold text-primary-900 tracking-wide">{displayInvId}</span>
            </div>
            <div className="flex gap-2 relative z-10">
              <span className="text-[10px] font-bold bg-success/10 text-success px-1.5 py-0.5 rounded-sm border border-success/20">
                AI {matchData?.match?.AI_CONFIDENCE_SCORE ?? "98"}%
              </span>
              <button className="text-primary-600 hover:bg-primary-50 p-1 rounded-sm">
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <div className="p-4 bg-surface flex-1 overflow-y-auto custom-scrollbar relative">
            <div className="grid grid-cols-2 gap-4 text-xs mb-6 pb-4 border-b border-border">
              <div>
                <span className="block text-text-secondary mb-1">Invoice Date</span>
                <span className="font-medium text-text-primary">28-Feb-2026</span>
              </div>
              <div>
                <span className="block text-text-secondary mb-1">Due Date</span>
                <span className="font-medium text-warning font-bold">30-Mar-2026</span>
              </div>
              <div>
                <span className="block text-text-secondary mb-1">Total Billed</span>
                <span className={`font-mono font-bold text-sm ${isVariance ? "text-danger" : "text-success"}`}>₹1,39,240.00</span>
              </div>
            </div>

            <div className="space-y-4">
              <div className={`p-3 rounded-sm relative shadow-sm ${isVariance ? "border-2 border-warning/50 bg-surface" : "border border-success/30 bg-success/5"}`}>
                {isVariance
                  ? <AlertTriangle className="w-4 h-4 text-warning absolute top-3 right-3" />
                  : <CheckCircle2 className="w-4 h-4 text-success absolute top-3 right-3" />
                }
                <div className="text-xs font-bold text-primary-900 mb-2">1. Dev Laptops 32GB</div>
                <div className="flex justify-between text-xs text-text-secondary mb-1">
                  <span>Qty Billed:</span>
                  <span className="font-mono text-text-primary font-medium">10 Nos <span className="text-success text-[10px] ml-1">(GRN Match)</span></span>
                </div>

                {isVariance && (
                  <>
                    <div className="flex justify-between items-center text-xs mt-2 p-1.5 bg-danger/5 border border-danger/20 rounded-sm">
                      <span className="text-danger font-bold flex items-center gap-1">
                        <FileMinus className="w-3 h-3" /> Unit Rate:
                      </span>
                      <div className="text-right">
                        <span className="font-mono text-danger font-bold line-through text-[10px] mr-1">₹1,00,000</span>
                        <span className="font-mono text-danger font-bold text-sm">₹1,18,000</span>
                      </div>
                    </div>
                    <div className="text-[9px] text-danger text-right mt-0.5 font-medium">
                      +{matchData?.lines?.[0]?.PRICE_VARIANCE_PCT ?? "18"}% Above PO Rate
                    </div>
                  </>
                )}

                <div className="flex justify-between text-xs text-primary-900 font-bold border-t border-border mt-3 pt-2">
                  <span>Line Total:</span> <span className="font-mono">₹11,80,000</span>
                </div>
              </div>
            </div>

            {/* Resolution Panel */}
            <div className="mt-8 p-3 bg-primary-50/50 border border-primary-100 rounded-sm">
              <h3 className="text-xs font-bold text-primary-900 mb-2 uppercase tracking-wide">Resolution Options</h3>
              <div className="space-y-2">
                <label className="flex items-start gap-2 cursor-pointer p-2 rounded-sm hover:bg-surface border border-transparent hover:border-primary-200 transition-colors">
                  <input
                    type="radio"
                    name="resolution"
                    value="DEBIT_NOTE"
                    className="mt-0.5 accent-primary-600"
                    onChange={(e) => setResolution(e.target.value)}
                  />
                  <div className="text-xs">
                    <span className="font-bold text-primary-900 block">Create Debit Note</span>
                    <span className="text-text-secondary">Process payment for original PO value; recover variance.</span>
                  </div>
                </label>
                <label className="flex items-start gap-2 cursor-pointer p-2 rounded-sm hover:bg-surface border border-transparent hover:border-primary-200 transition-colors">
                  <input
                    type="radio"
                    name="resolution"
                    value="ACCEPT_VARIANCE"
                    className="mt-0.5 accent-primary-600"
                    onChange={(e) => setResolution(e.target.value)}
                  />
                  <div className="text-xs">
                    <span className="font-bold text-primary-900 block">Accept Variance</span>
                    <span className="text-text-secondary">Approve higher rate. Requires Management override.</span>
                  </div>
                </label>
                <label className="flex items-start gap-2 cursor-pointer p-2 rounded-sm hover:bg-surface border border-transparent hover:border-primary-200 transition-colors">
                  <input
                    type="radio"
                    name="resolution"
                    value="BLOCK_INVOICE"
                    className="mt-0.5 accent-primary-600"
                    onChange={(e) => setResolution(e.target.value)}
                  />
                  <div className="text-xs">
                    <span className="font-bold text-danger block">Block &amp; Return to Vendor</span>
                    <span className="text-text-secondary">Reject invoice due to severe pricing error.</span>
                  </div>
                </label>

                <textarea
                  className="mt-3 enterprise-input h-16 resize-none w-full"
                  placeholder="Enter resolution remarks..."
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                />
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
