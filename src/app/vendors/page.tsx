"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Users,
  Search,
  Plus,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronRight,
} from "lucide-react";

type Vendor = Record<string, string>;

const STATUS_TABS = [
  { label: "All",          value: "" },
  { label: "Pending KYC", value: "PENDING_KYC" },
  { label: "Active",       value: "ACTIVE" },
  { label: "Deactivated",  value: "DEACTIVATED" },
];

function StatusBadge({ status }: { status: string }) {
  if (status === "ACTIVE")
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-green-100 text-green-800 border border-green-200">
        <CheckCircle2 className="w-3 h-3" /> Active
      </span>
    );
  if (status === "DEACTIVATED")
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-700 border border-red-200">
        <XCircle className="w-3 h-3" /> Deactivated
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
      <Clock className="w-3 h-3" /> Pending KYC
    </span>
  );
}

function RefBadge({ value }: { value: string }) {
  if (value === "Y")
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-green-50 text-green-700 border border-green-200">
        Yes
      </span>
    );
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
      No
    </span>
  );
}

export default function VendorListPage() {
  const [vendors, setVendors]       = useState<Vendor[]>([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState("");
  const [activeTab, setActiveTab]   = useState("");

  useEffect(() => {
    setLoading(true);
    fetch("/api/vendors")
      .then((r) => r.json())
      .then((data) => setVendors(data.vendors ?? []))
      .catch(() => setVendors([]))
      .finally(() => setLoading(false));
  }, []);

  const counts: Record<string, number> = { "": vendors.length };
  STATUS_TABS.slice(1).forEach((t) => {
    counts[t.value] = vendors.filter((v) => v.STATUS === t.value).length;
  });

  const filtered = vendors.filter((v) => {
    const matchTab = !activeTab || v.STATUS === activeTab;
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      (v.COMPANY_NAME ?? "").toLowerCase().includes(q) ||
      (v.VENDOR_ID ?? "").toLowerCase().includes(q);
    return matchTab && matchSearch;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-bold text-primary-900 tracking-tight flex items-center gap-2">
            <Users className="w-6 h-6 text-primary-600" /> Vendor Management
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Review, approve and manage vendor KYC registrations.
          </p>
        </div>
        <Link
          href="/vendors/new"
          className="inline-flex items-center gap-2 h-9 px-4 bg-primary-900 hover:bg-primary-800 text-white text-sm font-medium rounded-sm border border-primary-950 shadow-sm transition-colors"
        >
          <Plus className="w-4 h-4" /> Register New Vendor
        </Link>
      </div>

      {/* Status filter tabs */}
      <div className="flex items-center gap-1 flex-wrap">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={`px-3 py-1.5 text-xs font-medium rounded-sm border transition-colors ${
              activeTab === tab.value
                ? "bg-primary-900 text-white border-primary-950"
                : "bg-surface text-primary-700 border-border hover:bg-primary-50"
            }`}
          >
            {tab.label}
            <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
              activeTab === tab.value ? "bg-primary-700 text-white" : "bg-primary-100 text-primary-700"
            }`}>
              {counts[tab.value] ?? 0}
            </span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
        <input
          type="text"
          placeholder="Search by company name or vendor ID…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="enterprise-input pl-8"
        />
      </div>

      {/* Table */}
      <div className="enterprise-card p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary-400" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-text-secondary">
            <Users className="w-10 h-10 opacity-30" />
            <p className="text-sm font-medium">No vendors found</p>
            {search && (
              <button onClick={() => setSearch("")} className="text-xs text-primary-600 underline">
                Clear search
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-primary-50/60">
                <tr>
                  {[
                    "Vendor ID",
                    "Company Name",
                    "Type",
                    "GSTIN",
                    "Status",
                    "Ref. Verified",
                    "Registered Date",
                    "Actions",
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-[11px] font-bold text-primary-700 uppercase tracking-wider whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-surface divide-y divide-border">
                {filtered.map((v) => (
                  <tr key={v.VENDOR_ID} className="hover:bg-primary-50/40 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-primary-700 whitespace-nowrap">
                      {v.VENDOR_ID}
                    </td>
                    <td className="px-4 py-3 font-medium text-primary-900 max-w-[200px] truncate">
                      {v.COMPANY_NAME}
                    </td>
                    <td className="px-4 py-3 text-text-secondary whitespace-nowrap text-xs">
                      {v.VENDOR_TYPE}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-text-secondary whitespace-nowrap">
                      {v.GSTIN}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <StatusBadge status={v.STATUS} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <RefBadge value={v.REFERENCE_VERIFIED} />
                    </td>
                    <td className="px-4 py-3 text-xs text-text-secondary whitespace-nowrap">
                      {v.REGISTERED_DATE
                        ? new Date(v.REGISTERED_DATE).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Link
                        href={`/vendors/${v.VENDOR_ID}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-primary-700 border border-primary-200 rounded-sm hover:bg-primary-50 hover:border-primary-400 transition-colors"
                      >
                        Review <ChevronRight className="w-3.5 h-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-text-secondary text-right">
        Showing {filtered.length} of {vendors.length} vendors
      </p>
    </div>
  );
}
