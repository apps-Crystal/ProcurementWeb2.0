"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  ShoppingCart,
  PackageCheck,
  Receipt,
  CreditCard,
  Flag,
  Users,
  BarChart3,
  History,
  LogOut,
  ChevronDown,
  ChevronLeft,
  Menu,
  ClipboardCheck,
} from "lucide-react";
import { useCurrentUser } from "@/components/auth/AuthProvider";
import { useState } from "react";

const navItems = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard, roles: ["All"] },
  {
    name: "Purchase Requests",
    icon: FileText,
    roles: ["Requestor", "Procurement_Team", "Designated_Approver", "Management"],
    children: [
      { name: "New MPR (F1)", href: "/pr/mpr/new" },
      { name: "New SPR (F2)", href: "/pr/spr/new" },
      { name: "My Requests", href: "/pr/list" },
    ]
  },
  {
    name: "PR Approvals",
    icon: ClipboardCheck,
    roles: ["System_Admin", "Procurement_Head"],
    children: [
      { name: "Pending Approvals", href: "/pr/approvals" },
    ]
  },
  {
    name: "Purchase Orders",
    icon: ShoppingCart,
    roles: ["Procurement_Team", "Management", "Accounts", "System_Admin", "Procurement_Head"],
    children: [
      { name: "PO Pending Queue", href: "/po/pending" },
      { name: "Open POs", href: "/po/open" },
      { name: "PO Amendment", href: "/po/amend" },
    ]
  },
  {
    name: "GRN / SRN",
    icon: PackageCheck,
    roles: ["Warehouse", "Site_Head", "Procurement_Team"],
    children: [
      { name: "New GRN (F4)", href: "/receipts/grn/new" },
      { name: "New SRN (F5)", href: "/receipts/srn/new" },
      { name: "Non-PO Purchase (F6)", href: "/receipts/non-po/new" },
    ]
  },
  {
    name: "Invoices",
    icon: Receipt,
    roles: ["Accounts", "Procurement_Team", "Management"],
    children: [
      { name: "Upload Invoice", href: "/invoices/upload" },
      { name: "Three-Way Match", href: "/invoices/match" },
    ]
  },
  {
    name: "Payments",
    icon: CreditCard,
    roles: ["Accounts", "Finance", "Management"],
    children: [
      { name: "Payment Queue", href: "/payments/queue" },
      { name: "Payment History", href: "/payments/history" },
    ]
  },
  { name: "Flags & Disputes", href: "/flags", icon: Flag, roles: ["Site_Head", "Accounts", "Management"] },
  {
    name: "Vendors",
    icon: Users,
    roles: ["Procurement_Team", "Management"],
    children: [
      { name: "Vendor List", href: "/vendors" },
      { name: "Register New (F7)", href: "/vendors/new" },
    ]
  },
  { name: "Reports", href: "/reports", icon: BarChart3, roles: ["Management", "Procurement_Team", "Accounts", "Finance"] },
  { name: "Audit Log", href: "/audit", icon: History, roles: ["Management", "Finance"] },
];

