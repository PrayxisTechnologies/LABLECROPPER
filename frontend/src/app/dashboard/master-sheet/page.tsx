"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import {
  apiBulkDeleteMasterLabels,
  apiDeleteMasterLabel,
  apiExportMasterSheetCsv,
  apiGetMasterSheet,
  apiPrintSelectedMasterLabels,
  apiSyncMasterSheetFromHistory,
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
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  // Multi-select state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState<boolean>(false);
  const [isBulkPrinting, setIsBulkPrinting] = useState<boolean>(false);

  // Hidden print iframe
  const printIframeRef = useRef<HTMLIFrameElement>(null);

  // Memory SWR cache for sub-10ms instant tab switching and navigation
  const dataCacheRef = useRef<Map<string, { data: any; timestamp: number }>>(new Map());

  const loadData = useCallback(async (forceRefresh = false) => {
    const cacheKey = `${selectedPlatform}_${selectedCourier}_${selectedDays}_${search.trim()}_${page}`;
    const cached = dataCacheRef.current.get(cacheKey);

    // If cached within the last 45 seconds and not a forced reload, display instantly (<5ms)
    if (!forceRefresh && cached && Date.now() - cached.timestamp < 45000) {
      const res = cached.data;
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
      setLoading(false);
      // Still revalidate in background silently if older than 10s
      if (Date.now() - cached.timestamp < 10000) {
        return;
      }
    } else if (!cached) {
      setLoading(true);
    }

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

      // Save to fast cache
      dataCacheRef.current.set(cacheKey, { data: res, timestamp: Date.now() });

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
      if (!cached) {
        setError(
          err instanceof Error ? err.message : "Failed to load Master Sheet data."
        );
      }
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
    loadData(true);
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
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(labelId);
        return next;
      });
      dataCacheRef.current.clear();
      await loadData(true);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to delete label record.");
    }
  };

  // Toggle selection of all items currently displayed on page
  const handleSelectAllToggle = () => {
    if (items.length === 0) return;
    const allVisibleSelected = items.every((i) => selectedIds.has(i.id));
    if (allVisibleSelected) {
      // Deselect visible items
      setSelectedIds((prev) => {
        const next = new Set(prev);
        items.forEach((i) => next.delete(i.id));
        return next;
      });
    } else {
      // Select all visible items
      setSelectedIds((prev) => {
        const next = new Set(prev);
        items.forEach((i) => next.add(i.id));
        return next;
      });
    }
  };

  // Toggle selection for a single row
  const handleRowSelectToggle = (labelId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(labelId)) {
        next.delete(labelId);
      } else {
        next.add(labelId);
      }
      return next;
    });
  };

  // Deselect all
  const handleDeselectAll = () => {
    setSelectedIds(new Set());
  };

  // Bulk Delete selected items
  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    if (
      !window.confirm(
        `Are you sure you want to delete ${count} selected ${
          count === 1 ? "order" : "orders"
        } from Master Sheet? This cannot be undone.`
      )
    ) {
      return;
    }

    setIsBulkDeleting(true);
    try {
      const res = await apiBulkDeleteMasterLabels(Array.from(selectedIds));
      setSelectedIds(new Set());
      setSyncMessage(`Deleted ${res.deleted_count} selected orders successfully.`);
      setTimeout(() => setSyncMessage(null), 4000);
      dataCacheRef.current.clear();
      await loadData(true);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to bulk delete selected labels.");
    } finally {
      setIsBulkDeleting(false);
    }
  };

  // Print all selected labels merged into a single printable 4x6 thermal PDF
  const handlePrintSelected = async () => {
    if (selectedIds.size === 0) return;
    setIsBulkPrinting(true);
    try {
      const pdfBlob = await apiPrintSelectedMasterLabels(Array.from(selectedIds));
      const blobUrl = window.URL.createObjectURL(pdfBlob);

      // Open printable PDF in new tab/window
      const printWindow = window.open(blobUrl, "_blank");
      if (!printWindow) {
        // Fallback: trigger download if popups are blocked
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = `selected_labels_${selectedIds.size}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to prepare print document.");
    } finally {
      setIsBulkPrinting(false);
    }
  };

  // Re-sync all batches from processing history
  const handleSyncFromHistory = async () => {
    setIsSyncing(true);
    setSyncMessage(null);
    try {
      const res = await apiSyncMasterSheetFromHistory();
      setSyncMessage(res.message || `Successfully synced ${res.synced_count} batch orders!`);
      dataCacheRef.current.clear();
      await loadData(true);
      setTimeout(() => setSyncMessage(null), 5000);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to sync Master Sheet from history.");
    } finally {
      setIsSyncing(false);
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
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-1">
        <div className="space-y-1">
          <div className="flex items-center space-x-2.5">
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center space-x-2.5">
              <span>Master Label Sheet</span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-cyan-100 dark:bg-cyan-neon/15 text-cyan-700 dark:text-cyan-neon font-bold border border-cyan-300 dark:border-cyan-neon/30">
                {isFiltered
                  ? `${filteredTotal} of ${allTimeTotal} Orders`
                  : `${allTimeTotal} Active Orders (30 Days)`}
              </span>
            </h1>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-2xl">
            Live consolidated ledger (last 30 days active). Deduplicated by Order ID with 1-click single print, jump to PDF, and automatic 60-day trash auto-removal.
          </p>
        </div>

        {/* Action Buttons Toolbar in a Clean Responsive Row */}
        <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap sm:flex-nowrap shrink-0 self-start lg:self-center">
          <button
            type="button"
            onClick={handleSyncFromHistory}
            disabled={isSyncing}
            className="inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-white dark:bg-navy-900 border border-slate-200 dark:border-navy-700 hover:border-cyan-500 dark:hover:border-cyan-neon text-slate-700 dark:text-slate-200 hover:text-cyan-600 dark:hover:text-cyan-neon text-xs font-semibold shadow-sm transition-colors disabled:opacity-50 whitespace-nowrap"
            title="Scan processing history and auto-populate all batch orders"
          >
            <svg
              className={`w-3.5 h-3.5 text-cyan-600 dark:text-cyan-neon ${isSyncing ? "animate-spin" : ""}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 11-.57-8.38l5.67-5.67" />
            </svg>
            <span>{isSyncing ? "Syncing..." : "Sync Batches"}</span>
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            disabled={total === 0}
            className="inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-white dark:bg-navy-900 border border-slate-200 dark:border-navy-700 hover:border-slate-300 dark:hover:border-slate-600 text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white text-xs font-semibold shadow-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
            title="Download full master database as CSV"
          >
            <svg className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-neon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>Export CSV</span>
          </button>

          <Link
            href="/"
            className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white font-bold text-xs shadow-md shadow-cyan-500/20 transition-all active:scale-95 whitespace-nowrap"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>Crop New Batch</span>
          </Link>
        </div>
      </div>

      {/* Platform Sub-Page Tabs */}
      <div className="flex items-center space-x-1.5 border-b border-slate-200 dark:border-navy-800 pb-2 overflow-x-auto scrollbar-none">
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
                  ? "bg-cyan-500 dark:bg-cyan-neon text-white dark:text-navy-950 shadow-sm dark:shadow-glow"
                  : "bg-white dark:bg-navy-900 border border-slate-200 dark:border-navy-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:border-slate-300 dark:hover:border-slate-600 shadow-sm"
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`px-1.5 py-0.5 rounded-md text-[10px] font-extrabold ${
                  isActive
                    ? "bg-white/20 dark:bg-navy-950/20 text-white dark:text-navy-950"
                    : "bg-slate-100 dark:bg-navy-950 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-navy-700"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Sync Success / Feedback Banner */}
      {syncMessage && (
        <div className="p-3.5 rounded-2xl bg-cyan-50 dark:bg-cyan-neon/10 border border-cyan-200 dark:border-cyan-neon/30 text-cyan-800 dark:text-cyan-neon text-xs font-semibold flex items-center justify-between shadow-sm animate-fade-in">
          <div className="flex items-center space-x-2">
            <svg className="w-4 h-4 text-cyan-600 dark:text-cyan-neon shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>{syncMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setSyncMessage(null)}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-1 rounded"
          >
            ✕
          </button>
        </div>
      )}

      {/* Top Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-2xl bg-white dark:bg-navy-900 border border-slate-200 dark:border-navy-800 shadow-sm">
          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
            {isFiltered ? "Filtered Orders" : "Total Orders"}
          </span>
          <p className="text-xl font-extrabold text-slate-900 dark:text-white mt-1">
            {filteredTotal}
            {isFiltered && (
              <span className="text-xs font-normal text-slate-500 dark:text-slate-400 ml-1.5">
                / {allTimeTotal} All-Time
              </span>
            )}
          </p>
        </div>
        <div className="p-3.5 rounded-2xl bg-white dark:bg-navy-900 border border-slate-200 dark:border-navy-800 shadow-sm">
          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Distinct SKUs</span>
          <p className="text-xl font-extrabold text-cyan-600 dark:text-cyan-neon mt-1">{uniqueSkus}</p>
        </div>
        <div className="p-3.5 rounded-2xl bg-white dark:bg-navy-900 border border-slate-200 dark:border-navy-800 shadow-sm">
          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Couriers Active</span>
          <p className="text-xl font-extrabold text-purple-600 dark:text-purple-300 mt-1">{couriersList.length || 0}</p>
        </div>
        <div className="p-3.5 rounded-2xl bg-white dark:bg-navy-900 border border-slate-200 dark:border-navy-800 shadow-sm">
          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Deduplication Status</span>
          <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 mt-2 flex items-center space-x-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400" />
            <span>Keyed by Order ID (100% Unique)</span>
          </p>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs">
          {error}
        </div>
      )}

      {/* Search & Filter Bar with Days and Courier dropdowns */}
      <div className="bg-white dark:bg-navy-900 border border-slate-200 dark:border-navy-800 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-3 shadow-sm">
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
              className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-navy-950 border border-slate-300 dark:border-navy-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 text-xs focus:outline-none focus:border-cyan-500 dark:focus:border-cyan-neon transition-colors"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-navy-800 hover:bg-slate-200 dark:hover:bg-navy-700 border border-slate-300 dark:border-navy-700 text-xs font-semibold text-slate-800 dark:text-slate-200 transition-colors shadow-sm"
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
              className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-navy-800"
              title="Clear search"
            >
              ✕
            </button>
          )}
        </form>

        <div className="flex flex-wrap items-center space-x-3 w-full md:w-auto justify-end">
          {/* Days Filter */}
          <div className="flex items-center space-x-2">
            <label className="text-xs text-slate-500 dark:text-slate-400 font-medium">Days:</label>
            <select
              value={selectedDays}
              onChange={(e) => {
                setSelectedDays(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-navy-950 border border-slate-300 dark:border-navy-700 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-cyan-500 dark:focus:border-cyan-neon"
            >
              <option value="all">Last 30 Days (Active)</option>
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="7days">Last 7 Days</option>
              <option value="this_month">This Month</option>
            </select>
          </div>

          {/* Courier Filter */}
          <div className="flex items-center space-x-2">
            <label className="text-xs text-slate-500 dark:text-slate-400 font-medium">Courier:</label>
            <select
              value={selectedCourier}
              onChange={(e) => {
                setSelectedCourier(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-navy-950 border border-slate-300 dark:border-navy-700 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-cyan-500 dark:focus:border-cyan-neon"
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
      <div className="bg-white dark:bg-navy-900 border border-slate-200 dark:border-navy-800 rounded-2xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center space-y-3">
            <div className="w-8 h-8 border-2 border-cyan-500 dark:border-cyan-neon border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-slate-500 dark:text-slate-400">Loading Master Sheet records...</p>
          </div>
        ) : items.length === 0 ? (
          <div className="py-20 text-center px-4">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-navy-800 border border-slate-200 dark:border-navy-700 mx-auto flex items-center justify-center text-slate-400 dark:text-slate-500 mb-3.5">
              <svg className="w-7 h-7 text-cyan-600 dark:text-cyan-neon/80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">No Master Sheet Records Found</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 max-w-md mx-auto leading-relaxed">
              {search
                ? `No orders matched query '${search}'. Check for typos or try searching by SKU or WBL tracking ID.`
                : selectedPlatform !== "all"
                ? `No orders recorded yet for ${selectedPlatform}. Upload and crop labels from the ${selectedPlatform} tab to see them tracked here.`
                : "Whenever you crop shipping label batches, each unique Order ID, real SKU, WBL ID, and exact PDF page position is automatically tracked here."}
            </p>
            {!search && (
              <Link
                href="/"
                className="mt-5 inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-cyan-500 dark:bg-cyan-neon text-white dark:text-navy-950 font-bold text-xs shadow-sm dark:shadow-glow hover:bg-cyan-600 dark:hover:bg-cyan-400 transition-all"
              >
                <span>Crop Your First Batch</span>
              </Link>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-navy-800 text-slate-600 dark:text-slate-400 font-semibold bg-slate-50/80 dark:bg-navy-950/50">
                  <th className="py-3.5 px-3 w-10 text-center">
                    <input
                      type="checkbox"
                      aria-label="Select all visible orders"
                      checked={items.length > 0 && items.every((i) => selectedIds.has(i.id))}
                      onChange={handleSelectAllToggle}
                      className="w-4 h-4 rounded border-slate-300 dark:border-navy-600 text-cyan-600 focus:ring-cyan-500 cursor-pointer"
                    />
                  </th>
                  <th className="py-3.5 px-4 font-bold">Order ID (Unique Key)</th>
                  <th className="py-3.5 px-4">Real SKU</th>
                  <th className="py-3.5 px-4">WBL ID (Tracking No.)</th>
                  <th className="py-3.5 px-4">Delivery Partner</th>
                  <th className="py-3.5 px-4">Cropped PDF File &amp; Page No.</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-navy-800/60">
                {items.map((item) => (
                  <tr
                    key={item.id}
                    className={`transition-colors ${
                      selectedIds.has(item.id)
                        ? "bg-cyan-500/10 dark:bg-cyan-500/15"
                        : "hover:bg-slate-50/80 dark:hover:bg-navy-800/35"
                    }`}
                  >
                    {/* Checkbox column */}
                    <td className="py-3.5 px-3 text-center">
                      <input
                        type="checkbox"
                        aria-label={`Select order ${item.order_id}`}
                        checked={selectedIds.has(item.id)}
                        onChange={() => handleRowSelectToggle(item.id)}
                        className="w-4 h-4 rounded border-slate-300 dark:border-navy-600 text-cyan-600 focus:ring-cyan-500 cursor-pointer"
                      />
                    </td>

                    {/* 1. Order ID */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center space-x-1.5">
                        <span className="font-mono font-bold text-slate-900 dark:text-white tracking-wide">
                          {item.order_id}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopyText(item.order_id, `order_${item.id}`)}
                          className="p-1 rounded text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-neon hover:bg-slate-100 dark:hover:bg-navy-800"
                          title="Copy Order ID"
                        >
                          {copiedId === `order_${item.id}` ? (
                            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">Copied!</span>
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
                      <span className="inline-block px-2.5 py-1 rounded-md bg-cyan-50 dark:bg-cyan-neon/10 border border-cyan-200 dark:border-cyan-neon/30 text-cyan-700 dark:text-cyan-neon font-mono font-bold text-xs">
                        {item.sku}
                      </span>
                      {item.matched_sku && item.matched_sku.trim().toUpperCase() !== item.sku.trim().toUpperCase() && (
                        <span className="block text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                          Mapped: <strong className="text-amber-700 dark:text-amber-300 font-mono">{item.matched_sku}</strong>
                        </span>
                      )}
                    </td>

                    {/* 3. WBL ID (AWB Number - e.g. VL0085864655841) */}
                    <td className="py-3.5 px-4">
                      {item.wbl_id ? (
                        <div className="flex items-center space-x-1.5">
                          <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-navy-950 border border-slate-200 dark:border-navy-700 font-mono text-xs font-semibold text-amber-700 dark:text-amber-300 flex items-center space-x-1">
                            <svg className="w-3 h-3 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M3 5h2v14H3zM7 5h1v14H7zM10 5h2v14h-2zM14 5h1v14h-1zM17 5h3v14h-3z" />
                            </svg>
                            <span>{item.wbl_id}</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopyText(item.wbl_id!, `wbl_${item.id}`)}
                            className="p-1 rounded text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-neon hover:bg-slate-100 dark:hover:bg-navy-800"
                            title="Copy WBL Tracking ID"
                          >
                            {copiedId === `wbl_${item.id}` ? (
                              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">Copied!</span>
                            ) : (
                              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                              </svg>
                            )}
                          </button>
                        </div>
                      ) : (
                        <span className="text-slate-400 dark:text-slate-500 text-[11px] italic">No WBL ID</span>
                      )}
                    </td>

                    {/* 4. Delivery Partner */}
                    <td className="py-3.5 px-4">
                      <span className="px-2.5 py-1 rounded-md bg-purple-50 dark:bg-purple-brand/10 border border-purple-200 dark:border-purple-brand/30 text-purple-700 dark:text-purple-300 font-medium text-[11px]">
                        {item.courier_partner}
                      </span>
                    </td>

                    {/* 5. Cropped PDF File & Page Location(s) */}
                    <td className="py-3.5 px-4 max-w-sm">
                      <div className="space-y-1.5">
                        {item.appearances && item.appearances.length > 0 ? (
                          item.appearances.map((app, appIdx) => (
                            <div
                              key={appIdx}
                              className="flex items-center space-x-2 p-1.5 rounded-lg bg-slate-50 dark:bg-navy-950 border border-slate-200 dark:border-navy-800 text-[11px]"
                            >
                              <svg className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-neon shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                                <polyline points="14 2 14 8 20 8" />
                              </svg>
                              <span className="font-mono text-slate-700 dark:text-slate-300 font-semibold truncate" title={app.pdf_filename}>
                                {app.pdf_filename}
                              </span>
                              <span className="px-1.5 py-0.5 rounded bg-cyan-100 dark:bg-cyan-neon/15 text-cyan-700 dark:text-cyan-neon font-bold text-[10px] shrink-0">
                                Page #{app.page_number}
                              </span>
                            </div>
                          ))
                        ) : (
                          <span className="text-slate-400 dark:text-slate-500 text-[11px] italic">No file records</span>
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
                              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-navy-800 hover:bg-slate-200 dark:hover:bg-navy-700 text-slate-700 dark:text-slate-200 hover:text-cyan-600 dark:hover:text-cyan-neon font-semibold text-xs border border-slate-200 dark:border-navy-700 transition-colors shadow-sm"
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
                              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-cyan-500 dark:bg-cyan-neon text-white dark:text-navy-950 font-bold text-xs shadow-sm dark:shadow-glow hover:bg-cyan-600 dark:hover:bg-cyan-400 transition-all active:scale-95 disabled:opacity-50"
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
                              className="p-1.5 rounded-lg bg-slate-100 dark:bg-navy-800 hover:bg-rose-50 dark:hover:bg-rose-500/20 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 border border-slate-200 dark:border-navy-700 hover:border-rose-300 dark:hover:border-rose-500/30 transition-colors shadow-sm"
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
          <div className="p-4 border-t border-slate-200 dark:border-navy-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>
              Showing {(page - 1) * 25 + 1} - {Math.min(page * 25, total)} of {total} Orders
            </span>
            <div className="flex items-center space-x-1.5">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className="px-2.5 py-1 rounded-lg bg-white dark:bg-navy-800 border border-slate-200 dark:border-navy-700 hover:bg-slate-50 dark:hover:bg-navy-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-700 dark:text-white shadow-sm"
              >
                Previous
              </button>
              <span className="px-2 text-slate-700 dark:text-slate-300 font-semibold">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
                className="px-2.5 py-1 rounded-lg bg-white dark:bg-navy-800 border border-slate-200 dark:border-navy-700 hover:bg-slate-50 dark:hover:bg-navy-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-700 dark:text-white shadow-sm"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Floating Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-slate-900/95 dark:bg-navy-950/95 backdrop-blur-md border border-cyan-500/50 text-white rounded-2xl px-5 py-3 shadow-2xl flex items-center space-x-4 animate-in fade-in slide-in-from-bottom-4 duration-200">
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
            <span className="text-xs font-bold font-mono">
              {selectedIds.size} {selectedIds.size === 1 ? "Order" : "Orders"} Selected
            </span>
          </div>

          <div className="h-4 w-px bg-slate-700" />

          {/* Print Selected */}
          <button
            type="button"
            onClick={handlePrintSelected}
            disabled={isBulkPrinting}
            className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-navy-950 font-bold text-xs shadow-md transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
            title="Merge and print selected 4x6 thermal labels"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
            <span>{isBulkPrinting ? "Merging PDF..." : "Print Selected"}</span>
          </button>

          {/* Delete Selected */}
          <button
            type="button"
            onClick={handleBulkDelete}
            disabled={isBulkDeleting}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-600 border border-rose-500/50 text-rose-300 hover:text-white font-semibold text-xs transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
            title="Delete selected orders from Master Sheet"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
            </svg>
            <span>{isBulkDeleting ? "Deleting..." : "Delete Selected"}</span>
          </button>

          {/* Deselect All */}
          <button
            type="button"
            onClick={handleDeselectAll}
            className="text-xs text-slate-400 hover:text-white underline pl-1 cursor-pointer"
          >
            Deselect
          </button>
        </div>
      )}
    </div>
  );
}
