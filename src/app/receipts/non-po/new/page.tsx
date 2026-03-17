"use client";

import { useState } from "react";
import { 
  Receipt,
  AlertTriangle,
  UploadCloud,
  Save,
  Send,
  Info
} from "lucide-react";

export default function NonPOPurchaseForm() {
  const [amount, setAmount] = useState<number | "">("");

  const isOverLimit = typeof amount === "number" && amount > 10000;

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-20">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-bold text-primary-900 tracking-tight flex items-center gap-2">
            <Receipt className="w-6 h-6 text-primary-600" />
            Non-PO / Ad-hoc Purchase (F6)
          </h1>
          <p className="text-sm text-text-secondary mt-1">Record emergency or petty cash purchases made without a prior Purchase Order.</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="h-9 px-4 bg-surface hover:bg-primary-50 text-primary-700 text-sm font-medium rounded-sm border border-primary-200 transition-colors shadow-sm focus:ring-1 focus:ring-primary-500 flex items-center gap-2">
            <Save className="w-4 h-4" /> Save Draft
          </button>
          <button 
            disabled={isOverLimit || amount === ""}
            className="h-9 px-4 bg-primary-900 hover:bg-primary-800 text-white text-sm font-medium rounded-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm focus:ring-1 focus:ring-accent-500 flex items-center gap-2"
          >
            <Send className="w-4 h-4" /> Submit Request
          </button>
        </div>
      </div>

      {/* Warning Banner */}
      <div className="bg-warning/10 border-l-4 border-warning p-4 rounded-r-sm">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-bold text-warning-800">Strict Limit: ₹10,000 max</h3>
            <p className="text-xs text-warning-900 mt-1">
              Per SOP-PROC-001 §7.3, Non-PO processing is strictly limited to emergency or petty purchases under ₹10,000. 
              Any amount exceeding this limit requires a standard MPR → PO route. 
              <strong> Finance Head exception approval is required for all Non-PO submissions.</strong>
            </p>
          </div>
        </div>
      </div>

      <div className="enterprise-card p-6 space-y-8">
        
        {/* Purchase Details */}
        <div>
          <h2 className="text-sm font-bold text-primary-900 uppercase tracking-wide border-b border-border pb-2 mb-4">1. Purchase Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Date of Purchase <span className="text-danger">*</span></label>
              <input type="date" className="enterprise-input" defaultValue="2026-03-13" />
            </div>
            
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Vendor / Store Name <span className="text-danger">*</span></label>
              <input type="text" className="enterprise-input" placeholder="e.g. Local Hardware Store" />
            </div>

            <div>
               <label className="block text-xs font-medium text-text-secondary mb-1">Category <span className="text-danger">*</span></label>
               <select className="enterprise-input">
                 <option value="">Select Category</option>
                 <option value="Office Supplies">Office Supplies</option>
                 <option value="Travel">Travel & Conveyance</option>
                 <option value="Small Spares">Small Spares / Tools</option>
                 <option value="Food & Beverages">Food & Beverages</option>
                 <option value="Other">Other</option>
               </select>
            </div>

            <div className="relative">
              <label className="block text-xs font-medium text-text-secondary mb-1">Exact Total Amount (₹) <span className="text-danger">*</span></label>
              <input 
                type="number" 
                className={`enterprise-input font-mono font-bold text-lg ${isOverLimit ? 'border-danger focus:ring-danger text-danger' : 'text-primary-900'}`} 
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value ? Number(e.target.value) : "")}
              />
              {isOverLimit && (
                <div className="mt-1.5 flex items-center gap-1 text-[11px] font-bold text-danger">
                  <AlertTriangle className="w-3.5 h-3.5" /> Amount exceeds non-PO limit. Please raise an MPR.
                </div>
              )}
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-text-secondary mb-1">Purpose / Justification <span className="text-danger">*</span></label>
              <textarea 
                className="w-full min-h-[80px] rounded-sm p-3 text-sm border border-border focus:ring-1 focus:ring-primary-600 outline-none transition-colors resize-y bg-surface" 
                placeholder="Explain why this purchase was necessary and couldn't follow the standard PO route..."
              />
            </div>
          </div>
        </div>

        {/* Documents */}
        <div>
          <h2 className="text-sm font-bold text-primary-900 uppercase tracking-wide border-b border-border pb-2 mb-4">2. Mandatory Proof of Purchase</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <button className="w-full flex flex-col items-center justify-center p-6 border-2 border-dashed border-primary-300 rounded-sm bg-primary-50/30 hover:bg-primary-50 transition-colors cursor-pointer group">
               <UploadCloud className="w-8 h-8 text-primary-400 group-hover:text-primary-600 mb-2" />
               <span className="text-sm font-bold text-primary-700">Upload Original Bill / Cash Memo *</span>
               <span className="text-[10px] text-text-secondary mt-1">Required. Clear photo or PDF.</span>
             </button>

             <div className="flex flex-col justify-center p-6 bg-surface border border-border rounded-sm">
               <div className="flex items-start gap-3">
                 <Info className="w-5 h-5 text-primary-600 shrink-0 mt-0.5" />
                 <div className="text-xs text-text-secondary space-y-2">
                   <p><strong>Bill Requirements:</strong></p>
                   <ul className="list-disc pl-4 space-y-1">
                     <li>Must clearly show the date and total amount.</li>
                     <li>Must contain the vendor's name.</li>
                     <li>If GST is applicable, the GSTIN must be visible for claiming input tax credit.</li>
                   </ul>
                 </div>
               </div>
             </div>
          </div>
        </div>

      </div>

      <div className="mt-8 space-y-2">
        <div className="bg-primary-50 border border-primary-200 text-primary-700 text-[11px] font-bold tracking-wide uppercase p-2 rounded-sm flex items-center justify-center text-center">
          ⚑ Audit Flag: Non-PO purchases are heavily audited for split-PO avoidance. — SOP §15.2
        </div>
        <p className="text-center text-xs text-text-secondary">
          Per Crystal Group SOP-PROC-001 Version 1.1 | SOP-PROC-001
        </p>
      </div>
    </div>
  );
}
