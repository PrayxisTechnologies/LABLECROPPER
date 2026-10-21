"use client";

import React, { useEffect, useRef, useState } from "react";
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

export default function HomePage() {
  const [files, setFiles] = useState<UploadedFileItem[]>([]);
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const [backendVersion, setBackendVersion] = useState<string>("1.0.0");
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Auto-loaded from localStorage (Default: SKU + Delivery partner)
  const [processingConfig, setProcessingConfig] = useState<ProcessingConfig>(DEFAULT_CONFIG);

  const [processingResult, setProcessingResult] =
    useState<ProcessingJobResponse | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const generatorRef = useRef<HTMLDivElement>(null);

  // Load saved preferences on client mount
  useEffect(() => {
    const saved = loadSavedConfig();
    setProcessingConfig(saved);
  }, []);

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
      setErrorMessage(
        "FastAPI Backend is currently unreachable at http://localhost:8000. Please start backend server to process."
      );
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);

    try {
      const response = await processLabelsOnBackend(rawFiles, configToUse);
      setProcessingResult(response);
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

  const handleHeroUploadClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const scrollToHowItWorks = () => {
    const el = document.getElementById("how-it-works");
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
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

  const handleManualReProcess = () => {
    if (files.length === 0) return;
    executeProcessing(
      files.map((f) => f.file),
      processingConfig
    );
  };

  const handleResetBatch = () => {
    setProcessingResult(null);
    setFiles([]);
    setErrorMessage(null);
  };

  return (
    <div className="min-h-screen bg-navy-900 text-white flex flex-col justify-between">
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

      {/* Active Processing Result: Full-Page Workspace + Top Summary with Live Re-Sort */}
      {processingResult ? (
        <div className="w-full flex-1 flex flex-col px-2 sm:px-4 lg:px-8 py-2 space-y-4 animate-in fade-in duration-200">
          {/* Top: Instant SKU & Delivery Partner Summary with Direct Sort Controls */}
          <UploadSummaryCard
            data={{
              total_files: processingResult.total_files,
              total_pages: processingResult.total_input_pages,
              total_labels: processingResult.total_labels_generated,
              courier_breakdown: processingResult.courier_breakdown,
              main_skus: processingResult.main_skus || [],
              all_skus: processingResult.all_skus || [],
            }}
            currentSort={processingConfig.sort_by}
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

              <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white leading-tight">
                Meesho Shipping Label Cropper,{" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-neon via-cyan-dim to-purple-brand">
                  Ready to Print
                </span>
              </h1>

              <p className="text-base sm:text-lg text-slate-300 max-w-xl leading-relaxed">
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
                  onClick={scrollToHowItWorks}
                  className="px-5 py-3 rounded-xl bg-navy-850 hover:bg-navy-800 text-slate-300 hover:text-white border border-navy-700 text-sm font-semibold transition-colors"
                >
                  How It Works
                </button>
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
          </section>

          {/* 3 Compact Benefit Items */}
          <section
            id="features"
            aria-label="Core Benefits"
            className="pt-6 border-t border-navy-700/60"
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* Benefit 1 */}
              <div className="p-5 rounded-2xl bg-navy-850/80 border border-navy-700/70 space-y-2.5">
                <div className="w-10 h-10 rounded-xl bg-cyan-neon/15 border border-cyan-neon/30 flex items-center justify-center text-cyan-neon">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 2v14a2 2 0 0 0 2 2h14" />
                    <path d="M18 22V8a2 2 0 0 0-2-2H2" />
                  </svg>
                </div>
                <h3 className="text-base font-bold text-white">
                  Smart label cropping
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Automatically isolates shipping labels from tax invoices and
                  extra margins. Never crops barcodes, QR codes, or essential
                  routing addresses.
                </p>
              </div>

              {/* Benefit 2 */}
              <div className="p-5 rounded-2xl bg-navy-850/80 border border-navy-700/70 space-y-2.5">
                <div className="w-10 h-10 rounded-xl bg-purple-brand/15 border border-purple-brand/30 flex items-center justify-center text-purple-300">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="8" y1="6" x2="21" y2="6" />
                    <line x1="8" y1="12" x2="21" y2="12" />
                    <line x1="8" y1="18" x2="21" y2="18" />
                    <line x1="3" y1="6" x2="3.01" y2="6" />
                    <line x1="3" y1="12" x2="3.01" y2="12" />
                    <line x1="3" y1="18" x2="3.01" y2="18" />
                  </svg>
                </div>
                <h3 className="text-base font-bold text-white">
                  Optional SKU & courier sorting
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Group labels by product SKU, delivery partner (Delhivery,
                  Shadowfax, Ekart, etc.), or both. Includes consolidated SKU
                  picklists.
                </p>
              </div>

              {/* Benefit 3 */}
              <div className="p-5 rounded-2xl bg-navy-850/80 border border-navy-700/70 space-y-2.5">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="6 9 6 2 18 2 18 9" />
                    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                    <rect x="6" y="14" width="12" height="8" />
                  </svg>
                </div>
                <h3 className="text-base font-bold text-white">
                  Print-ready 4×6 PDF
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Produces standard 4 × 6 inch (288 × 432 pt) direct thermal vector
                  pages. Sharp barcodes, zero pixelation, ready for thermal
                  printers.
                </p>
              </div>
            </div>
          </section>

          {/* Short Three-Step How It Works Section */}
          <section
            id="how-it-works"
            aria-label="How It Works Instructions"
            className="pt-6 border-t border-navy-700/60 space-y-6"
          >
            <div className="space-y-1">
              <h2 className="text-xl sm:text-2xl font-bold text-white">
                How It Works (Meesho, Flipkart, Amazon & More)
              </h2>
              <p className="text-xs sm:text-sm text-slate-400">
                Three simple steps to transform raw marketplace downloads into
                print-ready 4×6 thermal labels.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* Step 1 */}
              <div className="p-5 rounded-2xl bg-navy-900/90 border border-navy-700/60 space-y-2">
                <div className="flex items-center space-x-2">
                  <span className="w-6 h-6 rounded-full bg-cyan-neon/20 border border-cyan-neon/40 text-cyan-neon text-xs font-bold flex items-center justify-center">
                    1
                  </span>
                  <h4 className="font-bold text-white text-sm">Upload Seller PDF</h4>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Drag and drop order manifests downloaded from your Meesho, Flipkart,
                  or Amazon seller portal containing labels and customer invoices.
                </p>
              </div>

              {/* Step 2 */}
              <div className="p-5 rounded-2xl bg-navy-900/90 border border-navy-700/60 space-y-2">
                <div className="flex items-center space-x-2">
                  <span className="w-6 h-6 rounded-full bg-cyan-neon/20 border border-cyan-neon/40 text-cyan-neon text-xs font-bold flex items-center justify-center">
                    2
                  </span>
                  <h4 className="font-bold text-white text-sm">Sort by Courier & SKU</h4>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Keep standard 1-click defaults or sort by delivery partner
                  (Valmo, Shadowfax, Ekart, Delhivery) and Main SKU for fast packing.
                </p>
              </div>

              {/* Step 3 */}
              <div className="p-5 rounded-2xl bg-navy-900/90 border border-navy-700/60 space-y-2">
                <div className="flex items-center space-x-2">
                  <span className="w-6 h-6 rounded-full bg-cyan-neon/20 border border-cyan-neon/40 text-cyan-neon text-xs font-bold flex items-center justify-center">
                    3
                  </span>
                  <h4 className="font-bold text-white text-sm">1-Click 4×6 Thermal Print</h4>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Review the exact 288×432 pt thermal vector preview in your browser
                  and print directly to TVS, TSC, Zebra, or Rollo printers with crisp barcodes.
                </p>
              </div>
            </div>
          </section>
        </main>
      )}

      {/* AdSense & SEO Compliant Footer */}
      {!processingResult && (
        <footer className="border-t border-navy-700/60 bg-navy-950/80 px-4 sm:px-8 py-6 mt-12">
          <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-slate-400">
            <div className="flex items-center space-x-2">
              <span className="font-semibold text-white">LabelFlow</span>
              <span>•</span>
              <span>Universal 4×6 Thermal Shipping Label Cropper</span>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-4">
              <a href="/blogs" className="hover:text-cyan-neon transition-colors">Blogs & Guides</a>
              <a href="/how-it-works" className="hover:text-cyan-neon transition-colors">How It Works</a>
              <a href="/privacy-policy" className="hover:text-white transition-colors">Privacy Policy</a>
              <a href="/terms-of-service" className="hover:text-white transition-colors">Terms of Service</a>
              <a href="/contact" className="hover:text-white transition-colors">Contact Support</a>
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}
