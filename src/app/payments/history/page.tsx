"use client";

import { useState } from "react";
import { 
  History,
  Search,
  Filter,
  Download,
  FileText,
  CreditCard,
  Building2,
  Calendar,
  IndianRupee
} from "lucide-react";

interface PaymentRecord {
  id: string;
  date: string;
  vendor: string;
  category: string;
  amount: string;
  mode: "NEFT" | "RTGS" | "Cheque";
  utr: string;
}

const mockHistory: PaymentRecord[] = [
  { id: "PAY-2503-0102", date: "10-Mar-2026", vendor: "TechFlow Systems", category: "Raw Material", amount: "₹11,80,000", mode: "RTGS", utr: "HDFCR520260310123" },
  { id: "PAY-2503-0088", date: "05-Mar-2026", vendor: "Pinnacle Consulting", category: "Services", amount: "₹5,00,000", mode: "NEFT", utr: "SBIN220260305884" },
  { id: "PAY-2502-0210", date: "28-Feb-2026", vendor: "Office Supplies Co", category: "Consumables", amount: "₹45,500", mode: "NEFT", utr: "ICICN220260228001" },
  { id: "PAY-2502-0185", date: "20-Feb-2026", vendor: "BuildCorp Inc.", category: "Civil Works", amount: "₹45,00,000", mode: "RTGS", utr: "UTIBH520260220993" },
  { id: "PAY-2501-0042", date: "15-Jan-2026", vendor: "SafetyFirst Ltd", category: "Consumables", amount: "₹2,50,000", mode: "NEFT", utr: "SBIN220260115222" }
];

