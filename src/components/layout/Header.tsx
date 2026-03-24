"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Search, Menu, LogOut, ChevronDown, User, ShieldAlert, RefreshCw } from "lucide-react";
import { useCurrentUser } from "@/components/auth/AuthProvider";

export function Header() {
  const { user } = useCurrentUser();
  const router   = useRouter();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut]     = useState(false);
  const [refreshing, setRefreshing]     = useState(false);

  const [searchQuery,   setSearchQuery]   = useState("");
  const [searchResults, setSearchResults] = useState<{ id: string; label: string; sublabel: string; type: string; href: string }[]>([]);
  const [searchOpen,    setSearchOpen]    = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);

  async function handleSearch(val: string) {
    setSearchQuery(val);
    if (val.trim().length < 2) { setSearchResults([]); setSearchOpen(false); return; }
    setSearchLoading(true);
    try {
      const res  = await fetch(`/api/search?q=${encodeURIComponent(val)}&limit=10`);
      const data = await res.json();
      setSearchResults(data.results ?? []);
      setSearchOpen(true);
    } catch {
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") { setSearchOpen(false); setSearchQuery(""); }
    if (e.key === "Enter" && searchResults.length > 0) {
      router.push(searchResults[0].href);
      setSearchOpen(false);
      setSearchQuery("");
    }
  }

  async function handleLogout() {
    setLoggingOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/auth/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-10 flex h-14 w-full items-center justify-between border-b border-border bg-surface px-4 shadow-sm">
      <div className="flex items-center gap-4">
        <button className="md:hidden text-text-secondary hover:text-text-primary">
          <Menu className="h-5 w-5" />
        </button>

        <div className="hidden md:flex items-center gap-2">
          <span className="text-sm font-medium px-2 py-0.5 bg-primary-50 text-primary-700 border border-primary-200 rounded-sm">
            {user?.site ?? "—"}
          </span>
          <span className="text-sm font-medium px-2 py-0.5 bg-success/10 text-success border border-success/20 rounded-sm flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-success" />
            System Online
          </span>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-end gap-4">
        <div className="relative hidden max-w-md flex-1 md:block">
          <div className="relative flex items-center">
            <Search className="absolute left-2.5 h-4 w-4 text-text-secondary" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              onFocus={() => searchResults.length > 0 && setSearchOpen(true)}
              onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
              placeholder="Search POs, Invoices, PRs..."
              className="peer h-8 w-full rounded-sm border border-border bg-background pl-9 pr-14 text-sm shadow-sm transition-colors focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
            {searchLoading && (
              <div className="absolute right-10 text-[10px] text-text-secondary animate-pulse">…</div>
            )}
            <div className="absolute right-2 flex items-center pointer-events-none text-[10px] text-text-secondary font-mono border border-border px-1 rounded-sm bg-surface">
              Ctrl K
            </div>
          </div>

          {/* Dropdown results */}
          {searchOpen && searchResults.length > 0 && (
            <div className="absolute top-full left-0 mt-1 w-full bg-surface border border-border rounded-sm shadow-lg z-50 py-1 max-h-72 overflow-y-auto">
              {searchResults.map((r) => (
                <button
                  key={r.id}
                  onMouseDown={() => { router.push(r.href); setSearchOpen(false); setSearchQuery(""); }}
                  className="w-full text-left px-3 py-2 hover:bg-primary-50 flex flex-col gap-0.5 border-b border-border last:border-0"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-sm bg-primary-100 text-primary-700 shrink-0">{r.type}</span>
                    <span className="text-xs font-semibold text-text-primary truncate">{r.label}</span>
                  </div>
                  <span className="text-[11px] text-text-secondary pl-7 truncate">{r.sublabel}</span>
                </button>
              ))}
            </div>
          )}

          {searchOpen && searchQuery.length >= 2 && searchResults.length === 0 && !searchLoading && (
            <div className="absolute top-full left-0 mt-1 w-full bg-surface border border-border rounded-sm shadow-lg z-50 py-3 text-center text-xs text-text-secondary">
              No results found for &quot;{searchQuery}&quot;
            </div>
          )}
        </div>

        <button
          onClick={() => {
            setRefreshing(true);
            window.location.reload();
          }}
          disabled={refreshing}
          title="Refresh page data"
          className="text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-5 w-5 ${refreshing ? "animate-spin" : ""}`} />
        </button>

        <button className="relative text-text-secondary hover:text-text-primary transition-colors">
          <Bell className="h-5 w-5" />
          <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-danger text-[9px] font-bold text-white border-2 border-surface">
            3
          </span>
        </button>

        {/* User menu */}
        <div className="relative">
          <button
            onClick={() => setUserMenuOpen((o) => !o)}
            className="flex items-center gap-2 h-8 px-2 rounded-sm hover:bg-primary-50 border border-transparent hover:border-border transition-colors text-sm"
          >
            <div className="w-6 h-6 rounded-full bg-primary-700 text-white flex items-center justify-center text-[10px] font-bold shrink-0">
              {user?.name?.charAt(0)?.toUpperCase() ?? <User className="w-3 h-3" />}
            </div>
            <div className="hidden md:block text-left">
              <div className="text-xs font-semibold text-text-primary leading-none">{user?.name ?? "Loading…"}</div>
              <div className="text-[10px] text-text-secondary leading-none mt-0.5">{user?.role ?? ""}</div>
            </div>
            <ChevronDown className="w-3 h-3 text-text-secondary" />
          </button>

          {userMenuOpen && (
            <>
              {/* Backdrop */}
              <div
                className="fixed inset-0 z-10"
                onClick={() => setUserMenuOpen(false)}
              />
              <div className="absolute right-0 top-full mt-1 w-56 bg-surface border border-border rounded-sm shadow-lg z-20 py-1">
                <div className="px-3 py-2 border-b border-border">
                  <p className="text-xs font-semibold text-text-primary">{user?.name}</p>
                  <p className="text-[11px] text-text-secondary">{user?.email}</p>
                  <div className="flex items-center gap-1 mt-1">
                    <ShieldAlert className="w-3 h-3 text-primary-500" />
                    <span className="text-[10px] text-primary-600 font-medium">{user?.role}</span>
                  </div>
                </div>
                <button
                  onClick={handleLogout}
                  disabled={loggingOut}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-danger hover:bg-danger/10 transition-colors disabled:opacity-50"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  {loggingOut ? "Signing out…" : "Sign Out"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
