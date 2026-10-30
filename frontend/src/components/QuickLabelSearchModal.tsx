"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { apiGetMasterSheet, getSingleLabelPrintUrl } from "@/lib/api-auth";
import { getViewPdfUrl } from "@/lib/api";
import { MasterLabelItem } from "@/lib/types";
import { useAuth } from "@/lib/auth-context";

interface QuickLabelSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialQuery?: string;
}

export const QuickLabelSearchModal: React.FC<QuickLabelSearchModalProps> = ({
  isOpen,
  onClose,
  initialQuery = "",
}) => {
  const { isAuthenticated } = useAuth();
  const [query, setQuery] = useState<string>(initialQuery);
  const [results, setResults] = useState<MasterLabelItem[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [hasSearched, setHasSearched] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [printingKey, setPrintingKey] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery(initialQuery);
      setTimeout(() => inputRef.current?.focus(), 50);
      if (initialQuery.trim()) {
        executeSearch(initialQuery.trim());
      }
    } else {
      setResults([]);
      setHasSearched(false);
    }
  }, [isOpen, initialQuery]);

  const executeSearch = async (searchQuery: string) => {
    const q = searchQuery.trim();
    if (!q) return;

    setLoading(true);
    setHasSearched(true);
    try {
      if (isAuthenticated) {
        const res = await apiGetMasterSheet({ search: q, page: 1, size: 20 });
        setResults(res.items || []);
        setTotalCount(res.total || 0);
      } else {
        // Guest mode fallback
        setResults([]);
        setTotalCount(0);
      }
    } catch {
      setResults([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeSearch(query);
  };

  const handleCopyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handlePrintLabel = (jobId: string, pageNumber: number) => {
    const key = `${jobId}_p${pageNumber}`;
    setPrintingKey(key);
    const printUrl = getSingleLabelPrintUrl(jobId, pageNumber);

    let iframe = document.getElementById("search-label-print-iframe") as HTMLIFrameElement;
    if (!iframe) {
      iframe = document.createElement("iframe");
      iframe.id = "search-label-print-iframe";
      iframe.style.position = "fixed";
      iframe.style.right = "0";
      iframe.style.bottom = "0";
      iframe.style.width = "0";
      iframe.style.height = "0";
      iframe.style.border = "none";
      document.body.appendChild(iframe);
    }

    iframe.src = printUrl;
    iframe.onload = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch {
        window.open(printUrl, "_blank");
      } finally {
        setTimeout(() => setPrintingKey(null), 1000);
      }
    };
  };

  const handleViewLabel = (jobId: string, pageNumber: number) => {
    const baseViewUrl = getViewPdfUrl(jobId);
    window.open(`${baseViewUrl}#page=${pageNumber}`, "_blank");
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-start justify-center p-3 sm:p-4 md:p-6 bg-slate-950/70 backdrop-blur-md overflow-y-auto animate-in fade-in duration-150"
    >
      <div className="w-full max-w-3xl mt-12 bg-white dark:bg-[#0B1527] border border-slate-200 dark:border-navy-700/80 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Search Header Bar */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-navy-700/80 bg-slate-50/80 dark:bg-navy-950/50">
          <div className="flex items-center justify-between pb-3">
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-500 shadow-[0_0_8px_rgba(0,209,255,0.8)]" />
              <h3 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white">
                Quick Label Search
              </h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-navy-800 transition-colors"
              title="Close modal"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Search Form Input */}
          <form onSubmit={handleFormSubmit} className="relative flex items-center">
            <div className="absolute left-3.5 text-slate-400">
              <svg className="w-4 h-4 text-cyan-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </div>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by Order ID, WBL Tracking No, or SKU..."
              className="w-full pl-10 pr-24 py-3 rounded-2xl bg-white dark:bg-[#070F1E] border border-slate-300 dark:border-navy-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 shadow-inner placeholder:text-slate-400"
            />
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="absolute right-2 px-4 py-1.5 rounded-xl bg-cyan-500 dark:bg-cyan-neon hover:bg-cyan-600 dark:hover:bg-cyan-400 text-white dark:text-navy-950 font-bold text-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
            >
              {loading ? "Searching..." : "Search"}
            </button>
          </form>
        </div>

        {/* Results Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center space-y-2">
              <div className="w-7 h-7 border-2 border-cyan-500 dark:border-cyan-neon border-t-transparent rounded-full animate-spin" />
              <p className="text-xs text-slate-500 dark:text-slate-400">Searching master sheet orders...</p>
            </div>
          ) : !hasSearched ? (
            <div className="py-12 text-center text-slate-500 dark:text-slate-400 space-y-2">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                Enter an Order ID, AWB Tracking Number, or SKU
              </p>
              <p className="text-xs max-w-md mx-auto">
                Instantly locate any cropped thermal label, reprint 4×6 labels with 1 click, or preview the page.
              </p>
            </div>
          ) : results.length === 0 ? (
            <div className="py-12 text-center text-slate-500 dark:text-slate-400 space-y-3">
              <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-navy-800 flex items-center justify-center mx-auto text-slate-400">
                ✕
              </div>
              <div>
                <p className="text-sm font-bold text-slate-800 dark:text-white">
                  No labels found matching &ldquo;{query}&rdquo;
                </p>
                <p className="text-xs mt-1">
                  {!isAuthenticated
                    ? "Sign in to search across your complete Master Sheet database and past batches."
                    : "Check for typos or try searching by SKU or Tracking number."}
                </p>
              </div>
              {!isAuthenticated && (
                <Link
                  href="/auth/login"
                  onClick={onClose}
                  className="inline-block mt-2 px-4 py-2 rounded-xl bg-cyan-500 text-white font-bold text-xs"
                >
                  Sign In to Access Master Sheet
                </Link>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-500 pb-1">
                <span>
                  Found <strong className="text-cyan-600 dark:text-cyan-neon">{totalCount}</strong> matching{" "}
                  {totalCount === 1 ? "order" : "orders"}
                </span>
                <Link
                  href={`/dashboard/master-sheet?search=${encodeURIComponent(query)}`}
                  onClick={onClose}
                  className="text-cyan-600 dark:text-cyan-neon hover:underline font-semibold"
                >
                  View in Master Sheet →
                </Link>
              </div>

              {results.map((item) => {
                const latestApp = item.appearances && item.appearances.length > 0 ? item.appearances[item.appearances.length - 1] : null;
                const isPrinting = latestApp ? printingKey === `${latestApp.job_id}_p${latestApp.page_number}` : false;

                return (
                  <div
                    key={item.id}
                    className="p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-navy-900 border border-slate-200 dark:border-navy-800 shadow-sm hover:border-cyan-500/40 transition-all flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                  >
                    {/* Left Details */}
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                        <span className="font-mono font-bold text-sm text-slate-900 dark:text-white tracking-wide">
                          {item.order_id}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopyText(item.order_id, `ord_${item.id}`)}
                          className="text-xs text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-neon"
                          title="Copy Order ID"
                        >
                          {copiedId === `ord_${item.id}` ? "✓ Copied" : "📋"}
                        </button>

                        <span className="px-2 py-0.5 rounded-full bg-cyan-50 dark:bg-cyan-neon/10 border border-cyan-200 dark:border-cyan-neon/30 text-cyan-700 dark:text-cyan-neon font-mono font-bold text-xs">
                          {item.sku}
                        </span>

                        <span className="px-2 py-0.5 rounded-md bg-purple-50 dark:bg-purple-brand/10 border border-purple-200 dark:border-purple-brand/30 text-purple-700 dark:text-purple-300 font-semibold text-[11px]">
                          {item.courier_partner}
                        </span>
                      </div>

                      <div className="flex items-center space-x-3 text-xs text-slate-500 flex-wrap gap-y-1">
                        {item.wbl_id && (
                          <span className="font-mono text-amber-700 dark:text-amber-300">
                            AWB: <strong>{item.wbl_id}</strong>
                          </span>
                        )}

                        {latestApp && (
                          <span className="flex items-center space-x-1 text-slate-600 dark:text-slate-400">
                            <span>📄</span>
                            <span className="font-mono truncate max-w-[150px]">{latestApp.pdf_filename}</span>
                            <span className="font-bold text-cyan-600 dark:text-cyan-neon">Page #{latestApp.page_number}</span>
                          </span>
                        )}

                        <span>• {item.marketplace}</span>
                      </div>
                    </div>

                    {/* Right Action Buttons */}
                    {latestApp && (
                      <div className="flex items-center space-x-2 shrink-0 self-end sm:self-center">
                        <button
                          type="button"
                          onClick={() => handleViewLabel(latestApp.job_id, latestApp.page_number)}
                          className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-navy-800 hover:bg-slate-200 dark:hover:bg-navy-700 text-slate-700 dark:text-slate-200 font-semibold text-xs border border-slate-200 dark:border-navy-700 shadow-sm"
                        >
                          View
                        </button>

                        <button
                          type="button"
                          onClick={() => handlePrintLabel(latestApp.job_id, latestApp.page_number)}
                          disabled={isPrinting}
                          className="px-3.5 py-1.5 rounded-xl bg-cyan-500 dark:bg-cyan-neon hover:bg-cyan-600 dark:hover:bg-cyan-400 text-white dark:text-navy-950 font-bold text-xs shadow-sm flex items-center space-x-1.5 active:scale-95 disabled:opacity-50"
                        >
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <polyline points="6 9 6 2 18 2 18 9" />
                            <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" />
                            <rect x="6" y="14" width="12" height="8" />
                          </svg>
                          <span>{isPrinting ? "..." : "Print 4×6"}</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
