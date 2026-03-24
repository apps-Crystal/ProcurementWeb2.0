"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  PackageCheck,
  Search,
  UploadCloud,
  Send,
  AlertTriangle,
  FileCheck,
  Truck,
  ClipboardCheck,
  Loader2,
  CheckCircle2,
  XCircle,
  Camera,
} from "lucide-react";
import { useCurrentUser } from "@/components/auth/AuthProvider";
import { fmtDate } from "@/lib/utils";

interface POLine {
  PO_LINE_ID: string;
  ITEM_NAME: string;
  ITEM_DESCRIPTION: string;
  UNIT_OF_MEASURE: string;
  ORDERED_QTY: string;
  QTY_OUTSTANDING?: string;
  RATE: string;
}

interface POData {
  PO_ID: string;
  VENDOR_NAME: string;
  PO_DATE: string;
  GRAND_TOTAL: string;
  DELIVERY_DATE: string;
  STATUS: string;
}

interface LineInspection {
  po_line_ref: string;
  item_description: string;
  unit_of_measure: string;
  qty_ordered: number;
  qty_outstanding: number;
  qty_received: number;
  qty_defective: number;
  qty_accepted: number;
  qc_outcome: string;
  remarks: string;
}

interface POSearchResult {
  PO_ID: string;
  VENDOR_NAME: string;
  PO_DATE: string;
  GRAND_TOTAL: string;
  DELIVERY_DATE: string;
  STATUS: string;
}

const VALID_PO_STATUSES = ["ISSUED", "OPEN", "PARTIALLY_RECEIVED", "ACKNOWLEDGED", "ACCEPTED"];

export default function NewGRNWrapper() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-primary-400" /></div>}>
      <NewGRN />
    </Suspense>
  );
}

