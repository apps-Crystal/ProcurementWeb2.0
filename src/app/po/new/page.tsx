"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ShoppingCart,
  ChevronLeft,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Briefcase,
  ExternalLink,
} from "lucide-react";
import { useCurrentUser } from "@/components/auth/AuthProvider";

export default function CreatePOPageWrapper() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-primary-400" /></div>}>
      <CreatePOPage />
    </Suspense>
  );
}

interface PRData {
  PR_ID?: string;
  SPR_ID?: string;
  REQUESTOR_NAME?: string;
  REQUESTOR_SITE?: string;
  CATEGORY?: string;
  SERVICE_CATEGORY?: string;
  PURPOSE?: string;
  SERVICE_DESCRIPTION?: string;
  PREFERRED_VENDOR_ID?: string;
  PREFERRED_VENDOR_NAME?: string;
  VENDOR_ID?: string;
  VENDOR_NAME?: string;
  PAYMENT_TERMS?: string;
  ADVANCE_PERCENT?: string;
  CREDIT_PERIOD_DAYS?: string;
  DELIVERY_LOCATION?: string;
  RETENTION_AMOUNT?: string;
  EXPECTED_DELIVERY_DATE?: string;
  TOTAL_AMOUNT_WITH_GST?: string;
  TOTAL_VALUE?: string;
  QUOTATION_URL?: string;
  STATUS?: string;
}

interface PRLine {
  LINE_NUMBER?: string;
  ITEM_NAME?: string;
  ITEM_DESCRIPTION?: string;
  SERVICE_DESCRIPTION?: string;
  UNIT_OF_MEASURE?: string;
  QUANTITY?: string;
  RATE?: string;
  GST_PERCENT?: string;
  HSN_CODE?: string;
  SAC_CODE?: string;
  LINE_TOTAL?: string;
}

interface Vendor {
  VENDOR_ID: string;
  COMPANY_NAME: string;
  EMAIL?: string;
  CONTACT_EMAIL?: string;
}

function CreatePOPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prId   = searchParams.get("pr")   ?? "";
  const prType = (searchParams.get("type") ?? "MPR") as "MPR" | "SPR";
  const { user } = useCurrentUser();

  const [pr, setPr]       = useState<PRData | null>(null);
  const [lines, setLines] = useState<PRLine[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [poId, setPoId]   = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Form fields
  const [vendorId,   setVendorId]   = useState("");
  const [vendorName, setVendorName] = useState("");
  const [vendorEmail, setVendorEmail] = useState("");
  const [deliveryDate,     setDeliveryDate]     = useState("");
  const [deliveryLocation, setDeliveryLocation] = useState("");
  const [freightCharges,   setFreightCharges]   = useState("0");
  const [installationCharges, setInstallationCharges] = useState("0");
  const [tallyPoNumber,       setTallyPoNumber]       = useState("");
  const [specialTerms,        setSpecialTerms]        = useState("");

  useEffect(() => {
    if (!prId) return;
    Promise.all([
      fetch(`/api/pr/${prId}`).then((r) => r.json()),
      fetch("/api/vendors").then((r) => r.json()),
    ])
      .then(([prData, vendorData]) => {
        const prRow: PRData = prData.pr ?? {};
        setPr(prRow);
        setLines(prData.lines ?? []);

        const vendorList: Vendor[] = (vendorData.vendors ?? []).map((v: Record<string, string>) => ({
          VENDOR_ID:    v.VENDOR_ID,
          COMPANY_NAME: v.COMPANY_NAME,
          EMAIL:        v.EMAIL ?? v.CONTACT_EMAIL ?? "",
        }));
        setVendors(vendorList);

        // Pre-fill vendor from PR
        const prefVendorId   = prRow.PREFERRED_VENDOR_ID ?? prRow.VENDOR_ID ?? "";
        const prefVendorName = prRow.PREFERRED_VENDOR_NAME ?? prRow.VENDOR_NAME ?? "";
        if (prefVendorId) setVendorId(prefVendorId);
        if (prefVendorName) setVendorName(prefVendorName);

        // Pre-fill vendor email from vendor list if found
        const match = vendorList.find((v) => v.VENDOR_ID === prefVendorId);
        if (match?.EMAIL) setVendorEmail(match.EMAIL);

        // Pre-fill delivery date and location from PR
        if (prRow.EXPECTED_DELIVERY_DATE) setDeliveryDate(prRow.EXPECTED_DELIVERY_DATE.slice(0, 10));
        if (prRow.DELIVERY_LOCATION) setDeliveryLocation(prRow.DELIVERY_LOCATION);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [prId]);

  function handleVendorChange(vid: string) {
    setVendorId(vid);
    const match = vendors.find((v) => v.VENDOR_ID === vid);
    if (match) {
      setVendorName(match.COMPANY_NAME);
      setVendorEmail(match.EMAIL ?? "");
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!vendorId || !deliveryDate) {
      setError("Vendor and Delivery Date are required.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/po", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pr_id:                  prId,
          pr_type:                prType,
          vendor_id:              vendorId,
          vendor_name:            vendorName,
          vendor_email:           vendorEmail,
          delivery_date:          deliveryDate,
          delivery_location:      deliveryLocation,
          freight_charges:        parseFloat(freightCharges) || 0,
          installation_charges:   parseFloat(installationCharges) || 0,
          advance_percent:        parseFloat(pr?.ADVANCE_PERCENT ?? "0") || 0,
          tally_po_number:        tallyPoNumber,
          special_commercial_terms: specialTerms,
          created_by:             user?.userId ?? "",
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? "Failed to create PO");
      setPoId(result.po_id);
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create PO");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-primary-400" />
      </div>
    );
  }

  if (!pr) {
    return (
      <div className="text-center py-20 text-text-secondary">
        <AlertTriangle className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p>PR not found or not accessible.</p>
      </div>
    );
  }

  if (pr.STATUS !== "APPROVED") {
    return (
      <div className="text-center py-20 text-text-secondary">
        <AlertTriangle className="w-10 h-10 mx-auto mb-3 text-warning opacity-60" />
        <p className="font-medium">This PR is not approved yet.</p>
        <p className="text-xs mt-1">A PO can only be created for an approved PR.</p>
        <button onClick={() => router.back()} className="mt-4 text-xs text-primary-600 underline">Go back</button>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center py-24 space-y-4">
        <div className="w-14 h-14 rounded-full bg-success/10 flex items-center justify-center">
          <CheckCircle2 className="w-8 h-8 text-success" />
        </div>
        <h2 className="text-xl font-bold text-primary-900">Purchase Order Created</h2>
        <p className="text-sm text-text-secondary">
          <span className="font-mono font-bold text-primary-700">{poId}</span> has been issued to the vendor.
        </p>
        <div className="flex gap-3 mt-2">
          <button
            onClick={() => router.push("/po/open")}
            className="flex items-center gap-1.5 text-xs font-bold px-4 py-2 bg-primary-900 text-white rounded-sm hover:bg-primary-800 transition-colors"
          >
            <ShoppingCart className="w-3.5 h-3.5" /> View Open POs
          </button>
          <button
            onClick={() => router.push("/pr/list")}
            className="flex items-center gap-1.5 text-xs font-bold px-4 py-2 border border-border text-primary-700 rounded-sm hover:bg-primary-50 transition-colors"
          >
            Back to PR List
          </button>
        </div>
      </div>
    );
  }

  const prIdDisplay = pr.PR_ID ?? pr.SPR_ID ?? prId;
  const category    = pr.CATEGORY ?? pr.SERVICE_CATEGORY ?? "—";
  const prTotal     = parseFloat(pr.TOTAL_AMOUNT_WITH_GST ?? pr.TOTAL_VALUE ?? "0");
  const freightNum  = parseFloat(freightCharges) || 0;
  const instNum     = parseFloat(installationCharges) || 0;
  const poTotal     = prTotal + freightNum + instNum;

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border pb-4">
        <div>
          <button
            onClick={() => router.back()}
            className="flex items-center gap-1 text-xs text-text-secondary hover:text-primary-900 mb-2 transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Back
          </button>
          <h1 className="text-2xl font-bold text-primary-900 tracking-tight flex items-center gap-2">
            <ShoppingCart className="w-6 h-6 text-primary-600" />
            Create Purchase Order
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Issuing PO against{" "}
            <span className="font-mono font-bold text-primary-700">{prIdDisplay}</span>
            {" · "}
            {prType === "MPR" ? "Material PR" : "Service PR"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Form */}
        <form onSubmit={handleSubmit} className="xl:col-span-2 space-y-5">

          {/* PR Summary */}
          <div className="enterprise-card p-4 space-y-3 bg-primary-50/40">
            <h2 className="text-xs font-bold text-primary-900 uppercase tracking-wide flex items-center gap-1.5">
              {prType === "MPR"
                ? <FileText className="w-3.5 h-3.5 text-primary-600" />
                : <Briefcase className="w-3.5 h-3.5 text-primary-600" />}
              Source PR Details
            </h2>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
              <div>
                <p className="text-[11px] text-text-secondary uppercase tracking-wider font-medium">Requestor</p>
                <p className="font-medium text-primary-900">{pr.REQUESTOR_NAME ?? "—"}</p>
              </div>
              <div>
                <p className="text-[11px] text-text-secondary uppercase tracking-wider font-medium">Site</p>
                <p className="font-medium text-primary-900">{pr.REQUESTOR_SITE ?? "—"}</p>
              </div>
              <div>
                <p className="text-[11px] text-text-secondary uppercase tracking-wider font-medium">Category</p>
                <p className="font-medium text-primary-900">{category}</p>
              </div>
              <div>
                <p className="text-[11px] text-text-secondary uppercase tracking-wider font-medium">Payment Terms</p>
                <p className="font-medium text-primary-900">{pr.PAYMENT_TERMS ?? "—"}</p>
              </div>
              <div className="col-span-2">
                <p className="text-[11px] text-text-secondary uppercase tracking-wider font-medium">Purpose / Description</p>
                <p className="text-primary-900 leading-relaxed">{pr.PURPOSE ?? pr.SERVICE_DESCRIPTION ?? "—"}</p>
              </div>
            </div>
            {pr.QUOTATION_URL && (
              <a href={pr.QUOTATION_URL} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-[11px] font-medium text-primary-700 bg-white border border-primary-200 px-2.5 py-1 rounded-sm hover:bg-primary-50 transition-colors">
                <ExternalLink className="w-3 h-3" /> View Quotation
              </a>
            )}
          </div>

          {/* Line Items Preview */}
          {lines.length > 0 && (
            <div className="enterprise-card overflow-hidden">
              <div className="p-3 border-b border-border bg-primary-50/30">
                <h2 className="text-xs font-bold text-primary-900 uppercase tracking-wide">Line Items (from PR)</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-[11px] text-text-secondary bg-surface border-b border-border uppercase tracking-wider">
                    <tr>
                      <th className="px-3 py-2 font-semibold w-8">#</th>
                      <th className="px-3 py-2 font-semibold">Description</th>
                      <th className="px-3 py-2 font-semibold w-16 text-center">UOM</th>
                      <th className="px-3 py-2 font-semibold w-14 text-right">Qty</th>
                      <th className="px-3 py-2 font-semibold w-24 text-right">Rate (₹)</th>
                      <th className="px-3 py-2 font-semibold w-14 text-center">GST%</th>
                      <th className="px-3 py-2 font-semibold w-28 text-right">Total (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {lines.map((l, i) => (
                      <tr key={i} className="hover:bg-primary-50/20">
                        <td className="px-3 py-2 text-text-secondary text-center">{l.LINE_NUMBER ?? i + 1}</td>
                        <td className="px-3 py-2 font-medium text-primary-900">
                          {l.ITEM_NAME ?? l.ITEM_DESCRIPTION ?? l.SERVICE_DESCRIPTION ?? "—"}
                          {(l.HSN_CODE || l.SAC_CODE) && (
                            <span className="ml-1.5 font-mono text-[10px] text-text-secondary">{l.HSN_CODE ?? l.SAC_CODE}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center text-text-secondary">{l.UNIT_OF_MEASURE ?? "—"}</td>
                        <td className="px-3 py-2 text-right font-mono">{l.QUANTITY ?? "—"}</td>
                        <td className="px-3 py-2 text-right font-mono">{parseFloat(l.RATE ?? "0").toLocaleString("en-IN")}</td>
                        <td className="px-3 py-2 text-center">{l.GST_PERCENT ?? "—"}%</td>
                        <td className="px-3 py-2 text-right font-mono font-semibold text-primary-900">
                          {parseFloat(l.LINE_TOTAL ?? "0").toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Vendor Selection */}
          <div className="enterprise-card p-5 space-y-4">
            <h2 className="text-sm font-bold text-primary-900 uppercase tracking-wide border-b border-border pb-2">
              Vendor Details
            </h2>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-text-secondary">
                Select Vendor <span className="text-danger">*</span>
              </label>
              <select
                value={vendorId}
                onChange={(e) => handleVendorChange(e.target.value)}
                required
                className="enterprise-input"
              >
                <option value="">— Select approved vendor —</option>
                {vendors.map((v) => (
                  <option key={v.VENDOR_ID} value={v.VENDOR_ID}>
                    {v.COMPANY_NAME} ({v.VENDOR_ID})
                  </option>
                ))}
              </select>
              {pr.PREFERRED_VENDOR_NAME && (
                <p className="text-[11px] text-text-secondary">
                  PR preferred: <span className="font-medium">{pr.PREFERRED_VENDOR_NAME}</span>
                </p>
              )}
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-text-secondary">Vendor Email (for PO dispatch)</label>
              <input
                type="email"
                value={vendorEmail}
                onChange={(e) => setVendorEmail(e.target.value)}
                placeholder="vendor@example.com"
                className="enterprise-input"
              />
            </div>
          </div>

          {/* PO Terms */}
          <div className="enterprise-card p-5 space-y-4">
            <h2 className="text-sm font-bold text-primary-900 uppercase tracking-wide border-b border-border pb-2">
              PO Terms
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="block text-xs font-medium text-text-secondary">
                  Delivery Date <span className="text-danger">*</span>
                </label>
                <input
                  type="date"
                  value={deliveryDate}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                  required
                  className="enterprise-input"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-medium text-text-secondary">Delivery Location</label>
                <input
                  type="text"
                  value={deliveryLocation}
                  onChange={(e) => setDeliveryLocation(e.target.value)}
                  placeholder="e.g. Mumbai HO / Pune Plant"
                  className="enterprise-input"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-medium text-text-secondary">Tally PO Number</label>
                <input
                  type="text"
                  value={tallyPoNumber}
                  onChange={(e) => setTallyPoNumber(e.target.value)}
                  placeholder="e.g. PO/2526/1234"
                  className="enterprise-input font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-medium text-text-secondary">Freight Charges (₹)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={freightCharges}
                  onChange={(e) => setFreightCharges(e.target.value)}
                  className="enterprise-input font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-medium text-text-secondary">Installation Charges (₹)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={installationCharges}
                  onChange={(e) => setInstallationCharges(e.target.value)}
                  className="enterprise-input font-mono"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-text-secondary">Special Commercial Terms</label>
              <textarea
                value={specialTerms}
                onChange={(e) => setSpecialTerms(e.target.value)}
                rows={3}
                placeholder="Any additional terms, LD clauses, warranty conditions…"
                className="enterprise-input resize-none"
              />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 bg-danger/10 border border-danger/30 rounded-sm text-xs text-danger font-medium">
              <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 h-11 text-sm font-bold rounded-sm bg-primary-900 hover:bg-primary-800 text-white transition-colors disabled:opacity-50"
          >
            {submitting ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Creating PO…</>
            ) : (
              <><ShoppingCart className="w-4 h-4" /> Issue Purchase Order</>
            )}
          </button>
        </form>

        {/* Right — Summary */}
        <div className="space-y-4">
          <div className="enterprise-card p-4 space-y-2 border-t-4 border-t-primary-900">
            <h3 className="text-xs font-bold text-primary-900 uppercase tracking-wide border-b border-border pb-2">PO Value Summary</h3>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-text-secondary">PR Value (incl. GST)</span>
                <span className="font-mono font-medium">₹{prTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Freight</span>
                <span className="font-mono font-medium">₹{freightNum.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Installation</span>
                <span className="font-mono font-medium">₹{instNum.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between border-t border-border pt-1.5 mt-1">
                <span className="font-bold text-primary-900">Total PO Value</span>
                <span className="font-mono font-bold text-primary-900">₹{poTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>

          <div className="enterprise-card p-4 space-y-2">
            <h3 className="text-xs font-bold text-primary-900 uppercase tracking-wide border-b border-border pb-2">Carry-forward from PR</h3>
            <div className="space-y-1.5 text-xs">
              {pr.PAYMENT_TERMS && (
                <div className="flex justify-between">
                  <span className="text-text-secondary">Payment Terms</span>
                  <span className="font-medium">{pr.PAYMENT_TERMS}</span>
                </div>
              )}
              {pr.CREDIT_PERIOD_DAYS && (
                <div className="flex justify-between">
                  <span className="text-text-secondary">Credit Period</span>
                  <span className="font-medium">{pr.CREDIT_PERIOD_DAYS} days</span>
                </div>
              )}
              {pr.ADVANCE_PERCENT && parseFloat(pr.ADVANCE_PERCENT) > 0 && (
                <div className="flex justify-between">
                  <span className="text-text-secondary">Advance</span>
                  <span className="font-medium">{pr.ADVANCE_PERCENT}%</span>
                </div>
              )}
              {pr.RETENTION_AMOUNT && parseFloat(pr.RETENTION_AMOUNT) > 0 && (
                <div className="flex justify-between">
                  <span className="text-text-secondary">Retention</span>
                  <span className="font-mono font-medium">₹{parseFloat(pr.RETENTION_AMOUNT).toLocaleString("en-IN")}</span>
                </div>
              )}
            </div>
            <p className="text-[10px] text-text-secondary pt-1">These terms are automatically applied from the approved PR.</p>
          </div>

          <div className="bg-primary-50 border border-primary-200 text-primary-700 text-[11px] font-bold tracking-wide uppercase p-2 rounded-sm flex items-center justify-center text-center">
            ⚑ PO will be issued with STATUS = ISSUED
          </div>
        </div>
      </div>
    </div>
  );
}