export default function PaymentHistory() {
  const [activeTab, setActiveTab] = useState<"Month" | "Quarter" | "FY">("Month");

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-20">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-bold text-primary-900 tracking-tight flex items-center gap-2">
            <History className="w-6 h-6 text-success" />
            Payment History Register
          </h1>
          <p className="text-sm text-text-secondary mt-1">View and export completed transactions, UTR numbers, and payment receipts.</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="h-9 px-4 bg-surface hover:bg-primary-50 text-primary-700 text-sm font-medium rounded-sm border border-primary-200 transition-colors shadow-sm focus:ring-1 focus:ring-primary-500 flex items-center gap-2">
            <Download className="w-4 h-4" /> Export Report (CSV)
          </button>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="enterprise-card p-4 flex items-center gap-4 border-l-4 border-l-success">
          <div className="p-3 bg-success/10 text-success rounded-full">
            <IndianRupee className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-text-secondary font-medium uppercase tracking-wider">Total Paid (Filtered)</p>
            <p className="text-lg font-bold text-primary-900 font-mono mt-0.5">₹ 64,75,500</p>
          </div>
        </div>
        <div className="enterprise-card p-4 flex items-center gap-4 border-l-4 border-l-warning">
          <div className="p-3 bg-warning/10 text-warning-800 rounded-full">
            <CreditCard className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-text-secondary font-medium uppercase tracking-wider">Transactions</p>
            <p className="text-lg font-bold text-primary-900 font-mono mt-0.5">5</p>
          </div>
        </div>
        <div className="enterprise-card p-4 flex items-center gap-4 border-l-4 border-l-primary-600">
          <div className="p-3 bg-primary-100 text-primary-700 rounded-full">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-text-secondary font-medium uppercase tracking-wider">Unique Vendors</p>
            <p className="text-lg font-bold text-primary-900 font-mono mt-0.5">5</p>
          </div>
        </div>
        <div className="enterprise-card p-4 flex items-center gap-4">
          <div className="p-3 bg-accent-100 text-accent-700 rounded-full">
             <Calendar className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-text-secondary font-medium uppercase tracking-wider">Date Range</p>
            <p className="text-sm font-bold text-primary-900 mt-1">Jan 2026 - Mar 2026</p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="enterprise-card flex flex-col min-h-[500px]">
        
        {/* Toolbar */}
        <div className="p-4 border-b border-border bg-primary-50/30 flex flex-col sm:flex-row justify-between gap-4">
          
          {/* Tabs */}
          <div className="flex bg-surface border border-border rounded-sm p-1 inline-flex shadow-sm overflow-x-auto">
            <button 
              onClick={() => setActiveTab("Month")}
              className={`px-4 py-1.5 text-xs font-bold rounded-sm transition-colors whitespace-nowrap ${activeTab === 'Month' ? 'bg-primary-900 text-white shadow-sm' : 'text-text-secondary hover:text-primary-900'}`}
            >
              This Month
            </button>
            <button 
              onClick={() => setActiveTab("Quarter")}
              className={`px-4 py-1.5 text-xs font-bold rounded-sm transition-colors whitespace-nowrap ${activeTab === 'Quarter' ? 'bg-primary-900 text-white shadow-sm' : 'text-text-secondary hover:text-primary-900'}`}
            >
              This Quarter
            </button>
            <button 
              onClick={() => setActiveTab("FY")}
              className={`px-4 py-1.5 text-xs font-bold rounded-sm transition-colors whitespace-nowrap ${activeTab === 'FY' ? 'bg-primary-900 text-white shadow-sm' : 'text-text-secondary hover:text-primary-900'}`}
            >
              Financial Year (FY25-26)
            </button>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2.5 top-2 text-text-secondary" />
              <input type="text" placeholder="Search Vendor or UTR..." className="enterprise-input pl-8 w-64" />
            </div>
            <button className="h-9 px-3 bg-surface border border-border text-text-secondary hover:text-primary-900 hover:border-primary-300 rounded-sm transition-colors shadow-sm flex items-center gap-2">
              <Filter className="w-4 h-4" /> Filter
            </button>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-auto bg-surface">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="text-[11px] text-text-secondary bg-primary-50/50 sticky top-0 border-b border-border uppercase tracking-wider">
              <tr>
                <th className="px-6 py-3 font-semibold w-32">Payment ID</th>
                <th className="px-6 py-3 font-semibold w-28">Date</th>
                <th className="px-6 py-3 font-semibold">Vendor</th>
                <th className="px-6 py-3 font-semibold">Category</th>
                <th className="px-6 py-3 font-semibold text-right">Amount Paid</th>
                <th className="px-6 py-3 font-semibold w-24 text-center">Mode</th>
                <th className="px-6 py-3 font-semibold w-40">Bank UTR / Ref No.</th>
                <th className="px-6 py-3 font-semibold w-24 text-center">Receipt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {mockHistory.map((pay) => (
                <tr key={pay.id} className="hover:bg-primary-50/30 transition-colors group">
                  <td className="px-6 py-4 font-mono text-primary-700 font-bold">
                    {pay.id}
                  </td>
                  <td className="px-6 py-4 text-xs font-medium text-text-secondary">{pay.date}</td>
                  <td className="px-6 py-4 font-medium text-text-primary">{pay.vendor}</td>
                  <td className="px-6 py-4 text-xs text-text-secondary">{pay.category}</td>
                  <td className="px-6 py-4 font-mono font-bold text-success text-right">{pay.amount}</td>
                  <td className="px-6 py-4 text-center">
                    <span className="inline-flex items-center text-[10px] font-bold uppercase tracking-wider bg-surface border border-border px-2 py-0.5 rounded-sm">
                      {pay.mode}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-mono text-xs font-medium text-text-secondary">{pay.utr}</td>
                  <td className="px-6 py-4 text-center">
                    <button className="p-1.5 text-text-secondary hover:text-primary-600 hover:bg-primary-50 rounded-sm transition-colors focus:outline-none" title="Download Payment Advice">
                      <FileText className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {/* Footer info */}
        <div className="p-3 border-t border-border bg-primary-50/30 text-xs text-text-secondary flex justify-between items-center">
           <span>Showing 5 transactions.</span>
        </div>
      </div>
    </div>
  );
}