function NewGRN() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useCurrentUser();

  const [poInput, setPoInput] = useState(searchParams.get("po") ?? "");
  const [fetching, setFetching] = useState(false);
  const [poData, setPoData] = useState<POData | null>(null);
  const [lines, setLines] = useState<LineInspection[]>([]);
  const [poError, setPoError] = useState("");

  // Delivery details
  const [challanNumber, setChallanNumber] = useState("");
  const [grnDate, setGrnDate] = useState(new Date().toISOString().slice(0, 10));
  const [transporter, setTransporter] = useState("");
  const [lrNumber, setLrNumber] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");

  // Files
  const challanRef = useRef<HTMLInputElement>(null);
  const invoiceRef = useRef<HTMLInputElement>(null);
  const photosRef  = useRef<HTMLInputElement>(null);
  const [challanFile, setChallanFile] = useState<File | null>(null);
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [photosFile,  setPhotosFile]  = useState<File | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");

  // PO live-search dropdown
  const [searchResults, setSearchResults]   = useState<POSearchResult[]>([]);
  const [searching, setSearching]           = useState(false);
  const [showDropdown, setShowDropdown]     = useState(false);
  const searchDebounceRef                   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchContainerRef                  = useRef<HTMLDivElement>(null);

  const today = new Date().toISOString().slice(0, 10);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Auto-fetch if po= query param is set
  useEffect(() => {
    if (poInput) fetchPO();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSearchInput(value: string) {
    setPoInput(value);
    setPoData(null);
    setLines([]);
    setPoError("");

    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);

    if (value.trim().length < 2) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }

    searchDebounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res  = await fetch(`/api/po?for_grn=1&q=${encodeURIComponent(value.trim())}`);
        const data = await res.json();
        setSearchResults((data.pos ?? []).slice(0, 10));
        setShowDropdown(true);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  }

  function selectSearchResult(po: POSearchResult) {
    setPoInput(po.PO_ID);
    setSearchResults([]);
    setShowDropdown(false);
    fetchPO(po.PO_ID);
  }

  async function fetchPO(id?: string) {
    const poId = (id ?? poInput).trim();
    if (!poId) return;
    setFetching(true);
    setPoError("");
    setPoData(null);
    setLines([]);
    try {
      const res = await fetch(`/api/po/${poId}`);
      if (!res.ok) {
        setPoError("PO not found or not accessible.");
        return;
      }
      const data = await res.json();
      const po: POData = data.po;

      // Validate PO status before allowing GRN
      if (!VALID_PO_STATUSES.includes(po.STATUS)) {
        setPoError(`This PO cannot receive a GRN (status: ${po.STATUS}). PO must be ISSUED, ACKNOWLEDGED, ACCEPTED, or OPEN.`);
        return;
      }

      setPoData(po);
      setLines(
        (data.lines as POLine[]).map((l) => {
          const orderedQty     = parseFloat(l.ORDERED_QTY ?? "0") || 0;
          const rawOutstanding = parseFloat(l.QTY_OUTSTANDING ?? "");
          // Fall back to full ordered qty if QTY_OUTSTANDING has never been set (blank)
          const outstandingQty = isNaN(rawOutstanding) ? orderedQty : Math.max(0, rawOutstanding);
          return {
            po_line_ref:      l.PO_LINE_ID,
            item_description: l.ITEM_DESCRIPTION || l.ITEM_NAME || "—",
            unit_of_measure:  l.UNIT_OF_MEASURE || "",
            qty_ordered:      orderedQty,
            qty_outstanding:  outstandingQty,
            qty_received:     outstandingQty,
            qty_defective:    0,
            qty_accepted:     outstandingQty,
            qc_outcome:       "Pass",
            remarks:          "",
          };
        })
      );
    } catch {
      setPoError("Failed to fetch PO details.");
    } finally {
      setFetching(false);
    }
  }

  function updateLine(index: number, field: keyof LineInspection, value: number | string) {
    setLines((prev) => {
      const updated = [...prev];
      (updated[index] as unknown as Record<string, unknown>)[field] = value;
      // Clamp received qty to outstanding (cannot receive more than what's left)
      if (field === "qty_received") {
        updated[index].qty_received = Math.max(
          0,
          Math.min(updated[index].qty_received, updated[index].qty_outstanding)
        );
      }
      // Clamp defective to received
      if (field === "qty_defective") {
        updated[index].qty_defective = Math.max(
          0,
          Math.min(updated[index].qty_defective, updated[index].qty_received)
        );
      }
      // Auto-compute accepted = received - defective
      if (field === "qty_received" || field === "qty_defective") {
        updated[index].qty_accepted = Math.max(
          0,
          updated[index].qty_received - updated[index].qty_defective
        );
      }
      // Auto-correct QC outcome when defective qty > 0
      if (field === "qty_defective" && updated[index].qty_defective > 0 && updated[index].qc_outcome === "Pass") {
        updated[index].qc_outcome = "Defective";
      }
      return updated;
    });
  }

  const shortReceiptCount = lines.filter(
    (l) => l.qty_outstanding > 0 && l.qty_received < l.qty_outstanding
  ).length;

  // Lines where defective > 0 but outcome is still Pass (warn the user)
  const qcMismatchCount = lines.filter(
    (l) => l.qty_defective > 0 && l.qc_outcome === "Pass"
  ).length;

  // Active lines (have some qty to receive or received)
  const activeLineCount = lines.filter((l) => l.qty_outstanding > 0).length;

  function validate(): string | null {
    if (!challanFile) return "Please upload the delivery challan.";
    if (!invoiceFile) return "Please upload the vendor invoice.";
    if (!challanNumber.trim()) return "Challan / LR number is required.";
    if (!invoiceNumber.trim()) return "Vendor invoice number is required.";
    if (!invoiceDate) return "Vendor invoice date is required.";
    if (grnDate > today) return "GRN date cannot be in the future.";
    if (poData?.PO_DATE && grnDate < poData.PO_DATE.slice(0, 10))
      return `GRN date cannot be before the PO issue date (${fmtDate(poData.PO_DATE)}).`;
    if (invoiceDate > grnDate)
      return "Vendor invoice date cannot be after the GRN date.";
    const anyReceived = lines.some((l) => l.qty_received > 0);
    if (!anyReceived) return "At least one line must have a received quantity greater than zero.";
    if (qcMismatchCount > 0)
      return `${qcMismatchCount} line(s) have defective qty > 0 but QC outcome is still "Pass". Please correct the QC outcome.`;
    return null;
  }

  async function handleSubmit() {
    if (!poData || !user) return;

    const validationError = validate();
    if (validationError) { setSubmitError(validationError); return; }

    setSubmitting(true);
    setSubmitError("");

    try {
      // Only send lines that have outstanding qty — skip fully-received lines
      const linesToSend = lines.filter((l) => l.qty_outstanding > 0);

      const payload = {
        po_id:            poData.PO_ID,
        site:             user.site,
        received_by:      user.userId,
        received_by_name: user.name,
        grn_date:         grnDate,
        lr_number:        lrNumber,
        challan_number:   challanNumber,
        vehicle_number:   vehicleNumber,
        transporter_name: transporter,
        invoice_number:   invoiceNumber,
        invoice_date:     invoiceDate,
        lines:            linesToSend,
      };

      const fd = new FormData();
      fd.append("data", JSON.stringify(payload));
      fd.append("delivery_challan", challanFile!);
      fd.append("vendor_invoice", invoiceFile!);
      if (photosFile) fd.append("material_photos", photosFile);

      const res = await fetch("/api/grn", { method: "POST", body: fd });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? "Failed to submit GRN");

      setSubmitSuccess(result.grn_id);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitSuccess) {
    return (
      <div className="max-w-lg mx-auto mt-20 enterprise-card p-8 text-center space-y-4">
        <CheckCircle2 className="w-12 h-12 text-success mx-auto" />
        <h2 className="text-xl font-bold text-primary-900">GRN Submitted</h2>
        <p className="text-sm text-text-secondary">
          GRN <span className="font-mono font-bold text-primary-700">{submitSuccess}</span> has been created and is pending Site Head verification.
        </p>
        <div className="flex gap-3 justify-center pt-2">
          <button onClick={() => router.push("/po/open")}
            className="h-9 px-4 bg-primary-900 text-white text-sm font-medium rounded-sm border border-primary-950 transition-colors">
            Back to Open POs
          </button>
          <button onClick={() => {
              setSubmitSuccess("");
              setPoData(null);
              setLines([]);
              setPoInput("");
              setChallanNumber("");
              setGrnDate(new Date().toISOString().slice(0, 10));
              setLrNumber("");
              setVehicleNumber("");
              setTransporter("");
              setInvoiceNumber("");
              setInvoiceDate("");
              setChallanFile(null);
              setInvoiceFile(null);
              setPhotosFile(null);
              if (challanRef.current) challanRef.current.value = "";
              if (invoiceRef.current) invoiceRef.current.value = "";
              if (photosRef.current)  photosRef.current.value  = "";
            }}
            className="h-9 px-4 bg-surface text-primary-700 text-sm font-medium rounded-sm border border-border transition-colors">
            Create Another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-bold text-primary-900 tracking-tight flex items-center gap-2">
            <PackageCheck className="w-6 h-6 text-success" /> Goods Receipt Note (F4)
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Record physical receipt of materials against an approved Purchase Order.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            disabled={!poData || submitting}
            onClick={handleSubmit}
            className="h-9 px-4 bg-success hover:bg-success/90 text-white text-sm font-medium rounded-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm flex items-center gap-2"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {submitting ? "Submitting…" : "Finalize GRN"}
          </button>
        </div>
      </div>

      {submitError && (
        <div className="flex items-center gap-2 p-3 bg-danger/10 border border-danger/30 rounded-sm text-sm text-danger">
          <XCircle className="w-4 h-4 shrink-0" /> {submitError}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        {/* Left column */}
        <div className="xl:col-span-1 space-y-6">
          {/* 1. Link PO */}
          <div className="enterprise-card p-4 space-y-4 border-t-4 border-t-accent-500">
            <h2 className="text-sm font-bold text-primary-900 uppercase tracking-wide border-b border-border pb-2">
              1. Link Purchase Order
            </h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">
                  PO Number or Vendor Name <span className="text-danger">*</span>
                </label>
                <div className="relative" ref={searchContainerRef}>
                  <Search className="absolute left-2.5 top-2 h-4 w-4 text-text-secondary z-10" />
                  {searching && <Loader2 className="absolute right-2.5 top-2 h-4 w-4 animate-spin text-text-secondary z-10" />}
                  <input
                    type="text"
                    className="enterprise-input pl-8 font-mono"
                    placeholder="PO-2503-0001 or vendor name"
                    value={poInput}
                    onChange={(e) => handleSearchInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && fetchPO()}
                  />
                  {/* Live-search dropdown */}
                  {showDropdown && (
                    <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-surface border border-border rounded-sm shadow-lg max-h-64 overflow-y-auto">
                      {searchResults.length === 0 ? (
                        <div className="px-3 py-4 text-xs text-text-secondary text-center">
                          No open POs found for this search.
                        </div>
                      ) : (
                        searchResults.map((po) => (
                          <button
                            key={po.PO_ID}
                            type="button"
                            onMouseDown={(e) => { e.preventDefault(); selectSearchResult(po); }}
                            className="w-full text-left px-3 py-2.5 hover:bg-primary-50 border-b border-border last:border-0 transition-colors"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-mono text-xs font-bold text-primary-700">{po.PO_ID}</span>
                              <span className="text-[10px] text-text-secondary font-mono">
                                ₹{parseFloat(po.GRAND_TOTAL || "0").toLocaleString("en-IN")}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-2 mt-0.5">
                              <span className="text-xs text-text-primary truncate">{po.VENDOR_NAME}</span>
                              {po.DELIVERY_DATE && (
                                <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 bg-primary-100 text-primary-700 rounded-sm uppercase tracking-wide">
                                  Due {fmtDate(po.DELIVERY_DATE)}
                                </span>
                              )}
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>
              <button
                onClick={() => fetchPO()}
                disabled={fetching || !poInput.trim()}
                className="w-full h-8 bg-primary-900 hover:bg-primary-800 text-white text-xs font-medium rounded-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {fetching ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                {fetching ? "Fetching…" : "Fetch PO Details"}
              </button>
              {poError && <p className="text-xs text-danger">{poError}</p>}
            </div>

            {poData && (
              <div className="mt-4 p-3 bg-success/10 border border-success/30 rounded-sm">
                <div className="flex items-center gap-2 mb-2">
                  <FileCheck className="w-4 h-4 text-success" />
                  <span className="text-xs font-bold text-success">PO Linked</span>
                </div>
                <div className="text-xs space-y-1 text-primary-900">
                  <p><span className="text-text-secondary">PO:</span> {poData.PO_ID}</p>
                  <p><span className="text-text-secondary">Vendor:</span> {poData.VENDOR_NAME}</p>
                  <p><span className="text-text-secondary">Value:</span> ₹{parseFloat(poData.GRAND_TOTAL || "0").toLocaleString("en-IN")}</p>
                  <p><span className="text-text-secondary">Delivery:</span> {fmtDate(poData.DELIVERY_DATE)}</p>
                </div>
              </div>
            )}
          </div>

          {/* 2. Delivery Details */}
          {poData && (
            <div className="enterprise-card p-4 space-y-4">
              <h2 className="text-sm font-bold text-primary-900 uppercase tracking-wide border-b border-border pb-2 flex items-center gap-2">
                <Truck className="w-4 h-4 text-primary-600" /> Delivery Details
              </h2>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">Challan / LR No. <span className="text-danger">*</span></label>
                  <input type="text" className="enterprise-input font-mono" placeholder="DC-8849"
                    autoComplete="off" value={challanNumber} onChange={(e) => setChallanNumber(e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">Date Received <span className="text-danger">*</span></label>
                  <input type="date" className="enterprise-input" value={grnDate} max={today}
                    onChange={(e) => setGrnDate(e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">LR Number</label>
                  <input type="text" className="enterprise-input font-mono" placeholder="LR-2231"
                    value={lrNumber} onChange={(e) => setLrNumber(e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">Vehicle Number</label>
                  <input type="text" className="enterprise-input font-mono" placeholder="MH01AB1234"
                    value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">Transporter</label>
                  <input type="text" className="enterprise-input" placeholder="SafeExpress Logistics"
                    value={transporter} onChange={(e) => setTransporter(e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">Invoice No. <span className="text-danger">*</span></label>
                  <input type="text" className="enterprise-input font-mono" placeholder="INV-20260301"
                    autoComplete="off" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">Invoice Date <span className="text-danger">*</span></label>
                  <input type="date" className="enterprise-input" value={invoiceDate} max={grnDate}
                    onChange={(e) => setInvoiceDate(e.target.value)} />
                  {invoiceDate && invoiceDate > grnDate && (
                    <p className="text-[11px] text-danger mt-1">Invoice date cannot be after GRN date.</p>
                  )}
                </div>
              </div>

              {/* File uploads */}
              <div className="pt-3 border-t border-border space-y-2">
                <h3 className="text-xs font-bold text-primary-900 uppercase mb-1">Documents</h3>
                <p className="text-[10px] text-text-secondary mb-2">PDF or image only · max 20 MB each</p>

                {/* Challan */}
                <input ref={challanRef} type="file" accept=".pdf,image/*" className="hidden"
                  onChange={(e) => setChallanFile(e.target.files?.[0] ?? null)} />
                <button
                  type="button"
                  onClick={() => challanRef.current?.click()}
                  className={`w-full flex items-center justify-center gap-2 p-3 border border-dashed rounded-sm transition-colors text-[10px] font-bold ${challanFile ? "border-success/50 bg-success/10 text-success" : "border-primary-300 bg-primary-50/30 hover:bg-primary-50 text-primary-700"}`}
                >
                  {challanFile ? <><CheckCircle2 className="w-4 h-4" /> {challanFile.name}</> : <><UploadCloud className="w-4 h-4" /> Upload Challan PDF *</>}
                </button>

                {/* Vendor invoice */}
                <input ref={invoiceRef} type="file" accept=".pdf,image/*" className="hidden"
                  onChange={(e) => setInvoiceFile(e.target.files?.[0] ?? null)} />
                <button
                  type="button"
                  onClick={() => invoiceRef.current?.click()}
                  className={`w-full flex items-center justify-center gap-2 p-3 border border-dashed rounded-sm transition-colors text-[10px] font-bold ${invoiceFile ? "border-success/50 bg-success/10 text-success" : "border-primary-300 bg-primary-50/30 hover:bg-primary-50 text-primary-700"}`}
                >
                  {invoiceFile ? <><CheckCircle2 className="w-4 h-4" /> {invoiceFile.name}</> : <><UploadCloud className="w-4 h-4" /> Upload Vendor Invoice *</>}
                </button>

                {/* Material photos (optional) */}
                <input ref={photosRef} type="file" accept=".pdf,image/*" className="hidden"
                  onChange={(e) => setPhotosFile(e.target.files?.[0] ?? null)} />
                <button
                  type="button"
                  onClick={() => photosRef.current?.click()}
                  className={`w-full flex items-center justify-center gap-2 p-3 border border-dashed rounded-sm transition-colors text-[10px] font-bold ${photosFile ? "border-success/50 bg-success/10 text-success" : "border-primary-300 bg-primary-50/30 hover:bg-primary-50 text-primary-700"}`}
                >
                  {photosFile ? <><CheckCircle2 className="w-4 h-4" /> {photosFile.name}</> : <><Camera className="w-4 h-4" /> Upload Material Photos</>}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right column — Line inspection */}
        <div className="xl:col-span-3">
          {!poData ? (
            <div className="enterprise-card h-full min-h-[400px] flex flex-col items-center justify-center p-8 text-center bg-surface">
              {fetching ? (
                <Loader2 className="w-10 h-10 animate-spin text-primary-300 mb-4" />
              ) : (
                <PackageCheck className="w-16 h-16 text-primary-200 mb-4" />
              )}
              <h3 className="text-lg font-bold text-primary-900 mb-2">No PO Selected</h3>
              <p className="text-sm text-text-secondary max-w-md">
                Search and link a Purchase Order on the left to load the expected line items.
              </p>
            </div>
          ) : (
            <div className="enterprise-card flex flex-col min-h-[500px]">
              <div className="p-4 border-b border-border bg-primary-50/50">
                <h2 className="text-sm font-bold text-primary-900 uppercase tracking-wide">
                  2. Physical Inspection & Receiving
                </h2>
                {activeLineCount === 0 && (
                  <p className="text-xs text-warning mt-1 font-medium">All lines on this PO have already been fully received.</p>
                )}
              </div>

              <div className="flex-1 overflow-x-auto">
                <table className="w-full text-sm text-left whitespace-nowrap">
                  <thead className="text-[11px] text-text-secondary bg-surface border-b border-border uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Item Description</th>
                      <th className="px-4 py-3 font-semibold w-24">Ord Qty</th>
                      <th className="px-4 py-3 font-semibold w-32 bg-success/5 border-l border-r border-success/20 text-success">Rcvd Qty</th>
                      <th className="px-4 py-3 font-semibold w-32 bg-danger/5 border-r border-danger/20 text-danger">Defect Qty</th>
                      <th className="px-4 py-3 font-semibold w-28 text-center">QC Outcome</th>
                      <th className="px-4 py-3 font-semibold w-48">Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {lines.map((line, i) => {
                      const fullyReceived = line.qty_outstanding === 0;
                      const qcMismatch = line.qty_defective > 0 && line.qc_outcome === "Pass";
                      return (
                        <tr key={i} className={`transition-colors ${fullyReceived ? "bg-slate-50 opacity-60" : "hover:bg-primary-50/30"}`}>
                          <td className="px-4 py-3 text-xs font-medium text-primary-900 whitespace-normal min-w-[250px]">
                            {line.item_description}
                            {fullyReceived && (
                              <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-200 text-slate-500 uppercase tracking-wide">
                                Fully Received
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-text-secondary">
                            {line.qty_ordered}
                            {line.qty_outstanding < line.qty_ordered && (
                              <div className="text-[10px] text-amber-600 font-semibold">
                                Rem: {line.qty_outstanding}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 bg-success/5 border-l border-r border-success/10">
                            {fullyReceived ? (
                              <span className="block text-right text-xs text-slate-400 font-mono pr-2">0</span>
                            ) : (
                              <input type="number" min={0} max={line.qty_outstanding}
                                aria-label={`Received Qty for ${line.item_description}`}
                                value={line.qty_received}
                                onChange={(e) => updateLine(i, "qty_received", parseFloat(e.target.value) || 0)}
                                className="w-full bg-surface border border-success/30 focus:border-success focus:ring-1 focus:ring-success rounded-sm px-2 py-1 text-xs text-right font-bold text-success" />
                            )}
                          </td>
                          <td className="px-4 py-3 bg-danger/5 border-r border-danger/10">
                            <input type="number" min={0} max={line.qty_received}
                              aria-label={`Defect Qty for ${line.item_description}`}
                              disabled={fullyReceived}
                              value={fullyReceived ? 0 : line.qty_defective}
                              onChange={(e) => updateLine(i, "qty_defective", parseFloat(e.target.value) || 0)}
                              className="w-full bg-surface border border-danger/30 focus:border-danger focus:ring-1 focus:ring-danger rounded-sm px-2 py-1 text-xs text-right text-danger disabled:opacity-40" />
                          </td>
                          <td className={`px-4 py-3 border-r border-border ${qcMismatch ? "bg-warning/10" : ""}`}>
                            <select value={line.qc_outcome}
                              disabled={fullyReceived}
                              onChange={(e) => updateLine(i, "qc_outcome", e.target.value)}
                              className={`w-full bg-surface border focus:ring-1 focus:ring-primary-500 rounded-sm px-1 py-1 text-[10px] font-medium disabled:opacity-40 ${qcMismatch ? "border-warning text-warning" : "border-border"}`}>
                              <option>Pass</option>
                              <option>Fail</option>
                              <option>Conditional Accept</option>
                              <option>Defective</option>
                            </select>
                            {qcMismatch && (
                              <p className="text-[9px] text-warning mt-0.5 font-semibold">Defective qty set — update outcome</p>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <input type="text" value={line.remarks}
                              disabled={fullyReceived}
                              onChange={(e) => updateLine(i, "remarks", e.target.value)}
                              placeholder="Inspection remarks…"
                              className="w-full bg-surface border border-border focus:ring-1 focus:ring-primary-500 rounded-sm px-2 py-1 text-xs disabled:opacity-40" />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* QC summary */}
              <div className="p-4 border-t border-border bg-primary-50/30">
                <h2 className="text-sm font-bold text-primary-900 uppercase tracking-wide flex items-center gap-2 mb-1">
                  <ClipboardCheck className="w-4 h-4 text-primary-600" /> Summary
                </h2>
                <p className="text-xs text-text-secondary">
                  Accepted: <strong>{lines.reduce((s, l) => s + l.qty_accepted, 0)}</strong> units across {lines.length} line(s).
                  Defective: <strong>{lines.reduce((s, l) => s + l.qty_defective, 0)}</strong> units.
                </p>
              </div>

              {shortReceiptCount > 0 && (
                <div className="p-4 border-t border-border bg-surface">
                  <div className="flex items-start gap-3 p-3 bg-warning/10 border border-warning/30 rounded-sm">
                    <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs font-bold text-warning-800">Short Receipt Warning</h4>
                      <p className="text-[10px] text-text-secondary mt-0.5 leading-relaxed">
                        {shortReceiptCount} line(s) received fewer quantities than ordered. The balance will remain open for future deliveries.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {qcMismatchCount > 0 && (
                <div className="p-4 border-t border-border bg-surface">
                  <div className="flex items-start gap-3 p-3 bg-warning/10 border border-warning/30 rounded-sm">
                    <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs font-bold text-warning-800">QC Outcome Mismatch</h4>
                      <p className="text-[10px] text-text-secondary mt-0.5 leading-relaxed">
                        {qcMismatchCount} line(s) have defective quantities recorded but QC outcome is still &quot;Pass&quot;. Please update the outcome before submitting.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mt-8 space-y-2">
        <div className="bg-primary-50 border border-primary-200 text-primary-700 text-[11px] font-bold tracking-wide uppercase p-2 rounded-sm flex items-center justify-center text-center">
          ⚑ Segregation Control: You cannot approve your own submission. — SOP §15.1
        </div>
        <p className="text-center text-xs text-text-secondary">
          Per Crystal Group SOP-PROC-001 Version 1.1
        </p>
      </div>
    </div>
  );
}
