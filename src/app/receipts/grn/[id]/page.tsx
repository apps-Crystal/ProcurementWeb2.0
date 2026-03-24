"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  PackageCheck, ArrowLeft, Loader2, CheckCircle2, Clock,
  AlertTriangle, FileText, Package, ExternalLink, ChevronRight,
} from "lucide-react";
import { fmtDate } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface GRNLine {
  LINE_NUMBER:      string;
  ITEM_DESCRIPTION: string;
  ORDERED_QTY:      string;
  RECEIVED_QTY:     string;
  ACCEPTED_QTY:     string;
  DEFECT_QTY:       string;
  UNIT_OF_MEASURE:  string;
  REMARKS:          string;
}

interface GRNDetail {
  grn:      Record<string, string>;
  lines:    GRNLine[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  if (status === "GRN_VERIFIED")
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-success bg-success/10 border border-success/20 px-3 py-1 rounded-full uppercase tracking-wide">
        <CheckCircle2 className="w-3.5 h-3.5" /> Verified
      </span>
    );
  if (status === "FLAGGED")
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-danger bg-danger/10 border border-danger/20 px-3 py-1 rounded-full uppercase tracking-wide">
        <AlertTriangle className="w-3.5 h-3.5" /> Flagged
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-warning-800 bg-warning/10 border border-warning/20 px-3 py-1 rounded-full uppercase tracking-wide">
      <Clock className="w-3.5 h-3.5" /> Pending
    </span>
  );
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{value || "—"}</span>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function GRNDetailPage() {
  const { id }  = useParams<{ id: string }>();
  const router  = useRouter();
  const [data, setData]     = useState<GRNDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState("");

  useEffect(() => {
    if (!id) return;
    setLoading(true);

    // Fetch GRN header
    fetch(`/api/grn?grn_id=${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then(async (grnData) => {
        const grn = (grnData.grns ?? []).find(
          (g: Record<string, string>) => g.GRN_ID === id
        ) ?? null;

        if (!grn) {
          setError("GRN not found.");
          setLoading(false);
          return;
        }

        // Fetch GRN lines
        const linesRes = await fetch(`/api/grn/${encodeURIComponent(id)}/lines`).catch(() => null);
        let lines: GRNLine[] = [];
        if (linesRes?.ok) {
          const linesData = await linesRes.json();
          lines = (linesData.lines ?? []) as GRNLine[];
        }

        setData({ grn, lines });
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load GRN details.");
        setLoading(false);
      });
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <AlertTriangle className="w-12 h-12 text-danger mx-auto mb-4" />
        <p className="text-lg font-semibold text-foreground">{error || "GRN not found"}</p>
        <button
          onClick={() => router.back()}
          className="mt-6 inline-flex items-center gap-2 text-sm text-primary hover:underline"
        >
          <ArrowLeft className="w-4 h-4" /> Go back
        </button>
      </div>
    );
  }

  const { grn, lines } = data;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="p-2 rounded-lg hover:bg-muted transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <PackageCheck className="w-5 h-5 text-primary" />
              <h1 className="text-xl font-bold text-foreground">{grn.GRN_ID}</h1>
            </div>
            <StatusBadge status={grn.STATUS ?? "PENDING"} />
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Good Receipt Note &middot; {fmtDate(grn.GRN_DATE || grn.CREATED_AT)}
          </p>
        </div>
      </div>

      {/* Flagged alert */}
      {grn.STATUS === "FLAGGED" && (grn.FLAG_REASON || grn.VERIFICATION_REMARKS) && (
        <div className="flex items-start gap-3 bg-danger/5 border border-danger/20 rounded-lg px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-danger mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-danger">GRN Flagged</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              {grn.FLAG_REASON || grn.VERIFICATION_REMARKS}
            </p>
          </div>
        </div>
      )}

      {/* GRN Header Info */}
      <div className="bg-card border rounded-xl shadow-sm">
        <div className="px-5 py-4 border-b">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <FileText className="w-4 h-4 text-muted-foreground" /> GRN Details
          </h2>
        </div>
        <div className="px-5 py-5 grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-4">
          <InfoRow label="GRN ID"          value={grn.GRN_ID} />
          <InfoRow label="GRN Date"         value={fmtDate(grn.GRN_DATE || grn.CREATED_AT)} />
          <InfoRow label="Linked PO"        value={grn.PO_ID} />
          <InfoRow label="Vendor"           value={grn.VENDOR_NAME} />
          <InfoRow label="Site"             value={grn.SITE} />
          <InfoRow label="Challan Number"   value={grn.CHALLAN_NUMBER} />
          <InfoRow label="Challan Date"     value={fmtDate(grn.CHALLAN_DATE)} />
          <InfoRow label="Received By"      value={grn.RECEIVED_BY_NAME || grn.RECEIVED_BY} />
          <InfoRow label="Transport Mode"   value={grn.TRANSPORT_MODE} />
          <InfoRow label="Verified By"      value={grn.VERIFIED_BY} />
          <InfoRow label="Verification Date" value={fmtDate(grn.VERIFICATION_DATE)} />
          <InfoRow label="Status"           value={grn.STATUS} />
        </div>
        {grn.VERIFICATION_REMARKS && grn.STATUS !== "FLAGGED" && (
          <div className="px-5 pb-4">
            <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1">Remarks</p>
            <p className="text-sm text-foreground">{grn.VERIFICATION_REMARKS}</p>
          </div>
        )}
      </div>

      {/* Line Items */}
      <div className="bg-card border rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b flex items-center gap-2">
          <Package className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Line Items</h2>
          <span className="ml-auto text-xs text-muted-foreground">{lines.length} item{lines.length !== 1 ? "s" : ""}</span>
        </div>
        {lines.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">#</th>
                  <th className="text-left px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Description</th>
                  <th className="text-right px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Ordered</th>
                  <th className="text-right px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Received</th>
                  <th className="text-right px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Accepted</th>
                  <th className="text-right px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Defect</th>
                  <th className="text-left px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Unit</th>
                  <th className="text-left px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Remarks</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, idx) => (
                  <tr key={idx} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 text-muted-foreground">{line.LINE_NUMBER || idx + 1}</td>
                    <td className="px-4 py-3 font-medium">{line.ITEM_DESCRIPTION || "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{line.ORDERED_QTY || "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{line.RECEIVED_QTY || "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-success font-medium">{line.ACCEPTED_QTY || "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-danger font-medium">
                      {parseFloat(line.DEFECT_QTY || "0") > 0 ? line.DEFECT_QTY : "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{line.UNIT_OF_MEASURE || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{line.REMARKS || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-5 py-10 text-center text-muted-foreground text-sm">
            No line item data available for this GRN.
          </div>
        )}
      </div>

      {/* Linked Documents */}
      <div className="bg-card border rounded-xl shadow-sm">
        <div className="px-5 py-4 border-b">
          <h2 className="text-sm font-semibold text-foreground">Linked Documents</h2>
        </div>
        <div className="divide-y">
          {grn.PO_ID && (
            <button
              onClick={() => router.push(`/po/${grn.PO_ID}`)}
              className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-muted/30 transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <FileText className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Purchase Order</p>
                  <p className="text-xs text-muted-foreground">{grn.PO_ID}</p>
                </div>
              </div>
              <div className="flex items-center gap-1 text-xs text-primary">
                <ExternalLink className="w-3.5 h-3.5" />
                <ChevronRight className="w-4 h-4" />
              </div>
            </button>
          )}
          {grn.MATCH_ID && (
            <button
              onClick={() => router.push(`/match/${grn.MATCH_ID}`)}
              className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-muted/30 transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <PackageCheck className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Three-Way Match</p>
                  <p className="text-xs text-muted-foreground">{grn.MATCH_ID}</p>
                </div>
              </div>
              <div className="flex items-center gap-1 text-xs text-primary">
                <ExternalLink className="w-3.5 h-3.5" />
                <ChevronRight className="w-4 h-4" />
              </div>
            </button>
          )}
          {grn.INVOICE_ID && (
            <button
              onClick={() => router.push(`/invoices/${grn.INVOICE_ID}`)}
              className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-muted/30 transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <FileText className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Invoice</p>
                  <p className="text-xs text-muted-foreground">{grn.INVOICE_ID}</p>
                </div>
              </div>
              <div className="flex items-center gap-1 text-xs text-primary">
                <ExternalLink className="w-3.5 h-3.5" />
                <ChevronRight className="w-4 h-4" />
              </div>
            </button>
          )}
          {!grn.PO_ID && !grn.MATCH_ID && !grn.INVOICE_ID && (
            <p className="px-5 py-4 text-sm text-muted-foreground">No linked documents.</p>
          )}
        </div>
      </div>
    </div>
  );
}
