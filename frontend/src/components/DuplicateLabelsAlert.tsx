"use client";

import React, { useState } from "react";
import { DuplicateLabelItem } from "@/lib/types";

interface DuplicateLabelsAlertProps {
  duplicateLabels: DuplicateLabelItem[];
  allLabelsDuplicate?: boolean;
  excludedDuplicatesCount?: number;
  totalLabelsGenerated?: number;
  onExcludeAllDuplicates: () => void;
  onExcludeSelectedDuplicates: (orderIds: string[]) => void;
  onResetBatch: () => void;
  onRestoreDuplicates?: () => void;
}

export const DuplicateLabelsAlert: React.FC<DuplicateLabelsAlertProps> = ({
  duplicateLabels,
  allLabelsDuplicate = false,
  excludedDuplicatesCount = 0,
  totalLabelsGenerated = 0,
  onExcludeAllDuplicates,
  onExcludeSelectedDuplicates,
  onResetBatch,
  onRestoreDuplicates,
}) => {
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [isDismissed, setIsDismissed] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");

  // IDs selected to be EXCLUDED / MINUSED (defaults to all duplicate labels selected)
  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    duplicateLabels.map((d) => d.order_id || d.wbl_id || "")
  );

  // If user dismissed this warning during the current batch, don't show the warning banner
  if (isDismissed && duplicateLabels.length > 0) {
    return (
      <div className="flex items-center justify-between px-3.5 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs">
        <span className="flex items-center space-x-1.5">
          <span>⚠️ {duplicateLabels.length} duplicate label(s) were kept in this batch.</span>
        </span>
        <button
          type="button"
          onClick={() => setIsDismissed(false)}
          className="text-amber-200 underline hover:text-white font-semibold cursor-pointer"
        >
          Review duplicates
        </button>
      </div>
    );
  }

  // If all duplicates were excluded, show a subtle green success pill with undo option
  if (duplicateLabels.length === 0 && excludedDuplicatesCount > 0) {
    return (
      <div className="flex items-center justify-between px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs animate-in fade-in">
        <div className="flex items-center space-x-2">
          <svg className="w-4 h-4 text-emerald-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span className="font-semibold">
            {excludedDuplicatesCount} duplicate label(s) successfully removed from final PDF.
          </span>
        </div>
        {onRestoreDuplicates && (
          <button
            type="button"
            onClick={onRestoreDuplicates}
            className="text-xs text-emerald-300 underline hover:text-white font-medium cursor-pointer"
          >
            Undo / Restore labels
          </button>
        )}
      </div>
    );
  }

  if (duplicateLabels.length === 0) {
    return null;
  }

  const firstDup = duplicateLabels[0];
  const previousFileDisplay = firstDup.previous_filename || "a previous batch";

  const totalCalculated = totalLabelsGenerated + duplicateLabels.length;

  const handleToggleSelectId = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    setSelectedIds(duplicateLabels.map((d) => d.order_id || d.wbl_id || ""));
  };

  const handleDeselectAll = () => {
    setSelectedIds([]);
  };

  const handleApplyModalExclusions = () => {
    onExcludeSelectedDuplicates(selectedIds);
    setModalOpen(false);
  };

  // Filtered list for search inside modal
  const filteredDuplicates = duplicateLabels.filter((item) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      item.order_id.toLowerCase().includes(q) ||
      (item.wbl_id && item.wbl_id.toLowerCase().includes(q)) ||
      item.sku.toLowerCase().includes(q) ||
      item.courier.toLowerCase().includes(q) ||
      (item.previous_filename && item.previous_filename.toLowerCase().includes(q))
    );
  });

  return (
    <>
      {/* ========================================================
          1. TOP NOTIFICATION BANNER
          ======================================================== */}
      {allLabelsDuplicate ? (
        // Case 1: 100% of labels are duplicates
        <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-rose-50 via-amber-50 to-white dark:from-rose-950/60 dark:via-amber-950/40 dark:to-navy-900 border-2 border-rose-300 dark:border-rose-500/50 text-slate-900 dark:text-white shadow-lg animate-in fade-in transition-colors">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start space-x-3.5">
              <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-500/20 border border-rose-300 dark:border-rose-500/40 flex items-center justify-center text-rose-600 dark:text-rose-400 shrink-0 mt-0.5">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </div>
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <span className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">
                    ⚠️ All {duplicateLabels.length} labels in this PDF were already printed!
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-500/30 text-rose-700 dark:text-rose-200 border border-rose-300 dark:border-rose-500/40 font-bold uppercase">
                    100% Duplicate
                  </span>
                </div>
                <p className="text-xs text-rose-800 dark:text-rose-200/90 leading-relaxed max-w-2xl">
                  Aapne ye saare labels pehle file <span className="font-mono font-bold text-slate-900 dark:text-white bg-rose-100 dark:bg-rose-950/80 px-1.5 py-0.5 rounded border border-rose-300 dark:border-rose-800">{previousFileDisplay}</span> me nikal liye the. Kya aap is PDF ko wapas nikalna chahte hain ya pura batch minus karna chahte hain?
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 shrink-0 self-end md:self-center">
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="px-3.5 py-2 rounded-xl bg-white dark:bg-navy-800 hover:bg-slate-100 dark:hover:bg-navy-700 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-navy-700 text-xs font-bold transition-colors cursor-pointer"
              >
                👁️ View Duplicates
              </button>
              <button
                type="button"
                onClick={() => setIsDismissed(true)}
                className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
                title="Keep these labels and print anyway"
              >
                Re-print All
              </button>
              <button
                type="button"
                onClick={onResetBatch}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-600 hover:to-rose-700 text-white font-extrabold text-xs shadow-lg transition-all active:scale-95 cursor-pointer"
              >
                ✕ Pura Batch Minus Karein (Discard)
              </button>
            </div>
          </div>
        </div>
      ) : (
        // Case 2: Partial duplicates (e.g. 2 out of 10 labels are duplicates)
        <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-50 via-slate-50 to-white dark:from-amber-950/40 dark:via-navy-900 dark:to-navy-900 border border-amber-300 dark:border-amber-500/40 text-slate-900 dark:text-white shadow-md animate-in fade-in transition-colors">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3.5">
            <div className="flex items-start space-x-3">
              <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-500/20 border border-amber-300 dark:border-amber-500/40 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0 mt-0.5">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center space-x-2">
                  <span className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white">
                    ⚠️ {duplicateLabels.length} Duplicate Label(s) Found ({duplicateLabels.length} of {totalCalculated} already printed)
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-500/30 font-bold">
                    Previously Cropped
                  </span>
                </div>
                <p className="text-[11px] text-amber-900/80 dark:text-amber-200/80 leading-relaxed max-w-2xl">
                  Is PDF me {duplicateLabels.length} aise shipping labels hain jo pehle kisi PDF (jaise <span className="font-mono text-slate-900 dark:text-white underline">{previousFileDisplay}</span>) me nikal chuke hain. Inhe minus karein taaki duplicate order ship na ho.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0 self-end md:self-center">
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="px-3 py-1.5 rounded-xl bg-white dark:bg-navy-800 hover:bg-slate-100 dark:hover:bg-navy-700 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-navy-700 text-xs font-semibold transition-colors cursor-pointer"
              >
                👁️ View &amp; Select
              </button>
              <button
                type="button"
                onClick={onExcludeAllDuplicates}
                className="px-3.5 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-navy-950 font-extrabold text-xs shadow-md transition-all active:scale-95 cursor-pointer"
              >
                ➖ Sabhi Minus Karein ({duplicateLabels.length} Remove)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          2. DUPLICATE LABELS INSPECTION & SELECTION MODAL
          ======================================================== */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-950/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-2xl bg-white dark:bg-navy-900 border border-slate-200 dark:border-navy-700 rounded-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-navy-800 flex items-center justify-between">
              <div>
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center space-x-2">
                  <span>Duplicate Labels Inspector</span>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-500/30 font-bold">
                    {duplicateLabels.length} Total Duplicates
                  </span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Select which previously printed labels you want to remove from this output PDF:
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-navy-800"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Filter and Selection Tools */}
            <div className="p-3.5 bg-slate-50 dark:bg-navy-950/60 border-b border-slate-200 dark:border-navy-800/80 flex flex-col sm:flex-row items-center justify-between gap-2.5 text-xs">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by Order ID, AWB, SKU, Courier..."
                className="w-full sm:w-72 px-3 py-1.5 rounded-lg bg-white dark:bg-navy-900 border border-slate-300 dark:border-navy-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 text-xs focus:outline-none focus:border-cyan-500 dark:focus:border-cyan-neon"
              />
              <div className="flex items-center space-x-2 self-end sm:self-auto">
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="px-2.5 py-1 rounded bg-slate-200 hover:bg-slate-300 dark:bg-navy-800 dark:hover:bg-navy-700 text-slate-700 dark:text-slate-300 font-semibold text-[11px]"
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={handleDeselectAll}
                  className="px-2.5 py-1 rounded bg-slate-200 hover:bg-slate-300 dark:bg-navy-800 dark:hover:bg-navy-700 text-slate-700 dark:text-slate-300 font-semibold text-[11px]"
                >
                  Deselect All
                </button>
                <span className="text-[11px] text-cyan-600 dark:text-cyan-300 font-bold pl-1">
                  {selectedIds.length} marked to remove
                </span>
              </div>
            </div>

            {/* Duplicate Labels List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2.5 divide-y divide-slate-100 dark:divide-navy-800/40">
              {filteredDuplicates.length === 0 ? (
                <div className="py-12 text-center text-slate-500 dark:text-slate-400 text-xs">
                  No duplicate orders matched &quot;{searchQuery}&quot;.
                </div>
              ) : (
                filteredDuplicates.map((item, idx) => {
                  const idKey = item.order_id || item.wbl_id || `idx_${idx}`;
                  const isChecked = selectedIds.includes(idKey);

                  return (
                    <div
                      key={idKey}
                      onClick={() => handleToggleSelectId(idKey)}
                      className={`pt-2.5 first:pt-0 flex items-start space-x-3 p-3 rounded-xl transition-all cursor-pointer ${
                        isChecked
                          ? "bg-rose-50/70 dark:bg-rose-950/20 border border-rose-300 dark:border-rose-500/30"
                          : "bg-slate-50/80 dark:bg-navy-950/40 border border-slate-200 dark:border-navy-800 hover:border-slate-300 dark:hover:border-slate-700"
                      }`}
                    >
                      {/* Checkbox */}
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleToggleSelectId(idKey)}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-1 w-4 h-4 rounded text-rose-500 focus:ring-0 bg-white dark:bg-navy-900 border-slate-300 dark:border-navy-700 cursor-pointer"
                      />

                      {/* Details */}
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center space-x-2">
                            <span className="font-mono font-bold text-xs text-slate-900 dark:text-white">
                              {item.order_id}
                            </span>
                            {item.wbl_id && (
                              <span className="text-[10px] font-mono text-slate-600 dark:text-slate-400 bg-slate-200 dark:bg-navy-900 px-1.5 py-0.5 rounded border border-slate-300 dark:border-navy-800">
                                AWB: {item.wbl_id}
                              </span>
                            )}
                          </div>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                              isChecked
                                ? "bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-500/30"
                                : "bg-emerald-100 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-500/20"
                            }`}
                          >
                            {isChecked ? "✕ Will Remove" : "✓ Will Keep"}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-700 dark:text-slate-300">
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-slate-100 dark:bg-navy-900 border border-slate-200 dark:border-navy-700 text-cyan-700 dark:text-cyan-300 font-mono">
                            <span>SKU:</span>
                            <span className="font-bold">{item.sku}</span>
                          </span>
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-slate-100 dark:bg-navy-900 border border-slate-200 dark:border-navy-700 text-indigo-700 dark:text-indigo-300">
                            <span>Courier:</span>
                            <span className="font-bold">{item.courier}</span>
                          </span>
                          <span className="text-slate-500 dark:text-slate-400">
                            (Page {item.page_number} in {item.input_filename})
                          </span>
                        </div>

                        {/* Previous Batch Provenance */}
                        <div className="text-[11px] text-amber-800 dark:text-amber-300/80 flex items-center space-x-1.5 pt-0.5">
                          <svg className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" />
                            <polyline points="12 6 12 12 16 14" />
                          </svg>
                          <span>
                            Pehle nikala gaya tha: <strong className="text-slate-900 dark:text-white font-mono">{item.previous_filename || "Previous Batch"}</strong>
                            {item.previous_processed_at && (
                              <span className="text-slate-500 dark:text-slate-400 ml-1">
                                ({new Date(item.previous_processed_at).toLocaleString("en-IN", {
                                  month: "short",
                                  day: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-200 dark:border-navy-800 bg-slate-50 dark:bg-navy-950/70 flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-navy-800 dark:hover:bg-navy-700 text-slate-700 dark:text-slate-300 font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApplyModalExclusions}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-600 hover:to-rose-700 text-white font-bold text-xs shadow-lg transition-all active:scale-95 cursor-pointer"
              >
                Apply &amp; Remove Selected ({selectedIds.length}) Labels
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
