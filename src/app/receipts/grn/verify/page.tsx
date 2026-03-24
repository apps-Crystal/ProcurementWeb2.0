"use client";

import { useEffect, useState } from "react";
import {
  ClipboardCheck,
  CheckCircle2,
  Flag,
  Loader2,
  PackageCheck,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  XCircle,
  FileText,
} from "lucide-react";
import { useCurrentUser } from "@/components/auth/AuthProvider";
import { fmtDate } from "@/lib/utils";
import { useUserNames, resolveUser } from "@/lib/useUserNames";

interface GRNLine {
  GRN_LINE_ID: string;
  PO_LINE_ID: string;
  LINE_NUMBER: string;
  ITEM_NAME: string;
  UNIT_OF_MEASURE: string;
  ORDERED_QTY: string;
  RECEIVED_QTY: string;
  DEFECTIVE_QTY: string;
  ACCEPTED_QTY: string;
  ITEM_CONDITION: string;
  QC_LINE_OUTCOME: string;
  REMARKS: string;
}

interface GRN {
  GRN_ID: string;
  GRN_DATE: string;
  PO_ID: string;
  VENDOR_ID: string;
  VENDOR_NAME: string;
  SITE: string;
  LR_CHALLAN_NUMBER: string;
  VEHICLE_NUMBER: string;
  TRANSPORTER_NAME: string;
  DELIVERY_DATE: string;
  VENDOR_INVOICE_NUMBER: string;
  VENDOR_INVOICE_DATE: string;
  QC_CONDUCTED: string;
  QC_OVERALL_OUTCOME: string;
  QC_INSPECTOR_NAME: string;
  DELIVERY_CHALLAN_URL: string;
  VENDOR_INVOICE_URL: string;
  MATERIAL_PHOTOS_URL: string;
  TOTAL_ORDERED_QTY: string;
  TOTAL_RECEIVED_QTY: string;
  TOTAL_ACCEPTED_QTY: string;
  TOTAL_DEFECTIVE_QTY: string;
  STATUS: string;
  RAISED_BY_USER_ID: string;
  RAISED_DATE: string;
}

