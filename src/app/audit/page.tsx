"use client";

import { 
  History,
  Search,
  Filter,
  Download,
  Shield,
  Clock,
  User,
  Activity,
  ChevronRight
} from "lucide-react";

const getActionColor = (action: string) => {
  switch (action) {
    case "APPROVE": return "bg-success/10 text-success border-success/20";
    case "REJECT": return "bg-danger/10 text-danger border-danger/20";
    case "CREATE": return "bg-primary-50 text-primary-700 border-primary-200";
    case "UPDATE": return "bg-warning/10 text-warning-700 border-warning/20";
    case "LOGIN": return "bg-surface text-text-secondary border-border";
    case "OVERRIDE": return "bg-accent-500/20 text-accent-700 border-accent-500/50 font-bold";
    default: return "bg-surface text-text-secondary border-border";
  }
};

export default function AuditLog() {
  const auditData = [
    { id: "LOG-99201", timestamp: "2026-03-12 14:30:22", user: "R. Sharma", role: "Site_Head", action: "APPROVE", entity: "PR-2503-0102", ip: "192.168.1.45", details: "L1 Approval granted. Cost center: CC-045" },
    { id: "LOG-99200", timestamp: "2026-03-12 14:15:05", user: "System", role: "Worker", action: "UPDATE", entity: "PO-2502-044", ip: "Internal", details: "SLA Tracker triggered Warning email to Vendor." },
    { id: "LOG-99199", timestamp: "2026-03-12 11:42:19", user: "A. Patel", role: "Management", action: "OVERRIDE", entity: "INV-0992", ip: "10.0.0.12", details: "Forced match approval on 18% variance. Reason: Emergency dispatch." },
    { id: "LOG-99198", timestamp: "2026-03-12 10:05:44", user: "J. Doe", role: "Procurement", action: "CREATE", entity: "PO-2503-015", ip: "192.168.1.88", details: "Generated PO from PR-2503-0095. Vendor: V-042" },
    { id: "LOG-99197", timestamp: "2026-03-12 09:12:01", user: "K. Singh", role: "Warehouse", action: "REJECT", entity: "GRN-2503-011", ip: "192.168.2.14", details: "Rejected delivery - material damaged in transit." },
    { id: "LOG-99196", timestamp: "2026-03-12 08:30:00", user: "J. Doe", role: "Procurement", action: "LOGIN", entity: "Session", ip: "192.168.1.88", details: "Successful authentication via SSO." },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-bold text-primary-900 tracking-tight flex items-center gap-2">
            <Shield className="w-6 h-6 text-primary-600" />
            System Audit Log
          </h1>
          <p className="text-sm text-text-secondary mt-1">Immutable record of all system activities as per SOP-PROC-001 compliance.</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="h-9 px-4 bg-surface hover:bg-primary-50 text-primary-700 text-sm font-medium rounded-sm border border-primary-200 transition-colors shadow-sm focus:ring-1 focus:ring-primary-500 flex items-center gap-2">
            <Download className="w-4 h-4" /> Export CSV
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="enterprise-card flex flex-col min-h-[600px]">
        
        {/* Toolbar */}
        <div className="p-4 border-b border-border bg-primary-50/30 grid grid-cols-1 md:grid-cols-4 gap-4">
          
          <div className="relative md:col-span-2">
            <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-text-secondary" />
            <input type="text" placeholder="Search by User, Entity ID, or Keyword..." className="enterprise-input pl-8 w-full" />
          </div>
          
          <div>
            <select className="enterprise-input">
              <option value="">All Actions</option>
              <option value="APPROVE">Approve</option>
              <option value="REJECT">Reject</option>
              <option value="CREATE">Create</option>
              <option value="UPDATE">Update</option>
              <option value="OVERRIDE">Override</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
             <input type="date" className="enterprise-input w-full" />
             <button className="h-9 px-3 bg-primary-900 text-white hover:bg-primary-800 rounded-sm transition-colors shadow-sm focus:ring-1 focus:ring-accent-500 flex items-center justify-center shrink-0">
               <Filter className="w-4 h-4" />
             </button>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-x-auto bg-surface p-0">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="text-[11px] text-text-secondary bg-surface sticky top-0 border-b border-border uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3 font-semibold w-40">Timestamp</th>
                <th className="px-4 py-3 font-semibold w-32">Action</th>
                <th className="px-4 py-3 font-semibold w-48">User & Role</th>
                <th className="px-4 py-3 font-semibold w-32">Target Entity</th>
                <th className="px-4 py-3 font-semibold w-32">IP Source</th>
                <th className="px-4 py-3 font-semibold w-full">Detailed Trace</th>
                <th className="px-4 py-3 font-semibold w-10 text-center"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {auditData.map((log) => (
                <tr key={log.id} className="hover:bg-primary-50/30 transition-colors group cursor-pointer font-mono text-xs">
                  <td className="px-4 py-3 text-text-secondary whitespace-nowrap flex items-center gap-1.5">
                    <Clock className="w-3 h-3" />
                    {log.timestamp}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 border rounded-sm tracking-wider font-semibold ${getActionColor(log.action)}`}>
                      {log.action}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col">
                      <span className="font-bold text-primary-900 font-sans tracking-tight">{log.user}</span>
                      <span className="text-[10px] text-text-secondary font-sans">{log.role}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-bold text-primary-700 bg-primary-50 px-1.5 py-0.5 rounded-sm border border-primary-100">
                      {log.entity}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {log.ip}
                  </td>
                  <td className="px-4 py-3 text-text-primary whitespace-normal max-w-[400px]">
                    <div className="flex items-start gap-2">
                      <Activity className="w-3.5 h-3.5 text-text-secondary mt-0.5 shrink-0" />
                      <span className="font-sans leading-relaxed">{log.details}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button className="text-primary-400 hover:text-primary-900 transition-colors p-1">
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {/* Footer info */}
        <div className="p-3 border-t border-border bg-primary-50/30 text-xs text-text-secondary flex justify-between items-center">
           <span>Showing 6 of 8,492 log entries.</span>
           <div className="flex items-center gap-4">
             <button className="text-primary-700 font-medium hover:underline">Previous</button>
             <span>Page 1 of 1,416</span>
             <button className="text-primary-700 font-medium hover:underline">Next</button>
           </div>
        </div>
      </div>
    </div>
  );
}
