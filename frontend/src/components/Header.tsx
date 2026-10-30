"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-context";
import { QuickLabelSearchModal } from "@/components/QuickLabelSearchModal";
import { ExtensionDownloadModal } from "@/components/ExtensionDownloadModal";

interface HeaderProps {
  backendOnline?: boolean | null;
  backendVersion?: string;
}

export const Header: React.FC<HeaderProps> = () => {
  const pathname = usePathname();
  const { user, isAuthenticated, logout } = useAuth();
  const { resolvedTheme, toggleTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [extensionModalOpen, setExtensionModalOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Clean navigation links with SEO-friendly targets
  const navLinks = [
    { label: "Home", href: "/" },
    { label: "Meesho", href: "/meesho-label-cropper" },
    { label: "Flipkart", href: "/flipkart-label-cropper" },
    { label: "Snapdeal", href: "/snapdeal-label-cropper" },
    { label: "Amazon", href: "/amazon" },
    { label: "Myntra", href: "/myntra" },
    { label: "SKU Rules", href: "/dashboard/skus" },
    { label: "Blogs & Guides", href: "/blogs" },
  ];

  const isActive = (href: string) => {
    if (href === "/") {
      return pathname === "/";
    }
    return pathname.startsWith(href);
  };

  return (
    <header className="sticky top-0 z-50 w-full transition-colors duration-200 border-b dark:border-navy-700/60 border-slate-200/80 bg-white/90 dark:bg-[#07111F]/90 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        
        {/* Left: Brand Logo & Title */}
        <Link
          href="/"
          className="flex items-center space-x-2.5 sm:space-x-3 group flex-shrink-0 transition-transform active:scale-98"
        >
          {/* Official Prayxis Logo */}
          <div className="relative w-9 h-9 sm:w-10 sm:h-10 rounded-xl overflow-hidden p-0.5 bg-gradient-to-tr from-cyan-neon via-purple-brand to-cyan-400 shadow-[0_0_12px_rgba(0,209,255,0.3)] group-hover:shadow-[0_0_18px_rgba(0,209,255,0.55)] transition-all flex-shrink-0">
            <div className="w-full h-full rounded-[10px] overflow-hidden bg-navy-950 flex items-center justify-center">
              <img
                src="/api/logo"
                alt="LabelFlow Official Logo"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                onError={(e) => {
                  const img = e.currentTarget;
                  if (img.src.indexOf("/api/logo") !== -1) {
                    img.src = "/logo.png";
                  }
                }}
              />
            </div>
          </div>

          <div className="flex flex-col">
            <div className="flex items-center space-x-1.5">
              <span className="text-base sm:text-lg font-black tracking-tight text-slate-900 dark:text-white leading-tight">
                Label<span className="text-cyan-500 dark:text-cyan-neon">Flow</span>
              </span>
            </div>
            <span className="text-[9px] sm:text-[10px] text-slate-500 dark:text-slate-400 font-medium tracking-wide leading-none">
              by Prayxis
            </span>
          </div>
        </Link>

        {/* Center: Clean Navigation Links with vertical dot dividers ⋮ */}
        <nav className="hidden lg:flex items-center space-x-2 sm:space-x-2.5 py-1">
          {navLinks.map((link, idx) => {
            const active = isActive(link.href);
            const isLast = idx === navLinks.length - 1;

            return (
              <React.Fragment key={link.href}>
                <Link
                  href={link.href}
                  className={`text-sm font-semibold transition-all duration-150 px-2 py-1 rounded-md ${
                    active
                      ? "text-cyan-600 dark:text-cyan-neon font-bold drop-shadow-[0_0_8px_rgba(0,209,255,0.35)]"
                      : "text-slate-600 dark:text-slate-300 hover:text-cyan-600 dark:hover:text-cyan-neon hover:bg-slate-100/70 dark:hover:bg-navy-800/50"
                  }`}
                >
                  {link.label}
                </Link>

                {!isLast && (
                  <span
                    aria-hidden="true"
                    className="text-slate-300 dark:text-slate-700 select-none text-xs font-bold px-0.5"
                  >
                    ⋮
                  </span>
                )}
              </React.Fragment>
            );
          })}
        </nav>

        {/* Right Section: Sign In FIRST, then Theme Toggle (Clean & No Register Button / No Offline Badge) */}
        <div className="flex items-center space-x-3 flex-shrink-0">
          
          {/* 1. Sign In (or Authenticated User Profile) */}
          {mounted && isAuthenticated && user ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                className="flex items-center space-x-2 px-2.5 py-1.5 rounded-xl border text-xs font-semibold bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-800 dark:bg-navy-800/90 dark:border-navy-700 dark:text-slate-200 dark:hover:bg-navy-750 transition-colors"
              >
                {user.google_picture ? (
                  <img
                    src={user.google_picture}
                    alt={user.name || "User Avatar"}
                    className="w-5 h-5 rounded-full object-cover shrink-0"
                  />
                ) : (
                  <span className="w-2 h-2 rounded-full bg-cyan-neon shadow-[0_0_8px_rgba(0,209,255,0.8)]" />
                )}
                <span className="max-w-[120px] truncate">
                  {user.name || user.email.split("@")[0]}
                </span>
                <svg
                  className={`w-3.5 h-3.5 text-slate-400 transition-transform ${
                    userDropdownOpen ? "rotate-180" : ""
                  }`}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {/* Dropdown Menu */}
              {userDropdownOpen && (
                <div
                  className="absolute right-0 mt-2 w-48 rounded-xl shadow-xl border py-1.5 z-50 bg-white border-slate-200 dark:bg-navy-850 dark:border-navy-700 animate-in fade-in slide-in-from-top-2 duration-150"
                  onMouseLeave={() => setUserDropdownOpen(false)}
                >
                  <div className="px-3 py-1.5 border-b border-slate-100 dark:border-navy-700/60">
                    <p className="text-[11px] text-slate-400 truncate">{user.email}</p>
                  </div>
                  <Link
                    href="/dashboard"
                    onClick={() => setUserDropdownOpen(false)}
                    className="block px-3 py-1.5 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-navy-750"
                  >
                    Dashboard
                  </Link>
                  <Link
                    href="/dashboard/skus"
                    onClick={() => setUserDropdownOpen(false)}
                    className="block px-3 py-1.5 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-navy-750"
                  >
                    My SKUs Database
                  </Link>
                  <Link
                    href="/dashboard/master-sheet"
                    onClick={() => setUserDropdownOpen(false)}
                    className="block px-3 py-1.5 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-navy-750 flex items-center justify-between"
                  >
                    <span>Master Label Sheet</span>
                    <span className="text-[10px] text-cyan-neon font-bold">New</span>
                  </Link>
                  <Link
                    href="/dashboard/history"
                    onClick={() => setUserDropdownOpen(false)}
                    className="block px-3 py-1.5 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-navy-750"
                  >
                    Processing History
                  </Link>
                  <div className="border-t border-slate-100 dark:border-navy-700/60 my-1" />
                  <button
                    type="button"
                    onClick={() => {
                      setUserDropdownOpen(false);
                      logout();
                    }}
                    className="w-full text-left px-3 py-1.5 text-xs text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 font-semibold"
                  >
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link
              href="/login"
              className="text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-200 hover:text-cyan-600 dark:hover:text-cyan-neon px-3 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-navy-800/70 transition-colors"
            >
              Sign In
            </Link>
          )}

          {/* Extension Download Button */}
          <button
            type="button"
            onClick={() => setExtensionModalOpen(true)}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all duration-150 bg-gradient-to-r from-cyan-500/10 to-indigo-500/10 border-cyan-400/40 dark:border-cyan-neon/30 text-cyan-600 dark:text-cyan-neon hover:bg-cyan-500/20 active:scale-95 shadow-sm cursor-pointer"
            title="Download Chrome Extension (100% Free)"
          >
            <span className="text-sm">⚡</span>
            <span className="hidden sm:inline">Extension</span>
          </button>

          {/* Quick Search Button */}
          <button
            type="button"
            onClick={() => setSearchModalOpen(true)}
            title="Search labels by Order ID, WBL, or SKU"
            aria-label="Quick search labels"
            className="p-2 rounded-xl border transition-all duration-200 flex items-center justify-center bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700 dark:bg-navy-800/90 dark:border-navy-700 dark:text-cyan-400 dark:hover:border-cyan-neon/50 active:scale-95"
          >
            <svg className="w-4 h-4 text-cyan-600 dark:text-cyan-neon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </button>

          {/* 2. Dark / Bright Mode Toggle placed AFTER Sign In */}
          <button
            type="button"
            onClick={toggleTheme}
            title={`Active: ${resolvedTheme === "dark" ? "Dark Mode" : "Bright Mode"}. Click to toggle.`}
            aria-label="Toggle Bright / Dark Mode"
            className="p-2 rounded-xl border transition-all duration-200 flex items-center justify-center bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700 dark:bg-navy-800/90 dark:border-navy-700 dark:text-amber-400 dark:hover:border-cyan-neon/50 dark:hover:shadow-[0_0_12px_rgba(0,209,255,0.25)] active:scale-95"
          >
            {resolvedTheme === "dark" ? (
              // Sun Icon (Dark -> Bright Mode)
              <svg
                className="w-4 h-4 text-amber-400 animate-in spin-in-180 duration-200"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            ) : (
              // Moon Icon (Bright -> Dark Mode)
              <svg
                className="w-4 h-4 text-slate-700 animate-in spin-in-90 duration-200"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>

          {/* Mobile Menu Hamburger Button */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle navigation menu"
            className="lg:hidden p-2 rounded-xl text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-navy-800 transition-colors"
          >
            {mobileMenuOpen ? (
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            ) : (
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile Dropdown Menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-t dark:border-navy-700/60 border-slate-200 px-4 pt-3 pb-4 space-y-1 bg-white/95 dark:bg-[#07111F]/95 backdrop-blur-md animate-in slide-in-from-top-2 duration-150">
          {navLinks.map((link) => {
            const active = isActive(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center justify-between px-3 py-2 rounded-xl text-sm font-semibold transition-all ${
                  active
                    ? "text-cyan-600 dark:text-cyan-neon bg-cyan-50 dark:bg-cyan-neon/10"
                    : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-navy-800/80"
                }`}
              >
                <span>{link.label}</span>
              </Link>
            );
          })}

          {(!mounted || !isAuthenticated) && (
            <div className="pt-2 border-t dark:border-navy-700/60 border-slate-200">
              <Link
                href="/login"
                onClick={() => setMobileMenuOpen(false)}
                className="block text-center py-2.5 rounded-xl border text-xs font-bold text-slate-800 dark:text-slate-200 border-slate-300 dark:border-navy-700 hover:bg-slate-100 dark:hover:bg-navy-800"
              >
                Sign In
              </Link>
            </div>
          )}

          {/* Mobile Extension Download Link */}
          <button
            type="button"
            onClick={() => {
              setMobileMenuOpen(false);
              setExtensionModalOpen(true);
            }}
            className="w-full text-left flex items-center justify-between px-3 py-2.5 text-xs font-bold text-cyan-600 dark:text-cyan-neon hover:bg-cyan-50 dark:hover:bg-navy-800 rounded-xl border border-cyan-400/30 dark:border-cyan-neon/30 mt-2 transition-colors cursor-pointer"
          >
            <span className="flex items-center space-x-2">
              <span>⚡</span>
              <span>Download Chrome Extension</span>
            </span>
            <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-cyan-100 dark:bg-cyan-neon/20 text-cyan-700 dark:text-cyan-neon">Free</span>
          </button>
        </div>
      )}
      {/* Quick Label Search Modal */}
      <QuickLabelSearchModal
        isOpen={searchModalOpen}
        onClose={() => setSearchModalOpen(false)}
      />

      {/* Chrome Extension Download Modal */}
      <ExtensionDownloadModal
        isOpen={extensionModalOpen}
        onClose={() => setExtensionModalOpen(false)}
      />
    </header>
  );
};
