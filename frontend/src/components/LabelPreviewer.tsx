"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { ProcessingJobResponse } from "@/lib/types";
import { getAbsoluteDownloadUrl, getViewPdfUrl } from "@/lib/api";

interface LabelPreviewerProps {
  result: ProcessingJobResponse;
  onReset: () => void;
}

export const LabelPreviewer: React.FC<LabelPreviewerProps> = ({
  result,
  onReset,
}) => {
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [showInsightsDrawer, setShowInsightsDrawer] = useState<boolean>(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const totalPages = result.total_labels_generated || 1;
  const viewPdfUrl = getViewPdfUrl(result.job_id);
  const downloadPdfUrl = getAbsoluteDownloadUrl(result.downloads.thermal_pdf);
  const picklistCsvUrl = result.downloads.picklist_csv
    ? getAbsoluteDownloadUrl(result.downloads.picklist_csv)
    : null;

  // Print handler targeting the embedded PDF iframe
  const handlePrint = useCallback(() => {
    if (iframeRef.current && iframeRef.current.contentWindow) {
      try {
        iframeRef.current.contentWindow.focus();
        iframeRef.current.contentWindow.print();
        return;
      } catch {
        // Fallback to direct print window
      }
    }
    const printWindow = window.open(viewPdfUrl, "_blank");
    if (printWindow) {
      printWindow.focus();
      printWindow.print();
    }
  }, [viewPdfUrl]);

  // Direct download trigger
  const handleDownload = useCallback(() => {
    const a = document.createElement("a");
    a.href = downloadPdfUrl;
    const downloadFilename =
      result.formatted_filename || `${(result.marketplace || "meesho").toLowerCase()}_thermal_4x6_${result.job_id}.pdf`;
    a.download = downloadFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [downloadPdfUrl, result.formatted_filename, result.job_id]);

  // Keyboard shortcut listener (Ctrl+P, Ctrl+S, Esc, F)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape to close preview or exit fullscreen
      if (e.key === "Escape") {
        if (isFullscreen) {
          setIsFullscreen(false);
        } else {
          onReset();
        }
      }
      // Ctrl+P or Cmd+P to print
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") {
        e.preventDefault();
        handlePrint();
      }
      // Ctrl+S or Cmd+S to download
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        handleDownload();
      }
      // F to toggle fullscreen view
      if (
        (e.key === "f" || e.key === "F") &&
        !e.ctrlKey &&
        !e.metaKey &&
        document.activeElement?.tagName !== "INPUT" &&
        document.activeElement?.tagName !== "TEXTAREA"
      ) {
        setIsFullscreen((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFullscreen, onReset, handlePrint, handleDownload]);

  return (
    <div
      className={`w-full flex flex-col bg-white dark:bg-[#0A101D] border border-slate-200 dark:border-slate-800/90 rounded-2xl shadow-xl overflow-hidden transition-all duration-300 ${
        isFullscreen
          ? "fixed inset-0 z-50 rounded-none h-screen bg-white dark:bg-[#070B14]"
          : "h-[calc(100vh-100px)] min-h-[680px]"
      }`}
    >
      {/* Top Header Bar */}
      <div className="flex items-center justify-between px-3.5 sm:px-5 py-2.5 bg-slate-50/95 dark:bg-[#0D1526]/90 border-b border-slate-200 dark:border-slate-800/80 backdrop-blur-sm flex-shrink-0">
        {/* Left: Platform badge & summary */}
        <div className="flex items-center space-x-2.5 sm:space-x-3 min-w-0">
          <span className="px-2 py-0.5 rounded-md bg-violet-500/15 border border-violet-500/30 text-violet-700 dark:text-violet-300 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider shrink-0">
            {(result.marketplace || "Meesho").toUpperCase()}
          </span>

          <div className="flex items-center space-x-2 truncate">
            <h2 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white tracking-tight truncate">
              Document Preview
            </h2>
            <span className="text-slate-400 dark:text-slate-600 hidden sm:inline">•</span>
            <span className="text-[11px] sm:text-xs text-slate-600 dark:text-slate-300 font-medium shrink-0">
              <span className="text-violet-600 dark:text-violet-400 font-bold">{totalPages}</span>{" "}
              {totalPages === 1 ? "Label" : "Labels"}
            </span>

            {result.total_invoices_removed > 0 && (
              <span className="hidden xl:inline-flex items-center text-[10px] font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 px-2 py-0.5 rounded-full shrink-0">
                ✓ {result.total_invoices_removed} invoice(s) stripped
              </span>
            )}
          </div>
        </div>

        {/* Right: Actions Toolbar */}
        <div className="flex items-center space-x-1.5 sm:space-x-2 shrink-0">
          {/* Picklist CSV Button (if generated) */}
          {picklistCsvUrl && (
            <a
              href={picklistCsvUrl}
              download
              className="hidden lg:flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/80 dark:hover:bg-slate-700/80 border border-slate-300 dark:border-slate-700/70 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white text-[11px] font-medium transition-colors"
              title="Download consolidated SKU picklist CSV"
            >
              <svg className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="8" y1="13" x2="16" y2="13" />
              </svg>
              <span>Picklist</span>
            </a>
          )}

          {/* Download Button */}
          <button
            type="button"
            onClick={handleDownload}
            className="px-2.5 sm:px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/90 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 hover:text-slate-950 dark:hover:text-white border border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-600 text-xs font-semibold flex items-center space-x-1.5 transition-all shadow-sm"
            title="Download 4x6 Thermal PDF (Ctrl+S)"
          >
            <svg className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>Download</span>
            <span className="hidden sm:inline text-[9px] text-slate-500 dark:text-slate-400 font-mono px-1 py-0.2 rounded bg-slate-200 dark:bg-slate-900 border border-slate-300 dark:border-slate-700/60">
              ^S
            </span>
          </button>

          {/* Print Button (Primary) */}
          <button
            type="button"
            onClick={handlePrint}
            className="px-3 sm:px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-violet-600 via-indigo-600 to-violet-700 hover:from-violet-500 hover:to-indigo-500 text-white text-xs font-bold flex items-center space-x-1.5 transition-all shadow-md shadow-violet-950/40 active:scale-95"
            title="Print 4x6 Thermal Labels (Ctrl+P)"
          >
            <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
            <span>Print</span>
            <span className="hidden sm:inline text-[9px] text-violet-200 font-mono px-1 py-0.2 rounded bg-violet-900/60 border border-violet-400/30">
              ^P
            </span>
          </button>

          {/* Details toggle */}
          <button
            type="button"
            onClick={() => setShowInsightsDrawer(!showInsightsDrawer)}
            className={`p-1.5 rounded-lg text-xs font-medium border transition-colors ${
              showInsightsDrawer
                ? "bg-violet-100 dark:bg-violet-500/20 text-violet-800 dark:text-violet-300 border-violet-300 dark:border-violet-500/40"
                : "bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/60 dark:hover:bg-slate-700/60 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border-slate-300 dark:border-slate-700/60"
            }`}
            title="Toggle batch details & courier breakdown"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
          </button>

          {/* Fullscreen Toggle */}
          <button
            type="button"
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 rounded-lg text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/80 border border-transparent hover:border-slate-300 dark:hover:border-slate-700/60 transition-colors"
            title={isFullscreen ? "Exit Fullscreen (Esc)" : "Fullscreen (F)"}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {isFullscreen ? (
                <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
              ) : (
                <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
              )}
            </svg>
          </button>

          {/* Close / Return Button */}
          <button
            type="button"
            onClick={onReset}
            className="p-1.5 rounded-lg text-slate-600 dark:text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-slate-800/80 border border-transparent hover:border-slate-300 dark:hover:border-slate-700/60 transition-colors"
            title="Close Preview & Process Another Batch (Esc)"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* Main Viewing Workspace */}
      <div className="relative flex-1 w-full bg-slate-100 dark:bg-[#050811] overflow-hidden flex">
        {/* The Native / Embedded PDF Viewer showing processed labels at 100% natural scale */}
        <iframe
          ref={iframeRef}
          id="preview-pdf-frame"
          src={`${viewPdfUrl}#toolbar=1&navpanes=0&zoom=100`}
          className="w-full h-full border-0 bg-slate-50 dark:bg-[#0e1320]"
          title={`${result.marketplace || "Shipping"} 4x6 Thermal Labels Preview`}
        />

        {/* Collapsible Details Drawer */}
        {showInsightsDrawer && (
          <div className="absolute top-0 right-0 bottom-0 w-80 bg-white/95 dark:bg-[#0B1220]/95 backdrop-blur-md border-l border-slate-200 dark:border-slate-800 p-5 overflow-y-auto space-y-4 shadow-2xl z-20 animate-in slide-in-from-right duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-bold text-slate-900 dark:text-white text-sm">Batch Details</h3>
              <button
                type="button"
                onClick={() => setShowInsightsDrawer(false)}
                className="text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white text-base leading-none p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                ✕
              </button>
            </div>

            {/* Courier Breakdown */}
            <div className="space-y-2">
              <h4 className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Couriers Detected
              </h4>
              <div className="space-y-1.5">
                {result.courier_breakdown.map((c) => (
                  <div
                    key={c.courier}
                    className="flex items-center justify-between text-xs py-2 px-3 rounded-lg bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800"
                  >
                    <span className="text-slate-800 dark:text-slate-200 font-medium">{c.courier}</span>
                    <span className="font-mono text-violet-600 dark:text-violet-400 font-bold">
                      {c.label_count} ({c.percentage}%)
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Picklist Summary */}
            {result.picklist_items && result.picklist_items.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <h4 className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    SKU Picklist ({result.picklist_items.length})
                  </h4>
                  {picklistCsvUrl && (
                    <a
                      href={picklistCsvUrl}
                      download
                      className="text-[11px] text-violet-600 dark:text-violet-400 hover:underline font-medium"
                    >
                      Download CSV
                    </a>
                  )}
                </div>
                <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
                  {result.picklist_items.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between text-[11px] p-2 rounded-lg bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800"
                    >
                      <span className="font-mono text-slate-800 dark:text-slate-200 truncate pr-2">{item.sku}</span>
                      <span className="text-slate-500 dark:text-slate-400 shrink-0 font-medium">{item.total_quantity} qty</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Ambiguity / Safety Warnings if any */}
            {result.total_pages_flagged > 0 && (
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-500/40 text-amber-900 dark:text-amber-200 text-xs space-y-1">
                <span className="font-bold text-amber-700 dark:text-amber-300 block">
                  {result.total_pages_flagged} Page(s) Flagged
                </span>
                <p className="text-[11px] text-amber-800 dark:text-amber-300/80 leading-relaxed">
                  Pages with ambiguous layouts or address blocks near the invoice line were preserved in full to prevent parcel delivery loss.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Subtle Bottom Status Bar */}
      <div className="px-4 py-1.5 bg-slate-100 dark:bg-[#090E1A] border-t border-slate-200 dark:border-slate-800/80 flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-400 shrink-0">
        <div className="flex items-center space-x-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400"></span>
          <span>4×6 inch Thermal Format</span>
          <span className="text-slate-400 dark:text-slate-600">•</span>
          <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400">Standard 203/300 DPI</span>
        </div>
        <div className="hidden sm:flex items-center space-x-3 text-[10px] text-slate-500 dark:text-slate-400 font-mono">
          <span>Ctrl+P to Print</span>
          <span>Ctrl+S to Save</span>
          <span>Esc to Close</span>
        </div>
      </div>
    </div>
  );
};
