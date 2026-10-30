"use client";

import React, { useState } from "react";
import { apiResolveAmbiguity } from "@/lib/api-auth";
import { AmbiguousLabelItem, ProcessingJobResponse, SaveDecisionRequest } from "@/lib/types";

interface AmbiguityResolverModalProps {
  jobId: string;
  ambiguousLabels: AmbiguousLabelItem[];
  onResolved: (updatedResult: ProcessingJobResponse) => void;
  onClose: () => void;
}

export const AmbiguityResolverModal: React.FC<AmbiguityResolverModalProps> = ({
  jobId,
  ambiguousLabels,
  onResolved,
  onClose,
}) => {
  // Store SKU Name (Key) per label index
  const [skuNames, setSkuNames] = useState<Record<number, string>>(() => {
    const initial: Record<number, string> = {};
    ambiguousLabels.forEach((item) => {
      initial[item.label_index] =
        item.chosen_sku || (item.detected_candidates && item.detected_candidates[0]) || "";
    });
    return initial;
  });

  // Store Keyword (Value) per label index
  const [skuKeywords, setSkuKeywords] = useState<Record<number, string>>(() => {
    const initial: Record<number, string> = {};
    ambiguousLabels.forEach((item) => {
      initial[item.label_index] =
        item.matching_keyword ||
        item.chosen_sku ||
        (item.detected_candidates && item.detected_candidates[0]) ||
        "";
    });
    return initial;
  });

  const [rememberRules, setRememberRules] = useState<Record<number, boolean>>(() => {
    const initial: Record<number, boolean> = {};
    ambiguousLabels.forEach((item) => {
      initial[item.label_index] = true;
    });
    return initial;
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // When user clicks a suggested chip (e.g. "GREEN", "RSPK", "RSPK GREEN")
  const handleSelectChip = (index: number, chipText: string) => {
    setSkuKeywords((prev) => ({ ...prev, [index]: chipText }));
    setSkuNames((prev) => ({ ...prev, [index]: chipText }));
  };

  const handleSkuNameChange = (index: number, val: string) => {
    setSkuNames((prev) => ({ ...prev, [index]: val }));
  };

  const handleKeywordChange = (index: number, val: string) => {
    setSkuKeywords((prev) => ({ ...prev, [index]: val }));
  };

  const handleToggleRemember = (index: number) => {
    setRememberRules((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const resolutions: SaveDecisionRequest[] = ambiguousLabels.map((item) => {
      const defaultCandidate =
        (item.detected_candidates && item.detected_candidates[0]) || "UNMATCHED";
      const chosen = (skuNames[item.label_index] || item.chosen_sku || defaultCandidate).trim();
      const keyword = (skuKeywords[item.label_index] || item.matching_keyword || chosen).trim();
      const rawText = (item.original_sku || item.raw_text_snippet || chosen).trim();

      return {
        raw_product_text: rawText,
        chosen_sku: chosen,
        matching_keyword: keyword,
        remember_rule: rememberRules[item.label_index] ?? true,
        job_id: jobId,
      };
    });

    try {
      const updated = await apiResolveAmbiguity(jobId, resolutions);
      onResolved(updated);
      onClose();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to apply SKU mapping."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-950/80 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-2xl bg-white dark:bg-navy-900 border border-slate-200 dark:border-cyan-neon/40 rounded-2xl p-6 shadow-2xl relative max-h-[90vh] flex flex-col transition-colors">
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-slate-200 dark:border-navy-800 shrink-0">
          <div>
            <div className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-cyan-100 dark:bg-cyan-neon/15 border border-cyan-300 dark:border-cyan-neon/30 text-cyan-800 dark:text-cyan-neon text-[11px] font-bold mb-1">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>New SKU Found ({ambiguousLabels.length})</span>
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Unrecognized Product Detected on Shipping Label
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Select the matching keyword (Value) and SKU Name (Key). All matching labels will be automatically grouped together and saved to your SKU Database.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-navy-800 transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {error && (
          <div className="mt-3 p-3 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs shrink-0">
            {error}
          </div>
        )}

        {/* Scrollable List of Labels */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto my-4 space-y-4 pr-1">
          {ambiguousLabels.map((item, idx) => {
            const currentSku = skuNames[item.label_index] || "";
            const currentKw = skuKeywords[item.label_index] || "";
            const isRemember = rememberRules[item.label_index] ?? true;
            const fullOriginalSku = item.original_sku || item.raw_text_snippet || "UNKNOWN";

            return (
              <div
                key={idx}
                className="p-4 rounded-xl bg-slate-50 dark:bg-navy-950 border border-slate-200 dark:border-navy-800 space-y-3"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-800 dark:text-white">
                    Item #{idx + 1} • {item.filename} (Page {item.page_number})
                  </span>
                  <span className="text-[10px] text-cyan-700 dark:text-cyan-neon font-mono bg-cyan-50 dark:bg-navy-900 px-2 py-0.5 rounded border border-cyan-200 dark:border-navy-800">
                    Smart AI Detected
                  </span>
                </div>

                {/* Original Detected Full SKU */}
                <div className="p-3 rounded-xl bg-gradient-to-r from-amber-50 to-slate-50 dark:from-amber-500/10 dark:via-navy-900 dark:to-navy-900 border border-amber-300 dark:border-amber-500/30">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] uppercase tracking-wider font-bold text-amber-700 dark:text-amber-400">
                      Original Detected Full SKU
                    </span>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400">
                      From Shipping Label
                    </span>
                  </div>
                  <div className="text-sm font-mono font-bold text-amber-800 dark:text-amber-300 tracking-wide select-all">
                    {fullOriginalSku}
                  </div>
                </div>

                {/* Suggested Keyword Chips */}
                {item.detected_candidates && item.detected_candidates.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-[11px] font-bold text-slate-700 dark:text-slate-200">
                        Select Matching Keyword (Value) from this SKU:
                      </label>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400">
                        Click to choose
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {item.detected_candidates.map((cand) => {
                        const isSelected = currentKw.toUpperCase() === cand.toUpperCase();
                        return (
                          <button
                            key={cand}
                            type="button"
                            onClick={() => handleSelectChip(item.label_index, cand)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all border flex items-center space-x-1.5 ${
                              isSelected
                                ? "bg-cyan-500 dark:bg-cyan-neon text-white dark:text-navy-950 border-cyan-500 dark:border-cyan-neon shadow-sm scale-[1.02]"
                                : "bg-white dark:bg-navy-900 border-slate-300 dark:border-navy-700 text-slate-700 dark:text-slate-200 hover:border-cyan-500 dark:hover:border-cyan-neon/50 hover:text-cyan-600 dark:hover:text-cyan-neon hover:bg-slate-50 dark:hover:bg-navy-850"
                            }`}
                          >
                            <span>{cand}</span>
                            {isSelected && (
                              <svg className="w-3.5 h-3.5 ml-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Key-Value Pair: Value (Keyword) & Key (SKU Name) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-200 mb-1">
                      Matching Keyword / Value (Value) *
                    </label>
                    <input
                      type="text"
                      required
                      value={currentKw}
                      onChange={(e) => handleKeywordChange(item.label_index, e.target.value)}
                      placeholder="e.g. GREEN, RSPK, RSPK GREEN"
                      className="w-full px-3 py-2 rounded-xl bg-white dark:bg-navy-900 border border-slate-300 dark:border-navy-700 text-cyan-700 dark:text-cyan-neon font-mono font-bold text-xs focus:outline-none focus:border-cyan-500 dark:focus:border-cyan-neon shadow-inner"
                    />
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                      Labels containing this keyword (e.g. <span className="text-slate-700 dark:text-slate-300 font-mono">001 to 2939</span>) will match this SKU.
                    </p>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-200 mb-1">
                      SKU Name / Display Name (Key) *
                    </label>
                    <input
                      type="text"
                      required
                      value={currentSku}
                      onChange={(e) => handleSkuNameChange(item.label_index, e.target.value)}
                      placeholder="e.g. GREEN"
                      className="w-full px-3 py-2 rounded-xl bg-white dark:bg-navy-900 border border-slate-300 dark:border-navy-700 text-slate-900 dark:text-white font-mono font-bold text-xs focus:outline-none focus:border-cyan-500 dark:focus:border-cyan-neon shadow-inner"
                    />
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                      Display title on Picklist and label group sorting.
                    </p>
                  </div>
                </div>

                {/* Remember Rule & Add to Database Checkbox */}
                <div className="pt-2 flex items-center justify-between text-xs border-t border-slate-200 dark:border-navy-900">
                  <label className="inline-flex items-center space-x-2 cursor-pointer text-slate-600 dark:text-slate-300 text-[11px]">
                    <input
                      type="checkbox"
                      checked={isRemember}
                      onChange={() => handleToggleRemember(item.label_index)}
                      className="w-3.5 h-3.5 rounded text-cyan-600 dark:text-cyan-neon focus:ring-0 bg-white dark:bg-navy-900 border-slate-300 dark:border-navy-700"
                    />
                    <span>
                      Save Key &amp; Value to my Personal SKU Database (Auto-applies to all future shipping labels)
                    </span>
                  </label>
                </div>
              </div>
            );
          })}

          <div className="pt-3 border-t border-slate-200 dark:border-navy-800 flex items-center justify-end space-x-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-navy-800 dark:hover:bg-navy-700 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-colors"
            >
              Skip For Now
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 dark:from-cyan-neon dark:to-cyan-400 text-white dark:text-navy-950 font-bold text-xs shadow-md hover:opacity-95 transition-all active:scale-95 disabled:opacity-50"
            >
              {loading ? "Saving & Re-sorting Labels..." : "Save SKU & Apply"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
