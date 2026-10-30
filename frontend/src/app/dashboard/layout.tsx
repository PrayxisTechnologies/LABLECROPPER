"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { useAuth } from "@/lib/auth-context";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, isAuthenticated } = useAuth();

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.push("/login");
    }
  }, [loading, isAuthenticated, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-navy-950 text-slate-900 dark:text-white transition-colors duration-200">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center space-y-3">
            <div className="w-8 h-8 border-2 border-cyan-neon border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-slate-500 dark:text-slate-400">Loading your seller dashboard...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return null;
  }

  const tabs = [
    { label: "Overview", href: "/dashboard" },
    { label: "Personal SKUs", href: "/dashboard/skus" },
    { label: "Master Sheet", href: "/dashboard/master-sheet" },
    { label: "Processing History", href: "/dashboard/history" },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-navy-950 text-slate-900 dark:text-white transition-colors duration-200">
      <Header />

      {/* Dashboard Sub-Header / Navigation Tabs */}
      <div className="border-b border-slate-200 dark:border-navy-800 bg-white/80 dark:bg-navy-900/60 backdrop-blur-sm px-4 sm:px-8 py-3 transition-colors">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center space-x-3">
            {user.google_picture ? (
              <img
                src={user.google_picture}
                alt={user.name || "User Avatar"}
                className="w-9 h-9 rounded-xl object-cover border border-cyan-neon/30"
              />
            ) : (
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-neon/20 to-purple-brand/20 border border-cyan-neon/30 flex items-center justify-center text-cyan-600 dark:text-cyan-neon font-bold text-sm">
                {(user.name || user.email)[0].toUpperCase()}
              </div>
            )}
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-sm font-bold text-slate-900 dark:text-white leading-tight">
                  {user.name || "Seller Dashboard"}
                </h2>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">{user.email}</p>
            </div>
          </div>

          <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 sm:pb-0">
            {tabs.map((tab) => {
              const active =
                tab.href === "/dashboard"
                  ? pathname === "/dashboard"
                  : pathname.startsWith(tab.href);
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-all ${
                    active
                      ? "bg-cyan-50 dark:bg-cyan-neon/15 text-cyan-600 dark:text-cyan-neon border border-cyan-300 dark:border-cyan-neon/30 shadow-[0_0_12px_rgba(0,209,255,0.1)]"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-navy-800"
                  }`}
                >
                  {tab.label}
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 py-6">
        {children}
      </main>
    </div>
  );
}
