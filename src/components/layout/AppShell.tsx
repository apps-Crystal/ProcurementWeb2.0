"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { AuthProvider } from "@/components/auth/AuthProvider";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuth = pathname.startsWith("/auth");

  if (isAuth) {
    return <>{children}</>;
  }

  return (
    <AuthProvider>
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0">
        <Header />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 bg-background custom-scrollbar">
          {children}
        </main>
      </div>
    </AuthProvider>
  );
}