export default function GRNVerifyPage() {
  const { user } = useCurrentUser();
  const [grns, setGrns]           = useState<GRN[]>([]);
  const userNames = useUserNames(grns.map((g) => g.RAISED_BY_USER_ID));
  const [loading, setLoading]     = useState(true);
  const [expanded, setExpanded]   = useState<string | null>(null);
  const [lines, setLines]         = useState<Record<string, GRNLine[]>>({});
  const [loadingLines, setLoadingLines] = useState<string | null>(null);
  const [actioning, setActioning] = useState<string | null>(null);
  const [remarks, setRemarks]     = useState<Record<string, string>>({});
  const [error, setError]         = useState<Record<string, string>>({});
  const [done, setDone]           = useState<Record<string, "APPROVED" | "FLAGGED">>({});

  useEffect(() => {
    fetch("/api/grn")
      .then((r) => r.json())
      .then((data) => {
        const pending = (data.grns ?? []).filter(
          (g: GRN) => g.STATUS === "PENDING"
        );
        setGrns(pending);
      })
      .catch(() => setGrns([]))
      .finally(() => setLoading(false));
  }, []);

  async function toggleExpand(grnId: string) {
    if (expanded === grnId) {
      setExpanded(null);
      return;
    }
    setExpanded(grnId);
    if (!lines[grnId]) {
      setLoadingLines(grnId);
      try {
        const res  = await fetch(`/api/grn/${grnId}/lines`);
        const data = await res.json();
        setLines((prev) => ({ ...prev, [grnId]: data.lines ?? [] }));
      } catch {
        setLines((prev) => ({ ...prev, [grnId]: [] }));
      } finally {
        setLoadingLines(null);
      }
    }
  }

  async function handleAction(grnId: string, action: "APPROVE" | "FLAG") {
    if (!user) return;

    const grn = grns.find((g) => g.GRN_ID === grnId);
    if (grn?.RAISED_BY_USER_ID === user.userId) {
      setError((p) => ({ ...p, [grnId]: "You cannot approve a GRN you submitted (SOP §15.1)." }));
      return;
    }
    if (action === "FLAG" && !remarks[grnId]?.trim()) {
      setError((p) => ({ ...p, [grnId]: "Remarks are required when flagging a GRN." }));
      return;
    }

    setActioning(grnId);
    setError((p) => ({ ...p, [grnId]: "" }));
    try {
      const res = await fetch(`/api/grn/${grnId}/verify`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, verified_by: user.userId, remarks: remarks[grnId] ?? "" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Action failed");
      setDone((p) => ({ ...p, [grnId]: action === "APPROVE" ? "APPROVED" : "FLAGGED" }));
      setGrns((prev) => prev.filter((g) => g.GRN_ID !== grnId));
    } catch (e) {
      setError((p) => ({ ...p, [grnId]: e instanceof Error ? e.message : "Action failed" }));
    } finally {
      setActioning(null);
    }
  }

  const qcColor = (outcome: string) => {
    if (outcome === "Pass") return "text-success bg-success/10 border-success/20";
    if (outcome === "Fail" || outcome === "Defective") return "text-danger bg-danger/10 border-danger/20";
    return "text-warning-800 bg-warning/10 border-warning/20";
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-bold text-primary-900 tracking-tight flex items-center gap-2">
            <ClipboardCheck className="w-6 h-6 text-primary-600" />
            GRN Site Head Verification
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Review and approve goods receipt notes before invoice matching (SOP §15.1).
          </p>
        </div>
        <div className="text-xs font-mono bg-primary-50 border border-primary-200 px-3 py-1.5 rounded-sm text-primary-700">
          {grns.length} pending
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-8 h-8 animate-spin text-primary-400" />
        </div>
      ) : grns.length === 0 ? (
        <div className="enterprise-card p-12 text-center">
          <CheckCircle2 className="w-12 h-12 text-success mx-auto mb-3" />
          <p className="text-primary-900 font-bold">No pending GRNs</p>
          <p className="text-sm text-text-secondary mt-1">All GRNs have been reviewed.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {grns.map((grn) => {
            const isExpanded  = expanded === grn.GRN_ID;
            const isDone      = done[grn.GRN_ID];
            const isActioning = actioning === grn.GRN_ID;
            const grnLines    = lines[grn.GRN_ID] ?? [];
            const isSelf      = grn.RAISED_BY_USER_ID === user?.userId;

            return (
              <div
                key={grn.GRN_ID}
                className={`enterprise-card overflow-hidden border-l-4 ${
                  isDone === "APPROVED" ? "border-l-success opacity-60" :
                  isDone === "FLAGGED"  ? "border-l-danger opacity-60" :
                  isSelf                ? "border-l-warning" :
                  "border-l-primary-300"
                }`}
              >
                {/* GRN Header Row */}
                <button
                  onClick={() => toggleExpand(grn.GRN_ID)}
                  className="w-full p-4 flex items-start justify-between gap-4 text-left hover:bg-primary-50/30 transition-colors"
                >
                  <div className="flex items-start gap-4 flex-1 min-w-0">
                    <PackageCheck className="w-5 h-5 text-primary-600 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-primary-700 text-sm">{grn.GRN_ID}</span>
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-sm border ${qcColor(grn.QC_OVERALL_OUTCOME)}`}>
                          QC: {grn.QC_OVERALL_OUTCOME || "—"}
                        </span>
                        <span className="text-[10px] text-text-secondary">
                          Submitted by: <strong>{resolveUser(userNames, grn.RAISED_BY_USER_ID)}</strong>
                        </span>
                        {isSelf && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-sm border bg-warning/10 text-warning-800 border-warning/30">
                            <AlertTriangle className="w-3 h-3" /> Cannot self-approve (SOP §15.1)
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-text-secondary mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
                        <span>PO: <span className="font-mono text-primary-700">{grn.PO_ID}</span></span>
                        <span>Vendor: <strong className="text-text-primary">{grn.VENDOR_NAME}</strong></span>
                        <span>Date: {fmtDate(grn.GRN_DATE)}</span>
                        <span>Challan: <span className="font-mono">{grn.LR_CHALLAN_NUMBER || "—"}</span></span>
                        <span>Received: <strong>{grn.TOTAL_RECEIVED_QTY}</strong> / Ordered: <strong>{grn.TOTAL_ORDERED_QTY}</strong></span>
                        {parseFloat(grn.TOTAL_DEFECTIVE_QTY) > 0 && (
                          <span className="text-danger font-bold">Defective: {grn.TOTAL_DEFECTIVE_QTY}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="shrink-0 text-text-secondary">
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>
                </button>

                {/* Expanded Detail */}
                {isExpanded && (
                  <div className="border-t border-border">
                    {/* Document Links */}
                    <div className="px-4 py-3 bg-primary-50/30 flex flex-wrap gap-2 border-b border-border">
                      {grn.DELIVERY_CHALLAN_URL && (
                        <a href={grn.DELIVERY_CHALLAN_URL} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[10px] font-bold text-primary-700 bg-white border border-primary-200 hover:bg-primary-50 px-2.5 py-1 rounded-sm transition-all">
                          <FileText className="w-3 h-3" /> Delivery Challan <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                      {grn.VENDOR_INVOICE_URL && (
                        <a href={grn.VENDOR_INVOICE_URL} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[10px] font-bold text-primary-700 bg-white border border-primary-200 hover:bg-primary-50 px-2.5 py-1 rounded-sm transition-all">
                          <FileText className="w-3 h-3" /> Vendor Invoice <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                      {grn.MATERIAL_PHOTOS_URL && (
                        <a href={grn.MATERIAL_PHOTOS_URL} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[10px] font-bold text-primary-700 bg-white border border-primary-200 hover:bg-primary-50 px-2.5 py-1 rounded-sm transition-all">
                          <FileText className="w-3 h-3" /> Material Photos <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                      <div className="ml-auto text-[10px] text-text-secondary">
                        Invoice No: <span className="font-mono">{grn.VENDOR_INVOICE_NUMBER || "—"}</span>
                        {grn.VENDOR_INVOICE_DATE && <> · Date: {fmtDate(grn.VENDOR_INVOICE_DATE)}</>}
                      </div>
                    </div>

                    {/* Line Items */}
                    <div className="overflow-x-auto">
                      {loadingLines === grn.GRN_ID ? (
                        <div className="flex justify-center py-8">
                          <Loader2 className="w-5 h-5 animate-spin text-primary-400" />
                        </div>
                      ) : (
                        <table className="w-full text-sm whitespace-nowrap">
                          <thead className="text-[10px] text-text-secondary bg-surface border-b border-border uppercase tracking-wider">
                            <tr>
                              <th className="px-4 py-2 font-semibold text-left">#</th>
                              <th className="px-4 py-2 font-semibold text-left">Item</th>
                              <th className="px-4 py-2 font-semibold text-right">UOM</th>
                              <th className="px-4 py-2 font-semibold text-right">Ordered</th>
                              <th className="px-4 py-2 font-semibold text-right bg-success/5">Received</th>
                              <th className="px-4 py-2 font-semibold text-right bg-danger/5">Defective</th>
                              <th className="px-4 py-2 font-semibold text-right">Accepted</th>
                              <th className="px-4 py-2 font-semibold text-center">QC</th>
                              <th className="px-4 py-2 font-semibold text-left">Remarks</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {grnLines.length === 0 ? (
                              <tr>
                                <td colSpan={9} className="px-4 py-6 text-center text-text-secondary text-xs">
                                  No line data available
                                </td>
                              </tr>
                            ) : grnLines.map((line) => (
                              <tr key={line.GRN_LINE_ID} className="hover:bg-primary-50/20">
                                <td className="px-4 py-2 text-xs text-text-secondary">{line.LINE_NUMBER}</td>
                                <td className="px-4 py-2 text-xs font-medium text-primary-900 whitespace-normal max-w-[300px]">{line.ITEM_NAME || "—"}</td>
                                <td className="px-4 py-2 text-xs text-right text-text-secondary">{line.UNIT_OF_MEASURE || "—"}</td>
                                <td className="px-4 py-2 text-xs text-right font-mono">{line.ORDERED_QTY}</td>
                                <td className="px-4 py-2 text-xs text-right font-mono font-bold text-success bg-success/5">{line.RECEIVED_QTY}</td>
                                <td className="px-4 py-2 text-xs text-right font-mono text-danger bg-danger/5">
                                  {parseFloat(line.DEFECTIVE_QTY) > 0 ? line.DEFECTIVE_QTY : "—"}
                                </td>
                                <td className="px-4 py-2 text-xs text-right font-mono font-bold">{line.ACCEPTED_QTY}</td>
                                <td className="px-4 py-2 text-center">
                                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-sm border ${qcColor(line.QC_LINE_OUTCOME)}`}>
                                    {line.QC_LINE_OUTCOME || "—"}
                                  </span>
                                </td>
                                <td className="px-4 py-2 text-xs text-text-secondary max-w-[160px] whitespace-normal">{line.REMARKS || "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>

                    {/* Action Panel */}
                    <div className="p-4 border-t border-border bg-surface">
                      {error[grn.GRN_ID] && (
                        <div className="flex items-center gap-2 mb-3 p-2.5 bg-danger/10 border border-danger/30 rounded-sm text-xs text-danger">
                          <XCircle className="w-4 h-4 shrink-0" /> {error[grn.GRN_ID]}
                        </div>
                      )}
                      <div className="flex flex-col sm:flex-row items-start sm:items-end gap-3">
                        <div className="flex-1">
                          <label className="block text-xs font-medium text-text-secondary mb-1">
                            Remarks <span className="text-danger">*</span> (required for Flag)
                          </label>
                          <input
                            type="text"
                            value={remarks[grn.GRN_ID] ?? ""}
                            onChange={(e) => setRemarks((p) => ({ ...p, [grn.GRN_ID]: e.target.value }))}
                            placeholder="Site Head remarks on this GRN…"
                            className="enterprise-input w-full"
                          />
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <button
                            onClick={() => handleAction(grn.GRN_ID, "FLAG")}
                            disabled={isActioning || isSelf}
                            className="inline-flex items-center gap-1.5 text-xs font-bold text-danger bg-danger/10 hover:bg-danger/20 border border-danger/30 px-3 py-2 rounded-sm transition-all disabled:opacity-40"
                          >
                            {isActioning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Flag className="w-3.5 h-3.5" />}
                            Flag GRN
                          </button>
                          <button
                            onClick={() => handleAction(grn.GRN_ID, "APPROVE")}
                            disabled={isActioning || isSelf}
                            className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-success hover:bg-success/90 px-4 py-2 rounded-sm shadow-sm transition-all disabled:opacity-40"
                          >
                            {isActioning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                            Approve GRN
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="bg-primary-50 border border-primary-200 text-primary-700 text-[11px] font-bold tracking-wide uppercase p-2 rounded-sm text-center">
        ⚑ Segregation Control: You cannot approve your own submission. — SOP §15.1
      </div>
    </div>
  );
}
