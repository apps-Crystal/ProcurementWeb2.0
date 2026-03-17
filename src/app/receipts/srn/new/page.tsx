"use client";

import { useState } from "react";
import { 
  CheckSquare,
  Search,
  UploadCloud,
  Save,
  Send,
  AlertTriangle,
  FileCheck,
  Settings
} from "lucide-react";

export default function NewSRN() {
  const [woLinked, setWoLinked] = useState(false);
  const [serviceType, setServiceType] = useState("Physical Labor/Civil");

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-20">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-bold text-primary-900 tracking-tight flex items-center gap-2">
            <CheckSquare className="w-6 h-6 text-warning" />
            Service Receipt Note (F5)
          </h1>
          <p className="text-sm text-text-secondary mt-1">Certify completion of services or milestones against a Work Order for payment release.</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="h-9 px-4 bg-surface hover:bg-primary-50 text-primary-700 text-sm font-medium rounded-sm border border-primary-200 transition-colors shadow-sm focus:ring-1 focus:ring-primary-500 flex items-center gap-2">
            <Save className="w-4 h-4" /> Save Draft
          </button>
          <button 
            disabled={!woLinked}
            className="h-9 px-4 bg-warning hover:bg-warning/90 text-white text-sm font-medium rounded-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm focus:ring-1 focus:ring-accent-500 flex items-center gap-2"
          >
            <Send className="w-4 h-4" /> Submit for Head Approval
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        
        {/* Left Column - Link WO */}
        <div className="xl:col-span-1 space-y-6">
          <div className="enterprise-card p-4 space-y-4 border-t-4 border-t-accent-500">
            <h2 className="text-sm font-bold text-primary-900 uppercase tracking-wide border-b border-border pb-2">1. Link Work Order</h2>
            
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Enter WO Number <span className="text-danger">*</span></label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2 h-4 w-4 text-text-secondary" />
                  <input 
                    type="text" 
                    className="enterprise-input pl-8 font-mono" 
                    placeholder="e.g. WO-2501-012" 
                    onBlur={() => setWoLinked(true)}
                  />
                </div>
              </div>
              <button 
                onClick={() => setWoLinked(true)}
                className="w-full h-8 bg-primary-900 hover:bg-primary-800 text-white text-xs font-medium rounded-sm transition-colors"
              >
                Fetch WO Details
              </button>
            </div>

            {woLinked && (
              <div className="mt-4 p-3 bg-success/10 border border-success/30 rounded-sm">
                <div className="flex items-center gap-2 mb-2">
                  <FileCheck className="w-4 h-4 text-success" />
                  <span className="text-xs font-bold text-success">WO Linked Successfully</span>
                </div>
                <div className="text-xs space-y-1 text-primary-900">
                  <p><span className="text-text-secondary">Vendor:</span> Acme Services Pvt Ltd</p>
                  <p><span className="text-text-secondary">Date:</span> 10-Jan-2026</p>
                  <p><span className="text-text-secondary">Value:</span> ₹50,00,000</p>
                </div>
              </div>
            )}
          </div>

          {woLinked && (
            <div className="enterprise-card p-4 space-y-4">
              <h2 className="text-sm font-bold text-primary-900 uppercase tracking-wide border-b border-border pb-2 flex items-center gap-2">
                <Settings className="w-4 h-4 text-primary-600" /> Service Details
              </h2>
              
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">Service Type <span className="text-danger">*</span></label>
                  <select 
                    className="enterprise-input"
                    value={serviceType}
                    onChange={(e) => setServiceType(e.target.value)}
                  >
                    <option value="Physical Labor/Civil">Physical Labor/Civil</option>
                    <option value="Consultancy">Consultancy</option>
                    <option value="Design">Design</option>
                    <option value="AMC">AMC</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">Service Period Start <span className="text-danger">*</span></label>
                  <input type="date" className="enterprise-input" defaultValue="2026-02-01" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">Service Period End <span className="text-danger">*</span></label>
                  <input type="date" className="enterprise-input" defaultValue="2026-02-28" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">Service Location</label>
                  <input type="text" className="enterprise-input" defaultValue="Mumbai Facility" />
                </div>
              </div>

              <div className="pt-4 border-t border-border mt-4">
                <h3 className="text-xs font-bold text-primary-900 uppercase mb-2">Mandatory Documents</h3>
                <p className="text-[10px] text-text-secondary italic mb-3">Vendor Invoice is mandatory at SRN stage per SOP-PROC-001 §7.2.</p>
                <div className="space-y-3">
                  <button className="w-full flex flex-col items-center justify-center p-3 border border-dashed border-primary-300 rounded-sm bg-primary-50/30 hover:bg-primary-50 transition-colors cursor-pointer group">
                    <UploadCloud className="w-5 h-5 text-primary-400 group-hover:text-primary-600 mb-1" />
                    <span className="text-[10px] font-bold text-primary-700">
                      {serviceType === 'Consultancy' || serviceType === 'Design' ? 'Upload Deliverable Report *' : 'Upload Measurement Book (MB) *'}
                    </span>
                  </button>
                  <button className="w-full flex flex-col items-center justify-center p-3 border border-dashed border-primary-300 rounded-sm bg-primary-50/30 hover:bg-primary-50 transition-colors cursor-pointer group">
                    <UploadCloud className="w-5 h-5 text-primary-400 group-hover:text-primary-600 mb-1" />
                    <span className="text-[10px] font-bold text-primary-700">Upload Vendor Invoice *</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column - Milestone Certification */}
        <div className="xl:col-span-3">
          {!woLinked ? (
            <div className="enterprise-card h-full min-h-[400px] flex flex-col items-center justify-center p-8 text-center bg-surface">
              <CheckSquare className="w-16 h-16 text-primary-200 mb-4" />
              <h3 className="text-lg font-bold text-primary-900 mb-2">No Work Order Selected</h3>
              <p className="text-sm text-text-secondary max-w-md">Search and link a Work Order on the left to load the service milestones and certify completion.</p>
            </div>
          ) : (
            <div className="enterprise-card flex flex-col h-full min-h-[500px]">
              <div className="p-4 border-b border-border bg-primary-50/50 flex justify-between items-center">
                <h2 className="text-sm font-bold text-primary-900 uppercase tracking-wide">2. Milestone Certification</h2>
              </div>
              
              <div className="flex-1 overflow-x-auto p-0">
                <table className="w-full text-sm text-left whitespace-nowrap">
                  <thead className="text-[11px] text-text-secondary bg-surface pb-2 border-b border-border uppercase tracking-wider">
                    <tr>
                       <th className="px-4 py-3 font-semibold">Service / Milestone Description</th>
                       <th className="px-4 py-3 font-semibold w-24">WO Total</th>
                       <th className="px-4 py-3 font-semibold w-24">Prev Cert.</th>
                       <th className="px-4 py-3 font-semibold w-32 bg-warning/10 border-l border-r border-warning/30 text-warning-800">Curr. Cert %</th>
                       <th className="px-4 py-3 font-semibold w-48 bg-primary-50 border-r border-primary-200 text-primary-900 text-right">Cert. Amount (₹)</th>
                       <th className="px-4 py-3 font-semibold w-32 border-r border-border">Scope Status</th>
                       <th className="px-4 py-3 font-semibold w-48">Certifier Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    <tr className="hover:bg-primary-50/30 transition-colors">
                      <td className="px-4 py-3 text-xs font-medium text-primary-900">Phase 1: Foundation Works</td>
                      <td className="px-4 py-3 font-mono text-xs text-text-secondary line-through">100%</td>
                      <td className="px-4 py-3 font-mono text-xs font-bold text-success">100%</td>
                      <td className="px-4 py-3 bg-surface border-l border-r border-border text-center">
                        <span className="text-xs font-bold text-text-secondary">LOCKED</span>
                      </td>
                      <td className="px-4 py-3 bg-surface border-r border-border text-right text-text-secondary font-mono">
                         ₹0.00
                      </td>
                      <td className="px-4 py-3 border-r border-border">
                        <select className="w-full bg-surface border border-border focus:ring-1 focus:ring-primary-500 rounded-sm px-1 py-1 text-[10px] text-text-secondary font-medium outline-none" disabled>
                          <option>Not Started</option><option>In Progress</option><option value="Completed" selected>Completed</option>
                        </select>
                      </td>
                      <td className="px-4 py-3 text-xs text-text-secondary italic">
                        Certified in SRN-2502-005
                      </td>
                    </tr>
                    <tr className="hover:bg-primary-50/30 transition-colors">
                      <td className="px-4 py-3 text-xs font-medium text-primary-900">Phase 2: Superstructure Erection</td>
                      <td className="px-4 py-3 font-mono text-xs text-text-secondary">100%</td>
                      <td className="px-4 py-3 font-mono text-xs font-bold text-warning">0%</td>
                      <td className="px-4 py-3 bg-warning/10 border-l border-r border-warning/30">
                        <div className="flex items-center gap-1">
                          <input type="number" className="w-full bg-surface border border-warning/50 focus:border-warning focus:ring-1 focus:ring-warning rounded-sm px-2 py-1 text-xs text-right font-bold text-warning-900" defaultValue={50} max={100} min={0} />
                          <span className="text-xs font-bold text-warning-800">%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 bg-primary-50 border-r border-primary-200 text-right">
                         <span className="font-mono text-sm font-bold text-primary-900">₹25,00,000.00</span>
                      </td>
                      <td className="px-4 py-3 border-r border-border">
                        <select className="w-full bg-surface border border-border focus:ring-1 focus:ring-primary-500 rounded-sm px-1 py-1 text-[10px] text-text-primary font-medium">
                          <option>Not Started</option><option value="In Progress" selected>In Progress</option><option>Completed</option>
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <input type="text" className="w-full bg-surface border border-border focus:ring-1 focus:ring-primary-500 rounded-sm px-2 py-1 text-xs" placeholder="Milestone roughly 50% complete" defaultValue="Ground floor and 1st floor columns cast." />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              
              <div className="p-4 border-t border-border bg-surface mt-auto">
                 <div className="flex items-center justify-between p-3 bg-primary-900 text-white rounded-sm shadow-sm group border border-primary-950">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-accent-500 flex items-center justify-center text-primary-900 font-bold border-2 border-primary-900 group-hover:scale-110 transition-transform">
                        ₹
                      </div>
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-accent-400">Total Certification Value</h4>
                        <p className="text-[10px] text-primary-200 mt-0.5">Value to be passed for invoicing</p>
                      </div>
                    </div>
                    <div className="font-mono text-xl font-bold tracking-tight">
                      ₹25,00,000.00
                    </div>
                 </div>

                 <div className="mt-4 flex items-start gap-3 p-3 bg-warning/10 border border-warning/30 rounded-sm">
                   <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
                   <div>
                     <h4 className="text-xs font-bold text-warning-800">Site Head Verification Required</h4>
                     <p className="text-[10px] text-text-secondary mt-0.5 leading-relaxed">
                       As per SOP-PROC-001, Service Receipt Notes must be verified by the Site Head before the vendor can upload the invoice. The system will BLOCK invoice routing until Site Head digitally signs this SRN.
                     </p>
                   </div>
                 </div>
              </div>

            </div>
          )}
        </div>
      </div>

      <div className="mt-8 space-y-2">
        <div className="bg-primary-50 border border-primary-200 text-primary-700 text-[11px] font-bold tracking-wide uppercase p-2 rounded-sm flex items-center justify-center text-center">
          ⚑ Segregation Control: You cannot approve your own submission. — SOP §15.1
        </div>
        <p className="text-center text-xs text-text-secondary">
          Per Crystal Group SOP-PROC-001 Version 1.1 | SOP-PROC-001
        </p>
      </div>
    </div>
  );
}
