"use client";

import React, { useEffect, useState, useRef } from "react";
import {
  apiCreateSku,
  apiDeleteSku,
  apiExportSkusCsv,
  apiGetSkus,
  apiImportSkusCsv,
  apiSyncSkusFromJobs,
  apiUpdateSku,
} from "@/lib/api-auth";
import { SKUImportResult, UserSKU } from "@/lib/types";

export default function SkusPage() {
  const [skus, setSkus] = useState<UserSKU[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [search, setSearch] = useState<string>("");
  const [filterActive, setFilterActive] = useState<string>("all");
  const [loading, setLoading] = useState<boolean>(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncSuccessMessage, setSyncSuccessMessage] = useState<string | null>(null);

  // Add / Edit Modal State (Parent SKU & Multiple Values / Sub-SKUs)
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [editingSku, setEditingSku] = useState<UserSKU | null>(null);
  const [skuCode, setSkuCode] = useState<string>("");
  const [keywords, setKeywords] = useState<string[]>([]);
  const [currentKeywordInput, setCurrentKeywordInput] = useState<string>("");
  const [keywordWarning, setKeywordWarning] = useState<string | null>(null);
  const keywordInputRef = useRef<HTMLInputElement>(null);
  const [showBulkInput, setShowBulkInput] = useState<boolean>(false);
  const [bulkInputText, setBulkInputText] = useState<string>("");
  const [isActive, setIsActive] = useState<boolean>(true);
  const [modalLoading, setModalLoading] = useState<boolean>(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // CSV Import Modal State
  const [importModalOpen, setImportModalOpen] = useState<boolean>(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importLoading, setImportLoading] = useState<boolean>(false);
  const [importResult, setImportResult] = useState<SKUImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadSkus = async () => {
    setLoading(true);
    setActionError(null);
    try {
      const activeParam =
        filterActive === "active"
          ? true
          : filterActive === "inactive"
          ? false
          : undefined;

      const res = await apiGetSkus({
        search: search.trim() || undefined,
        is_active: activeParam,
        page,
        size: 25,
      });
      setSkus(res.items);
      setTotal(res.total);
    } catch (err: unknown) {
      setActionError(
        err instanceof Error ? err.message : "Failed to load SKU database."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSkus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, filterActive]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadSkus();
  };

  // Open modal for Create
  const handleOpenCreate = () => {
    setEditingSku(null);
    setSkuCode("");
    setKeywords([]);
    setCurrentKeywordInput("");
    setKeywordWarning(null);
    setShowBulkInput(false);
    setBulkInputText("");
    setIsActive(true);
    setModalError(null);
    setModalOpen(true);
  };

  // Open modal for Edit
  const handleOpenEdit = (sku: UserSKU) => {
    setEditingSku(sku);
    setSkuCode(sku.sku_code);
    const initialKeywords =
      sku.keywords && sku.keywords.length > 0
        ? [...sku.keywords]
        : [sku.sku_code];
    setKeywords(initialKeywords);
    setCurrentKeywordInput("");
    setKeywordWarning(null);
    setShowBulkInput(false);
    setBulkInputText("");
    setIsActive(sku.is_active);
    setModalError(null);
    setModalOpen(true);
  };

  // Add keyword from current input field
  const handleAddCurrentKeyword = (explicitVal?: string) => {
    const raw = (explicitVal !== undefined ? explicitVal : currentKeywordInput).trim();
    if (!raw) return;
    const newValues = raw
      .split(/[,;\n\r]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const updated = [...keywords];
    let addedCount = 0;
    let dupVal: string | null = null;

    for (const val of newValues) {
      if (!updated.some((k) => k.toLowerCase() === val.toLowerCase())) {
        updated.push(val);
        addedCount++;
      } else {
        dupVal = val;
      }
    }

    if (addedCount > 0) {
      setKeywords(updated);
      setKeywordWarning(null);
    } else if (dupVal) {
      setKeywordWarning(`"${dupVal}" is already added in the list below.`);
      setTimeout(() => setKeywordWarning(null), 4000);
    }

    setCurrentKeywordInput("");
    setTimeout(() => {
      keywordInputRef.current?.focus();
    }, 50);
  };

  // Handle enter or comma in keyword input
  const handleKeywordKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (
      e.key === "Enter" ||
      e.code === "Enter" ||
      e.code === "NumpadEnter" ||
      e.keyCode === 13 ||
      e.key === ","
    ) {
      e.preventDefault();
      e.stopPropagation();
      const val = (e.currentTarget.value || currentKeywordInput).trim();
      if (val) {
        handleAddCurrentKeyword(val);
      } else {
        // If input is empty and Enter is pressed, submit/save the whole SKU
        handleSaveSku();
      }
    }
  };

  // Remove a keyword pill
  const handleRemoveKeyword = (indexToRemove: number) => {
    setKeywords((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  // Apply bulk keywords
  const handleApplyBulkKeywords = () => {
    if (!bulkInputText.trim()) return;
    const parsed = bulkInputText
      .split(/[\r\n,;]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const updated = [...keywords];
    for (const val of parsed) {
      if (!updated.some((k) => k.toLowerCase() === val.toLowerCase())) {
        updated.push(val);
      }
    }
    setKeywords(updated);
    setBulkInputText("");
    setShowBulkInput(false);
  };

  // Save SKU (Create or Update)
  const handleSaveSku = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setModalError(null);

    const cleanSku = skuCode.trim();
    if (!cleanSku) {
      setModalError("SKU Name is required.");
      return;
    }

    // Include currentKeywordInput if user typed but forgot to click Add
    let finalKeywords = [...keywords];
    if (currentKeywordInput.trim()) {
      const extra = currentKeywordInput
        .split(/[,;\n\r]+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      for (const val of extra) {
        if (!finalKeywords.some((k) => k.toLowerCase() === val.toLowerCase())) {
          finalKeywords.push(val);
        }
      }
    }

    // Default to cleanSku itself if no keywords added
    if (finalKeywords.length === 0) {
      finalKeywords = [cleanSku];
    }

    setModalLoading(true);
    try {
      const payload = {
        sku_code: cleanSku,
        product_name: cleanSku,
        keywords: finalKeywords,
        aliases: [],
        priority: 0,
        is_active: isActive,
      };

      if (editingSku) {
        await apiUpdateSku(editingSku.id, payload);
        setSyncSuccessMessage(`✓ SKU '${cleanSku}' updated successfully!`);
      } else {
        await apiCreateSku(payload);
        setSyncSuccessMessage(`✓ SKU '${cleanSku}' created successfully!`);
      }
      setTimeout(() => setSyncSuccessMessage(null), 4000);
      setModalOpen(false);
      loadSkus();
    } catch (err: unknown) {
      setModalError(
        err instanceof Error ? err.message : "Failed to save SKU definition."
      );
    } finally {
      setModalLoading(false);
    }
  };

  // Delete SKU
  const handleDeleteSku = async (sku: UserSKU) => {
    if (
      !confirm(
        `Are you sure you want to delete SKU '${sku.sku_code}'? This cannot be undone.`
      )
    ) {
      return;
    }
    try {
      await apiDeleteSku(sku.id);
      loadSkus();
    } catch (err: unknown) {
      setActionError(
        err instanceof Error ? err.message : "Failed to delete SKU."
      );
    }
  };

  // Toggle Active
  const handleToggleActive = async (sku: UserSKU) => {
    try {
      await apiUpdateSku(sku.id, { is_active: !sku.is_active });
      loadSkus();
    } catch (err: unknown) {
      setActionError(
        err instanceof Error ? err.message : "Failed to update SKU status."
      );
    }
  };

  // CSV Export
  const handleExportCsv = async () => {
    try {
      const blob = await apiExportSkusCsv();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `labelflow_skus_export_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err: unknown) {
      setActionError(
        err instanceof Error ? err.message : "Failed to export SKU database."
      );
    }
  };

  // CSV Import
  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importFile) return;

    setImportLoading(true);
    setImportError(null);
    setImportResult(null);

    try {
      const result = await apiImportSkusCsv(importFile);
      setImportResult(result);
      loadSkus();
    } catch (err: unknown) {
      setImportError(
        err instanceof Error ? err.message : "CSV import failed."
      );
    } finally {
      setImportLoading(false);
    }
  };

  const handleSyncFromBatches = async () => {
    setIsSyncing(true);
    setActionError(null);
    setSyncSuccessMessage(null);
    try {
      const res = await apiSyncSkusFromJobs();
      setSyncSuccessMessage(res.message);
      await loadSkus();
      setTimeout(() => setSyncSuccessMessage(null), 5000);
    } catch (err: unknown) {
      setActionError(
        err instanceof Error ? err.message : "Failed to sync SKUs from processing batches."
      );
    } finally {
      setIsSyncing(false);
    }
  };

  const totalPages = Math.ceil(total / 25) || 1;

  return (
    <div className="space-y-6">
      {/* Top Header & Actions Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center space-x-2.5">
            <span>Personal SKU Database</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-cyan-100 dark:bg-cyan-neon/15 text-cyan-700 dark:text-cyan-neon font-bold border border-cyan-300 dark:border-cyan-neon/30">
              {total} Total
            </span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Manage your SKU &amp; Matching Keyword pairs to automatically identify and group products on Meesho labels
          </p>
        </div>

        <div className="flex items-center space-x-2 flex-wrap">
          <button
            type="button"
            onClick={handleSyncFromBatches}
            disabled={isSyncing}
            className="inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-white dark:bg-navy-900 border border-cyan-500/40 dark:border-cyan-neon/40 hover:border-cyan-500 dark:hover:border-cyan-neon text-cyan-700 dark:text-cyan-neon hover:text-cyan-800 dark:hover:text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer"
            title="Scan uploaded batches and import any detected SKUs"
          >
            <svg
              className={`w-4 h-4 ${isSyncing ? "animate-spin" : ""}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
            </svg>
            <span>{isSyncing ? "Syncing..." : "Sync from Batches"}</span>
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-white dark:bg-navy-900 border border-slate-200 dark:border-navy-700 hover:border-slate-400 dark:hover:border-slate-500 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white text-xs font-semibold shadow-sm transition-colors"
            title="Download CSV backup of all personal SKUs"
          >
            <svg className="w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>Export CSV</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setImportModalOpen(true);
              setImportFile(null);
              setImportResult(null);
              setImportError(null);
            }}
            className="inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-white dark:bg-navy-900 border border-slate-200 dark:border-navy-700 hover:border-cyan-500 dark:hover:border-cyan-neon/50 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white text-xs font-semibold shadow-sm transition-colors"
          >
            <svg className="w-4 h-4 text-cyan-600 dark:text-cyan-neon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span>Import CSV</span>
          </button>

          <button
            type="button"
            onClick={handleOpenCreate}
            className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-cyan-500 dark:bg-gradient-to-r dark:from-cyan-neon dark:to-cyan-400 text-white dark:text-navy-950 font-bold text-xs shadow-sm dark:shadow-glow hover:bg-cyan-600 dark:hover:opacity-95 transition-all active:scale-95"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>Add New SKU</span>
          </button>
        </div>
      </div>

      {syncSuccessMessage && (
        <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/40 text-emerald-800 dark:text-emerald-300 text-xs font-bold flex items-center space-x-2 animate-in fade-in shadow-sm">
          <svg className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span>{syncSuccessMessage}</span>
        </div>
      )}

      {actionError && (
        <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs shadow-sm">
          {actionError}
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white dark:bg-navy-900 border border-slate-200 dark:border-navy-800 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-sm">
        <form onSubmit={handleSearchSubmit} className="w-full sm:max-w-md flex items-center space-x-2">
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
              placeholder="Search by SKU, product name, or keyword..."
              className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-slate-50 dark:bg-navy-950 border border-slate-300 dark:border-navy-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 text-xs focus:outline-none focus:border-cyan-500 dark:focus:border-cyan-neon transition-colors"
            />
          </div>
          <button
            type="submit"
            className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-navy-800 hover:bg-slate-200 dark:hover:bg-navy-700 border border-slate-300 dark:border-navy-700 text-xs font-semibold text-slate-800 dark:text-slate-200 transition-colors shadow-sm"
          >
            Search
          </button>
        </form>

        <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
          <label className="text-xs text-slate-500 dark:text-slate-400 font-medium">Status:</label>
          <select
            value={filterActive}
            onChange={(e) => {
              setFilterActive(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-navy-950 border border-slate-300 dark:border-navy-700 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-cyan-500 dark:focus:border-cyan-neon"
          >
            <option value="all">All SKUs</option>
            <option value="active">Active Only</option>
            <option value="inactive">Inactive Only</option>
          </select>
        </div>
      </div>

      {/* SKUs Table */}
      <div className="bg-white dark:bg-navy-900 border border-slate-200 dark:border-navy-800 rounded-2xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="py-16 flex flex-col items-center justify-center space-y-3">
            <div className="w-7 h-7 border-2 border-cyan-neon border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-slate-400">Loading personal SKU catalog...</p>
          </div>
        ) : skus.length === 0 ? (
          <div className="py-16 text-center px-4">
            <div className="w-12 h-12 rounded-2xl bg-navy-800 border border-navy-700 mx-auto flex items-center justify-center text-slate-500 mb-3">
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                <path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16" />
              </svg>
            </div>
            <h3 className="text-sm font-bold text-white">No SKUs Found</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              {search
                ? `No SKUs matched '${search}'. Try clearing your search query.`
                : "You have not added any SKUs to your personal catalog yet. Add one manually or upload a CSV."}
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
              <button
                type="button"
                onClick={handleSyncFromBatches}
                disabled={isSyncing}
                className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-neon to-purple-brand text-navy-950 font-extrabold text-xs shadow-glow hover:opacity-95 transition-all cursor-pointer"
              >
                <svg
                  className={`w-4 h-4 ${isSyncing ? "animate-spin" : ""}`}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                </svg>
                <span>{isSyncing ? "Syncing SKUs..." : "Sync SKUs from Uploaded Batches"}</span>
              </button>

              <button
                type="button"
                onClick={handleOpenCreate}
                className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-navy-800 hover:bg-navy-700 text-slate-200 font-bold text-xs border border-navy-700 transition-all cursor-pointer"
              >
                <span>Add SKU Manually</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-navy-800 text-slate-600 dark:text-slate-400 font-semibold bg-slate-50/80 dark:bg-navy-950/40">
                  <th className="py-3 px-4">Parent SKU (Key)</th>
                  <th className="py-3 px-4">Matching Values / Sub-SKUs</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-navy-800/60">
                {skus.map((sku) => {
                  const kwList =
                    sku.keywords && sku.keywords.length > 0
                      ? sku.keywords
                      : [sku.sku_code];
                  return (
                    <tr
                      key={sku.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-navy-800/30 transition-colors"
                    >
                      {/* SKU Name */}
                      <td className="py-3.5 px-4 font-mono font-bold text-cyan-700 dark:text-cyan-neon text-sm align-top">
                        {sku.sku_code}
                      </td>

                      {/* Matching Keyword / Multiple Values */}
                      <td className="py-3.5 px-4 align-top">
                        <div className="flex flex-wrap items-center gap-1.5 max-w-xl">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-navy-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-navy-700">
                            {kwList.length} {kwList.length === 1 ? "Value" : "Values"}
                          </span>
                          {kwList.map((kw, idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-navy-950 border border-slate-200 dark:border-cyan-neon/30 text-slate-800 dark:text-cyan-300 font-mono text-xs hover:border-cyan-500 dark:hover:border-cyan-neon transition-colors"
                            >
                              <span className="text-slate-400 dark:text-slate-500 text-[10px] mr-1">#</span>
                              <span className="font-semibold">{kw}</span>
                            </span>
                          ))}
                        </div>
                      </td>

                      {/* Status Toggle */}
                      <td className="py-3.5 px-4 align-top">
                        <button
                          type="button"
                          onClick={() => handleToggleActive(sku)}
                          className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase transition-colors ${
                            sku.is_active
                              ? "bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-500/30 hover:bg-emerald-200 dark:hover:bg-emerald-500/20"
                              : "bg-slate-100 dark:bg-slate-700/30 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700/50"
                          }`}
                          title="Click to toggle active status"
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              sku.is_active ? "bg-emerald-500 dark:bg-emerald-400" : "bg-slate-400 dark:bg-slate-500"
                            }`}
                          />
                          <span>{sku.is_active ? "Active" : "Inactive"}</span>
                        </button>
                      </td>

                      {/* Action Buttons */}
                      <td className="py-3.5 px-4 text-right align-top">
                        <div className="inline-flex items-center space-x-2">
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(sku)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-neon hover:bg-slate-100 dark:hover:bg-navy-800 transition-colors"
                            title="Edit SKU"
                          >
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteSku(sku)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-navy-800 transition-colors"
                            title="Delete SKU"
                          >
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {total > 25 && (
          <div className="p-4 border-t border-slate-200 dark:border-navy-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>
              Showing {(page - 1) * 25 + 1} - {Math.min(page * 25, total)} of{" "}
              {total} SKUs
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

      {/* ADD / EDIT SKU MODAL */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 dark:bg-navy-950/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-lg bg-white dark:bg-navy-900 border border-slate-200 dark:border-navy-700/90 rounded-2xl p-6 shadow-2xl relative">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-navy-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {editingSku ? `Edit SKU: ${editingSku.sku_code}` : "Add New SKU"}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-navy-800"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {modalError && (
              <div className="mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                {modalError}
              </div>
            )}

            <form onSubmit={handleSaveSku} className="mt-4 space-y-4 text-xs">
              <div className="p-3 rounded-xl bg-cyan-neon/5 border border-cyan-neon/20 text-slate-300 text-[11px] leading-relaxed">
                Map multiple marketplace values, aliases, and variations under this <span className="text-cyan-neon font-bold">Parent SKU</span>. If any label contains any of these values, it will automatically group under this SKU.
              </div>

              <div>
                <label className="block font-semibold text-slate-200 mb-1">
                  Parent SKU Name (Key) *
                </label>
                <input
                  type="text"
                  required
                  value={skuCode}
                  onChange={(e) => setSkuCode(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.code === "Enter" || e.keyCode === 13) {
                      e.preventDefault();
                      keywordInputRef.current?.focus();
                    }
                  }}
                  placeholder="e.g. GREEN, ROSPACK_80ML, BROWN_BOX"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-navy-950 border border-navy-700 text-white font-mono text-sm placeholder-slate-500 focus:outline-none focus:border-cyan-neon transition-colors"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  The unified SKU name that will appear in your cropped labels summary &amp; packing lists.
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="font-semibold text-slate-200 flex items-center space-x-1.5">
                    <span>Matching Values / Sub-SKUs ({keywords.length})</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-neon/15 text-cyan-300 font-medium">
                      Multi-Value
                    </span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowBulkInput(!showBulkInput)}
                    className="text-[11px] text-cyan-neon hover:underline font-medium cursor-pointer"
                  >
                    {showBulkInput ? "✕ Close Bulk Paste" : "📋 Paste Multiple Values"}
                  </button>
                </div>

                {/* Bulk Paste Box */}
                {showBulkInput && (
                  <div className="mb-3 p-3 rounded-xl bg-navy-950 border border-cyan-neon/30 space-y-2">
                    <p className="text-[11px] text-slate-300">
                      Paste multiple SKU codes or keywords (separated by commas, semicolons, or line breaks):
                    </p>
                    <textarea
                      rows={3}
                      value={bulkInputText}
                      onChange={(e) => setBulkInputText(e.target.value)}
                      placeholder="e.g.&#10;GREEN_PACK_1&#10;GREEN-80ML-V1&#10;Po10Green, 074"
                      className="w-full p-2.5 rounded-lg bg-navy-900 border border-navy-700 text-cyan-300 font-mono text-xs focus:outline-none focus:border-cyan-neon resize-none placeholder-slate-600"
                    />
                    <div className="flex justify-end space-x-2">
                      <button
                        type="button"
                        onClick={() => setShowBulkInput(false)}
                        className="px-3 py-1 rounded-lg bg-navy-800 text-slate-300 text-xs hover:bg-navy-700"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleApplyBulkKeywords}
                        disabled={!bulkInputText.trim()}
                        className="px-3 py-1 rounded-lg bg-cyan-neon text-navy-950 font-bold text-xs hover:opacity-95 disabled:opacity-50"
                      >
                        + Add All Values
                      </button>
                    </div>
                  </div>
                )}

                {/* Tag & Input Container */}
                <div className="p-3 rounded-xl bg-navy-950 border border-navy-700 space-y-2.5">
                  {keywords.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
                      {keywords.map((kw, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-navy-800 border border-navy-600 text-cyan-300 font-mono text-xs group"
                        >
                          <span>{kw}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveKeyword(idx)}
                            className="text-slate-400 hover:text-rose-400 font-bold transition-colors ml-1 p-0.5 rounded cursor-pointer"
                            title="Remove this value"
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="text-[11px] text-slate-500 italic">
                      No additional sub-SKUs added yet (will default to &quot;{skuCode || "Parent SKU"}&quot;).
                    </div>
                  )}

                  {/* Duplicate or Info warning */}
                  {keywordWarning && (
                    <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] flex items-center space-x-1.5 animate-fade-in">
                      <span>⚠️</span>
                      <span>{keywordWarning}</span>
                    </div>
                  )}

                  {/* Input field to add individual or comma-separated values */}
                  <div className="flex items-center space-x-2 pt-1 border-t border-navy-800">
                    <input
                      ref={keywordInputRef}
                      type="text"
                      value={currentKeywordInput}
                      onChange={(e) => {
                        setCurrentKeywordInput(e.target.value);
                        if (keywordWarning) setKeywordWarning(null);
                      }}
                      onKeyDown={handleKeywordKeyDown}
                      placeholder="Type a value & press Enter (or separate by commas)..."
                      className="flex-1 px-3 py-2 rounded-lg bg-navy-900 border border-navy-700 text-white font-mono text-xs placeholder-slate-500 focus:outline-none focus:border-cyan-neon"
                    />
                    <button
                      type="button"
                      onClick={() => handleAddCurrentKeyword()}
                      disabled={!currentKeywordInput.trim()}
                      className="px-3 py-2 rounded-lg bg-navy-800 hover:bg-navy-700 text-cyan-neon font-bold text-xs border border-cyan-neon/30 disabled:opacity-40 transition-colors cursor-pointer"
                    >
                      + Add
                    </button>
                  </div>
                </div>

                <p className="text-[11px] text-slate-400 mt-1.5">
                  Labels containing any of these keywords will map to <span className="text-cyan-neon font-semibold">{skuCode || "this parent SKU"}</span>.
                </p>
              </div>

              <div className="flex items-center pt-1">
                <label className="inline-flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="w-4 h-4 rounded text-cyan-neon focus:ring-0 bg-navy-950 border-navy-700"
                  />
                  <span className="font-semibold text-slate-200 text-xs">
                    Active for Auto-Matching
                  </span>
                </label>
              </div>

              <div className="pt-4 border-t border-navy-800 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-navy-800 hover:bg-navy-700 text-slate-300 text-xs font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalLoading}
                  className="px-5 py-2 rounded-xl bg-cyan-neon text-navy-950 font-bold text-xs shadow-glow hover:opacity-95 disabled:opacity-50 transition-all"
                >
                  {modalLoading ? "Saving..." : "Save SKU"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CSV IMPORT MODAL */}
      {importModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-950/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-lg bg-navy-900 border border-navy-700/90 rounded-2xl p-6 shadow-2xl relative">
            <div className="flex items-center justify-between pb-4 border-b border-navy-800">
              <h3 className="text-base font-bold text-white">
                Bulk Import SKUs via CSV
              </h3>
              <button
                type="button"
                onClick={() => setImportModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-navy-800"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {importError && (
              <div className="mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                {importError}
              </div>
            )}

            {importResult && (
              <div className="mt-4 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs space-y-1">
                <p className="font-bold">CSV Import Completed Successfully!</p>
                <p>
                  • Newly Added: {importResult.imported_count} SKUs
                  <br />
                  • Updated Existing: {importResult.updated_count} SKUs
                </p>
                {importResult.errors.length > 0 && (
                  <p className="text-amber-300 text-[11px] mt-1">
                    Warnings: {importResult.errors.join("; ")}
                  </p>
                )}
              </div>
            )}

            <form onSubmit={handleImportSubmit} className="mt-4 space-y-4 text-xs">
              <div className="p-4 rounded-xl bg-navy-950 border border-dashed border-navy-700 text-center">
                <input
                  type="file"
                  accept=".csv,text/csv"
                  ref={fileInputRef}
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setImportFile(e.target.files[0]);
                    }
                  }}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 rounded-xl bg-navy-800 hover:bg-navy-700 text-cyan-neon font-semibold text-xs border border-navy-700 transition-colors"
                >
                  Choose CSV File
                </button>
                <p className="text-slate-400 text-xs mt-2">
                  {importFile ? (
                    <span className="font-mono text-white font-bold">
                      Selected: {importFile.name} ({(importFile.size / 1024).toFixed(1)} KB)
                    </span>
                  ) : (
                    "Upload a .csv file containing your inventory catalog"
                  )}
                </p>
              </div>

              <div className="p-3 rounded-xl bg-navy-950/70 border border-navy-800 text-[11px] text-slate-400 space-y-1">
                <p className="font-bold text-slate-300">Expected CSV Header Columns:</p>
                <p className="font-mono text-[10px] text-cyan-neon/90">
                  sku_code, keywords (or keyword)
                </p>
                <p>
                  * Example: A row with &quot;GREEN, GREEN; Po10Green; 074&quot; maps any label containing any of those keywords to SKU &quot;GREEN&quot;.
                </p>
              </div>

              <div className="pt-4 border-t border-navy-800 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setImportModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-navy-800 hover:bg-navy-700 text-slate-300 text-xs font-semibold"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={!importFile || importLoading}
                  className="px-5 py-2 rounded-xl bg-cyan-neon text-navy-950 font-bold text-xs shadow-glow hover:opacity-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {importLoading ? "Processing CSV..." : "Upload & Sync SKUs"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
