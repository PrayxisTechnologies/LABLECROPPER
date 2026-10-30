"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { HomeSeoContent } from "@/components/HomeSeoContent";
import { DropZone } from "@/components/DropZone";
import { FileList } from "@/components/FileList";
import { AdvancedOptions } from "@/components/AdvancedOptions";
import { LabelPreviewer } from "@/components/LabelPreviewer";
import { UploadSummaryCard } from "@/components/UploadSummaryCard";
import { LabelProcessingHistory } from "@/components/LabelProcessingHistory";
import { DuplicateLabelsAlert } from "@/components/DuplicateLabelsAlert";
import { QuickLabelSearchModal } from "@/components/QuickLabelSearchModal";
import { ExtensionSyncPanel } from "@/components/ExtensionSyncPanel";
import {
  UploadedFileItem,
  ProcessingConfig,
  ProcessingJobResponse,
  SortOption,
} from "@/lib/types";
import { useAuth } from "@/lib/auth-context";
import { formatBytes, generateFileId } from "@/lib/utils";
import {
  checkBackendHealth,
  getDownloadPdfUrl,
  getViewPdfUrl,
  processLabelsOnBackend,
} from "@/lib/api";
import {
  apiClaimLocalHistory,
  apiClearAllJobs,
  apiDeleteJob,
  apiGetJobHistory,
  apiResolveAmbiguity,
  apiTrashJob,
} from "@/lib/api-auth";
import { DEFAULT_CONFIG, loadSavedConfig, saveUserConfig } from "@/lib/storage";
import {
  LocalProcessingItem,
  clearAllLocalHistoryToTrash,
  clearLocalProcessingHistory,
  getLocalProcessingHistory,
  moveLocalItemToTrash,
  removeLocalProcessingItem,
  saveLocalProcessingItem,
  syncServerJobsToLocalHistory,
} from "@/lib/localHistory";

