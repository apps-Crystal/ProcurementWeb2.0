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
  Lock,
  ChevronRight,
  ShieldCheck,
} from "lucide-react";
import { fmtDate } from "@/lib/utils";
import { useCurrentUser } from "@/components/auth/AuthProvider";

type User = Record<string, string>;

const STATUS_TABS = [
  { label: "All",      value: "" },
  { label: "Active",   value: "ACTIVE" },
  { label: "Inactive", value: "INACTIVE" },
  { label: "Locked",   value: "LOCKED" },
];

const ROLES = [
  "System_Admin", "Procurement_Head", "Procurement_Team",
  "Accounts", "Finance", "Management", "Requestor",
  "Warehouse", "Site_Head", "Designated_Approver",
];

const ROLE_COLORS: Record<string, string> = {
  System_Admin:       "bg-purple-100 text-purple-800 border-purple-200",
  Procurement_Head:   "bg-blue-100 text-blue-800 border-blue-200",
  Procurement_Team:   "bg-sky-100 text-sky-800 border-sky-200",
  Accounts:           "bg-amber-100 text-amber-800 border-amber-200",
  Finance:            "bg-green-100 text-green-800 border-green-200",
  Management:         "bg-indigo-100 text-indigo-800 border-indigo-200",
  Requestor:          "bg-gray-100 text-gray-800 border-gray-200",
  Warehouse:          "bg-orange-100 text-orange-800 border-orange-200",
  Site_Head:          "bg-teal-100 text-teal-800 border-teal-200",
  Designated_Approver:"bg-rose-100 text-rose-800 border-rose-200",
};

function StatusBadge({ user }: { user: User }) {
  if (user.ACCOUNT_LOCKED === "Y")
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-700 border border-red-200">
        <Lock className="w-3 h-3" /> Locked
      </span>
    );
  if (user.STATUS === "ACTIVE")
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-green-100 text-green-800 border border-green-200">
        <CheckCircle2 className="w-3 h-3" /> Active
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-gray-100 text-gray-600 border border-gray-200">
      <XCircle className="w-3 h-3" /> Inactive
    </span>
  );
}

function RoleBadge({ role }: { role: string }) {
  const cls = ROLE_COLORS[role] ?? "bg-gray-100 text-gray-700 border-gray-200";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border ${cls}`}>
      {role.replace(/_/g, " ")}
    </span>
  );
}

export default function AdminUsersPage() {
  const { user: me } = useCurrentUser();
  const [users, setUsers]     = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState("");
  const [activeTab, setActiveTab] = useState("");
  const [roleFilter, setRoleFilter] = useState("");

  useEffect(() => {
    fetch("/api/admin/users")
      .then((r) => r.json())
      .then((d) => setUsers(d.users ?? []))
      .catch(() => setUsers([]))
      .finally(() => setLoading(false));
  }, []);

  if (me && me.role !== "System_Admin") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-text-secondary">
        <ShieldCheck className="w-12 h-12 opacity-30" />
        <p className="text-sm font-medium">Access restricted to System Admins only.</p>
      </div>
    );
  }

  const tabCounts: Record<string, number> = { "": users.length };
  STATUS_TABS.slice(1).forEach((t) => {
    tabCounts[t.value] = users.filter((u) =>
      t.value === "LOCKED" ? u.ACCOUNT_LOCKED === "Y" : u.STATUS === t.value && u.ACCOUNT_LOCKED !== "Y"
    ).length;
  });

  const filtered = users.filter((u) => {
    const matchTab =
      !activeTab ||
      (activeTab === "LOCKED"
        ? u.ACCOUNT_LOCKED === "Y"
        : u.STATUS === activeTab && u.ACCOUNT_LOCKED !== "Y");
    const matchRole = !roleFilter || u.ROLE === roleFilter;
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      (u.FULL_NAME ?? "").toLowerCase().includes(q) ||
      (u.EMAIL ?? "").toLowerCase().includes(q) ||
      (u.USER_ID ?? "").toLowerCase().includes(q);
    return matchTab && matchRole && matchSearch;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-bold text-primary-900 tracking-tight flex items-center gap-2">
            <Users className="w-6 h-6 text-primary-600" /> User Management
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Create users, assign roles, and manage account access.
          </p>
        </div>
        <Link
          href="/admin/users/new"
          className="inline-flex items-center gap-2 h-9 px-4 bg-primary-900 hover:bg-primary-800 text-white text-sm font-medium rounded-sm border border-primary-950 shadow-sm transition-colors"
        >
          <Plus className="w-4 h-4" /> Create User
        </Link>
      </div>

      {/* Status tabs */}
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
              {tabCounts[tab.value] ?? 0}
            </span>
          </button>
        ))}
      </div>

      {/* Search + Role filter */}
      <div className="flex flex-col sm:flex-row gap-2 max-w-2xl">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
          <input
            type="text"
            placeholder="Search by name, email, or user ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="enterprise-input pl-8 w-full"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="enterprise-input w-auto"
        >
          <option value="">All Roles</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>{r.replace(/_/g, " ")}</option>
          ))}
        </select>
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
            <p className="text-sm font-medium">No users found</p>
            {(search || roleFilter) && (
              <button
                onClick={() => { setSearch(""); setRoleFilter(""); }}
                className="text-xs text-primary-600 underline"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-primary-50/60">
                <tr>
                  {["User ID", "Name", "Email", "Role", "Site", "Status", "Last Login", "Actions"].map((h) => (
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
                {filtered.map((u) => (
                  <tr key={u.USER_ID} className="hover:bg-primary-50/40 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-primary-700 whitespace-nowrap">
                      {u.USER_ID}
                    </td>
                    <td className="px-4 py-3 font-medium text-primary-900 max-w-[180px] truncate">
                      {u.FULL_NAME}
                    </td>
                    <td className="px-4 py-3 text-xs text-text-secondary max-w-[200px] truncate">
                      {u.EMAIL}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <RoleBadge role={u.ROLE} />
                    </td>
                    <td className="px-4 py-3 text-xs text-text-secondary whitespace-nowrap">
                      {u.SITE || "—"}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <StatusBadge user={u} />
                    </td>
                    <td className="px-4 py-3 text-xs text-text-secondary whitespace-nowrap">
                      {fmtDate(u.LAST_LOGIN_DATE)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Link
                        href={`/admin/users/${u.USER_ID}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-primary-700 border border-primary-200 rounded-sm hover:bg-primary-50 hover:border-primary-400 transition-colors"
                      >
                        Edit <ChevronRight className="w-3.5 h-3.5" />
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
        Showing {filtered.length} of {users.length} users
      </p>
    </div>
  );
}
