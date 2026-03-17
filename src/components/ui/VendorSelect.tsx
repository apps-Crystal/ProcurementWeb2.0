"use client";

/**
 * VendorSelect — searchable dropdown backed by GET /api/vendors?status=ACTIVE
 *
 * Props:
 *   value        — current vendor name displayed in the input
 *   onChange     — called with { vendor_id, vendor_name, gstin } on selection
 *   placeholder  — input placeholder text
 *   disabled     — disable the control
 */

import { useEffect, useRef, useState } from "react";
import { Search, CheckCircle2, ChevronDown, Loader2 } from "lucide-react";

interface VendorOption {
  vendor_id: string;
  vendor_name: string;
  gstin: string;
  vendor_type: string;
}

interface Props {
  value: string;
  onChange: (v: { vendor_id: string; vendor_name: string; gstin: string }) => void;
  placeholder?: string;
  disabled?: boolean;
}

export default function VendorSelect({
  value,
  onChange,
  placeholder = "Search active vendors…",
  disabled = false,
}: Props) {
  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(!!value);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync external value changes
  useEffect(() => {
    setQuery(value);
    setSelected(!!value);
  }, [value]);

  // Fetch vendors once on mount
  useEffect(() => {
    setLoading(true);
    fetch("/api/vendors?status=ACTIVE")
      .then((r) => r.json())
      .then((data) => {
        const rows: Record<string, string>[] = data.vendors ?? [];
        setVendors(
          rows.map((r) => ({
            vendor_id:   r.VENDOR_ID,
            vendor_name: r.COMPANY_NAME,
            gstin:       r.GSTIN,
            vendor_type: r.VENDOR_TYPE,
          }))
        );
      })
      .catch(() => setVendors([]))
      .finally(() => setLoading(false));
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        // If user typed something but didn't select, revert to last confirmed value
        if (!selected) setQuery("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [selected]);

  const filtered = vendors.filter(
    (v) =>
      !query ||
      v.vendor_name.toLowerCase().includes(query.toLowerCase()) ||
      v.vendor_id.toLowerCase().includes(query.toLowerCase()) ||
      v.gstin.toLowerCase().includes(query.toLowerCase())
  );

  function handleSelect(v: VendorOption) {
    setQuery(v.vendor_name);
    setSelected(true);
    setOpen(false);
    onChange({ vendor_id: v.vendor_id, vendor_name: v.vendor_name, gstin: v.gstin });
  }

  function handleClear() {
    setQuery("");
    setSelected(false);
    setOpen(true);
    onChange({ vendor_id: "", vendor_name: "", gstin: "" });
  }

  return (
    <div ref={containerRef} className="relative">
      <div className={`flex items-center enterprise-input p-0 gap-1 ${disabled ? "opacity-60 pointer-events-none" : ""}`}>
        {selected ? (
          <CheckCircle2 className="w-4 h-4 text-success shrink-0 ml-2.5" />
        ) : (
          <Search className="w-4 h-4 text-text-secondary shrink-0 ml-2.5" />
        )}
        <input
          type="text"
          className="flex-1 bg-transparent text-sm px-1.5 py-2 outline-none min-w-0"
          placeholder={loading ? "Loading vendors…" : placeholder}
          value={query}
          disabled={disabled}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(false);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
        />
        {loading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-text-secondary mr-2 shrink-0" />
        ) : selected ? (
          <button
            type="button"
            onClick={handleClear}
            className="text-[10px] text-text-secondary hover:text-danger mr-2 shrink-0 font-medium"
          >
            ✕
          </button>
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-text-secondary mr-2 shrink-0" />
        )}
      </div>

      {open && !disabled && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-surface border border-border rounded-sm shadow-lg max-h-60 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-3 py-4 text-xs text-text-secondary text-center">
              {vendors.length === 0
                ? "No active vendors registered yet."
                : "No vendors match your search."}
            </div>
          ) : (
            filtered.slice(0, 30).map((v) => (
              <button
                key={v.vendor_id}
                type="button"
                onMouseDown={(e) => e.preventDefault()} // prevent input blur before click
                onClick={() => handleSelect(v)}
                className="w-full text-left px-3 py-2.5 hover:bg-primary-50 border-b border-border/50 last:border-0 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold text-primary-900">{v.vendor_name}</p>
                    <p className="text-[10px] text-text-secondary mt-0.5 font-mono">
                      {v.vendor_id} · GSTIN: {v.gstin || "—"}
                    </p>
                  </div>
                  <span className="text-[9px] font-bold uppercase tracking-wider text-primary-600 bg-primary-50 border border-primary-200 px-1.5 py-0.5 rounded-sm shrink-0">
                    {v.vendor_type}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
