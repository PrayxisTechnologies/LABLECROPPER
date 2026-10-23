"use client";

import React, { useEffect, useMemo, useState } from "react";
import { UploadInspectionResponse, SortOption } from "@/lib/types";

interface UploadSummaryCardProps {
  data: UploadInspectionResponse;
  isLoading?: boolean;
  currentSort?: SortOption | string;
  isReSorting?: boolean;
  activeExcludedMainSkus?: string[];
  activeExcludedSkus?: string[];
  activeExcludedCouriers?: string[];
  onUpdateBatch?: (params: {
    sort: SortOption;
    excluded_main_skus: string[];
    excluded_skus: string[];
    excluded_couriers: string[];
  }) => void;
  onConfirmSku?: (params: {
    oldSku: string;
    newSku: string;
    keyword: string;
  }) => Promise<void> | void;
  // Fallbacks for backwards compatibility
  onApplySort?: (sort: SortOption) => void;
  onApplyFilters?: (filters: {
    excluded_main_skus: string[];
    excluded_skus: string[];
    excluded_couriers: string[];
  }) => void;
}

export const UploadSummaryCard: React.FC<UploadSummaryCardProps> = ({
  data,
  isLoading = false,
  currentSort = "sku_courier",
  isReSorting = false,
  activeExcludedMainSkus = [],
  activeExcludedSkus = [],
  activeExcludedCouriers = [],
  onUpdateBatch,
  onConfirmSku,
  onApplySort,
  onApplyFilters,
}) => {
  // Inline SKU Editing states for Main SKUs
  const [editingMainSku, setEditingMainSku] = useState<string | null>(null);
  const [editSkuName, setEditSkuName] = useState<string>("");
  const [editKeyword, setEditKeyword] = useState<string>("");
  const [isConfirmingSku, setIsConfirmingSku] = useState<boolean>(false);
  const [editSuccessSku, setEditSuccessSku] = useState<string | null>(null);

  // Active Tab: "main_sku" (Parent groups), "all_skus" (Individual variants), or "courier"
  const [activeTab, setActiveTab] = useState<"main_sku" | "all_skus" | "courier">("main_sku");

  // Sorting in All SKUs Tab: "name" (A-Z letter-wise) or "count" (No. of Labels)
  const [sortBy, setSortBy] = useState<"name" | "count">("name");
  const [sortAsc, setSortAsc] = useState<boolean>(true);

  // Selected PDF Organization Mode in the single unified dropdown
  const [selectedSort, setSelectedSort] = useState<SortOption>(
    (currentSort as SortOption) || "sku_courier"
  );

  useEffect(() => {
    if (currentSort) {
      setSelectedSort((currentSort as SortOption) || "sku_courier");
    }
  }, [currentSort]);

  // Exclusion Sets for Interactive Filter Selection (Crossed-out items)
  const [excludedMainSkus, setExcludedMainSkus] = useState<Set<string>>(
    new Set(activeExcludedMainSkus.map((s) => s.toUpperCase()))
  );
  const [excludedSkus, setExcludedSkus] = useState<Set<string>>(
    new Set(activeExcludedSkus.map((s) => s.toUpperCase()))
  );
  const [excludedCouriers, setExcludedCouriers] = useState<Set<string>>(
    new Set(activeExcludedCouriers.map((s) => s.toUpperCase()))
  );

  // Keep in sync with incoming active props
  useEffect(() => {
    setExcludedMainSkus(new Set((activeExcludedMainSkus || []).map((s) => s.toUpperCase())));
  }, [activeExcludedMainSkus]);

  useEffect(() => {
    setExcludedSkus(new Set((activeExcludedSkus || []).map((s) => s.toUpperCase())));
  }, [activeExcludedSkus]);

  useEffect(() => {
    setExcludedCouriers(new Set((activeExcludedCouriers || []).map((s) => s.toUpperCase())));
  }, [activeExcludedCouriers]);

  // Check if current user selections differ from active PDF settings
  const hasChanges = useMemo(() => {
    if (selectedSort !== currentSort) return true;

    const propMain = new Set((activeExcludedMainSkus || []).map((s) => s.toUpperCase()));
    const propSku = new Set((activeExcludedSkus || []).map((s) => s.toUpperCase()));
    const propCourier = new Set((activeExcludedCouriers || []).map((s) => s.toUpperCase()));

    if (excludedMainSkus.size !== propMain.size) return true;
    for (const item of excludedMainSkus) {
      if (!propMain.has(item)) return true;
    }

    if (excludedSkus.size !== propSku.size) return true;
    for (const item of excludedSkus) {
      if (!propSku.has(item)) return true;
    }

    if (excludedCouriers.size !== propCourier.size) return true;
    for (const item of excludedCouriers) {
      if (!propCourier.has(item)) return true;
    }

    return false;
  }, [
    selectedSort,
    currentSort,
    excludedMainSkus,
    excludedSkus,
    excludedCouriers,
    activeExcludedMainSkus,
    activeExcludedSkus,
    activeExcludedCouriers,
  ]);

  const totalExcludedItemsCount =
    excludedMainSkus.size + excludedSkus.size + excludedCouriers.size;

  // Single Action: Apply both sort and exclusions in one click
  const handleApplyClick = () => {
    const params = {
      sort: selectedSort,
      excluded_main_skus: Array.from(excludedMainSkus),
      excluded_skus: Array.from(excludedSkus),
      excluded_couriers: Array.from(excludedCouriers),
    };

    if (onUpdateBatch) {
      onUpdateBatch(params);
    } else {
      if (onApplySort && selectedSort !== currentSort) {
        onApplySort(selectedSort);
      }
      if (onApplyFilters) {
        onApplyFilters({
          excluded_main_skus: params.excluded_main_skus,
          excluded_skus: params.excluded_skus,
          excluded_couriers: params.excluded_couriers,
        });
      }
    }
  };

  // Reset all exclusions back to active
  const handleResetAllExclusions = () => {
    setExcludedMainSkus(new Set());
    setExcludedSkus(new Set());
    setExcludedCouriers(new Set());

    const params = {
      sort: selectedSort,
      excluded_main_skus: [],
      excluded_skus: [],
      excluded_couriers: [],
    };

    if (onUpdateBatch) {
      onUpdateBatch(params);
    } else if (onApplyFilters) {
      onApplyFilters({
        excluded_main_skus: [],
        excluded_skus: [],
        excluded_couriers: [],
      });
    }
  };

  // Toggle Handlers
  const toggleExcludeMainSku = (mainSkuName: string) => {
    const key = mainSkuName.toUpperCase();
    setExcludedMainSkus((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const toggleExcludeSku = (skuName: string) => {
    const key = skuName.toUpperCase();
    setExcludedSkus((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const toggleExcludeCourier = (courierName: string) => {
    const key = courierName.toUpperCase();
    setExcludedCouriers((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // Filter by Main SKU in All SKUs tab
  const [selectedMainSkuFilter, setSelectedMainSkuFilter] = useState<string | null>(null);

  // Expanded Main SKU cards in Main SKU tab
  const [expandedMainSkus, setExpandedMainSkus] = useState<Record<string, boolean>>({});

  const toggleExpandMainSku = (mainSkuName: string) => {
    setExpandedMainSkus((prev) => ({
      ...prev,
      [mainSkuName]: !prev[mainSkuName],
    }));
  };

  const handleStartEditSku = (sku: string) => {
    setEditingMainSku(sku);
    setEditSkuName(sku);
    setEditKeyword(sku);
    setEditSuccessSku(null);
  };

  const handleCancelEditSku = () => {
    setEditingMainSku(null);
    setEditSkuName("");
    setEditKeyword("");
    setEditSuccessSku(null);
  };

  const handleSaveEditSku = async (originalSku: string) => {
    if (!onConfirmSku) return;
    setIsConfirmingSku(true);
    try {
      await onConfirmSku({
        oldSku: originalSku,
        newSku: editSkuName.trim() || originalSku,
        keyword: editKeyword.trim() || originalSku,
      });
      setEditSuccessSku(originalSku);
      setTimeout(() => {
        setEditSuccessSku(null);
        setEditingMainSku(null);
      }, 1000);
    } catch (err) {
      console.error("Failed to confirm SKU:", err);
    } finally {
      setIsConfirmingSku(false);
    }
  };

  // Sorting and Filtering for All Sub-SKUs
  const sortedSubSkus = useMemo(() => {
    let list = [...data.all_skus];
    if (selectedMainSkuFilter) {
      list = list.filter((item) => item.main_sku === selectedMainSkuFilter);
    }

    list.sort((a, b) => {
      if (sortBy === "name") {
        const comp = a.sku.localeCompare(b.sku, undefined, { numeric: true, sensitivity: "base" });
        return sortAsc ? comp : -comp;
      } else {
        const comp = a.label_count - b.label_count;
        return sortAsc ? comp : -comp;
      }
    });

    return list;
  }, [data.all_skus, selectedMainSkuFilter, sortBy, sortAsc]);

  // Courier list sorted descending by count
  const sortedCouriers = useMemo(() => {
    return [...data.courier_breakdown].sort((a, b) => b.label_count - a.label_count);
  }, [data.courier_breakdown]);

  // Color helper for Main SKU branding
  const getMainSkuColorStyle = (name: string, isExcluded: boolean) => {
    if (isExcluded) {
      return {
        border: "border-rose-900/60 hover:border-rose-700 bg-rose-950/25",
        badge: "bg-rose-950/90 text-rose-300 border-rose-700/80",
        dot: "bg-rose-500",
        pill: "bg-rose-950/40 text-rose-300 border-rose-700/60",
      };
    }
    const upper = name.toUpperCase();
    if (upper.includes("BROWN")) {
      return {
        border: "border-amber-600/50 hover:border-amber-500 bg-navy-950/80",
        badge: "bg-amber-950/60 text-amber-300 border-amber-600/60",
        dot: "bg-amber-500",
        pill: "bg-amber-500/15 text-amber-300 border-amber-500/30",
      };
    }
    if (upper.includes("GREEN")) {
      return {
        border: "border-emerald-600/50 hover:border-emerald-500 bg-navy-950/80",
        badge: "bg-emerald-950/60 text-emerald-300 border-emerald-600/60",
        dot: "bg-emerald-500",
        pill: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
      };
    }
    if (upper.includes("PINK")) {
      return {
        border: "border-pink-600/50 hover:border-pink-500 bg-navy-950/80",
        badge: "bg-pink-950/60 text-pink-300 border-pink-600/60",
        dot: "bg-pink-500",
        pill: "bg-pink-500/15 text-pink-300 border-pink-500/30",
      };
    }
    if (upper.includes("BLUE")) {
      return {
        border: "border-sky-600/50 hover:border-sky-500 bg-navy-950/80",
        badge: "bg-sky-950/60 text-sky-300 border-sky-600/60",
        dot: "bg-sky-500",
        pill: "bg-sky-500/15 text-sky-300 border-sky-500/30",
      };
    }
    return {
      border: "border-cyan-neon/40 hover:border-cyan-neon bg-navy-950/80",
      badge: "bg-cyan-950/60 text-cyan-300 border-cyan-neon/40",
      dot: "bg-cyan-neon",
      pill: "bg-cyan-neon/15 text-cyan-neon border-cyan-neon/30",
    };
  };

  if (isLoading) {
    return (
      <div className="w-full bg-[#0C182B] border border-cyan-neon/30 rounded-2xl p-5 my-4 animate-pulse">
        <div className="flex items-center space-x-3 mb-4">
          <div className="w-5 h-5 border-2 border-cyan-neon border-t-transparent rounded-full animate-spin" />
          <div className="h-4 bg-navy-700 rounded w-64" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-navy-800 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const formatCourierName = (c: string) => {
    if (c.toLowerCase() === "xpressbees") return "Xpress Bees";
    return c;
  };

  return (
    <div className="w-full bg-[#0C182B] border border-cyan-neon/30 rounded-2xl p-4 sm:p-5 my-4 shadow-xl transition-all">
      {/* 1. Header with Title and Mode Switch Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-3.5 border-b border-navy-700/80 gap-3">
        <div className="flex items-center space-x-2.5">
          <span className="flex h-3 w-3 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-neon opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-neon" />
          </span>
          <div>
            <h3 className="text-sm sm:text-base font-bold text-white tracking-tight flex items-center space-x-2">
              <span>PDF Batch Summary</span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-cyan-neon/15 border border-cyan-neon/40 text-cyan-neon font-mono font-bold">
                {data.total_labels} Labels Detected
              </span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Click (✕) on any card to exclude unwanted orders, then click &apos;Update PDF&apos;
            </p>
          </div>
        </div>

        {/* 3 Dedicated Mode Tabs: Main SKU, All Sub-SKUs, Courier Partner */}
        <div className="flex items-center bg-navy-950/90 p-1 rounded-xl border border-navy-700 self-start sm:self-auto space-x-1">
          <button
            type="button"
            onClick={() => setActiveTab("main_sku")}
            className={`px-3 sm:px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer ${
              activeTab === "main_sku"
                ? "bg-cyan-neon text-navy-950 shadow-md font-extrabold"
                : "text-slate-300 hover:text-white"
            }`}
          >
            <span>🏷️ Main SKU</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${activeTab === "main_sku" ? "bg-navy-950/20 text-navy-950 font-extrabold" : "bg-navy-800 text-slate-300"}`}>
              {data.main_skus.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("all_skus")}
            className={`px-3 sm:px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer ${
              activeTab === "all_skus"
                ? "bg-cyan-neon text-navy-950 shadow-md font-extrabold"
                : "text-slate-300 hover:text-white"
            }`}
          >
            <span>📦 All SKUs</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${activeTab === "all_skus" ? "bg-navy-950/20 text-navy-950 font-extrabold" : "bg-navy-800 text-slate-300"}`}>
              {data.all_skus.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("courier")}
            className={`px-3 sm:px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer ${
              activeTab === "courier"
                ? "bg-cyan-neon text-navy-950 shadow-md font-extrabold"
                : "text-slate-300 hover:text-white"
            }`}
          >
            <span>🚚 Delivery Partner</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${activeTab === "courier" ? "bg-navy-950/20 text-navy-950 font-extrabold" : "bg-navy-800 text-slate-300"}`}>
              {data.courier_breakdown.length}
            </span>
          </button>
        </div>
      </div>

      {/* 2. SINGLE UNIFIED ACTION BAR: Organize sequence + Filter status + ONLY 1 Apply button */}
      <div className="mt-3 p-3 sm:p-3.5 rounded-xl bg-navy-950/95 border border-cyan-neon/30 flex flex-col md:flex-row md:items-center md:justify-between gap-3 shadow-md">
        {/* Left: Sorting sequence dropdown */}
        <div className="flex items-center space-x-2.5 flex-1">
          <span className="p-1.5 rounded-lg bg-cyan-neon/15 text-cyan-neon text-sm flex-shrink-0">
            🔀
          </span>
          <div className="flex-1 max-w-md">
            <span className="text-[11px] font-bold text-slate-400 block mb-1">
              Organize PDF Labels By:
            </span>
            <select
              value={selectedSort}
              onChange={(e) => setSelectedSort(e.target.value as SortOption)}
              disabled={isReSorting}
              className="w-full appearance-none bg-navy-900 border border-navy-600 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-neon cursor-pointer font-medium"
            >
              <option value="sku_courier">
                🏷️ SKU + Delivery partner (Brown Valmo/Shadowfax, then Green)
              </option>
              <option value="courier_partner">
                🚚 Delivery partner (All Valmo first, then Shadowfax, then Xpress Bees)
              </option>
              <option value="sku">📦 SKU (Group by Product SKU & variants)</option>
              <option value="original_order">📄 Original order (Input PDF sequence)</option>
            </select>
          </div>
        </div>

        {/* Right: Exclusion Badge (if any) + EXACTLY ONE Primary Action Button */}
        <div className="flex items-center space-x-2.5 self-end md:self-auto">
          {totalExcludedItemsCount > 0 && (
            <div className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-rose-500/15 border border-rose-500/40 text-xs">
              <span className="font-bold text-rose-300">
                ✕ {totalExcludedItemsCount} Excluded
              </span>
              <button
                type="button"
                onClick={handleResetAllExclusions}
                disabled={isReSorting}
                className="text-[11px] text-slate-400 hover:text-white underline cursor-pointer ml-1"
                title="Reset all crossed-out items"
              >
                Reset
              </button>
            </div>
          )}

          {/* THE SINGLE UNIFIED BUTTON */}
          <button
            type="button"
            onClick={handleApplyClick}
            disabled={isReSorting || !hasChanges}
            className={`px-5 py-2 rounded-xl text-xs font-extrabold transition-all shadow-md flex items-center space-x-1.5 whitespace-nowrap cursor-pointer ${
              hasChanges
                ? "bg-gradient-to-r from-cyan-neon to-purple-brand text-navy-950 hover:brightness-110 active:scale-95 shadow-glow"
                : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 cursor-default"
            }`}
          >
            {isReSorting ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-navy-950 border-t-transparent rounded-full animate-spin" />
                <span>Updating PDF...</span>
              </>
            ) : hasChanges ? (
              <span>⚡ Update PDF</span>
            ) : (
              <span>✓ Up to Date</span>
            )}
          </button>
        </div>
      </div>

      {/* ======================================================== */}
      {/* TAB 1: MAIN SKU VIEW                                      */}
      {/* ======================================================== */}
      {activeTab === "main_sku" && (
        <div className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase tracking-wider text-slate-300 flex items-center space-x-2">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-neon" />
              <span>Main SKUs ({data.main_skus.length} Main Product Families)</span>
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {data.main_skus.map((group) => {
              const isMainExcluded = excludedMainSkus.has(group.main_sku.toUpperCase());
              const colorStyle = getMainSkuColorStyle(group.main_sku, isMainExcluded);
              const isExpanded = !!expandedMainSkus[group.main_sku];
              const courierCounts = group.courier_counts || {};

              return (
                <div
                  key={group.main_sku}
                  className={`rounded-xl border ${colorStyle.border} p-4 transition-all shadow-md relative ${
                    isMainExcluded ? "opacity-75" : ""
                  }`}
                >
                  {/* Top: Main SKU Title, Badge, Total Count & Cross Button */}
                  <div className="flex items-center justify-between pb-2.5 border-b border-navy-800 gap-2">
                    <div className="flex items-center space-x-2.5">
                      <span className={`w-3 h-3 rounded-full ${colorStyle.dot}`} />
                      <span className={`text-base font-extrabold tracking-wide ${isMainExcluded ? "line-through text-slate-400" : "text-white"}`}>
                        {group.main_sku}
                      </span>
                      {isMainExcluded && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold">
                          ✕ Excluded
                        </span>
                      )}
                    </div>

                    <div className="flex items-center space-x-2">
                      <span className={`px-2.5 py-1 rounded-lg border text-xs font-mono font-extrabold ${colorStyle.badge}`}>
                        {group.label_count} Labels
                      </span>

                      {/* Edit SKU button */}
                      {onConfirmSku && (
                        <button
                          type="button"
                          onClick={() => handleStartEditSku(group.main_sku)}
                          disabled={isReSorting || isConfirmingSku}
                          className="px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 border bg-navy-900/90 text-slate-300 hover:text-cyan-neon hover:bg-cyan-neon/10 border-navy-700 hover:border-cyan-neon/50 cursor-pointer disabled:opacity-50"
                          title={`Edit & confirm SKU name for ${group.main_sku}`}
                        >
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                          <span>Edit</span>
                        </button>
                      )}

                      {/* Clean Cross (✕) Exclude button */}
                      <button
                        type="button"
                        onClick={() => toggleExcludeMainSku(group.main_sku)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 border cursor-pointer ${
                          isMainExcluded
                            ? "bg-rose-500 text-white border-rose-400 shadow-sm hover:bg-rose-600"
                            : "bg-navy-900/90 text-slate-300 hover:text-rose-300 hover:bg-rose-950/40 border-navy-700 hover:border-rose-500/50"
                        }`}
                        title={
                          isMainExcluded
                            ? `Click to re-include ${group.main_sku}`
                            : `Click to cross out & exclude ${group.main_sku}`
                        }
                      >
                        <span className="text-sm font-extrabold leading-none">✕</span>
                        <span>{isMainExcluded ? "Excluded" : "Exclude"}</span>
                      </button>
                    </div>
                  </div>

                  {/* Inline Edit & Confirm Mode */}
                  {editingMainSku === group.main_sku && (
                    <div className="mt-3 p-3.5 rounded-xl bg-navy-950/95 border border-cyan-neon/40 shadow-glow space-y-3 animate-in fade-in duration-150">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-extrabold text-cyan-neon uppercase tracking-wider flex items-center space-x-1.5">
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                          <span>Edit & Confirm SKU</span>
                        </span>
                        <span className="text-[10px] text-slate-400">
                          Saves to database for future batches
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                            SKU Name (Key) *
                          </label>
                          <input
                            type="text"
                            value={editSkuName}
                            onChange={(e) => setEditSkuName(e.target.value)}
                            placeholder="e.g. GREEN, BROWN"
                            className="w-full px-2.5 py-1.5 rounded-lg bg-navy-900 border border-navy-700 text-white font-mono font-bold text-xs focus:outline-none focus:border-cyan-neon"
                          />
                          <p className="text-[9px] text-slate-400 mt-0.5">
                            Display name on Picklist & PDF
                          </p>
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                            Matching Keyword (Value) *
                          </label>
                          <input
                            type="text"
                            value={editKeyword}
                            onChange={(e) => setEditKeyword(e.target.value)}
                            placeholder="e.g. GREEN, RSPK"
                            className="w-full px-2.5 py-1.5 rounded-lg bg-navy-900 border border-navy-700 text-cyan-neon font-mono font-bold text-xs focus:outline-none focus:border-cyan-neon"
                          />
                          <p className="text-[9px] text-slate-400 mt-0.5">
                            Word matched on shipping labels
                          </p>
                        </div>
                      </div>

                      {/* Quick Chips from Sub-SKUs */}
                      {group.sub_skus && group.sub_skus.length > 0 && (
                        <div className="pt-1">
                          <span className="text-[10px] text-slate-400 block mb-1 font-medium">
                            Detected Sub-SKUs (click to use as keyword):
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {group.sub_skus.slice(0, 5).map((sub) => (
                              <button
                                key={sub.sku}
                                type="button"
                                onClick={() => {
                                  setEditKeyword(sub.sku);
                                  if (!editSkuName || editSkuName === group.main_sku) {
                                    setEditSkuName(group.main_sku);
                                  }
                                }}
                                className="px-2 py-0.5 rounded text-[10px] font-mono bg-navy-900 hover:bg-cyan-neon/20 border border-navy-700 hover:border-cyan-neon/50 text-slate-300 hover:text-cyan-neon transition-colors cursor-pointer"
                              >
                                {sub.sku}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Success Badge */}
                      {editSuccessSku === group.main_sku && (
                        <div className="p-2 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center space-x-1.5">
                          <svg className="w-4 h-4 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          <span>SKU Confirmed! Saved to your database.</span>
                        </div>
                      )}

                      {/* Confirm & Cancel Buttons */}
                      <div className="flex items-center justify-end space-x-2 pt-1 border-t border-navy-800">
                        <button
                          type="button"
                          onClick={handleCancelEditSku}
                          disabled={isConfirmingSku}
                          className="px-3 py-1 rounded-lg bg-navy-800 hover:bg-navy-700 text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveEditSku(group.main_sku)}
                          disabled={isConfirmingSku || !editSkuName.trim()}
                          className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-cyan-neon to-purple-brand text-navy-950 font-extrabold text-xs shadow-glow hover:brightness-110 active:scale-95 transition-all flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                        >
                          {isConfirmingSku ? (
                            <>
                              <div className="w-3 h-3 border-2 border-navy-950 border-t-transparent rounded-full animate-spin" />
                              <span>Confirming...</span>
                            </>
                          ) : (
                            <>
                              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                              <span>Confirm SKU</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Notice when excluded */}
                  {isMainExcluded && (
                    <div className="mt-2.5 py-1.5 px-3 rounded-lg bg-rose-950/90 border border-rose-500/50 flex items-center justify-between text-xs text-rose-200">
                      <span>✕ {group.label_count} {group.main_sku} labels excluded</span>
                      <button
                        type="button"
                        onClick={() => toggleExcludeMainSku(group.main_sku)}
                        className="underline hover:text-white font-bold ml-2 cursor-pointer"
                      >
                        Restore
                      </button>
                    </div>
                  )}

                  {/* Middle: Delivery Partner Breakdown for this Main SKU */}
                  <div className="pt-3 pb-2">
                    <div className="text-[11px] font-semibold text-slate-400 mb-1.5 flex items-center justify-between">
                      <span>Delivery Partners for {group.main_sku}:</span>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {Object.keys(courierCounts).length > 0 ? (
                        Object.entries(courierCounts)
                          .sort((a, b) => b[1] - a[1])
                          .map(([cName, cnt]) => (
                            <span
                              key={cName}
                              className="px-2.5 py-1 rounded-lg bg-navy-900 border border-navy-700 text-xs flex items-center space-x-1.5 text-slate-200"
                            >
                              <span className="text-slate-400">{formatCourierName(cName)}:</span>
                              <span className="font-mono font-bold text-cyan-neon">{cnt}</span>
                            </span>
                          ))
                      ) : (
                        <span className="text-xs text-slate-400">Standard Couriers</span>
                      )}
                    </div>
                  </div>

                  {/* Bottom: Sub-SKU Variants Expander Toggle */}
                  <div className="pt-2 border-t border-navy-800/80 flex items-center justify-between">
                    <span className="text-[11px] text-slate-400">
                      {group.sub_skus.length} individual SKU variant{group.sub_skus.length === 1 ? "" : "s"}
                    </span>

                    <button
                      type="button"
                      onClick={() => toggleExpandMainSku(group.main_sku)}
                      className="text-xs font-semibold text-cyan-neon hover:underline flex items-center space-x-1 focus:outline-none cursor-pointer"
                    >
                      <span>{isExpanded ? "Hide Variants" : "View Variants"}</span>
                      <svg
                        className={`w-3.5 h-3.5 transform transition-transform ${isExpanded ? "rotate-180" : ""}`}
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </button>
                  </div>

                  {/* Expanded Sub-SKUs list under this Main SKU */}
                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-navy-800/80 space-y-1.5 max-h-48 overflow-y-auto pr-1">
                      {group.sub_skus.map((sub, sIdx) => {
                        const isSubExcluded =
                          isMainExcluded || excludedSkus.has(sub.sku.toUpperCase());
                        return (
                          <div
                            key={sub.sku}
                            className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-xs transition-colors ${
                              isSubExcluded
                                ? "bg-rose-950/30 border-rose-800/40 opacity-70"
                                : "bg-navy-900/90 border-navy-800"
                            }`}
                          >
                            <div className="flex items-center space-x-2">
                              <span className="text-[10px] font-mono text-slate-500 w-4">
                                {sIdx + 1}.
                              </span>
                              <span className={`font-mono font-bold ${isSubExcluded ? "line-through text-slate-400" : "text-white"}`}>
                                {sub.sku}
                              </span>
                            </div>

                            <div className="flex items-center space-x-2">
                              <span className="font-mono text-cyan-neon font-semibold">
                                {sub.label_count} label{sub.label_count === 1 ? "" : "s"}
                              </span>
                              {!isMainExcluded && (
                                <button
                                  type="button"
                                  onClick={() => toggleExcludeSku(sub.sku)}
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold border cursor-pointer ${
                                    isSubExcluded
                                      ? "bg-rose-500 text-white border-rose-400"
                                      : "bg-navy-800 text-slate-400 hover:text-rose-300 border-navy-700"
                                  }`}
                                  title={isSubExcluded ? "Re-include SKU" : "Exclude SKU"}
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 2: ALL SUB-SKUS VIEW                                  */}
      {/* ======================================================== */}
      {activeTab === "all_skus" && (
        <div className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase tracking-wider text-slate-300 flex items-center space-x-2">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-neon" />
              <span>SKU Variants ({data.all_skus.length} Items)</span>
            </span>
          </div>

          {/* Main SKU Filter Pills */}
          {data.main_skus.length > 0 && (
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center justify-between">
                <span>Filter by Main SKU:</span>
                {selectedMainSkuFilter && (
                  <button
                    type="button"
                    onClick={() => setSelectedMainSkuFilter(null)}
                    className="text-[10px] text-cyan-neon hover:underline cursor-pointer"
                  >
                    Reset Filter (Show All)
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedMainSkuFilter(null)}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                    selectedMainSkuFilter === null
                      ? "bg-purple-brand text-white border-purple-brand shadow-sm font-bold"
                      : "bg-navy-900/60 border-navy-700 text-slate-300 hover:border-slate-500"
                  }`}
                >
                  All SKUs ({data.total_labels})
                </button>
                {data.main_skus.map((group) => {
                  const isSel = selectedMainSkuFilter === group.main_sku;
                  return (
                    <button
                      type="button"
                      key={group.main_sku}
                      onClick={() => setSelectedMainSkuFilter(isSel ? null : group.main_sku)}
                      className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer ${
                        isSel
                          ? "bg-cyan-neon text-navy-950 border-cyan-neon shadow-sm"
                          : "bg-navy-900/60 border-navy-700 text-slate-200 hover:border-cyan-neon/40"
                      }`}
                    >
                      <span>{group.main_sku}</span>
                      <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${isSel ? "bg-navy-950/20 text-navy-950" : "bg-white/10 text-cyan-neon"}`}>
                        {group.label_count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Subheader with "SKU Order" and Sorting Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pt-2 border-t border-navy-700/60 gap-2">
            <div className="text-xs font-extrabold uppercase tracking-wider text-slate-300 flex items-center space-x-2">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-neon" />
              <span>SKU Order ({sortedSubSkus.length} Separate SKUs)</span>
            </div>

            {/* Sort Controls (SKU Name A-Z vs No. of Labels) */}
            <div className="flex items-center space-x-2 self-start sm:self-auto">
              <span className="text-[11px] text-slate-400">Sort by:</span>
              <div className="inline-flex rounded-lg border border-navy-700 p-0.5 bg-navy-950 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setSortBy("name");
                    setSortAsc(true);
                  }}
                  className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                    sortBy === "name"
                      ? "bg-navy-700 text-cyan-neon font-bold"
                      : "text-slate-400 hover:text-white"
                  }`}
                  title="Alphabetical letter-wise sorting (A to Z)"
                >
                  SKU Name (A-Z)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSortBy("count");
                    setSortAsc(false);
                  }}
                  className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                    sortBy === "count"
                      ? "bg-navy-700 text-cyan-neon font-bold"
                      : "text-slate-400 hover:text-white"
                  }`}
                  title="Sort by label volume"
                >
                  No. of Labels
                </button>
              </div>

              {/* Ascending / Descending Direction Toggle */}
              <button
                type="button"
                onClick={() => setSortAsc(!sortAsc)}
                className="p-1 rounded-md border border-navy-700 bg-navy-950 text-slate-300 hover:text-cyan-neon transition-colors cursor-pointer"
                title={sortAsc ? "Ascending order" : "Descending order"}
              >
                <svg
                  className={`w-4 h-4 transform transition-transform ${sortAsc ? "" : "rotate-180"}`}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M12 19V5M5 12l7-7 7 7" />
                </svg>
              </button>
            </div>
          </div>

          {/* List of SKU Cards with Clean Cross (✕) Exclude button */}
          <div className="max-h-72 overflow-y-auto space-y-2 pr-1 scrollbar-thin">
            {sortedSubSkus.map((item, index) => {
              const isParentExcluded = excludedMainSkus.has(item.main_sku.toUpperCase());
              const isDirectExcluded = excludedSkus.has(item.sku.toUpperCase());
              const isSkuExcluded = isParentExcluded || isDirectExcluded;

              return (
                <div
                  key={item.sku}
                  className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl border transition-colors ${
                    isSkuExcluded
                      ? "bg-rose-950/25 border-rose-800/40 opacity-70"
                      : "bg-navy-950/70 border-navy-700/80 hover:border-cyan-neon/40"
                  }`}
                >
                  {/* Left: Rank Number + SKU Name */}
                  <div className="flex items-center space-x-3">
                    <span className="w-6 h-6 rounded-md bg-navy-800 border border-navy-600 flex items-center justify-center text-[11px] font-mono font-bold text-slate-300">
                      {index + 1}
                    </span>
                    <div>
                      <span className={`font-mono text-sm font-bold tracking-wide ${isSkuExcluded ? "line-through text-slate-400" : "text-white"}`}>
                        {item.sku}
                      </span>
                      <span className="ml-2 text-[10px] px-1.5 py-0.2 rounded bg-purple-brand/20 border border-purple-brand/30 text-purple-300 font-semibold">
                        {item.main_sku}
                      </span>
                      {isSkuExcluded && (
                        <span className="ml-2 text-[10px] px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold">
                          ✕ {isParentExcluded ? `Excluded (${item.main_sku})` : "Excluded"}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right: Quantity / Labels count + Couriers + Cross Button */}
                  <div className="flex items-center space-x-2.5">
                    <div className="flex flex-wrap gap-1 max-w-[150px] justify-end hidden sm:flex">
                      {item.courier_partners.map((cp) => (
                        <span key={cp} className="text-[10px] px-1.5 py-0.5 rounded bg-navy-800 text-slate-400 border border-navy-700">
                          {formatCourierName(cp)}
                        </span>
                      ))}
                    </div>

                    <span className="px-2.5 py-1 rounded-lg bg-navy-800/90 border border-navy-600 text-xs font-mono font-bold text-cyan-neon whitespace-nowrap">
                      {item.label_count} label{item.label_count === 1 ? "" : "s"}
                    </span>

                    {/* Cross (✕) Exclude button */}
                    <button
                      type="button"
                      onClick={() => toggleExcludeSku(item.sku)}
                      disabled={isParentExcluded}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center space-x-1 border cursor-pointer ${
                        isDirectExcluded
                          ? "bg-rose-500 text-white border-rose-400 shadow-sm"
                          : isParentExcluded
                          ? "bg-navy-950 text-slate-500 border-navy-800 cursor-not-allowed"
                          : "bg-navy-900 text-slate-300 hover:text-rose-300 hover:bg-rose-950/40 border-navy-700 hover:border-rose-500/40"
                      }`}
                      title={
                        isParentExcluded
                          ? `Already excluded because parent (${item.main_sku}) is crossed out`
                          : isDirectExcluded
                          ? `Click to re-include ${item.sku}`
                          : `Click to cross out & exclude ${item.sku}`
                      }
                    >
                      <span className="font-extrabold leading-none">✕</span>
                      <span className="text-[11px] hidden sm:inline">{isDirectExcluded ? "Excluded" : "Exclude"}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 3: COURIER PARTNER VIEW                               */}
      {/* ======================================================== */}
      {activeTab === "courier" && (
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between pb-1">
            <span className="text-xs font-extrabold uppercase tracking-wider text-slate-300 flex items-center space-x-2">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-neon" />
              <span>Courier Partner Order ({sortedCouriers.length} Carriers Detected)</span>
            </span>
          </div>

          <div className="space-y-2">
            {sortedCouriers.map((c, index) => {
              const isCourierExcluded = excludedCouriers.has(c.courier.toUpperCase());

              return (
                <div
                  key={c.courier}
                  className={`flex items-center justify-between px-4 py-3 rounded-xl border transition-colors ${
                    isCourierExcluded
                      ? "bg-rose-950/25 border-rose-800/40 opacity-70"
                      : "bg-navy-950/70 border-navy-700/80 hover:border-cyan-neon/40"
                  }`}
                >
                  {/* Left: Rank number + Courier Name */}
                  <div className="flex items-center space-x-3">
                    <span className="w-6 h-6 rounded-md bg-navy-800 border border-navy-600 flex items-center justify-center text-[11px] font-mono font-bold text-slate-300">
                      {index + 1}
                    </span>
                    <span className={`font-bold text-sm tracking-wide ${isCourierExcluded ? "line-through text-slate-400" : "text-white"}`}>
                      {formatCourierName(c.courier)}
                    </span>
                    <span className="text-xs text-slate-400">
                      ({c.percentage}% of batch)
                    </span>
                    {isCourierExcluded && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold">
                        ✕ Excluded
                      </span>
                    )}
                  </div>

                  {/* Right: Label Count Badge + Cross (✕) Exclude button */}
                  <div className="flex items-center space-x-2.5">
                    <span className="px-3 py-1 rounded-lg bg-navy-800 border border-cyan-neon/30 text-xs font-mono font-extrabold text-cyan-neon">
                      {c.label_count} labels
                    </span>

                    <button
                      type="button"
                      onClick={() => toggleExcludeCourier(c.courier)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 border cursor-pointer ${
                        isCourierExcluded
                          ? "bg-rose-500 text-white border-rose-400 shadow-sm hover:bg-rose-600"
                          : "bg-navy-900 text-slate-300 hover:text-rose-300 hover:bg-rose-950/40 border-navy-700 hover:border-rose-500/50"
                      }`}
                      title={
                        isCourierExcluded
                          ? `Click to re-include ${c.courier}`
                          : `Click to cross out & exclude ${c.courier}`
                      }
                    >
                      <span className="font-extrabold leading-none">✕</span>
                      <span>{isCourierExcluded ? "Excluded" : "Exclude"}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