export default function HomePage() {
  const { isAuthenticated } = useAuth();
  const [files, setFiles] = useState<UploadedFileItem[]>([]);
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const [backendVersion, setBackendVersion] = useState<string>("1.0.0");
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Auto-loaded from localStorage (Default: SKU + Delivery partner)
  const [processingConfig, setProcessingConfig] = useState<ProcessingConfig>(DEFAULT_CONFIG);

  const [processingResult, setProcessingResult] =
    useState<ProcessingJobResponse | null>(null);
  const [localHistory, setLocalHistory] = useState<LocalProcessingItem[]>([]);
  const [showSearchModal, setShowSearchModal] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const generatorRef = useRef<HTMLDivElement>(null);

  // Load saved preferences & local 48-hour history on mount
  useEffect(() => {
    const saved = loadSavedConfig();
    setProcessingConfig(saved);
    setLocalHistory(getLocalProcessingHistory());
  }, []);

  // Sync server history and claim local guest items when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      (async () => {
        try {
          const localItems = getLocalProcessingHistory();
          const jobIds = localItems.map((i) => i.job_id).filter(Boolean);
          if (jobIds.length > 0) {
            await apiClaimLocalHistory(jobIds);
          }
          const serverRes = await apiGetJobHistory(1, 20);
          if (serverRes && Array.isArray(serverRes.items)) {
            const synced = syncServerJobsToLocalHistory(serverRes.items);
            setLocalHistory(synced);
          }
        } catch {
          // Keep current local history on offline or error
        }
      })();
    }
  }, [isAuthenticated]);

  const handleRemoveHistoryItem = (jobId: string) => {
    moveLocalItemToTrash(jobId);
    setLocalHistory(getLocalProcessingHistory());
    if (isAuthenticated) {
      apiTrashJob(jobId).catch(() => {});
    }
  };

  const handleClearHistory = () => {
    clearAllLocalHistoryToTrash();
    setLocalHistory([]);
    if (isAuthenticated) {
      apiClearAllJobs().catch(() => {});
    }
  };

  // Check backend health on initial load and recurring interval
  useEffect(() => {
    let isMounted = true;

    async function probeBackend() {
      const res = await checkBackendHealth();
      if (isMounted) {
        setBackendOnline(res.online);
        if (res.data?.version) {
          setBackendVersion(res.data.version);
        }
      }
    }

    probeBackend();
    const interval = setInterval(probeBackend, 20000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const handleConfigChange = (newConfig: ProcessingConfig) => {
    setProcessingConfig(newConfig);
    saveUserConfig(newConfig);
  };

  /**
   * Fast Single-Step Label Processing
   * Directly processes & crops labels upon file upload in a single pass.
   */
  const executeProcessing = async (
    rawFiles: File[],
    configToUse: ProcessingConfig
  ) => {
    if (rawFiles.length === 0) return;

    if (backendOnline === false) {
      const isLocal =
        typeof window !== "undefined" &&
        (window.location.hostname === "localhost" ||
          window.location.hostname === "127.0.0.1");
      setErrorMessage(
        isLocal
          ? "Local FastAPI Backend is unreachable at http://localhost:8000. Start it in terminal: python -m uvicorn app.main:app --reload --port 8000"
          : "Backend server is connecting to Render. Please wait a moment and try again."
      );
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);

    try {
      const response = await processLabelsOnBackend(rawFiles, configToUse);
      setProcessingResult(response);

      // Auto-save guest / local 48-hour processing history
      const totalBytes = rawFiles.reduce((acc, f) => acc + f.size, 0);
      const outputFilename =
        response.formatted_filename || `${(response.marketplace || "meesho").toLowerCase()}1prayxis.pdf`;

      const historyItem: LocalProcessingItem = {
        id: response.job_id,
        job_id: response.job_id,
        filename: outputFilename,
        original_files: rawFiles.map((f) => f.name),
        created_at: Date.now(),
        total_labels: response.total_labels_generated,
        total_files: rawFiles.length,
        formatted_size: formatBytes(totalBytes),
        marketplace: response.marketplace || "Meesho",
        type_badge: response.config.remove_invoice ? "Label Only" : "Full Label",
        download_url: getDownloadPdfUrl(response.job_id),
        view_url: getViewPdfUrl(response.job_id),
      };

      saveLocalProcessingItem(historyItem);
      setLocalHistory(getLocalProcessingHistory());

      if (response.total_input_pages > 0) {
        setFiles((prev) =>
          prev.map((f) => ({ ...f, pageCount: response.total_input_pages }))
        );
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "An unexpected error occurred while generating shipping labels.";
      setErrorMessage(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFilesSelected = async (newFiles: File[]) => {
    setErrorMessage(null);

    const additions: UploadedFileItem[] = [];
    const existingNames = new Set(files.map((f) => f.name));

    for (const file of newFiles) {
      if (!existingNames.has(file.name)) {
        additions.push({
          id: generateFileId(),
          file,
          name: file.name,
          size: file.size,
          formattedSize: formatBytes(file.size),
          status: "ready",
          pageCount: undefined,
        });
      }
    }

    if (additions.length > 0) {
      const updated = [...files, ...additions];
      setFiles(updated);
      // For a fresh upload, always start with 0 exclusions so all labels are processed
      const cleanConfig: ProcessingConfig = files.length === 0 ? {
        ...processingConfig,
        excluded_main_skus: [],
        excluded_skus: [],
        excluded_couriers: [],
      } : processingConfig;
      if (files.length === 0) {
        setProcessingConfig(cleanConfig);
      }
      executeProcessing(
        updated.map((u) => u.file),
        cleanConfig
      );
    }
  };

  /**
   * Dedicated Chrome Extension 1-Click Vault Import Handler
   * Replaces any existing batch with incoming files directly without duplicate name filtering,
   * resets exclusions, and triggers immediate cropping.
   */
  const handleExtensionImportFiles = async (incomingFiles: File[]) => {
    if (!incomingFiles || incomingFiles.length === 0) return;
    setErrorMessage(null);
    setProcessingResult(null);

    const newAdditions: UploadedFileItem[] = incomingFiles.map((file) => ({
      id: generateFileId(),
      file,
      name: file.name,
      size: file.size,
      formattedSize: formatBytes(file.size),
      status: "ready",
      pageCount: undefined,
    }));

    setFiles(newAdditions);

    const freshConfig: ProcessingConfig = {
      ...processingConfig,
      excluded_main_skus: [],
      excluded_skus: [],
      excluded_couriers: [],
      excluded_order_ids: [],
    };
    setProcessingConfig(freshConfig);

    const el = document.getElementById("generator");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    await executeProcessing(
      newAdditions.map((u) => u.file),
      freshConfig
    );
  };

  // Global Window Message Listener for Chrome Extension (Always Active whether site is open, empty, or previewing)
  useEffect(() => {
    const handleExtensionMessage = (event: MessageEvent) => {
      if (typeof window === "undefined") return;
      if (event.origin !== window.location.origin) return;

      const data = event.data;
      if (!data || typeof data !== "object") return;

      if (data.type === "LABELFLOW_VAULT_IMPORT") {
        if (data._handledByPage) return;
        data._handledByPage = true;

        const incomingFiles = (data.files || []) as Array<{
          id: string;
          name: string;
          size: number;
          type: string;
          base64?: string;
          buffer?: ArrayBuffer;
        }>;

        if (!incomingFiles || incomingFiles.length === 0) return;

        try {
          const reconstructed: File[] = incomingFiles.map((item) => {
            let blob: Blob;
            if (item.base64 && typeof item.base64 === "string") {
              const binaryString = atob(item.base64);
              const bytes = new Uint8Array(binaryString.length);
              for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }
              blob = new Blob([bytes], { type: item.type || "application/pdf" });
            } else if (
              item.buffer &&
              (item.buffer instanceof ArrayBuffer || ArrayBuffer.isView(item.buffer))
            ) {
              blob = new Blob([item.buffer], { type: item.type || "application/pdf" });
            } else {
              throw new Error(`File payload for "${item.name}" has no valid binary data.`);
            }

            return new File([blob], item.name, {
              type: item.type || "application/pdf",
              lastModified: Date.now(),
            });
          });

          if (reconstructed.length > 0) {
            handleExtensionImportFiles(reconstructed);

            const fileIds = incomingFiles.map((i) => i.id).filter(Boolean);
            if (fileIds.length > 0) {
              window.postMessage(
                {
                  source: "LABELFLOW_WEBSITE",
                  type: "LABELFLOW_PROCESSING_SUCCESS",
                  fileIds: fileIds,
                },
                window.location.origin
              );
            }
          }
        } catch (err) {
          console.error("Failed to reconstruct extension files:", err);
        }
      }
    };

    window.addEventListener("message", handleExtensionMessage);
    window.postMessage({ type: "LABELFLOW_PAGE_READY" }, window.location.origin);

    return () => {
      window.removeEventListener("message", handleExtensionMessage);
    };
  }, [processingConfig]);

  const handleRemoveFile = (id: string) => {
    const remaining = files.filter((item) => item.id !== id);
    setFiles(remaining);
    if (remaining.length > 0) {
      executeProcessing(
        remaining.map((u) => u.file),
        processingConfig
      );
    } else {
      setProcessingResult(null);
    }
  };

  const handleClearAll = () => {
    setFiles([]);
    setProcessingResult(null);
    setErrorMessage(null);
    setProcessingConfig((prev) => ({
      ...prev,
      excluded_main_skus: [],
      excluded_skus: [],
      excluded_couriers: [],
      excluded_order_ids: [],
    }));
  };

  const handleResetBatch = () => {
    setProcessingResult(null);
    setFiles([]);
    setErrorMessage(null);
    setProcessingConfig((prev) => ({
      ...prev,
      excluded_main_skus: [],
      excluded_skus: [],
      excluded_couriers: [],
      excluded_order_ids: [],
    }));
  };

  const handleHeroUploadClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const scrollToFeatures = () => {
    const el = document.getElementById("features");
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  };

  const handleUpdateBatch = ({
    sort,
    excluded_main_skus,
    excluded_skus,
    excluded_couriers,
    excluded_marketplaces = [],
    smart_sku_detection,
  }: {
    sort: SortOption;
    excluded_main_skus: string[];
    excluded_skus: string[];
    excluded_couriers: string[];
    excluded_marketplaces?: string[];
    smart_sku_detection?: boolean;
  }) => {
    const updatedConfig: ProcessingConfig = {
      ...processingConfig,
      sort_by: sort,
      enable_sku_picklist:
        sort === "sku" ||
        sort === "sku_courier" ||
        sort === "marketplace_sku_courier" ||
        sort === "sku_marketplace_courier" ||
        sort === "courier_sku_marketplace" ||
        sort === "courier_marketplace_sku" ||
        sort === "sku_courier_marketplace"
          ? true
          : processingConfig.enable_sku_picklist,
      smart_sku_detection:
        smart_sku_detection !== undefined
          ? smart_sku_detection
          : processingConfig.smart_sku_detection,
      excluded_main_skus,
      excluded_skus,
      excluded_couriers,
      excluded_marketplaces,
      excluded_order_ids: processingConfig.excluded_order_ids || [],
    };
    setProcessingConfig(updatedConfig);
    saveUserConfig(updatedConfig);
    if (files.length > 0) {
      executeProcessing(
        files.map((f) => f.file),
        updatedConfig
      );
    }
  };

  // Exclude all duplicate labels in one click
  const handleExcludeAllDuplicates = () => {
    if (!processingResult || !processingResult.duplicate_labels) return;
    const allDupIds = processingResult.duplicate_labels
      .map((d) => d.order_id || d.wbl_id || "")
      .filter(Boolean);
    const updatedOrderExclusions = Array.from(
      new Set([...(processingConfig.excluded_order_ids || []), ...allDupIds])
    );
    const updatedConfig: ProcessingConfig = {
      ...processingConfig,
      excluded_order_ids: updatedOrderExclusions,
    };
    setProcessingConfig(updatedConfig);
    if (files.length > 0) {
      executeProcessing(
        files.map((f) => f.file),
        updatedConfig
      );
    }
  };

  // Exclude selected duplicate labels from modal
  const handleExcludeSelectedDuplicates = (orderIds: string[]) => {
    const updatedOrderExclusions = Array.from(
      new Set([...(processingConfig.excluded_order_ids || []), ...orderIds])
    );
    const updatedConfig: ProcessingConfig = {
      ...processingConfig,
      excluded_order_ids: updatedOrderExclusions,
    };
    setProcessingConfig(updatedConfig);
    if (files.length > 0) {
      executeProcessing(
        files.map((f) => f.file),
        updatedConfig
      );
    }
  };

  // Restore excluded duplicate labels
  const handleRestoreDuplicates = () => {
    const updatedConfig: ProcessingConfig = {
      ...processingConfig,
      excluded_order_ids: [],
    };
    setProcessingConfig(updatedConfig);
    if (files.length > 0) {
      executeProcessing(
        files.map((f) => f.file),
        updatedConfig
      );
    }
  };

  const handleManualReProcess = () => {
    if (files.length === 0) return;
    executeProcessing(
      files.map((f) => f.file),
      processingConfig
    );
  };

  const handleConfirmSku = async (
    param:
      | {
          oldSku: string;
          newSku: string;
          keyword: string;
        }
      | {
          resolutions: Array<{
            oldSku: string;
            newSku: string;
            keyword: string;
          }>;
        }
  ) => {
    if (!processingResult) return;
    setIsProcessing(true);
    setErrorMessage(null);

    try {
      let finalResolutions: Array<{
        raw_product_text: string;
        chosen_sku: string;
        matching_keyword: string;
        remember_rule: boolean;
        job_id: string;
      }> = [];

      if ("resolutions" in param && Array.isArray(param.resolutions)) {
        for (const item of param.resolutions) {
          const kws = (item.keyword || item.oldSku)
            .split(/[,;\n\r]+/)
            .map((k) => k.trim())
            .filter(Boolean);
          const uniqueKws = kws.length > 0 ? Array.from(new Set(kws)) : [item.oldSku];
          for (const kw of uniqueKws) {
            finalResolutions.push({
              raw_product_text: item.oldSku,
              chosen_sku: item.newSku,
              matching_keyword: kw,
              remember_rule: true,
              job_id: processingResult.job_id,
            });
          }
        }
      } else if ("oldSku" in param) {
        const { oldSku, newSku, keyword } = param;
        const kws = (keyword || oldSku)
          .split(/[,;\n\r]+/)
          .map((k) => k.trim())
          .filter(Boolean);
        const uniqueKws = kws.length > 0 ? Array.from(new Set(kws)) : [oldSku];
        finalResolutions = uniqueKws.map((kw) => ({
          raw_product_text: oldSku,
          chosen_sku: newSku,
          matching_keyword: kw,
          remember_rule: true,
          job_id: processingResult.job_id,
        }));
      }

      if (finalResolutions.length > 0) {
        const updated = await apiResolveAmbiguity(processingResult.job_id, finalResolutions);
        setProcessingResult(updated);
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Failed to confirm and update SKU.";
      setErrorMessage(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-navy-900 text-slate-900 dark:text-white flex flex-col justify-between transition-colors duration-200">
      {/* 1. Shared Navbar */}
      <Header
        backendOnline={backendOnline}
        backendVersion={backendVersion}
      />

      {/* Hidden File Input for Hero Action */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,application/pdf"
        onChange={(e) => {
          if (e.target.files) {
            handleFilesSelected(Array.from(e.target.files));
          }
          if (e.target) {
            e.target.value = "";
          }
        }}
        className="hidden"
      />

      {/* Active Processing Result: Side-by-Side Workspace (Left = SKU Filters, Right = Generated Label) */}
      {processingResult ? (
        <div className="w-full flex-1 px-2 sm:px-4 lg:px-6 py-2 space-y-4 animate-in fade-in duration-200">
          {/* Duplicate Orders Detection Banner & Inspector */}
          <DuplicateLabelsAlert
            duplicateLabels={processingResult.duplicate_labels || []}
            allLabelsDuplicate={Boolean(processingResult.all_labels_duplicate)}
            excludedDuplicatesCount={processingResult.excluded_duplicates_count || 0}
            totalLabelsGenerated={processingResult.total_labels_generated}
            onExcludeAllDuplicates={handleExcludeAllDuplicates}
            onExcludeSelectedDuplicates={handleExcludeSelectedDuplicates}
            onResetBatch={handleResetBatch}
            onRestoreDuplicates={handleRestoreDuplicates}
          />

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-5 items-stretch">
            {/* Left Side: SKU Filters, Delivery Partners & Sort Controls (Half Screen: 6/12) */}
            <div className="lg:col-span-6 xl:col-span-6 flex flex-col h-[calc(100vh-95px)] min-h-[700px]">
              <UploadSummaryCard
                data={{
                  total_files: processingResult.total_files,
                  total_pages: processingResult.total_input_pages,
                  total_labels: processingResult.total_labels_generated,
                  courier_breakdown: processingResult.courier_breakdown,
                  marketplace_breakdown: processingResult.marketplace_breakdown || [],
                  main_skus: processingResult.main_skus || [],
                  all_skus: processingResult.all_skus || [],
                }}
                currentSort={processingConfig.sort_by as SortOption}
                isReSorting={isProcessing}
                activeExcludedMainSkus={processingConfig.excluded_main_skus || []}
                activeExcludedSkus={processingConfig.excluded_skus || []}
                activeExcludedCouriers={processingConfig.excluded_couriers || []}
                activeExcludedMarketplaces={processingConfig.excluded_marketplaces || []}
                smartSkuDetection={Boolean(processingConfig.smart_sku_detection)}
                onUpdateBatch={handleUpdateBatch}
                onConfirmSku={handleConfirmSku}
              />
            </div>

            {/* Right Side: Generated 4×6 Label Document Workspace (Half Screen: 6/12) */}
            <div className="lg:col-span-6 xl:col-span-6 flex flex-col h-[calc(100vh-95px)] min-h-[700px]">
              <LabelPreviewer
                result={processingResult}
                onReset={handleResetBatch}
              />
            </div>
          </div>

          {/* Local 48-Hour Processing History */}
          <div className="w-full pt-2">
            <LabelProcessingHistory
              history={localHistory}
              onRemoveItem={handleRemoveHistoryItem}
              onClearAll={handleClearHistory}
            />
          </div>
        </div>
      ) : (
        <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-12 w-full">
          {/* 2. Hero Section */}
          <section
            aria-label="Hero Introduction"
            className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center"
          >
            {/* Hero Left Content */}
            <div className="lg:col-span-7 space-y-4">
              <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-cyan-neon/10 border border-cyan-neon/30 text-xs font-semibold text-cyan-neon">
                <span className="w-2 h-2 rounded-full bg-cyan-neon shadow-[0_0_8px_rgba(0,209,255,0.8)]" />
                <span>#1 Meesho Label Cropper Online</span>
              </div>

              <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-slate-900 dark:text-white leading-tight">
                Meesho Shipping Label Cropper,{" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-600 via-cyan-dim to-purple-brand dark:from-cyan-neon dark:via-cyan-dim dark:to-purple-brand">
                  Ready to Print
                </span>
              </h1>

              <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 max-w-xl leading-relaxed">
                Free online Meesho label cropper. Crop Meesho PDF labels to 4×6 thermal printer size, safely remove tax invoices, and group orders by SKU & Delivery Partner (Valmo, Shadowfax, Xpressbees).
              </p>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleHeroUploadClick}
                  className="px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-neon to-purple-brand text-navy-950 font-bold text-sm sm:text-base flex items-center space-x-2 shadow-glow hover:brightness-110 active:scale-95 transition-all cursor-pointer"
                >
                  <svg
                    className="w-5 h-5 text-navy-950"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  <span>Upload PDF</span>
                </button>

                <button
                  type="button"
                  onClick={scrollToFeatures}
                  className="px-5 py-3 rounded-xl bg-slate-200 dark:bg-navy-850 hover:bg-slate-300 dark:hover:bg-navy-800 text-slate-800 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border border-slate-300 dark:border-navy-700 text-sm font-semibold transition-colors"
                >
                  Features & Details
                </button>

                <button
                  type="button"
                  onClick={() => setShowSearchModal(true)}
                  className="px-5 py-3 rounded-xl bg-cyan-50 dark:bg-cyan-neon/15 hover:bg-cyan-100 dark:hover:bg-cyan-neon/25 text-cyan-800 dark:text-cyan-neon border border-cyan-200 dark:border-cyan-neon/40 text-sm font-semibold transition-all flex items-center space-x-2 shadow-sm cursor-pointer"
                  title="Search labels by Order ID, WBL Tracking ID, or SKU"
                >
                  <svg className="w-4 h-4 text-cyan-600 dark:text-cyan-neon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <span>Search Labels</span>
                </button>
              </div>

              {/* Supported Marketplaces Quick Switcher */}
              <div className="flex flex-wrap items-center gap-2 pt-2 text-xs text-slate-500 dark:text-slate-400">
                <span className="font-semibold text-slate-700 dark:text-slate-300">Marketplaces:</span>
                <Link href="/meesho-label-cropper" className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-navy-800 hover:bg-cyan-50 dark:hover:bg-cyan-neon/15 hover:text-cyan-600 dark:hover:text-cyan-neon font-medium transition-colors border border-slate-200 dark:border-navy-700">
                  Meesho
                </Link>
                <Link href="/flipkart-label-cropper" className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-navy-800 hover:bg-cyan-50 dark:hover:bg-cyan-neon/15 hover:text-cyan-600 dark:hover:text-cyan-neon font-medium transition-colors border border-slate-200 dark:border-navy-700">
                  Flipkart
                </Link>
                <Link href="/snapdeal-label-cropper" className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-navy-800 hover:bg-cyan-50 dark:hover:bg-cyan-neon/15 hover:text-cyan-600 dark:hover:text-cyan-neon font-medium transition-colors border border-slate-200 dark:border-navy-700">
                  Snapdeal
                </Link>
                <Link href="/amazon" className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-navy-800 hover:bg-cyan-50 dark:hover:bg-cyan-neon/15 hover:text-cyan-600 dark:hover:text-cyan-neon font-medium transition-colors border border-slate-200 dark:border-navy-700">
                  Amazon
                </Link>
                <Link href="/myntra" className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-navy-800 hover:bg-cyan-50 dark:hover:bg-cyan-neon/15 hover:text-cyan-600 dark:hover:text-cyan-neon font-medium transition-colors border border-slate-200 dark:border-navy-700">
                  Myntra
                </Link>
              </div>
            </div>

            {/* Hero Right Preview Illustration of 4x6 Shipping Label */}
            <div className="lg:col-span-5 flex justify-center lg:justify-end">
              <div className="relative w-64 sm:w-72 aspect-[2/3] bg-white rounded-xl border border-slate-300 shadow-card p-4 text-slate-800 select-none flex flex-col justify-between">
                {/* Carrier & Barcode Header */}
                <div className="space-y-2 border-b-2 border-black pb-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-sm tracking-wider text-black">
                      DELHIVERY
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 bg-black text-white rounded">
                      SURFACE
                    </span>
                  </div>
                  {/* Visual Barcode Lines */}
                  <div className="h-9 w-full flex items-stretch justify-between gap-0.5 px-1 bg-slate-50 py-1">
                    <div className="w-1 bg-black" />
                    <div className="w-0.5 bg-black" />
                    <div className="w-1.5 bg-black" />
                    <div className="w-0.5 bg-black" />
                    <div className="w-2 bg-black" />
                    <div className="w-0.5 bg-black" />
                    <div className="w-1 bg-black" />
                    <div className="w-1.5 bg-black" />
                    <div className="w-0.5 bg-black" />
                    <div className="w-2 bg-black" />
                    <div className="w-0.5 bg-black" />
                    <div className="w-1 bg-black" />
                    <div className="w-1.5 bg-black" />
                    <div className="w-0.5 bg-black" />
                  </div>
                  <div className="text-[9px] font-mono text-center text-slate-600">
                    AWB: 128471928371
                  </div>
                </div>

                {/* Address Section */}
                <div className="space-y-1 text-[11px] leading-tight">
                  <span className="font-bold text-black uppercase text-[10px]">
                    Ship To:
                  </span>
                  <p className="font-semibold text-black">Priya Sharma</p>
                  <p className="text-slate-600 text-[10px]">
                    Flat 402, Green Valley Apartments, Andheri West
                  </p>
                  <p className="font-bold text-black text-[10px]">
                    Mumbai, MH - 400053
                  </p>
                </div>

                {/* SKU & QR Divider Box */}
                <div className="pt-2 border-t-2 border-dashed border-slate-400 flex items-center justify-between">
                  <div>
                    <span className="text-[9px] uppercase font-bold text-slate-500 block">
                      Product SKU
                    </span>
                    <span className="font-mono text-xs font-bold text-black">
                      BROWNPO10
                    </span>
                    <span className="text-[10px] text-slate-600 block">
                      Qty: 1 • Size: XL
                    </span>
                  </div>
                  {/* Mini QR Graphic */}
                  <div className="w-10 h-10 border border-black p-0.5 grid grid-cols-3 gap-0.5">
                    <div className="bg-black" />
                    <div className="bg-white" />
                    <div className="bg-black" />
                    <div className="bg-white" />
                    <div className="bg-black" />
                    <div className="bg-white" />
                    <div className="bg-black" />
                    <div className="bg-white" />
                    <div className="bg-black" />
                  </div>
                </div>

                {/* Thermal 4x6 Roll Badge */}
                <div className="text-[9px] font-mono text-center text-slate-500 pt-1 border-t border-slate-200">
                  Standard 4 × 6 Inch Direct Thermal Standard
                </div>
              </div>
            </div>
          </section>

          {/* User Alert Banner */}
          {errorMessage && (
            <div
              role="alert"
              className="p-4 rounded-xl bg-rose-950/60 border border-rose-500/50 text-rose-200 text-sm flex items-start justify-between space-x-3 animate-in fade-in"
            >
              <div className="flex items-start space-x-2.5">
                <svg
                  className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>{errorMessage}</span>
              </div>
              <button
                type="button"
                onClick={() => setErrorMessage(null)}
                className="text-rose-400 hover:text-white"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          )}

          {/* 3. Minimal Label Processing Interface (Active Workflow) */}
          <section
            ref={generatorRef}
            id="generator"
            aria-label="Label Processing Generator"
            className="space-y-5"
          >
            <div className="space-y-4">
              {/* Quick Label Search Bar Trigger */}
              <div
                onClick={() => setShowSearchModal(true)}
                className="w-full p-3 sm:p-3.5 rounded-2xl bg-white dark:bg-[#0C182B] border border-slate-200 dark:border-navy-700/80 hover:border-cyan-500/50 dark:hover:border-cyan-neon/50 shadow-sm transition-all cursor-pointer flex items-center justify-between group"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") setShowSearchModal(true);
                }}
              >
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-xl bg-cyan-500/10 dark:bg-cyan-neon/15 flex items-center justify-center text-cyan-600 dark:text-cyan-neon">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                  </div>
                  <div>
                    <span className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200 group-hover:text-cyan-600 dark:group-hover:text-cyan-neon transition-colors">
                      Quick Search Any Label...
                    </span>
                    <span className="hidden sm:inline text-xs text-slate-400 dark:text-slate-500 ml-2">
                      (Search by Order ID, WBL Tracking No., or SKU)
                    </span>
                  </div>
                </div>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-navy-800 text-slate-600 dark:text-slate-300 group-hover:bg-cyan-500 group-hover:text-navy-950 transition-colors">
                  Search ↵
                </span>
              </div>

              {/* Chrome Extension 1-Click Auto-Cropper Sync Panel */}
              <ExtensionSyncPanel
                onImportFiles={handleExtensionImportFiles}
                isProcessing={isProcessing}
              />

              {/* PDF Dropzone Target */}
              <DropZone
                onFilesSelected={handleFilesSelected}
                onError={(msg) => setErrorMessage(msg)}
                disabled={isProcessing}
              />

              {/* Staged File List with page counts & remove option */}
              <FileList
                files={files}
                onRemoveFile={handleRemoveFile}
                onClearAll={handleClearAll}
                disabled={isProcessing}
              />

              {/* High-speed Single-Step Processing Progress Indicator */}
              {isProcessing && (
                <div className="w-full bg-white dark:bg-[#0C182B] border border-cyan-500/40 dark:border-cyan-neon/40 rounded-2xl p-5 shadow-xl animate-in fade-in duration-150">
                  <div className="flex items-center space-x-3">
                    <div className="w-6 h-6 border-3 border-cyan-600 dark:border-cyan-neon border-t-transparent rounded-full animate-spin" />
                    <div>
                      <h4 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white flex items-center space-x-2">
                        <span>Cropping & Organizing Labels...</span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-100 dark:bg-cyan-neon/15 text-cyan-700 dark:text-cyan-neon font-mono">
                          Fast Pipeline
                        </span>
                      </h4>
                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                        Extracting 4×6 thermal pages • Grouping by Main SKU & Delivery Partner
                      </p>
                    </div>
                  </div>
                  <div className="w-full bg-slate-200 dark:bg-navy-800 h-1.5 rounded-full overflow-hidden mt-3.5">
                    <div className="bg-gradient-to-r from-cyan-500 via-cyan-400 to-purple-brand h-full w-3/4 animate-pulse rounded-full" />
                  </div>
                </div>
              )}

              {/* 4. Advanced Options — Collapsed by default */}
              <AdvancedOptions
                config={processingConfig}
                onChange={handleConfigChange}
                disabled={isProcessing}
              />

              {files.length > 0 && !isProcessing && (
                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={handleManualReProcess}
                    disabled={isProcessing}
                    className="w-full sm:w-auto px-8 py-3.5 rounded-xl font-bold text-sm bg-gradient-to-r from-cyan-neon to-purple-brand text-navy-950 hover:shadow-glow hover:brightness-110 active:scale-95 cursor-pointer shadow-lg transition-all flex items-center justify-center space-x-2"
                  >
                    <span>Re-Generate & Apply Settings</span>
                  </button>
                </div>
              )}
            </div>

            {/* Local 48-Hour Processing History Card */}
            <LabelProcessingHistory
              history={localHistory}
              onRemoveItem={handleRemoveHistoryItem}
              onClearAll={handleClearHistory}
            />
          </section>

          {/* 3 Compact Benefit Items */}
          <section
            id="features"
            aria-label="Core Benefits"
            className="pt-6 border-t border-slate-200 dark:border-navy-700/60"
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* Benefit 1 */}
              <div className="p-5 rounded-2xl bg-white dark:bg-navy-850/80 border border-slate-200 dark:border-navy-700/70 shadow-sm dark:shadow-none space-y-2.5 transition-colors">
                <div className="w-10 h-10 rounded-xl bg-cyan-50 dark:bg-cyan-neon/15 border border-cyan-200 dark:border-cyan-neon/30 flex items-center justify-center text-cyan-600 dark:text-cyan-neon">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 2v14a2 2 0 0 0 2 2h14" />
                    <path d="M18 22V8a2 2 0 0 0-2-2H2" />
                  </svg>
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Smart label cropping
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  Automatically isolates shipping labels from tax invoices and
                  extra margins. Never crops barcodes, QR codes, or essential
                  routing addresses.
                </p>
              </div>

              {/* Benefit 2 */}
              <div className="p-5 rounded-2xl bg-white dark:bg-navy-850/80 border border-slate-200 dark:border-navy-700/70 shadow-sm dark:shadow-none space-y-2.5 transition-colors">
                <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-brand/15 border border-purple-200 dark:border-purple-brand/30 flex items-center justify-center text-purple-600 dark:text-purple-300">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="8" y1="6" x2="21" y2="6" />
                    <line x1="8" y1="12" x2="21" y2="12" />
                    <line x1="8" y1="18" x2="21" y2="18" />
                    <line x1="3" y1="6" x2="3.01" y2="6" />
                    <line x1="3" y1="12" x2="3.01" y2="12" />
                    <line x1="3" y1="18" x2="3.01" y2="18" />
                  </svg>
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Optional SKU & courier sorting
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  Group labels by product SKU, delivery partner (Delhivery,
                  Shadowfax, Ekart, etc.), or both. Includes consolidated SKU
                  picklists.
                </p>
              </div>

              {/* Benefit 3 */}
              <div className="p-5 rounded-2xl bg-white dark:bg-navy-850/80 border border-slate-200 dark:border-navy-700/70 shadow-sm dark:shadow-none space-y-2.5 transition-colors">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="6 9 6 2 18 2 18 9" />
                    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                    <rect x="6" y="14" width="12" height="8" />
                  </svg>
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Print-ready 4×6 PDF
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  Produces standard 4 × 6 inch (288 × 432 pt) direct thermal vector
                  pages. Sharp barcodes, zero pixelation, ready for thermal
                  printers.
                </p>
              </div>
            </div>
          </section>

          {/* Educational & Search-Optimized Content */}
          <HomeSeoContent />
        </main>
      )}

      {/* Quick Label Search Modal */}
      <QuickLabelSearchModal
        isOpen={showSearchModal}
        onClose={() => setShowSearchModal(false)}
      />

      {/* Global Professional Footer */}
      <Footer />

    </div>
  );
}
