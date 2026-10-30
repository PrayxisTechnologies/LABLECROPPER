"use client";

import React, { useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { MeeshoSeoContent } from "@/components/MeeshoSeoContent";
import { FlipkartSeoContent } from "@/components/FlipkartSeoContent";
import { SnapdealSeoContent } from "@/components/SnapdealSeoContent";
import { DropZone } from "@/components/DropZone";
import { FileList } from "@/components/FileList";
import { AdvancedOptions } from "@/components/AdvancedOptions";
import { LabelPreviewer } from "@/components/LabelPreviewer";
import { UploadSummaryCard } from "@/components/UploadSummaryCard";
import { AmbiguityResolverModal } from "@/components/AmbiguityResolverModal";
import { LabelProcessingHistory } from "@/components/LabelProcessingHistory";
import { DuplicateLabelsAlert } from "@/components/DuplicateLabelsAlert";
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
  apiDeleteJob,
  apiGetJobHistory,
  apiResolveAmbiguity,
} from "@/lib/api-auth";
import { DEFAULT_CONFIG, loadSavedConfig, saveUserConfig } from "@/lib/storage";
import {
  LocalProcessingItem,
  clearLocalProcessingHistory,
  getLocalProcessingHistory,
  removeLocalProcessingItem,
  saveLocalProcessingItem,
  syncServerJobsToLocalHistory,
} from "@/lib/localHistory";

interface PlatformCropperProps {
  platformName?: string;
  platformTitle?: string;
  platformSubtitle?: string;
}

