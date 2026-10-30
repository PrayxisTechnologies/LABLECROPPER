"use client";

import React, { useState } from "react";
import {
  LocalProcessingItem,
  formatHistoryTimestamp,
} from "@/lib/localHistory";

interface LabelProcessingHistoryProps {
  history: LocalProcessingItem[];
  onRemoveItem: (jobId: string) => void;
  onClearAll: () => void;
}

export function LabelProcessingHistory({
  history,
  onRemoveItem,
  onClearAll,
}: LabelProcessingHistoryProps) {
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  if (!history || history.length === 0) {
    return null;
  }

  const handleClear = () => {
    onClearAll();
    setShowClearConfirm(false);
  };

  return (
    <section
      aria-label="Local Label Processing History"
      className="w-full bg-white dark:bg-[#0B1527] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-sm dark:shadow-xl animate-in fade-in duration-200 transition-colors"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800/80 pb-4 mb-4">
        <div className="flex items-center space-x-2.5">
          <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white tracking-wide">
            Label Processing History
          </h3>
          <span className="text-[10px] font-extrabold px-2 py-0.5 rounded uppercase tracking-wider bg-amber-100 dark:bg-amber-500/15 text-amber-800 dark:text-amber-400 border border-amber-300 dark:border-amber-500/30">
            PREVIEW
          </span>
        </div>

        {showClearConfirm ? (
          <div className="flex items-center space-x-2">
            <span className="text-xs text-slate-600 dark:text-slate-300">Clear all?</span>
            <button
              type="button"
              onClick={handleClear}
              className="text-xs font-bold text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 bg-rose-50 dark:bg-rose-500/10 px-2.5 py-1 rounded-lg border border-rose-200 dark:border-rose-500/30 transition-colors"
            >
              Yes, Clear
            </button>
            <button
              type="button"
              onClick={() => setShowClearConfirm(false)}
              className="text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-white px-2 py-1"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowClearConfirm(true)}
            className="text-xs font-semibold text-rose-600 dark:text-rose-400/90 hover:text-rose-700 dark:hover:text-rose-300 transition-colors cursor-pointer"
          >
            Clear History
          </button>
        )}
      </div>

      {/* List of 48-Hour Cropped Label Batches */}
      <div className="space-y-2.5">
        {history.map((item) => {
          const timeFormatted = formatHistoryTimestamp(item.created_at);
          const displayName = item.filename || `${item.marketplace.toLowerCase()}1prayxis.pdf`;

          return (
            <div
              key={item.job_id}
              className="group flex items-center justify-between p-3.5 sm:p-4 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-900/60 dark:hover:bg-slate-800/50 border border-slate-200 dark:border-slate-800/90 hover:border-slate-300 dark:hover:border-slate-700 transition-all gap-3"
            >
              {/* Left: File Icon + Metadata */}
              <div className="flex items-center space-x-3.5 min-w-0 flex-1">
                {/* PDF Document Icon */}
                <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-500/15 border border-blue-200 dark:border-blue-500/30 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
                  <svg
                    className="w-5 h-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                    <polyline points="10 9 9 9 8 9" />
                  </svg>
                </div>

                {/* Details */}
                <div className="min-w-0 flex-1">
                  <h4
                    className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate group-hover:text-cyan-600 dark:group-hover:text-cyan-neon transition-colors"
                    title={displayName}
                  >
                    {displayName}
                  </h4>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    <span>{timeFormatted}</span>
                    <span>•</span>
                    {item.formatted_size && (
                      <>
                        <span>{item.formatted_size}</span>
                        <span>•</span>
                      </>
                    )}
                    {item.total_labels > 0 && (
                      <>
                        <span>{item.total_labels} Label{item.total_labels !== 1 ? "s" : ""}</span>
                        <span>•</span>
                      </>
                    )}
                    <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-500/30">
                      {item.type_badge || "Label Only"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Right: Action Buttons (View, Download, Delete) */}
              <div className="flex items-center space-x-2 shrink-0">
                {/* 👁️ View PDF Button */}
                <a
                  href={item.view_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="View Cropped PDF in Browser"
                  className="w-8 h-8 rounded-lg bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-500/15 dark:hover:bg-emerald-500/25 border border-emerald-300 dark:border-emerald-500/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center transition-all hover:scale-105 active:scale-95"
                >
                  <svg
                    className="w-4 h-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                </a>

                {/* ⬇️ Direct Download PDF Button */}
                <a
                  href={item.download_url}
                  download={displayName}
                  title="Download Cropped PDF"
                  className="w-8 h-8 rounded-lg bg-cyan-50 hover:bg-cyan-100 dark:bg-cyan-500/15 dark:hover:bg-cyan-500/25 border border-cyan-300 dark:border-cyan-500/40 text-cyan-600 dark:text-cyan-400 flex items-center justify-center transition-all hover:scale-105 active:scale-95"
                >
                  <svg
                    className="w-4 h-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                </a>

                {/* 🗑️ Delete Button */}
                <button
                  type="button"
                  onClick={() => onRemoveItem(item.job_id)}
                  title="Delete from Local History"
                  className="w-8 h-8 rounded-lg bg-rose-50 hover:bg-rose-100 dark:bg-rose-500/15 dark:hover:bg-rose-500/25 border border-rose-300 dark:border-rose-500/40 text-rose-600 dark:text-rose-400 flex items-center justify-center transition-all hover:scale-105 active:scale-95 cursor-pointer"
                >
                  <svg
                    className="w-4 h-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer 48-Hour Notice */}
      <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mt-3 pt-3 border-t border-slate-200 dark:border-slate-800/60">
        Processing history is stored locally and displays the last 48 hours of activity.
      </p>
    </section>
  );
}
