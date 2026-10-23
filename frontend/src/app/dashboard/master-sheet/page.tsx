"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import {
  apiClearMasterSheet,
  apiDeleteMasterLabel,
  apiExportMasterSheetCsv,
  apiGetMasterSheet,
  getSingleLabelPrintUrl,
} from "@/lib/api-auth";
import { getViewPdfUrl } from "@/lib/api";
import { LabelAppearance, MasterLabelItem } from "@/lib/types";

export default function MasterSheetPage() {
  const [items, setItems] = useState<MasterLabelItem[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [allTimeTotal, setAllTimeTotal] = useState<number>(0);
  const [filteredTotal, setFilteredTotal] = useState<number>(0);
  const [uniqueOrders, setUniqueOrders] = useState<number>(0);
  const [uniqueSkus, setUniqueSkus] = useState<number>(0);
  const [couriersList, setCouriersList] = useState<string[]>([]);
  const [marketplaceCounts, setMarketplaceCounts] = useState<Record<string, number>>({});
  const [page, setPage] = useState<number>(1);
  const [search, setSearch] = useState<string>("");
  const [selectedCourier, setSelectedCourier] = useState<string>("all");
  const [selectedDays, setSelectedDays] = useState<string>("all");
  const [selectedPlatform, setSelectedPlatform] = useState<string>("all");
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [printingJobKey, setPrintingJobKey] = useState<string | null>(null);

  // Hidden print iframe
  const printIframeRef = useRef<HTMLIFrameElement>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGetMasterSheet({
        search: search.trim() || undefined,
        courier: selectedCourier !== "all" ? selectedCourier : undefined,
        marketplace: selectedPlatform !== "all" ? selectedPlatform : undefined,
        days: selectedDays !== "all" ? selectedDays : undefined,
        page,
        size: 25,
      });
      setItems(res.items);
      setTotal(res.total);
      setFilteredTotal(res.filtered_total ?? res.total);
      setAllTimeTotal(res.all_time_total ?? res.unique_orders_count);
      setUniqueOrders(res.unique_orders_count);
      setUniqueSkus(res.unique_skus_count);
      if (res.marketplace_counts) {
        setMarketplaceCounts(res.marketplace_counts);
      }
      if (res.couriers_list && res.couriers_list.length > 0) {
        setCouriersList(res.couriers_list);
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to load Master Sheet data."
      );
    } finally {
      setLoading(false);
    }
  }, [search, selectedCourier, selectedPlatform, selectedDays, page]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadData();
  };

  const handleCopyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Direct 1-Click Single Label Print
  const handlePrintLabel = (app: LabelAppearance) => {
    const key = `${app.job_id}_p${app.page_number}`;
    setPrintingJobKey(key);

    const printUrl = getSingleLabelPrintUrl(app.job_id, app.page_number);

    // Create or reuse hidden iframe
    let iframe = document.getElementById("single-label-print-iframe") as HTMLIFrameElement;
    if (!iframe) {
      iframe = document.createElement("iframe");
      iframe.id = "single-label-print-iframe";
      iframe.style.position = "fixed";
      iframe.style.right = "0";
      iframe.style.bottom = "0";
      iframe.style.width = "0";
      iframe.style.height = "0";
      iframe.style.border = "0";
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
        setPrintingJobKey(null);
      }
    };
  };

  // Jump directly to that page in the PDF Viewer
  const handleViewLabel = (app: LabelAppearance) => {
    const baseViewUrl = getViewPdfUrl(app.job_id);
    const targetUrl = `${baseViewUrl}#page=${app.page_number}`;
    window.open(targetUrl, "_blank");
  };

  // Export CSV
  const handleExportCsv = async () => {
    try {
      const blob = await apiExportMasterSheetCsv({
        search: search.trim() || undefined,
        courier: selectedCourier !== "all" ? selectedCourier : undefined,
        marketplace: selectedPlatform !== "all" ? selectedPlatform : undefined,
        days: selectedDays !== "all" ? selectedDays : undefined,
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const mpTag = selectedPlatform !== "all" ? `_${selectedPlatform.toLowerCase()}` : "";
      a.download = `labelflow_master_sheet${mpTag}_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to export CSV.");
    }
  };

  // Delete single label record
  const handleDeleteLabel = async (labelId: string, orderId: string) => {
    if (!window.confirm(`Delete Order "${orderId}" from Master Sheet?`)) {
      return;
    }
    try {
      await apiDeleteMasterLabel(labelId);
      loadData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to delete label record.");
    }
  };

  // Clear all or platform-specific records
  const handleClearSheet = async () => {
    const target = selectedPlatform !== "all" ? selectedPlatform : "ALL";
    if (
      !window.confirm(
        `Are you sure you want to clear ${target} orders from the Master Sheet? This cannot be undone.`
      )
    ) {
      return;
    }
    try {
      await apiClearMasterSheet(selectedPlatform !== "all" ? selectedPlatform : undefined);
      loadData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to clear Master Sheet.");
    }
  };

  const totalPages = Math.ceil(total / 25) || 1;
  const isFiltered =
    selectedDays !== "all" ||
    selectedCourier !== "all" ||
    selectedPlatform !== "all" ||
    search.trim().length > 0;

  return (
    <div className="space-y-6">
      {/* Hidden print iframe container */}
      <iframe ref={printIframeRef} className="hidden" />

      {/* Header & Export Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight flex items-center space-x-2.5">
              <span>Master Label Sheet</span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-cyan-neon/15 text-cyan-neon font-bold border border-cyan-neon/30">
                {isFiltered
                  ? `${filteredTotal} of ${allTimeTotal} Orders`
                  : `${allTimeTotal} Total Orders`}
              </span>
            </h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Consolidated master database of every cropped label. Deduplicated strictly by Order ID with exact PDF page locations, 1-click printing, and instant view.
          </p>
        </div>

        <div className="flex items-center space-x-2.5 self-start sm:self-auto">
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={total === 0}
            className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-navy-900 border border-navy-700 hover:border-slate-500 text-slate-200 hover:text-white text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title="Download full master database as CSV"
          >
            <svg className="w-4 h-4 text-cyan-neon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>Export CSV</span>
          </button>

          {total > 0 && (
            <button
              type="button"
              onClick={handleClearSheet}
              className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-navy-900 border border-navy-700 hover:border-rose-500/50 text-slate-300 hover:text-rose-300 text-xs font-semibold transition-colors"
              title="Clear records from Master Sheet"
            >
              <svg className="w-4 h-4 text-rose-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
              </svg>
              <span>Clear Sheet</span>
            </button>
          )}

          <Link
            href="/"
            className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-cyan-neon text-navy-950 font-bold text-xs shadow-glow hover:bg-cyan-400 transition-all active:scale-95"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>Crop New Batch</span>
          </Link>
        </div>
      </div>

      {/* Platform Sub-Page Tabs */}
      <div className="flex items-center space-x-1.5 border-b border-navy-800 pb-2 overflow-x-auto scrollbar-none">
        {[
          { id: "all", label: "All Platforms" },
          { id: "Meesho", label: "Meesho" },
          { id: "Flipkart", label: "Flipkart" },
          { id: "Amazon", label: "Amazon" },
          { id: "Myntra", label: "Myntra" },
          { id: "Snapdeal", label: "Snapdeal" },
        ].map((tab) => {
          const isActive = selectedPlatform.toLowerCase() === tab.id.toLowerCase();
          const count = marketplaceCounts[tab.id] ?? 0;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setSelectedPlatform(tab.id);
                setPage(1);
              }}
              className={`inline-flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
                isActive
                  ? "bg-cyan-neon text-navy-950 shadow-glow"
                  : "bg-navy-900 border border-navy-800 text-slate-400 hover:text-white hover:border-slate-600"
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`px-1.5 py-0.5 rounded-md text-[10px] font-extrabold ${
                  isActive
                    ? "bg-navy-950/20 text-navy-950"
                    : "bg-navy-950 text-slate-300 border border-navy-700"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Top Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-2xl bg-navy-900 border border-navy-800 shadow-sm">
          <span className="text-[11px] text-slate-400 font-medium">
            {isFiltered ? "Filtered Orders" : "Total Orders"}
          </span>
          <p className="text-xl font-extrabold text-white mt-1">
            {filteredTotal}
            {isFiltered && (
              <span className="text-xs font-normal text-slate-400 ml-1.5">
                / {allTimeTotal} All-Time
              </span>
            )}
          </p>
        </div>
        <div className="p-3.5 rounded-2xl bg-navy-900 border border-navy-800 shadow-sm">
          <span className="text-[11px] text-slate-400 font-medium">Distinct SKUs</span>
          <p className="text-xl font-extrabold text-cyan-neon mt-1">{uniqueSkus}</p>
        </div>
        <div className="p-3.5 rounded-2xl bg-navy-900 border border-navy-800 shadow-sm">
          <span className="text-[11px] text-slate-400 font-medium">Couriers Active</span>
          <p className="text-xl font-extrabold text-purple-300 mt-1">{couriersList.length || 0}</p>
        </div>
        <div className="p-3.5 rounded-2xl bg-navy-900 border border-navy-800 shadow-sm">
          <span className="text-[11px] text-slate-400 font-medium">Deduplication Status</span>
          <p className="text-xs font-bold text-emerald-400 mt-2 flex items-center space-x-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>Keyed by Order ID (100% Unique)</span>
          </p>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
          {error}
        </div>
      )}

      {/* Search & Filter Bar with Days and Courier dropdowns */}
      <div className="bg-navy-900 border border-navy-800 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-3 shadow-sm">
        <form onSubmit={handleSearchSubmit} className="w-full md:max-w-md flex items-center space-x-2">
          <div className="relative flex-1">
            <svg
              className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by Order ID, SKU, or WBL tracking..."
              className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-navy-950 border border-navy-700 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-cyan-neon transition-colors"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2.5 rounded-xl bg-navy-800 hover:bg-navy-700 border border-navy-700 text-xs font-semibold text-slate-200 transition-colors"
          >
            Search
          </button>
          {search && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setPage(1);
              }}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-navy-800"
              title="Clear search"
            >
              ✕
            </button>
          )}
        </form>

        <div className="flex flex-wrap items-center space-x-3 w-full md:w-auto justify-end">
          {/* Days Filter */}
          <div className="flex items-center space-x-2">
            <label className="text-xs text-slate-400 font-medium">Days:</label>
            <select
              value={selectedDays}
              onChange={(e) => {
                setSelectedDays(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 rounded-xl bg-navy-950 border border-navy-700 text-white text-xs focus:outline-none focus:border-cyan-neon"
            >
              <option value="all">All Time</option>
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="7days">Last 7 Days</option>
              <option value="30days">Last 30 Days</option>
              <option value="this_month">This Month</option>
            </select>
          </div>

          {/* Courier Filter */}
          <div className="flex items-center space-x-2">
            <label className="text-xs text-slate-400 font-medium">Courier:</label>
            <select
              value={selectedCourier}
              onChange={(e) => {
                setSelectedCourier(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 rounded-xl bg-navy-950 border border-navy-700 text-white text-xs focus:outline-none focus:border-cyan-neon"
            >
              <option value="all">All Delivery Partners</option>
              {couriersList.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Master Sheet Table */}
      <div className="bg-navy-900 border border-navy-800 rounded-2xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center space-y-3">
            <div className="w-8 h-8 border-2 border-cyan-neon border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-slate-400">Loading Master Sheet records...</p>
          </div>
        ) : items.length === 0 ? (
          <div className="py-20 text-center px-4">
            <div className="w-14 h-14 rounded-2xl bg-navy-800 border border-navy-700 mx-auto flex items-center justify-center text-slate-500 mb-3.5">
              <svg className="w-7 h-7 text-cyan-neon/80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </div>
            <h3 className="text-base font-bold text-white">No Master Sheet Records Found</h3>
            <p className="text-xs text-slate-400 mt-1.5 max-w-md mx-auto leading-relaxed">
              {search
                ? `No orders matched query '${search}'. Check for typos or try searching by SKU or WBL tracking ID.`
                : selectedPlatform !== "all"
                ? `No orders recorded yet for ${selectedPlatform}. Upload and crop labels from the ${selectedPlatform} tab to see them tracked here.`
                : "Whenever you crop shipping label batches, each unique Order ID, real SKU, WBL ID, and exact PDF page position is automatically tracked here."}
            </p>
            {!search && (
              <Link
                href="/"
                className="mt-5 inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-cyan-neon text-navy-950 font-bold text-xs shadow-glow hover:bg-cyan-400 transition-all"
              >
                <span>Crop Your First Batch</span>
              </Link>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-navy-800 text-slate-400 font-semibold bg-navy-950/50">
                  <th className="py-3.5 px-4 font-bold">Order ID (Unique Key)</th>
                  <th className="py-3.5 px-4">Real SKU</th>
                  <th className="py-3.5 px-4">WBL ID (Tracking No.)</th>
                  <th className="py-3.5 px-4">Delivery Partner</th>
                  <th className="py-3.5 px-4">Cropped PDF File &amp; Page No.</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-800/60">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-navy-800/35 transition-colors">
                    {/* 1. Order ID */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center space-x-1.5">
                        <span className="font-mono font-bold text-white tracking-wide">
                          {item.order_id}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopyText(item.order_id, `order_${item.id}`)}
                          className="p-1 rounded text-slate-500 hover:text-cyan-neon hover:bg-navy-800"
                          title="Copy Order ID"
                        >
                          {copiedId === `order_${item.id}` ? (
                            <span className="text-[10px] text-emerald-400 font-bold">Copied!</span>
                          ) : (
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                            </svg>
                          )}
                        </button>
                      </div>
                      <span className="text-[10px] text-slate-500">
                        {item.marketplace} • Added {new Date(item.first_processed_at).toLocaleDateString()}
                      </span>
                    </td>

                    {/* 2. Full Real SKU (e.g. Rospack 80ml 074) */}
                    <td className="py-3.5 px-4">
                      <span className="inline-block px-2.5 py-1 rounded-md bg-cyan-neon/10 border border-cyan-neon/30 text-cyan-neon font-mono font-bold text-xs">
                        {item.sku}
                      </span>
                    </td>

                    {/* 3. WBL ID (AWB Number - e.g. VL0085864655841) */}
                    <td className="py-3.5 px-4">
                      {item.wbl_id ? (
                        <div className="flex items-center space-x-1.5">
                          <span className="px-2 py-0.5 rounded bg-navy-950 border border-navy-700 font-mono text-xs font-semibold text-amber-300 flex items-center space-x-1">
                            <svg className="w-3 h-3 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M3 5h2v14H3zM7 5h1v14H7zM10 5h2v14h-2zM14 5h1v14h-1zM17 5h3v14h-3z" />
                            </svg>
                            <span>{item.wbl_id}</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopyText(item.wbl_id!, `wbl_${item.id}`)}
                            className="p-1 rounded text-slate-500 hover:text-cyan-neon hover:bg-navy-800"
                            title="Copy WBL Tracking ID"
                          >
                            {copiedId === `wbl_${item.id}` ? (
                              <span className="text-[10px] text-emerald-400 font-bold">Copied!</span>
                            ) : (
                              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                              </svg>
                            )}
                          </button>
                        </div>
                      ) : (
                        <span className="text-slate-500 text-[11px] italic">No WBL ID</span>
                      )}
                    </td>

                    {/* 4. Delivery Partner */}
                    <td className="py-3.5 px-4">
                      <span className="px-2.5 py-1 rounded-md bg-purple-brand/10 border border-purple-brand/30 text-purple-300 font-medium text-[11px]">
                        {item.courier_partner}
                      </span>
                    </td>

                    {/* 5. Cropped PDF File & Page Location(s) - Clean badge display without duplicate buttons */}
                    <td className="py-3.5 px-4 max-w-sm">
                      <div className="space-y-1.5">
                        {item.appearances && item.appearances.length > 0 ? (
                          item.appearances.map((app, appIdx) => (
                            <div
                              key={appIdx}
                              className="flex items-center space-x-2 p-1.5 rounded-lg bg-navy-950 border border-navy-800 text-[11px]"
                            >
                              <svg className="w-3.5 h-3.5 text-cyan-neon shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                                <polyline points="14 2 14 8 20 8" />
                              </svg>
                              <span className="font-mono text-slate-300 font-semibold truncate" title={app.pdf_filename}>
                                {app.pdf_filename}
                              </span>
                              <span className="px-1.5 py-0.5 rounded bg-cyan-neon/15 text-cyan-neon font-bold text-[10px] shrink-0">
                                Page #{app.page_number}
                              </span>
                            </div>
                          ))
                        ) : (
                          <span className="text-slate-500 text-[11px] italic">No file records</span>
                        )}
                      </div>
                    </td>

                    {/* 6. Instant Actions - View and Print side-by-side */}
                    <td className="py-3.5 px-4 text-right">
                      {item.appearances && item.appearances.length > 0 && (() => {
                        const targetApp = item.appearances[item.appearances.length - 1];
                        const isPrinting = printingJobKey === `${targetApp.job_id}_p${targetApp.page_number}`;
                        return (
                          <div className="inline-flex items-center justify-end space-x-2">
                            {/* View Button */}
                            <button
                              type="button"
                              onClick={() => handleViewLabel(targetApp)}
                              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-navy-800 hover:bg-navy-700 text-slate-200 hover:text-cyan-neon font-semibold text-xs border border-navy-700 transition-colors"
                              title={`View ${targetApp.pdf_filename} directly at Page #${targetApp.page_number}`}
                            >
                              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                <circle cx="12" cy="12" r="3" />
                              </svg>
                              <span>View</span>
                            </button>

                            {/* Print Button */}
                            <button
                              type="button"
                              onClick={() => handlePrintLabel(targetApp)}
                              disabled={isPrinting}
                              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-cyan-neon text-navy-950 font-bold text-xs shadow-glow hover:bg-cyan-400 transition-all active:scale-95 disabled:opacity-50"
                              title={`Print single 4x6 label for Order ${item.order_id}`}
                            >
                              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <polyline points="6 9 6 2 18 2 18 9" />
                                <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" />
                                <rect x="6" y="14" width="12" height="8" />
                              </svg>
                              <span>{isPrinting ? "..." : "Print"}</span>
                            </button>

                            {/* Delete Button */}
                            <button
                              type="button"
                              onClick={() => handleDeleteLabel(item.id, item.order_id)}
                              className="p-1.5 rounded-lg bg-navy-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-navy-700 hover:border-rose-500/30 transition-colors"
                              title={`Delete Order ${item.order_id} from Master Sheet`}
                            >
                              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                              </svg>
                            </button>
                          </div>
                        );
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {total > 25 && (
          <div className="p-4 border-t border-navy-800 flex items-center justify-between text-xs text-slate-400">
            <span>
              Showing {(page - 1) * 25 + 1} - {Math.min(page * 25, total)} of {total} Orders
            </span>
            <div className="flex items-center space-x-1.5">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className="px-2.5 py-1 rounded-lg bg-navy-800 border border-navy-700 hover:bg-navy-700 disabled:opacity-40 disabled:cursor-not-allowed text-white"
              >
                Previous
              </button>
              <span className="px-2 text-slate-300 font-semibold">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
                className="px-2.5 py-1 rounded-lg bg-navy-800 border border-navy-700 hover:bg-navy-700 disabled:opacity-40 disabled:cursor-not-allowed text-white"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}