export default function CropLabelsPage({
  platformName = "Meesho",
  platformTitle,
  platformSubtitle,
}: PlatformCropperProps) {
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
  const [showAmbiguityModal, setShowAmbiguityModal] = useState<boolean>(false);
  const [localHistory, setLocalHistory] = useState<LocalProcessingItem[]>([]);

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
    const updated = removeLocalProcessingItem(jobId);
    setLocalHistory(updated);
    if (isAuthenticated) {
      apiDeleteJob(jobId).catch(() => {});
    }
  };

  const handleClearHistory = () => {
    clearLocalProcessingHistory();
    setLocalHistory([]);
  };

  // Backend health polling
  useEffect(() => {
    let isMounted = true;
    async function probe() {
      const res = await checkBackendHealth();
      if (isMounted) {
        setBackendOnline(res.online);
        if (res.data?.version) setBackendVersion(res.data.version);
      }
    }
    probe();
    return () => {
      isMounted = false;
    };
  }, []);

  // Save config changes to localStorage
  const handleConfigChange = (newConfig: ProcessingConfig) => {
    setProcessingConfig(newConfig);
    saveUserConfig(newConfig);
  };

  /**
   * Fast Single-Step Label Processing
   * Executes directly upon file upload without duplicate scans or two-step waiting.
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
      const response = await processLabelsOnBackend(rawFiles, configToUse, platformName);
      setProcessingResult(response);

      // Auto-save guest / local 48-hour processing history
      const totalBytes = rawFiles.reduce((acc, f) => acc + f.size, 0);
      const outputFilename =
        response.formatted_filename ||
        `${(platformName || "meesho").toLowerCase()}1prayxis.pdf`;

      const historyItem: LocalProcessingItem = {
        id: response.job_id,
        job_id: response.job_id,
        filename: outputFilename,
        original_files: rawFiles.map((f) => f.name),
        created_at: Date.now(),
        total_labels: response.total_labels_generated,
        total_files: rawFiles.length,
        formatted_size: formatBytes(totalBytes),
        marketplace: platformName || "Meesho",
        type_badge: response.config.remove_invoice ? "Label Only" : "Full Label",
        download_url: getDownloadPdfUrl(response.job_id),
        view_url: getViewPdfUrl(response.job_id),
      };

      saveLocalProcessingItem(historyItem);
      setLocalHistory(getLocalProcessingHistory());

      if (
        response.has_ambiguity &&
        response.ambiguous_labels &&
        response.ambiguous_labels.length > 0
      ) {
        setShowAmbiguityModal(true);
      }
      // Update page counts on files if needed
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

  const handleUpdateBatch = ({
    sort,
    excluded_main_skus,
    excluded_skus,
    excluded_couriers,
    smart_sku_detection,
  }: {
    sort: SortOption;
    excluded_main_skus: string[];
    excluded_skus: string[];
    excluded_couriers: string[];
    smart_sku_detection?: boolean;
  }) => {
    const updatedConfig: ProcessingConfig = {
      ...processingConfig,
      sort_by: sort,
      enable_sku_picklist:
        sort === "sku" || sort === "sku_courier"
          ? true
          : processingConfig.enable_sku_picklist,
      smart_sku_detection:
        smart_sku_detection !== undefined
          ? smart_sku_detection
          : processingConfig.smart_sku_detection,
      excluded_main_skus,
      excluded_skus,
      excluded_couriers,
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

  // Re-generate if user explicitly clicks button or changes options
  const handleManualReProcess = () => {
    if (files.length === 0) return;
    executeProcessing(
      files.map((f) => f.file),
      processingConfig
    );
  };

  const handleConfirmSku = async ({
    oldSku,
    newSku,
    keyword,
  }: {
    oldSku: string;
    newSku: string;
    keyword: string;
  }) => {
    if (!processingResult) return;
    setIsProcessing(true);
    setErrorMessage(null);

    try {
      const kws = (keyword || oldSku)
        .split(/[,;\n\r]+/)
        .map((k) => k.trim())
        .filter(Boolean);
      const uniqueKws = kws.length > 0 ? Array.from(new Set(kws)) : [oldSku];

      const resolutions = uniqueKws.map((kw) => ({
        raw_product_text: oldSku,
        chosen_sku: newSku,
        matching_keyword: kw,
        remember_rule: true,
        job_id: processingResult.job_id,
      }));

      const updated = await apiResolveAmbiguity(processingResult.job_id, resolutions);
      setProcessingResult(updated);
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
      <Header backendOnline={backendOnline} backendVersion={backendVersion} />

      {processingResult ? (
        <div className="w-full flex-1 flex flex-col px-2 sm:px-4 lg:px-8 py-2 space-y-4 animate-in fade-in duration-200">
          {/* Ambiguity Confirmation Banner */}
          {processingResult.has_ambiguity &&
            processingResult.ambiguous_labels &&
            processingResult.ambiguous_labels.length > 0 && (
              <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/40 text-amber-900 dark:text-amber-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-md transition-colors">
                <div className="flex items-center space-x-2.5">
                  <div className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-500/20 border border-amber-300 dark:border-amber-500/40 flex items-center justify-center text-amber-700 dark:text-amber-400 shrink-0">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                      {processingResult.ambiguous_labels.length} shipping label(s) have multiple candidate SKUs
                    </h4>
                    <p className="text-[11px] text-amber-800 dark:text-amber-300/80">
                      Confirm the correct product mapping so your labels are sorted with 100% precision.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAmbiguityModal(true)}
                  className="px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-navy-950 font-bold text-xs shadow-md transition-all self-start sm:self-auto"
                >
                  Confirm SKUs Now
                </button>
              </div>
            )}

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

          {/* Side-by-side Split Workspace: Left = SKU Filters, Right = Generated 4x6 Label */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-5 items-stretch">
            {/* Left Side: SKU Filters, Delivery Partners & Sort Controls (Half Screen: 6/12) */}
            <div className="lg:col-span-6 xl:col-span-6 flex flex-col h-[calc(100vh-95px)] min-h-[700px]">
              <UploadSummaryCard
                data={{
                  total_files: processingResult.total_files,
                  total_pages: processingResult.total_input_pages,
                  total_labels: processingResult.total_labels_generated,
                  courier_breakdown: processingResult.courier_breakdown,
                  main_skus: processingResult.main_skus || [],
                  all_skus: processingResult.all_skus || [],
                }}
                currentSort={processingConfig.sort_by as SortOption}
                isReSorting={isProcessing}
                activeExcludedMainSkus={processingConfig.excluded_main_skus || []}
                activeExcludedSkus={processingConfig.excluded_skus || []}
                activeExcludedCouriers={processingConfig.excluded_couriers || []}
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
        <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6 w-full">
          <div className="space-y-1">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
              {platformTitle || `Crop ${platformName} Labels`}
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300">
              {platformSubtitle ||
                `Upload your ${platformName} PDF to automatically crop 4×6 thermal labels and organize by Main SKU & Delivery Partner.`}
            </p>
          </div>

          {errorMessage && (
            <div
              role="alert"
              className="p-4 rounded-xl bg-rose-950/60 border border-rose-500/50 text-rose-200 text-sm flex items-start justify-between space-x-3"
            >
              <span>{errorMessage}</span>
              <button
                type="button"
                onClick={() => setErrorMessage(null)}
                className="text-rose-400 hover:text-white"
              >
                ×
              </button>
            </div>
          )}

          <div className="space-y-4">
            <ExtensionSyncPanel
              onImportFiles={handleFilesSelected}
              isProcessing={isProcessing}
            />

            <DropZone
              platformName={platformName}
              onFilesSelected={handleFilesSelected}
              onError={(msg) => setErrorMessage(msg)}
              disabled={isProcessing}
            />

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
                      <span>Cropping & Organizing {platformName} Labels...</span>
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

          {/* Platform Specific SEO Content */}
          {platformName?.toLowerCase().includes("meesho") && <MeeshoSeoContent />}
          {platformName?.toLowerCase().includes("flipkart") && <FlipkartSeoContent />}
          {platformName?.toLowerCase().includes("snapdeal") && <SnapdealSeoContent />}
        </main>
      )}

      <Footer />

      {/* Ambiguity Confirmation Modal */}
      {showAmbiguityModal && processingResult && processingResult.ambiguous_labels && (
        <AmbiguityResolverModal
          jobId={processingResult.job_id}
          ambiguousLabels={processingResult.ambiguous_labels}
          onResolved={(updated) => {
            setProcessingResult(updated);
            setShowAmbiguityModal(false);
          }}
          onClose={() => setShowAmbiguityModal(false)}
        />
      )}
    </div>
  );
}
