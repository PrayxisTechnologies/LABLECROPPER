"use client";

import React, { useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { DropZone } from "@/components/DropZone";
import { FileList } from "@/components/FileList";
import { AdvancedOptions } from "@/components/AdvancedOptions";
import { LabelPreviewer } from "@/components/LabelPreviewer";
import { UploadSummaryCard } from "@/components/UploadSummaryCard";
import {
  UploadedFileItem,
  ProcessingConfig,
  ProcessingJobResponse,
  SortOption,
} from "@/lib/types";
import { formatBytes, generateFileId } from "@/lib/utils";
import {
  checkBackendHealth,
  processLabelsOnBackend,
} from "@/lib/api";
import { DEFAULT_CONFIG, loadSavedConfig, saveUserConfig } from "@/lib/storage";

export default function CropLabelsPage() {
  const [files, setFiles] = useState<UploadedFileItem[]>([]);
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const [backendVersion, setBackendVersion] = useState<string>("1.0.0");
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Auto-loaded from localStorage (Default: SKU + Delivery partner)
  const [processingConfig, setProcessingConfig] = useState<ProcessingConfig>(DEFAULT_CONFIG);

  const [processingResult, setProcessingResult] =
    useState<ProcessingJobResponse | null>(null);

  // Load saved preferences on client mount
  useEffect(() => {
    const saved = loadSavedConfig();
    setProcessingConfig(saved);
  }, []);

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
      setErrorMessage(
        "FastAPI Backend is currently unreachable at http://localhost:8000. Start backend server to process."
      );
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);

    try {
      const response = await processLabelsOnBackend(rawFiles, configToUse);
      setProcessingResult(response);
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
      // Instant Single-Step: Auto-process immediately upon file intake!
      executeProcessing(
        updated.map((u) => u.file),
        processingConfig
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
  };

  const handleResetBatch = () => {
    setProcessingResult(null);
    setFiles([]);
    setErrorMessage(null);
  };

  const handleApplyNewSort = (newSort: SortOption) => {
    const updatedConfig: ProcessingConfig = {
      ...processingConfig,
      sort_by: newSort,
      enable_sku_picklist:
        newSort === "sku" || newSort === "sku_courier"
          ? true
          : processingConfig.enable_sku_picklist,
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

  // Re-generate if user explicitly clicks button or changes options
  const handleManualReProcess = () => {
    if (files.length === 0) return;
    executeProcessing(
      files.map((f) => f.file),
      processingConfig
    );
  };

  return (
    <div className="min-h-screen bg-navy-900 text-white flex flex-col justify-between">
      <Header backendOnline={backendOnline} backendVersion={backendVersion} />

      {processingResult ? (
        <div className="w-full flex-1 flex flex-col px-2 sm:px-4 lg:px-8 py-2 space-y-4 animate-in fade-in duration-200">
          {/* Top: Instant SKU & Delivery Partner Summary with Live Re-Sort Control */}
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
            onApplySort={handleApplyNewSort}
            isReSorting={isProcessing}
          />

          {/* Complete In-Browser 4×6 Label Workspace */}
          <LabelPreviewer
            result={processingResult}
            onReset={handleResetBatch}
          />
        </div>
      ) : (
        <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6 w-full">
          <div className="space-y-1">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
              Crop Meesho Labels
            </h1>
            <p className="text-xs sm:text-sm text-slate-300">
              Upload your PDF to automatically crop labels and organize by Main SKU & Courier Partner.
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
            <DropZone
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
              <div className="w-full bg-[#0C182B] border border-cyan-neon/40 rounded-2xl p-5 shadow-xl animate-in fade-in duration-150">
                <div className="flex items-center space-x-3">
                  <div className="w-6 h-6 border-3 border-cyan-neon border-t-transparent rounded-full animate-spin" />
                  <div>
                    <h4 className="text-sm sm:text-base font-bold text-white flex items-center space-x-2">
                      <span>Cropping & Organizing Labels...</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-neon/15 text-cyan-neon font-mono">
                        Fast Pipeline
                      </span>
                    </h4>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Extracting 4×6 thermal pages • Grouping by Main SKU & Delivery Partner
                    </p>
                  </div>
                </div>
                <div className="w-full bg-navy-800 h-1.5 rounded-full overflow-hidden mt-3.5">
                  <div className="bg-gradient-to-r from-cyan-neon to-purple-brand h-full w-3/4 animate-pulse rounded-full" />
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
        </main>
      )}

      <footer className="border-t border-navy-700/60 bg-navy-950/80 px-4 sm:px-8 py-5 mt-12 text-xs text-slate-400">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <span>LabelFlow • 4×6 Thermal Shipping Label Generator</span>
          <div className="flex items-center space-x-4">
            <a href="/blogs" className="hover:text-white transition-colors">Blogs</a>
            <a href="/how-it-works" className="hover:text-white transition-colors">How It Works</a>
            <a href="/privacy-policy" className="hover:text-white transition-colors">Privacy Policy</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
