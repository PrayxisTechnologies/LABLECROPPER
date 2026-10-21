"use client";

import React, { useEffect, useMemo, useState } from "react";
import { UploadInspectionResponse, MainSkuSummary, SubSkuSummary, SortOption } from "@/lib/types";

interface UploadSummaryCardProps {
  data: UploadInspectionResponse;
  isLoading?: boolean;
  currentSort?: SortOption | string;
  onApplySort?: (sort: SortOption) => void;
  isReSorting?: boolean;
}

export const UploadSummaryCard: React.FC<UploadSummaryCardProps> = ({
  data,
  isLoading = false,
  currentSort = "sku_courier",
  onApplySort,
  isReSorting = false,
}) => {
  // Active Tab: "main_sku" (Parent groups), "all_skus" (Individual variants), or "courier"
  const [activeTab, setActiveTab] = useState<"main_sku" | "all_skus" | "courier">("main_sku");

  // Sorting in All SKUs Tab: "name" (A-Z letter-wise) or "count" (No. of Labels)
  const [sortBy, setSortBy] = useState<"name" | "count">("name");
  const [sortAsc, setSortAsc] = useState<boolean>(true);

  // Selected PDF Organization Mode in the dropdown
  const [selectedSort, setSelectedSort] = useState<SortOption>(
    (currentSort as SortOption) || "sku_courier"
  );

  useEffect(() => {
    if (currentSort) {
      setSelectedSort((currentSort as SortOption) || "sku_courier");
    }
  }, [currentSort]);

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

  // Courier list sorted descending by count (Image 3)
  const sortedCouriers = useMemo(() => {
    return [...data.courier_breakdown].sort((a, b) => b.label_count - a.label_count);
  }, [data.courier_breakdown]);

  // Color helper for Main SKU branding
  const getMainSkuColorStyle = (name: string) => {
    const upper = name.toUpperCase();
    if (upper.includes("BROWN")) {
      return {
        border: "border-amber-600/50 hover:border-amber-500",
        badge: "bg-amber-950/60 text-amber-300 border-amber-600/60",
        dot: "bg-amber-500",
        pill: "bg-amber-500/15 text-amber-300 border-amber-500/30",
      };
    }
    if (upper.includes("GREEN")) {
      return {
        border: "border-emerald-600/50 hover:border-emerald-500",
        badge: "bg-emerald-950/60 text-emerald-300 border-emerald-600/60",
        dot: "bg-emerald-500",
        pill: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
      };
    }
    if (upper.includes("PINK")) {
      return {
        border: "border-pink-600/50 hover:border-pink-500",
        badge: "bg-pink-950/60 text-pink-300 border-pink-600/60",
        dot: "bg-pink-500",
        pill: "bg-pink-500/15 text-pink-300 border-pink-500/30",
      };
    }
    if (upper.includes("BLUE")) {
      return {
        border: "border-sky-600/50 hover:border-sky-500",
        badge: "bg-sky-950/60 text-sky-300 border-sky-600/60",
        dot: "bg-sky-500",
        pill: "bg-sky-500/15 text-sky-300 border-sky-500/30",
      };
    }
    return {
      border: "border-cyan-neon/40 hover:border-cyan-neon",
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

  // Format courier display name (e.g. Xpressbees -> Xpress Bees)
  const formatCourierName = (c: string) => {
    if (c.toLowerCase() === "xpressbees") return "Xpress Bees";
    return c;
  };

  return (
    <div className="w-full bg-[#0C182B] border border-cyan-neon/30 rounded-2xl p-4 sm:p-5 my-4 shadow-xl transition-all">
      {/* Header with Title and Mode Switch Tabs */}
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
              Review order breakdown and choose how labels are organized in the output PDF
            </p>
          </div>
        </div>

        {/* 3 Dedicated Mode Tabs: Main SKU, All Sub-SKUs, Courier Partner */}
        <div className="flex items-center bg-navy-950/90 p-1 rounded-xl border border-navy-700 self-start sm:self-auto space-x-1">
          <button
            type="button"
            onClick={() => setActiveTab("main_sku")}
            className={`px-3 sm:px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 ${
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
            className={`px-3 sm:px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 ${
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
            className={`px-3 sm:px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 ${
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

      {/* TOP SORT SELECTOR BAR (Requested by user: "UPAR VO OPTION SELECT KAR KE PROCEED KARNE KA OR DO") */}
      {onApplySort && (
        <div className="mt-3 p-3 sm:p-3.5 rounded-xl bg-navy-950/95 border border-cyan-neon/35 flex flex-col md:flex-row md:items-center md:justify-between gap-3 shadow-md">
          <div className="flex items-center space-x-2.5">
            <span className="p-1.5 rounded-lg bg-cyan-neon/15 text-cyan-neon text-sm">
              🔀
            </span>
            <div>
              <span className="text-xs font-extrabold text-white block tracking-wide">
                Organize PDF Output Labels By:
              </span>
              <span className="text-[11px] text-slate-400">
                Select your preferred label printing sequence and apply instantly
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-2 w-full md:w-auto">
            <select
              value={selectedSort}
              onChange={(e) => setSelectedSort(e.target.value as SortOption)}
              disabled={isReSorting}
              className="flex-1 md:flex-none appearance-none bg-navy-900 border border-navy-600 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-neon cursor-pointer font-medium"
            >
              <option value="sku_courier">
                🏷️ SKU + Delivery partner (Brown&apos;s Valmo/Shadowfax, then Green)
              </option>
              <option value="courier_partner">
                🚚 Delivery partner (All Valmo first, then Shadowfax, then Xpress Bees)
              </option>
              <option value="sku">📦 SKU (Group by Product SKU & variants)</option>
              <option value="original_order">📄 Original order (Input PDF sequence)</option>
            </select>

            <button
              type="button"
              onClick={() => onApplySort(selectedSort)}
              disabled={isReSorting || selectedSort === currentSort}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all shadow-md flex items-center space-x-1.5 whitespace-nowrap ${
                selectedSort === currentSort
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 cursor-default"
                  : "bg-gradient-to-r from-cyan-neon to-purple-brand text-navy-950 hover:brightness-110 active:scale-95 cursor-pointer font-extrabold shadow-glow"
              }`}
            >
              {isReSorting ? (
                <span>Re-sorting...</span>
              ) : selectedSort === currentSort ? (
                <span>✓ Applied</span>
              ) : (
                <span>⚡ Apply & Re-Sort</span>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 1: MAIN SKU VIEW (Parent SKU + Couriers breakdown)     */}
      {/* ======================================================== */}
      {activeTab === "main_sku" && (
        <div className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase tracking-wider text-slate-300 flex items-center space-x-2">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-neon" />
              <span>Main SKUs ({data.main_skus.length} Main Product Families)</span>
            </span>

            {/* Quick action button for Main SKU sort */}
            {onApplySort && (
              <button
                type="button"
                onClick={() => onApplySort("sku_courier")}
                disabled={isReSorting || currentSort === "sku_courier"}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center space-x-1 ${
                  currentSort === "sku_courier"
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 cursor-default"
                    : "bg-cyan-neon/15 hover:bg-cyan-neon text-cyan-neon hover:text-navy-950 border border-cyan-neon/40 active:scale-95 cursor-pointer"
                }`}
              >
                <span>{currentSort === "sku_courier" ? "✓ Active in PDF" : "⚡ Apply SKU + Courier Sort"}</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {data.main_skus.map((group) => {
              const colorStyle = getMainSkuColorStyle(group.main_sku);
              const isExpanded = !!expandedMainSkus[group.main_sku];
              const courierCounts = group.courier_counts || {};

              return (
                <div
                  key={group.main_sku}
                  className={`rounded-xl bg-navy-950/80 border ${colorStyle.border} p-4 transition-all shadow-md`}
                >
                  {/* Top: Main SKU Title, Badge & Total Count */}
                  <div className="flex items-center justify-between pb-2.5 border-b border-navy-800">
                    <div className="flex items-center space-x-2.5">
                      <span className={`w-3 h-3 rounded-full ${colorStyle.dot}`} />
                      <span className="text-base font-extrabold text-white tracking-wide">
                        {group.main_sku}
                      </span>
                    </div>

                    <div className="flex items-center space-x-2">
                      <span className={`px-2.5 py-1 rounded-lg border text-xs font-mono font-extrabold ${colorStyle.badge}`}>
                        {group.label_count} Labels ({group.total_quantity} pcs)
                      </span>
                    </div>
                  </div>

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
                      className="text-xs font-semibold text-cyan-neon hover:underline flex items-center space-x-1 focus:outline-none"
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
                      {group.sub_skus.map((sub, sIdx) => (
                        <div
                          key={sub.sku}
                          className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-navy-900/90 border border-navy-800 text-xs"
                        >
                          <div className="flex items-center space-x-2">
                            <span className="text-[10px] font-mono text-slate-500 w-4">
                              {sIdx + 1}.
                            </span>
                            <span className="font-mono font-bold text-white">
                              {sub.sku}
                            </span>
                          </div>
                          <span className="font-mono text-cyan-neon font-semibold">
                            {sub.label_count} label{sub.label_count === 1 ? "" : "s"}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 2: ALL SUB-SKUS VIEW (Matches Image 2)                */}
      {/* ======================================================== */}
      {activeTab === "all_skus" && (
        <div className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase tracking-wider text-slate-300 flex items-center space-x-2">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-neon" />
              <span>SKU Variants ({data.all_skus.length} Items)</span>
            </span>

            {/* Quick action button for SKU variant sort */}
            {onApplySort && (
              <button
                type="button"
                onClick={() => onApplySort("sku")}
                disabled={isReSorting || currentSort === "sku"}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center space-x-1 ${
                  currentSort === "sku"
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 cursor-default"
                    : "bg-cyan-neon/15 hover:bg-cyan-neon text-cyan-neon hover:text-navy-950 border border-cyan-neon/40 active:scale-95 cursor-pointer"
                }`}
              >
                <span>{currentSort === "sku" ? "✓ Active in PDF" : "⚡ Apply SKU Sort"}</span>
              </button>
            )}
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
                    className="text-[10px] text-cyan-neon hover:underline"
                  >
                    Reset Filter (Show All)
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedMainSkuFilter(null)}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
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
                      className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all flex items-center space-x-1.5 ${
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

          {/* Subheader with "SKU Order" and Sorting Controls (Image 2) */}
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
                  className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
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
                  className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
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
                className="p-1 rounded-md border border-navy-700 bg-navy-950 text-slate-300 hover:text-cyan-neon transition-colors"
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

          {/* List of SKU Cards (matching Image 2) */}
          <div className="max-h-72 overflow-y-auto space-y-2 pr-1 scrollbar-thin">
            {sortedSubSkus.map((item, index) => (
              <div
                key={item.sku}
                className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-navy-950/70 border border-navy-700/80 hover:border-cyan-neon/40 transition-colors"
              >
                {/* Left: Rank Number + SKU Name */}
                <div className="flex items-center space-x-3">
                  <span className="w-6 h-6 rounded-md bg-navy-800 border border-navy-600 flex items-center justify-center text-[11px] font-mono font-bold text-slate-300">
                    {index + 1}
                  </span>
                  <div>
                    <span className="font-mono text-sm font-bold text-white tracking-wide">
                      {item.sku}
                    </span>
                    <span className="ml-2 text-[10px] px-1.5 py-0.2 rounded bg-purple-brand/20 border border-purple-brand/30 text-purple-300 font-semibold">
                      {item.main_sku}
                    </span>
                  </div>
                </div>

                {/* Right: Quantity / Labels count + Couriers */}
                <div className="flex items-center space-x-2">
                  <div className="flex flex-wrap gap-1 max-w-[150px] justify-end">
                    {item.courier_partners.map((cp) => (
                      <span key={cp} className="text-[10px] px-1.5 py-0.5 rounded bg-navy-800 text-slate-400 border border-navy-700">
                        {formatCourierName(cp)}
                      </span>
                    ))}
                  </div>
                  <span className="px-2.5 py-1 rounded-lg bg-navy-800/90 border border-navy-600 text-xs font-mono font-bold text-cyan-neon whitespace-nowrap">
                    {item.label_count} label{item.label_count === 1 ? "" : "s"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 3: COURIER PARTNER VIEW (Matches Image 3)             */}
      {/* ======================================================== */}
      {activeTab === "courier" && (
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between pb-1">
            <span className="text-xs font-extrabold uppercase tracking-wider text-slate-300 flex items-center space-x-2">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-neon" />
              <span>Courier Partner Order ({sortedCouriers.length} Carriers Detected)</span>
            </span>

            {/* Quick action button for Courier Partner Sort */}
            {onApplySort && (
              <button
                type="button"
                onClick={() => onApplySort("courier_partner")}
                disabled={isReSorting || currentSort === "courier_partner"}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 ${
                  currentSort === "courier_partner"
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 cursor-default"
                    : "bg-cyan-neon text-navy-950 hover:bg-cyan-300 active:scale-95 cursor-pointer font-extrabold shadow-sm"
                }`}
              >
                <span>{currentSort === "courier_partner" ? "✓ Active in PDF" : "⚡ Apply Delivery Sort"}</span>
              </button>
            )}
          </div>

          <div className="space-y-2">
            {sortedCouriers.map((c, index) => (
              <div
                key={c.courier}
                className="flex items-center justify-between px-4 py-3 rounded-xl bg-navy-950/70 border border-navy-700/80 hover:border-cyan-neon/40 transition-colors"
              >
                {/* Left: Rank number + Courier Name */}
                <div className="flex items-center space-x-3">
                  <span className="w-6 h-6 rounded-md bg-navy-800 border border-navy-600 flex items-center justify-center text-[11px] font-mono font-bold text-slate-300">
                    {index + 1}
                  </span>
                  <span className="font-bold text-sm text-white tracking-wide">
                    {formatCourierName(c.courier)}
                  </span>
                  <span className="text-xs text-slate-400">
                    ({c.percentage}% of batch)
                  </span>
                </div>

                {/* Right: Label Count Badge */}
                <span className="px-3 py-1 rounded-lg bg-navy-800 border border-cyan-neon/30 text-xs font-mono font-extrabold text-cyan-neon">
                  {c.label_count} labels
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
