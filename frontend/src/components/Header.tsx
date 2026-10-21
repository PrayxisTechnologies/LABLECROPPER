"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface HeaderProps {
  backendOnline?: boolean | null;
  backendVersion?: string;
}

export const Header: React.FC<HeaderProps> = ({
  backendOnline,
  backendVersion,
}) => {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [aboutModalOpen, setAboutModalOpen] = useState(false);

  const navLinks = [
    { label: "Home", href: "/" },
    { label: "Meesho", href: "/crop-labels", badge: "Live" },
    { label: "Flipkart", href: "/flipkart", badge: "Soon" },
    { label: "Amazon", href: "/amazon", badge: "Soon" },
    { label: "Myntra", href: "/myntra", badge: "Soon" },
    { label: "Snapdeal", href: "/snapdeal", badge: "Soon" },
    { label: "Features", href: "/features" },
    { label: "How It Works", href: "/how-it-works" },
    { label: "Blogs", href: "/blogs" },
  ];

  const isActive = (href: string) => {
    if (href === "/") {
      return pathname === "/";
    }
    return pathname.startsWith(href);
  };

  return (
    <>
      <header className="border-b border-navy-700/60 bg-navy-950/85 backdrop-blur-md sticky top-0 z-40 px-4 sm:px-8 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          {/* Left: Brand Logo & Title */}
          <Link
            href="/"
            className="flex items-center space-x-3 group transition-transform active:scale-98"
          >
            <div className="relative flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-neon/20 via-purple-brand/25 to-navy-800 border border-cyan-neon/40 shadow-glow group-hover:border-cyan-neon/70 transition-all">
              <svg
                className="w-5 h-5 text-cyan-neon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M7 7h10" />
                <path d="M7 12h10" />
                <path d="M7 17h6" />
              </svg>
            </div>
            <div className="flex flex-col">
              <span className="text-lg font-bold tracking-tight text-white leading-tight">
                Label<span className="text-cyan-neon">Flow</span>
              </span>
              <span className="text-[10px] text-slate-400 font-medium tracking-wide">
                4×6 Thermal Generator
              </span>
            </div>
          </Link>

          {/* Center Navigation Links (Desktop) */}
          <nav className="hidden lg:flex items-center space-x-1">
            {navLinks.map((link) => {
              const active = isActive(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`text-xs font-semibold transition-all duration-150 flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg ${
                    active
                      ? "text-cyan-neon bg-cyan-neon/10 border border-cyan-neon/30 shadow-[0_0_12px_rgba(0,209,255,0.15)]"
                      : "text-slate-300 hover:text-white hover:bg-navy-800/70 border border-transparent"
                  }`}
                >
                  <span>{link.label}</span>
                  {link.badge && (
                    <span
                      className={`text-[9px] px-1 py-0.2 rounded font-extrabold uppercase ${
                        link.badge === "Live"
                          ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                          : "bg-purple-brand/20 text-purple-300 border border-purple-brand/30"
                      }`}
                    >
                      {link.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Right Actions: About, Backend Health & Mobile Toggle */}
          <div className="flex items-center space-x-2.5 sm:space-x-3">
            {/* About Modal Trigger */}
            <button
              type="button"
              onClick={() => setAboutModalOpen(true)}
              className="hidden sm:inline-flex items-center text-xs font-medium text-slate-300 hover:text-white px-2.5 py-1.5 rounded-lg hover:bg-navy-800/80 transition-colors"
            >
              About
            </button>

            {/* Backend Connectivity Indicator Dot */}
            {backendOnline !== undefined && (
              <div
                className="flex items-center space-x-1.5 px-2 py-1 rounded-md text-[11px] font-medium bg-navy-900 border border-navy-700/80"
                title={
                  backendOnline === true
                    ? `API Online (v${backendVersion || "1.0.0"})`
                    : backendOnline === false
                    ? "API Offline (Start FastAPI server at localhost:8000)"
                    : "Connecting to API..."
                }
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    backendOnline === true
                      ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]"
                      : backendOnline === false
                      ? "bg-rose-400"
                      : "bg-slate-500 animate-pulse"
                  }`}
                />
                <span className="hidden lg:inline text-slate-300">
                  {backendOnline === true
                    ? "API Active"
                    : backendOnline === false
                    ? "API Offline"
                    : "Connecting..."}
                </span>
              </div>
            )}

            {/* Mobile Menu Hamburger Button */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle navigation menu"
              className="md:hidden p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-navy-800 transition-colors"
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
          <div className="lg:hidden pt-3 pb-2 border-t border-navy-700/60 mt-2 space-y-1">
            {navLinks.map((link) => {
              const active = isActive(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium ${
                    active
                      ? "text-cyan-neon bg-cyan-neon/10 border border-cyan-neon/30"
                      : "text-slate-300 hover:text-white hover:bg-navy-800/80"
                  }`}
                >
                  <span>{link.label}</span>
                  {link.badge && (
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-extrabold uppercase ${
                        link.badge === "Live"
                          ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                          : "bg-purple-brand/20 text-purple-300 border border-purple-brand/30"
                      }`}
                    >
                      {link.badge}
                    </span>
                  )}
                </Link>
              );
            })}
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                setAboutModalOpen(true);
              }}
              className="w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-navy-800/80"
            >
              About LabelFlow
            </button>
          </div>
        )}
      </header>

      {/* About Modal */}
      {aboutModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-950/80 backdrop-blur-sm animate-in fade-in"
        >
          <div className="w-full max-w-md bg-navy-850 rounded-2xl border border-navy-700 p-6 shadow-glow text-white space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-navy-700/60">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-lg bg-cyan-neon/20 border border-cyan-neon/40 flex items-center justify-center text-cyan-neon">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <path d="M7 7h10" />
                    <path d="M7 12h10" />
                  </svg>
                </div>
                <h3 className="font-bold text-white text-base">About LabelFlow</h3>
              </div>
              <button
                type="button"
                onClick={() => setAboutModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              LabelFlow is a specialized fulfillment utility built for Meesho sellers and dispatch teams. It transforms mixed, multi-page Meesho batch downloads into vector-perfect 4 × 6 inch thermal labels (288 × 432 pt) with zero distortion.
            </p>
            <div className="space-y-2 text-xs text-slate-300 bg-navy-900 p-3 rounded-xl border border-navy-700/60">
              <div className="flex justify-between">
                <span className="text-slate-400">Target Standard:</span>
                <span className="font-semibold text-white">4×6 in (288×432 pt)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Processing Engine:</span>
                <span className="font-semibold text-white">PyMuPDF Vector Canvas</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Supported Carriers:</span>
                <span className="font-semibold text-white">Delhivery, Shadowfax, Ekart, Valmo, etc.</span>
              </div>
            </div>
            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setAboutModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-navy-750 border border-navy-600 text-xs font-semibold text-white hover:bg-navy-700 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
