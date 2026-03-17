"use client";

import { useState } from "react";
import { 
  BarChart3,
  PieChart,
  LineChart,
  TrendingDown,
  Clock,
  Download,
  Filter,
  Users,
  Building2,
  FileSpreadsheet
} from "lucide-react";

export default function ReportsAndDashboards() {
  const [timeframe, setTimeframe] = useState("This Month");

  const reports = [
    {
      id: "RPT-001",
      title: "Procurement Turnaround Time (TAT) Analysis",
      description: "Average days taken from PR creation to PO issuance, broken down by category and site. Identifies bottlenecks in the approval pipeline.",
      icon: <Clock className="w-8 h-8 text-primary-600" />,
      tags: ["Performance", "SLA"]
    },
    {
      id: "RPT-002",
      title: "Spend by Category & Site",
      description: "Aggregated expenditure visualized by material/service category across different plant locations vs allocated budget.",
      icon: <PieChart className="w-8 h-8 text-accent-600" />,
      tags: ["Financial", "Budget"]
    },
    {
      id: "RPT-003",
      title: "Vendor Performance Scorecard",
      description: "Evaluates vendors based on delivery timeliness, GRN quality rejection rates, and responsiveness. Helps in annual vendor evaluations.",
      icon: <BarChart3 className="w-8 h-8 text-success" />,
      tags: ["Vendors", "Quality"]
    },
    {
      id: "RPT-004",
      title: "Savings & Negotiation Tracker",
      description: "Tracks cost savings achieved by procurement teams through negotiations against initial PR estimates.",
      icon: <TrendingDown className="w-8 h-8 text-primary-500" />,
      tags: ["Financial", "KPI"]
    },
    {
      id: "RPT-005",
      title: "MSME Compliance Report",
      description: "Tracks payment cycles to registered MSME vendors to ensure compliance with the 45-day SLA mandate.",
      icon: <Building2 className="w-8 h-8 text-warning-700" />,
      tags: ["Compliance", "Legal"]
    },
    {
      id: "RPT-006",
      title: "Purchase Order Variance Analysis",
      description: "Compares final invoiced amounts against original PO values to track unauthorized value enhancements.",
      icon: <LineChart className="w-8 h-8 text-danger" />,
      tags: ["Audit", "Financial"]
    }
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-20">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-bold text-primary-900 tracking-tight flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-primary-600" />
            Reports & Analytics
          </h1>
          <p className="text-sm text-text-secondary mt-1">Generate comprehensive insights into procurement operations, spend, and compliance.</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="h-9 px-4 bg-surface hover:bg-primary-50 text-primary-700 text-sm font-medium rounded-sm border border-primary-200 transition-colors shadow-sm focus:ring-1 focus:ring-primary-500 flex items-center gap-2">
            <Filter className="w-4 h-4" /> Global Filters
          </button>
          <button className="h-9 px-4 bg-primary-900 hover:bg-primary-800 text-white text-sm font-medium rounded-sm transition-colors shadow-sm focus:ring-1 focus:ring-accent-500 flex items-center gap-2">
            <Download className="w-4 h-4" /> Export Master Zip
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="enterprise-card p-4 flex flex-col sm:flex-row justify-between items-center gap-4 border-l-4 border-l-accent-500">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <label className="text-xs font-bold text-text-secondary uppercase tracking-wider">Timeframe:</label>
          <select 
            className="enterprise-input w-48 font-medium text-primary-900"
            value={timeframe}
            onChange={(e) => setTimeframe(e.target.value)}
          >
            <option>This Month (Mar 2026)</option>
            <option>Last Month (Feb 2026)</option>
            <option>This Quarter (Q4 FY26)</option>
            <option>Financial Year (FY25-26)</option>
            <option>Custom Range...</option>
          </select>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
           <label className="text-xs font-bold text-text-secondary uppercase tracking-wider">Site Context:</label>
           <select className="enterprise-input w-48 font-medium text-primary-900">
             <option>All Sites (Consolidated)</option>
             <option>Mumbai HO</option>
             <option>Pune Manufacturing</option>
             <option>Noida R&D</option>
           </select>
        </div>
      </div>

      {/* Reports Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {reports.map((report) => (
          <div key={report.id} className="enterprise-card flex flex-col group hover:border-primary-300 transition-colors">
            <div className="p-6 flex-1 flex flex-col">
              <div className="flex justify-between items-start mb-4">
                <div className="p-3 bg-primary-50 rounded-sm group-hover:bg-primary-100 transition-colors">
                  {report.icon}
                </div>
                <div className="flex flex-col gap-1 items-end">
                  {report.tags.map(tag => (
                    <span key={tag} className="inline-flex text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 border border-border bg-surface text-text-secondary rounded-sm">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              
              <h3 className="text-sm font-bold text-primary-900 mb-2 leading-tight group-hover:text-primary-700 transition-colors">
                {report.title}
              </h3>
              
              <p className="text-xs text-text-secondary leading-relaxed flex-1">
                {report.description}
              </p>
            </div>
            
            <div className="p-4 border-t border-border bg-primary-50/30 flex gap-2">
              <button className="flex-1 h-9 flex items-center justify-center gap-2 bg-primary-900 hover:bg-primary-800 text-white text-xs font-medium rounded-sm transition-colors shadow-sm">
                <BarChart3 className="w-4 h-4" /> Generate View
              </button>
              <button className="h-9 px-3 bg-surface border border-primary-200 text-primary-700 hover:bg-primary-50 rounded-sm transition-colors shadow-sm" title="Export to Excel">
                <FileSpreadsheet className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 space-y-2">
        <div className="bg-primary-50 border border-primary-200 text-primary-700 text-[11px] font-bold tracking-wide uppercase p-2 rounded-sm flex items-center justify-center text-center">
          ⚑ Data Governance: Reports display data strictly based on your role and site access permissions. — SOP §3.2
        </div>
      </div>
    </div>
  );
}
