"use client";

import { useState } from "react";
import { 
  FileEdit,
  Search,
  UploadCloud,
  FileCheck,
  AlertTriangle,
  Send,
  Save,
  Calculator,
  CalendarDays,
  ListPlus
} from "lucide-react";

export default function POAmendmentRequest() {
  const [poLinked, setPoLinked] = useState(false);
  const [amendmentType, setAmendmentType] = useState("Value Enhancement");

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-20">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-bold text-primary-900 tracking-tight flex items-center gap-2">
            <FileEdit className="w-6 h-6 text-warning" />
            PO Amendment Request
          </h1>
          <p className="text-sm text-text-secondary mt-1">Request shifts in value, timeline, or scope for an approved Purchase Order.</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="h-9 px-4 bg-surface hover:bg-primary-50 text-primary-700 text-sm font-medium rounded-sm border border-primary-200 transition-colors shadow-sm focus:ring-1 focus:ring-primary-500 flex items-center gap-2">
            <Save className="w-4 h-4" /> Save Draft
          </button>
          <button 
            disabled={!poLinked}
            className="h-9 px-4 bg-primary-900 hover:bg-primary-800 text-white text-sm font-medium rounded-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm focus:ring-1 focus:ring-accent-500 flex items-center gap-2"
          >
            <Send className="w-4 h-4" /> Submit Request
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        
        {/* Left Column - PO Details & Amendment Reason */}
        <div className="xl:col-span-1 space-y-6">
          <div className="enterprise-card p-4 space-y-4 border-t-4 border-t-warning">
            <h2 className="text-sm font-bold text-primary-900 uppercase tracking-wide border-b border-border pb-2">1. Select Purchase Order</h2>
            
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Enter PO Number <span className="text-danger">*</span></label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2 h-4 w-4 text-text-secondary" />
                  <input 
                    type="text" 
                    className="enterprise-input pl-8 font-mono" 
                    placeholder="e.g. PO-2502-044" 
                    onBlur={() => setPoLinked(true)}
                  />
                </div>
              </div>
              <button 
                onClick={() => setPoLinked(true)}
                className="w-full h-8 bg-primary-900 hover:bg-primary-800 text-white text-xs font-medium rounded-sm transition-colors"
              >
                Fetch PO Details
              </button>
            </div>

            {poLinked && (
              <div className="mt-4 p-3 bg-primary-50 border border-primary-200 rounded-sm">
                <div className="flex items-center gap-2 mb-2">
                  <FileCheck className="w-4 h-4 text-primary-600" />
                  <span className="text-xs font-bold text-primary-900">Original PO Details</span>
                </div>
                <div className="text-xs space-y-1.5 text-text-primary">
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Vendor:</span>
                    <span className="font-medium">TechFlow Systems</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Issue Date:</span>
                    <span>15-Feb-2026</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Delivery Date:</span>
                    <span>01-Mar-2026</span>
                  </div>
                  <div className="flex justify-between border-t border-primary-200/50 pt-1 mt-1">
                    <span className="text-text-secondary">Current Value:</span>
                    <span className="font-mono font-bold text-primary-900">₹11,80,000.00</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {poLinked && (
            <div className="enterprise-card p-4 space-y-4">
              <h2 className="text-sm font-bold text-primary-900 uppercase tracking-wide border-b border-border pb-2 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-warning" /> Amendment Request
              </h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">Amendment Type <span className="text-danger">*</span></label>
                  <select 
                    className="enterprise-input"
                    value={amendmentType}
                    onChange={(e) => setAmendmentType(e.target.value)}
                  >
                    <option value="Value Enhancement">Value Enhancement</option>
                    <option value="Timeline Extension">Timeline Extension</option>
                    <option value="Scope Change">Scope / Item Change</option>
                    <option value="Cancellation">Cancellation</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">Reason for Amendment <span className="text-danger">*</span></label>
                  <textarea 
                    className="w-full flex min-h-[80px] rounded-sm p-3 text-sm border border-border focus:ring-1 focus:ring-primary-600 outline-none transition-colors resize-none" 
                    placeholder="Provide detailed justification for this change..."
                  />
                </div>

                <div className="pt-2 border-t border-border">
                  <label className="block text-xs font-medium text-text-secondary mb-1">Justification / Approval Doc <span className="text-danger">*</span></label>
                  <button className="w-full flex flex-col items-center justify-center p-3 border border-dashed border-primary-300 rounded-sm bg-primary-50/30 hover:bg-primary-50 transition-colors cursor-pointer group mt-1">
                    <UploadCloud className="w-4 h-4 text-primary-400 group-hover:text-primary-600 mb-1" />
                    <span className="text-[10px] font-bold text-primary-700">Upload Document</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column - Specific Edits */}
        <div className="xl:col-span-3">
          {!poLinked ? (
            <div className="enterprise-card h-full min-h-[400px] flex flex-col items-center justify-center p-8 text-center bg-surface">
              <FileEdit className="w-16 h-16 text-primary-200 mb-4" />
              <h3 className="text-lg font-bold text-primary-900 mb-2">Configure Amendment</h3>
              <p className="text-sm text-text-secondary max-w-md">Search and link a Purchase Order on the left to reveal amendment options for value, timeline, or scope.</p>
            </div>
          ) : (
            <div className="enterprise-card flex flex-col min-h-[500px]">
              <div className="p-4 border-b border-border bg-primary-50/50">
                <h2 className="text-sm font-bold text-primary-900 uppercase tracking-wide">
                  2. Amendment Details: {amendmentType}
                </h2>
              </div>
              
              <div className="p-6 flex-1 flex flex-col">
                
                {amendmentType === "Value Enhancement" && (
                  <div className="max-w-xl space-y-6">
                    <div className="flex items-start gap-4 p-4 bg-primary-50 border border-primary-200 rounded-sm">
                      <Calculator className="w-8 h-8 text-primary-600 shrink-0" />
                      <div>
                        <h3 className="text-sm font-bold text-primary-900">Revise Total PO Value</h3>
                        <p className="text-xs text-text-secondary mt-1">Increasing the value beyond the 10% tolerance limit will re-trigger the financial approval workflow.</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <label className="block text-xs font-medium text-text-secondary mb-1">Current PO Value (₹)</label>
                        <input type="text" className="enterprise-input bg-surface font-mono" value="11,80,000.00" disabled />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-primary-900 mb-1">New Proposed Total Value (₹) <span className="text-danger">*</span></label>
                        <input type="number" className="enterprise-input font-bold font-mono text-primary-900 focus:ring-primary-600" placeholder="e.g. 1500000" />
                      </div>
                    </div>
                    
                    <div className="p-3 bg-surface border border-border rounded-sm">
                      <div className="flex justify-between items-center text-sm">
                        <span className="font-bold text-text-primary">Net Increase / Delta:</span>
                        <span className="font-mono font-bold text-warning-800">₹ 3,20,000.00 (+27.1%)</span>
                      </div>
                    </div>
                  </div>
                )}

                {amendmentType === "Timeline Extension" && (
                  <div className="max-w-xl space-y-6">
                    <div className="flex items-start gap-4 p-4 bg-primary-50 border border-primary-200 rounded-sm">
                      <CalendarDays className="w-8 h-8 text-primary-600 shrink-0" />
                      <div>
                        <h3 className="text-sm font-bold text-primary-900">Extend Delivery Deadline</h3>
                        <p className="text-xs text-text-secondary mt-1">Extensions require business justification and may incur Liquidated Damages (LD) waivers if applicable.</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <label className="block text-xs font-medium text-text-secondary mb-1">Current Delivery Date</label>
                        <input type="text" className="enterprise-input bg-surface" value="01-Mar-2026" disabled />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-primary-900 mb-1">New Delivery Date <span className="text-danger">*</span></label>
                        <input type="date" className="enterprise-input focus:ring-primary-600" />
                      </div>
                    </div>
                  </div>
                )}

                {amendmentType === "Scope Change" && (
                  <div className="space-y-6">
                    <div className="flex items-start gap-4 p-4 bg-primary-50 border border-primary-200 rounded-sm">
                      <ListPlus className="w-8 h-8 text-primary-600 shrink-0" />
                      <div>
                        <h3 className="text-sm font-bold text-primary-900">Revise Line Items / Scope</h3>
                        <p className="text-xs text-text-secondary mt-1">Specify changes to quantities, items, or technical specifications. Significant changes may require a new PO.</p>
                      </div>
                    </div>

                    <div>
                       <label className="block text-xs font-medium text-primary-900 mb-1">Revised Scope Details <span className="text-danger">*</span></label>
                       <textarea 
                         className="w-full flex min-h-[200px] rounded-sm p-3 text-sm border border-border focus:ring-1 focus:ring-primary-600 outline-none transition-colors align-top bg-surface" 
                         placeholder="Detail the exact changes to line items, quantities, or technical specifications..."
                       />
                    </div>
                  </div>
                )}

                {amendmentType === "Cancellation" && (
                  <div className="max-w-xl space-y-6">
                    <div className="flex items-start gap-4 p-4 bg-danger/10 border border-danger/30 rounded-sm">
                      <AlertTriangle className="w-8 h-8 text-danger shrink-0" />
                      <div>
                        <h3 className="text-sm font-bold text-danger">PO Cancellation Request</h3>
                        <p className="text-xs text-danger/80 mt-1">Cancelling a PO requires Head of Procurement approval. Goods Receipt Notes (GRN) linked to this PO will be blocked.</p>
                      </div>
                    </div>

                    <div className="p-3 bg-surface border border-border rounded-sm">
                       <label className="flex items-center gap-2 cursor-pointer">
                         <input type="checkbox" className="rounded text-danger focus:ring-danger" />
                         <span className="text-xs font-bold text-text-primary">I confirm that the vendor has been notified and agreed to the cancellation terms.</span>
                       </label>
                    </div>
                  </div>
                )}
                
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mt-8 space-y-2">
        <div className="bg-primary-50 border border-primary-200 text-primary-700 text-[11px] font-bold tracking-wide uppercase p-2 rounded-sm flex items-center justify-center text-center">
          ⚑ Audit Trail: All amendments are permanently logged. — SOP §6.4
        </div>
        <p className="text-center text-xs text-text-secondary">
          Per Crystal Group SOP-PROC-001 Version 1.1 | SOP-PROC-001
        </p>
      </div>
    </div>
  );
}