export function Sidebar() {
  const pathname    = usePathname();
  const router      = useRouter();
  const { user }    = useCurrentUser();
  const [loggingOut, setLoggingOut] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const role = user?.role ?? "";

  const canAccess = (roles: string[]) =>
    roles.includes("All") || roles.includes(role) || role === "System_Admin";

  async function handleLogout() {
    setLoggingOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/auth/login");
    router.refresh();
  }

  return (
    <div className={`flex flex-col bg-primary-900 border-r border-primary-800 text-white shadow-xl h-screen sticky top-0 transition-all duration-300 z-50 ${isCollapsed ? 'w-16' : 'w-60'}`}>
      <div className={`flex h-14 items-center border-b border-primary-800 bg-primary-900 shadow-sm ${isCollapsed ? 'justify-center' : 'justify-between px-4'}`}>
        {!isCollapsed && (
          <div className="flex items-center gap-2 font-bold text-lg tracking-tight overflow-hidden whitespace-nowrap">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <div className="w-7 h-7 rounded flex-shrink-0 flex items-center justify-center" style={{ background: "#1a3a6b" }}>
              <img src="/logo.png" alt="Crystal Procure" width={22} height={22} style={{ objectFit: "contain" }} />
            </div>
            <span className="truncate">Crystal Procure</span>
          </div>
        )}
        <button 
          onClick={() => setIsCollapsed(!isCollapsed)} 
          className="p-1.5 hover:bg-primary-800 rounded text-primary-300 hover:text-white transition-colors flex-shrink-0"
          title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isCollapsed ? <Menu className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-4 px-2 custom-scrollbar overflow-x-hidden">
        <nav className="space-y-1">
          {navItems.filter(item => canAccess(item.roles)).map((item) => {
            const isActive = item.href ? pathname === item.href : pathname.startsWith(`/${item.name.toLowerCase().split(' ')[0]}`);
            
            return (
              <div key={item.name} className="flex flex-col relative group/navitem">
                {item.href ? (
                  <Link
                    href={item.href}
                    title={item.name}
                    className={`group flex items-center py-2 text-sm font-medium rounded-sm transition-colors ${
                      isCollapsed ? "justify-center px-0" : "px-2"
                    } ${
                      isActive 
                        ? (isCollapsed ? "bg-primary-800 text-accent-400" : "bg-primary-800 text-accent-400 border-l-2 border-accent-500") 
                        : (isCollapsed ? "text-primary-100 hover:bg-primary-800 hover:text-white" : "text-primary-100 hover:bg-primary-800 hover:text-white border-l-2 border-transparent")
                    }`}
                  >
                    <item.icon className={`h-5 w-5 flex-shrink-0 ${isCollapsed ? '' : 'mr-3'} ${isActive ? 'text-accent-500' : 'text-primary-300 group-hover:text-primary-100'}`} />
                    {!isCollapsed && <span className="truncate">{item.name}</span>}
                  </Link>
                ) : (
                  <div className="mb-1">
                    <div 
                      onClick={() => isCollapsed ? setIsCollapsed(false) : null}
                      title={item.name}
                      className={`group flex items-center py-2 text-sm font-medium rounded-sm text-primary-100 hover:bg-primary-800 hover:text-white cursor-pointer ${
                        isCollapsed ? "justify-center px-0" : "justify-between px-2"
                      }`}
                    >
                      <div className="flex items-center min-w-0">
                         <item.icon className={`h-5 w-5 flex-shrink-0 text-primary-300 group-hover:text-primary-100 ${isCollapsed ? '' : 'mr-3'}`} />
                         {!isCollapsed && <span className="truncate">{item.name}</span>}
                      </div>
                      {!isCollapsed && <ChevronDown className="h-4 w-4 opacity-50 flex-shrink-0" />}
                    </div>
                    {!isCollapsed && item.children && (
                      <div className="mt-1 space-y-1 pl-9">
                        {item.children.map((child) => {
                          const isChildActive = pathname === child.href;
                          return (
                            <Link
                              key={child.name}
                              href={child.href}
                              title={child.name}
                              className={`group flex items-center px-2 py-1.5 text-xs font-medium rounded-sm transition-colors ${
                                isChildActive
                                  ? "text-accent-400 font-semibold"
                                  : "text-primary-200 hover:text-white hover:bg-primary-800/50"
                              }`}
                            >
                              <span className="truncate">{child.name}</span>
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
                {/* Floating tooltip when collapsed */}
                {isCollapsed && (
                  <div className="absolute left-14 top-1 hidden group-hover/navitem:block bg-primary-800 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-[60] shadow-lg border border-primary-700">
                    {item.name}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </div>

      <div className={`p-4 border-t border-primary-800 bg-primary-900/50 ${isCollapsed ? 'flex flex-col items-center px-2' : ''}`}>
        <div className={`flex items-center gap-3 mb-3 w-full ${isCollapsed ? 'justify-center' : ''}`}>
          <div 
            title={user?.name ?? ""}
            className="w-8 h-8 rounded-full bg-primary-700 flex items-center justify-center border border-primary-600 shadow-sm text-xs font-bold text-accent-100 flex-shrink-0"
          >
            {user?.name?.charAt(0)?.toUpperCase() ?? "?"}
          </div>
          {!isCollapsed && (
            <div className="flex flex-col flex-1 min-w-0">
              <span className="text-sm font-medium text-white leading-tight truncate">
                {user?.name ?? "Loading…"}
              </span>
              <span className="text-xs text-accent-400 leading-tight truncate">
                {user?.role?.replace(/_/g, " ") ?? ""}
              </span>
            </div>
          )}
        </div>
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          title="Sign out"
          className={`flex w-full items-center py-1.5 text-xs font-medium text-primary-200 hover:text-white hover:bg-primary-800 rounded-sm transition-colors disabled:opacity-50 ${isCollapsed ? 'justify-center px-0' : 'px-2'}`}
        >
          <LogOut className={`h-4 w-4 flex-shrink-0 ${isCollapsed ? '' : 'mr-2'}`} />
          {!isCollapsed && <span className="truncate">{loggingOut ? "Signing out…" : "Sign out"}</span>}
        </button>
      </div>
    </div>
  );
}
