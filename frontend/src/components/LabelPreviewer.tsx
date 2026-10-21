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
    a.download = `meesho_thermal_4x6_${result.job_id}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [downloadPdfUrl, result.job_id]);

  // Keyboard shortcut listener (Ctrl+P, Ctrl+S, Esc, F)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape to close preview
      if (e.key === "Escape") {
        onReset();
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
  }, [onReset, handlePrint, handleDownload]);

  return (
    <div
      className={`w-full flex flex-col bg-[#07111F] border border-cyan-neon/30 rounded-2xl shadow-2xl overflow-hidden transition-all duration-300 ${
        isFullscreen
          ? "fixed inset-0 z-50 rounded-none h-screen"
          : "h-[85vh] sm:h-[90vh] my-4"
      }`}
    >
      {/* Top Bar matching E-cropper styling */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 bg-[#0C182B] border-b border-navy-700/80 flex-shrink-0">
        {/* Left: MEESHO badge & Document Preview title */}
        <div className="flex items-center space-x-3">
          <span className="px-2.5 py-1 rounded-md bg-[#7B61FF] text-white text-[11px] font-extrabold uppercase tracking-wider shadow-sm">
            MEESHO
          </span>
          <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-3">
            <h2 className="text-sm sm:text-base font-bold text-white tracking-tight">
              Document Preview
            </h2>
            <div className="flex items-center space-x-2 text-xs text-slate-400">
              <span className="hidden sm:inline">•</span>
              <span className="font-semibold text-cyan-neon">
                {totalPages} {totalPages === 1 ? "Label" : "Labels"} Cropped
              </span>
              <span>•</span>
              <span className="font-mono text-[11px] text-slate-400">
                Zero Margins • Thermal Print Ready
              </span>
              {result.total_invoices_removed > 0 && (
                <>
                  <span className="hidden md:inline">•</span>
                  <span className="hidden md:inline text-emerald-400">
                    {result.total_invoices_removed} invoice(s) removed
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right: Actions (Download Ctrl+S, Print Ctrl+P, View Toggle, Close Esc) */}
        <div className="flex items-center space-x-2 sm:space-x-2.5">
          {/* Picklist CSV Button (if generated) */}
          {picklistCsvUrl && (
            <a
              href={picklistCsvUrl}
              download
              className="hidden lg:flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-navy-800 hover:bg-navy-700 border border-purple-brand/40 text-purple-300 text-xs font-semibold transition-colors"
              title="Download consolidated SKU picklist CSV"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="8" y1="13" x2="16" y2="13" />
              </svg>
              <span>Picklist</span>
            </a>
          )}

          {/* Toggle Batch Insights */}
          <button
            type="button"
            onClick={() => setShowInsightsDrawer(!showInsightsDrawer)}
            className="hidden md:flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-navy-800 hover:bg-navy-750 text-slate-300 text-xs font-medium border border-navy-700"
            title="View detected couriers & SKUs"
          >
            <span>{showInsightsDrawer ? "Hide Details" : "Details"}</span>
          </button>

          {/* Download Button with Shortcut */}
          <button
            type="button"
            onClick={handleDownload}
            className="px-3 sm:px-4 py-1.5 rounded-xl bg-navy-800 hover:bg-navy-700 text-white border border-cyan-neon/40 hover:border-cyan-neon text-xs font-semibold flex items-center space-x-1.5 transition-all shadow-sm"
            title="Download 4x6 Thermal PDF (Ctrl+S)"
          >
            <svg className="w-3.5 h-3.5 text-cyan-neon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>Download</span>
            <span className="hidden sm:inline text-[10px] text-slate-400 font-mono">
              Ctrl+S
            </span>
          </button>

          {/* Print Button with Shortcut */}
          <button
            type="button"
            onClick={handlePrint}
            className="px-3.5 sm:px-4 py-1.5 rounded-xl bg-gradient-to-r from-purple-brand to-purple-dim hover:brightness-110 text-white text-xs font-bold flex items-center space-x-1.5 transition-all shadow-md active:scale-95"
            title="Print 4x6 Thermal Labels (Ctrl+P)"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
            <span>Print</span>
            <span className="hidden sm:inline text-[10px] text-purple-200 font-mono">
              Ctrl+P
            </span>
          </button>

          {/* Fullscreen / Standard View Toggle */}
          <button
            type="button"
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="hidden sm:flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-navy-800 hover:bg-navy-700 text-slate-300 text-xs border border-navy-700 transition-colors"
            title="Toggle Fullscreen View (F)"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {isFullscreen ? (
                <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
              ) : (
                <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
              )}
            </svg>
            <span>{isFullscreen ? "Standard" : "Full View"}</span>
          </button>

          {/* Close / Return to Upload Button */}
          <button
            type="button"
            onClick={onReset}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-navy-800 transition-colors"
            title="Close Preview & Process Another Batch (Esc)"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* Main Viewing Workspace */}
      <div className="relative flex-1 w-full bg-[#1A1D20] overflow-hidden flex">
        {/* The Native / Embedded PDF Viewer showing processed labels one after another */}
        <iframe
          ref={iframeRef}
          id="meesho-preview-pdf-frame"
          src={`${viewPdfUrl}#toolbar=1&navpanes=0&view=FitH`}
          className="w-full h-full border-0 bg-[#2b2b2b]"
          title="Meesho 4x6 Thermal Labels Preview"
        />

        {/* Collapsible Details Drawer */}
        {showInsightsDrawer && (
          <div className="absolute top-0 right-0 bottom-0 w-80 bg-navy-900/95 backdrop-blur-md border-l border-navy-700 p-5 overflow-y-auto space-y-4 shadow-2xl z-20 animate-in slide-in-from-right duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-navy-750">
              <h3 className="font-bold text-white text-sm">Batch Details</h3>
              <button
                type="button"
                onClick={() => setShowInsightsDrawer(false)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ×
              </button>
            </div>

            {/* Courier Breakdown */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-cyan-neon uppercase tracking-wider">
                Couriers Detected
              </h4>
              <div className="space-y-1.5">
                {result.courier_breakdown.map((c) => (
                  <div
                    key={c.courier}
                    className="flex items-center justify-between text-xs py-1.5 px-3 rounded-lg bg-navy-850 border border-navy-700/60"
                  >
                    <span className="text-white font-medium">{c.courier}</span>
                    <span className="font-mono text-cyan-neon font-semibold">
                      {c.label_count} ({c.percentage}%)
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Picklist Summary */}
            {result.picklist_items && result.picklist_items.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-navy-750">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-purple-300 uppercase tracking-wider">
                    SKU Picklist ({result.picklist_items.length})
                  </h4>
                  {picklistCsvUrl && (
                    <a
                      href={picklistCsvUrl}
                      download
                      className="text-[11px] text-cyan-neon hover:underline"
                    >
                      Download CSV
                    </a>
                  )}
                </div>
                <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
                  {result.picklist_items.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between text-[11px] p-2 rounded bg-navy-850 border border-navy-700/60"
                    >
                      <span className="font-mono text-purple-200">{item.sku}</span>
                      <span className="text-slate-300">{item.total_quantity} unit(s)</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Ambiguity / Safety Warnings if any */}
            {result.total_pages_flagged > 0 && (
              <div className="p-3 rounded-xl bg-amber-950/50 border border-amber-500/50 text-amber-200 text-xs space-y-1">
                <span className="font-bold text-amber-300 block">
                  {result.total_pages_flagged} Page(s) Flagged for Review
                </span>
                <p className="text-[11px] leading-relaxed">
                  Pages with ambiguous layouts or address blocks near the invoice line were preserved in full to prevent parcel delivery loss.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
