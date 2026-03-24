"use client";

import { useState, useRef } from "react";
import {
  FileText,
  UploadCloud,
  Cpu,
  CheckCircle2,
  AlertTriangle,
  Link as LinkIcon,
  Search,
  ArrowRight,
  XCircle
} from "lucide-react";
import type { ExtractedInvoice } from "@/lib/ai";

type UploadState = "idle" | "scanning" | "complete" | "error";

export default function InvoiceUpload() {
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [grnLinked, setGrnLinked] = useState(false);
  const [extracted, setExtracted] = useState<ExtractedInvoice | null>(null);
  const [invId, setInvId] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [grnSearch, setGrnSearch] = useState("");
  const [grnError, setGrnError] = useState("");
  const [grnValidating, setGrnValidating] = useState(false);
  const [processing, setProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Hardcoded for Phase 1 demo (replace with auth context later) ---
  const uploadedBy = "USR-001";
  const poId = "";   // will be linked via GRN

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setUploadState("scanning");
    setErrorMsg("");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("uploaded_by", uploadedBy);
    formData.append("po_id", poId);

    try {
      const res = await fetch("/api/invoices/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Upload failed");
      }

      setExtracted(data.extracted);
      setInvId(data.inv_id);
      setUploadState("complete");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Upload failed");
      setUploadState("error");
    }
  };

  // F-05: Server-validate GRN before linking
  const handleGrnLink = async () => {
    const grn = grnSearch.trim();
    if (!grn) return;
    setGrnValidating(true);
    setGrnError("");
    try {
      const res = await fetch(`/api/grn?grn_id=${encodeURIComponent(grn)}`);
      const data = await res.json();
      const found = (data.grns ?? []).find((g: Record<string, string>) => g.GRN_ID === grn);
      if (!found) { setGrnError(`GRN "${grn}" not found.`); return; }
      if (found.STATUS !== "GRN_VERIFIED") {
        setGrnError(`GRN status is "${found.STATUS}" — must be GRN_VERIFIED before linking.`);
        return;
      }
      setGrnLinked(true);
    } catch {
      setGrnError("Could not validate GRN. Please try again.");
    } finally {
      setGrnValidating(false);
    }
  };

  const handleProcessPayment = async () => {
    if (!invId || !grnLinked) return;
    setProcessing(true);
    // F-03: Pass grn_id to match page so server validates status via matchEngine
    window.location.href = `/invoices/match?inv_id=${invId}&grn_id=${encodeURIComponent(grnSearch.trim())}`;
  };

  const reset = () => {
    setUploadState("idle");
    setGrnLinked(false);
    setExtracted(null);
    setInvId(null);
    setFileName("");
    setErrorMsg("");
    setGrnSearch("");
    setGrnError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-20">

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-bold text-primary-900 tracking-tight flex items-center gap-2">
            <FileText className="w-6 h-6 text-primary-600" />
            AI Invoice Processing
          </h1>
          <p className="text-sm text-text-secondary mt-1">Upload vendor invoices for automatic data extraction and Three-Way Match validation.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleProcessPayment}
            disabled={uploadState !== "complete" || !grnLinked || processing}
            className="h-9 px-4 bg-primary-900 hover:bg-primary-800 text-white text-sm font-medium rounded-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm focus:ring-1 focus:ring-accent-500 flex items-center gap-2"
          >
            {processing ? "Processing..." : <><span>Process for Payment</span> <ArrowRight className="w-4 h-4" /></>}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">

        {/* Left Column - Upload & Preview */}
        <div className="flex flex-col space-y-6">
          <div className="enterprise-card p-4 flex flex-col items-center justify-center min-h-[400px] border-2 border-dashed border-primary-200 bg-surface">

            {uploadState === "idle" && (
              <div className="text-center space-y-4">
                <UploadCloud className="w-16 h-16 text-primary-300 mx-auto" />
                <div>
                  <h3 className="text-lg font-bold text-primary-900">Upload Vendor Invoice</h3>
                  <p className="text-sm text-text-secondary mt-1">Drag and drop PDF, JPG, or PNG up to 10MB.</p>
                </div>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-4 px-6 py-2 bg-primary-50 text-primary-700 font-bold text-sm border border-primary-200 rounded-sm hover:bg-primary-100 transition-colors"
                >
                  Browse Files
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>
            )}

            {uploadState === "scanning" && (
              <div className="text-center space-y-6">
                <div className="relative">
                  <div className="w-16 h-16 rounded-full border-4 border-primary-100 border-t-primary-600 animate-spin mx-auto"></div>
                  <Cpu className="w-6 h-6 text-primary-600 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-primary-900">AI Engine is Scanning...</h3>
                  <p className="text-sm text-text-secondary mt-1 animate-pulse">Extracting vendor details, amounts, and tax info.</p>
                </div>
              </div>
            )}

            {uploadState === "error" && (
              <div className="text-center space-y-4">
                <XCircle className="w-16 h-16 text-danger mx-auto" />
                <div>
                  <h3 className="text-lg font-bold text-danger">Extraction Failed</h3>
                  <p className="text-sm text-text-secondary mt-1">{errorMsg}</p>
                </div>
                <button onClick={reset} className="px-6 py-2 bg-primary-50 text-primary-700 font-bold text-sm border border-primary-200 rounded-sm hover:bg-primary-100">
                  Try Again
                </button>
              </div>
            )}

            {uploadState === "complete" && (
              <div className="w-full h-full flex flex-col">
                <div className="flex justify-between items-center mb-4 pb-4 border-b border-border">
                  <div className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-primary-600" />
                    <span className="font-bold text-primary-900 text-sm">{fileName}</span>
                  </div>
                  <button onClick={reset} className="text-xs text-danger font-medium hover:underline">
                    Remove & Upload New
                  </button>
                </div>
                <div className="flex-1 bg-primary-50/50 border border-border flex items-center justify-center rounded-sm text-text-secondary text-sm">
                  [ PDF Preview — {invId} ]
                </div>
              </div>
            )}

          </div>

          <div className="bg-primary-50 border border-primary-200 text-primary-700 text-xs p-3 rounded-sm flex items-start gap-2">
            <Cpu className="w-4 h-4 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              <strong>Crystal AI Vision:</strong> Automatically extracts data using Gemini and validates against invoice data. Follows SOP §9.1 requirements for digitising invoices.
            </p>
          </div>
        </div>

        {/* Right Column - Extraction & Matching */}
        <div className="space-y-6">

          <div className={`enterprise-card p-6 min-h-[200px] transition-all duration-500 ${uploadState === 'complete' ? 'opacity-100 translate-y-0' : 'opacity-50 blur-sm pointer-events-none translate-y-4'}`}>
            <div className="flex justify-between items-center border-b border-border pb-3 mb-4">
              <h2 className="text-sm font-bold text-primary-900 uppercase tracking-wide flex items-center gap-2">
                <SparklesIcon className="w-4 h-4 text-accent-500" /> Extracted Data
              </h2>
              {uploadState === "complete" && extracted && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-success bg-success/10 px-2 py-1 rounded-sm border border-success/20">
                  <CheckCircle2 className="w-3 h-3" /> {extracted.confidence_score}% Confidence
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-y-4 gap-x-6">
              <div>
                <label className="block text-[10px] font-bold text-text-secondary uppercase tracking-wider mb-1">Vendor Name</label>
                <input type="text" className="enterprise-input font-medium text-sm" value={extracted?.vendor_name ?? ""} readOnly />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-text-secondary uppercase tracking-wider mb-1">Invoice Number</label>
                <input type="text" className="enterprise-input font-mono text-sm" value={extracted?.invoice_number ?? ""} readOnly />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-text-secondary uppercase tracking-wider mb-1">Invoice Date</label>
                <input type="text" className="enterprise-input font-mono text-sm" value={extracted?.invoice_date ?? ""} readOnly />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-text-secondary uppercase tracking-wider mb-1">GSTIN</label>
                <input type="text" className="enterprise-input font-mono text-sm" value={extracted?.vendor_gstin ?? ""} readOnly />
              </div>
              <div className="col-span-2 grid grid-cols-3 gap-4 pt-2 border-t border-border mt-2">
                <div>
                  <label className="block text-[10px] font-bold text-text-secondary uppercase tracking-wider mb-1">Base Amount</label>
                  <input type="text" className="enterprise-input font-mono text-sm" value={extracted ? `₹${extracted.taxable_amount.toLocaleString("en-IN")}` : ""} readOnly />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-text-secondary uppercase tracking-wider mb-1">GST Amount</label>
                  <input type="text" className="enterprise-input font-mono text-sm" value={extracted ? `₹${extracted.total_gst.toLocaleString("en-IN")}` : ""} readOnly />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-primary-900 uppercase tracking-wider mb-1">Total Amount</label>
                  <input type="text" className="enterprise-input font-mono font-bold text-primary-900" value={extracted ? `₹${extracted.total_payable.toLocaleString("en-IN")}` : ""} readOnly />
                </div>
              </div>
            </div>
          </div>

          {/* Linking Section */}
          <div className={`enterprise-card p-6 transition-all duration-500 delay-100 ${uploadState === 'complete' ? 'opacity-100 translate-y-0' : 'opacity-50 blur-sm pointer-events-none translate-y-4'}`}>
            <h2 className="text-sm font-bold text-primary-900 uppercase tracking-wide border-b border-border pb-3 mb-4 flex items-center gap-2">
              <LinkIcon className="w-4 h-4 text-primary-600" /> Link Receipt (GRN/SRN)
            </h2>

            {!grnLinked ? (
              <div className="space-y-4">
                <p className="text-xs text-text-secondary">Link this invoice to its corresponding Goods/Service Receipt Note to perform the Three-Way Match.</p>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-text-secondary" />
                    <input
                      type="text"
                      value={grnSearch}
                      onChange={(e) => { setGrnSearch(e.target.value); setGrnError(""); }}
                      onKeyDown={(e) => e.key === "Enter" && handleGrnLink()}
                      className="enterprise-input pl-8"
                      placeholder="Enter GRN ID e.g. GRN-2603-0001"
                    />
                  </div>
                  <button
                    onClick={handleGrnLink}
                    disabled={!grnSearch.trim() || grnValidating}
                    className="px-4 py-2 bg-primary-900 text-white font-medium text-sm rounded-sm hover:bg-primary-800 transition-colors disabled:opacity-50"
                  >
                    {grnValidating ? "Checking…" : "Link GRN"}
                  </button>
                </div>
                {grnError && (
                  <div className="flex items-center gap-1.5 text-xs text-danger mt-1">
                    <XCircle className="w-3.5 h-3.5 shrink-0" /> {grnError}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-3 bg-success/10 border border-success/30 rounded-sm flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-success shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-bold text-success-800">Linked with {grnSearch}</h3>
                    <p className="text-xs text-success-900 mt-1">Three-Way Match will run on this GRN and invoice combination.</p>
                  </div>
                  <button onClick={() => setGrnLinked(false)} className="ml-auto text-xs text-text-secondary hover:text-danger hover:underline">
                    Unlink
                  </button>
                </div>

                <div className="space-y-2 mt-4">
                  <h4 className="text-[10px] font-bold text-text-secondary uppercase tracking-wider mb-2">Pre-Match Checks</h4>

                  <div className="flex items-center justify-between p-2 bg-surface border border-border rounded-sm">
                    <span className="text-xs font-medium text-text-primary">Invoice extracted successfully</span>
                    <CheckCircle2 className="w-4 h-4 text-success" />
                  </div>

                  <div className="flex items-center justify-between p-2 bg-surface border border-border rounded-sm">
                    <span className="text-xs font-medium text-text-primary">GRN reference linked</span>
                    <CheckCircle2 className="w-4 h-4 text-success" />
                  </div>

                  {extracted && extracted.confidence_score < 70 && (
                    <div className="flex items-center justify-between p-2 bg-warning/10 border border-warning/30 rounded-sm">
                      <span className="text-xs font-medium text-warning-900">Low AI confidence — manual review required</span>
                      <AlertTriangle className="w-4 h-4 text-warning" />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

        </div>

      </div>
    </div>
  );
}

function SparklesIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
    </svg>
  );
}
