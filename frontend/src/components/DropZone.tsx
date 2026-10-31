"use client";

import React, { useRef, useState } from "react";
import { validateClientPdf } from "@/lib/utils";

interface DropZoneProps {
  onFilesSelected: (files: File[]) => void;
  onError: (message: string) => void;
  disabled?: boolean;
  platformName?: string;
  isProcessing?: boolean;
  progressPercent?: number;
  processingStage?: string;
  activeFileName?: string;
}

export const DropZone: React.FC<DropZoneProps> = ({
  onFilesSelected,
  onError,
  disabled = false,
  platformName = "Meesho",
  isProcessing = false,
  progressPercent = 0,
  processingStage = "Extracting 4×6 shipping labels...",
  activeFileName = "",
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setIsDragging(true);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragging(false);
  };

  const processFileList = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;

    const rawFiles: File[] = Array.from(fileList);
    const validFiles: File[] = [];
    const errorMessages: string[] = [];

    for (const file of rawFiles) {
      const validation = validateClientPdf(file, 2048);
      if (validation.valid) {
        validFiles.push(file);
      } else if (validation.error) {
        errorMessages.push(validation.error);
      }
    }

    if (errorMessages.length > 0) {
      onError(errorMessages.join(" "));
    }

    if (validFiles.length > 0) {
      onFilesSelected(validFiles);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (disabled) return;
    processFileList(e.dataTransfer.files);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    processFileList(e.target.files);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleClick = () => {
    if (!disabled && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleClick();
    }
  };

  return (
    <div
      role="button"
      tabIndex={isProcessing ? -1 : 0}
      aria-label={isProcessing ? "Cropping and processing shipping labels" : `Upload ${platformName} shipping label PDFs`}
      onClick={isProcessing ? undefined : handleClick}
      onKeyDown={isProcessing ? undefined : handleKeyDown}
      onDragEnter={isProcessing ? undefined : handleDragEnter}
      onDragOver={isProcessing ? undefined : handleDragOver}
      onDragLeave={isProcessing ? undefined : handleDragLeave}
      onDrop={isProcessing ? undefined : handleDrop}
      className={`relative w-full rounded-2xl border-2 transition-all duration-200 p-8 sm:p-12 text-center ${
        isProcessing
          ? "border-cyan-500/50 dark:border-cyan-neon/50 bg-cyan-50/20 dark:bg-[#0C182B] cursor-wait shadow-md"
          : isDragging
          ? "border-cyan-neon bg-cyan-50 dark:bg-cyan-neon/10 shadow-glow scale-[1.008] cursor-pointer border-dashed"
          : "border-dashed border-slate-300 dark:border-navy-700 bg-white/80 dark:bg-navy-850/70 hover:border-cyan-500 dark:hover:border-cyan-neon/50 hover:bg-slate-50 dark:hover:bg-navy-800/80 shadow-sm dark:shadow-none cursor-pointer group"
      } ${disabled && !isProcessing ? "opacity-50 pointer-events-none cursor-not-allowed" : ""}`}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,application/pdf"
        onChange={handleInputChange}
        className="hidden"
        disabled={disabled || isProcessing}
      />

      {isProcessing ? (
        <div className="flex flex-col items-center justify-center space-y-4 max-w-lg mx-auto py-1">
          {/* Circular Percentage Ring Indicator */}
          <div className="relative w-18 h-18 sm:w-20 sm:h-20 flex items-center justify-center">
            <svg className="w-full h-full -rotate-90 transform" viewBox="0 0 36 36">
              {/* Background Track Circle */}
              <path
                className="text-slate-200 dark:text-navy-700"
                strokeWidth="3.2"
                stroke="currentColor"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
              {/* Foreground Animated Progress Arc */}
              <path
                className="text-cyan-500 dark:text-cyan-neon transition-all duration-200 ease-out"
                strokeDasharray={`${Math.min(100, Math.max(3, progressPercent))}, 100`}
                strokeWidth="3.2"
                strokeLinecap="round"
                stroke="currentColor"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center flex-col">
              <span className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white font-mono">
                {Math.round(progressPercent)}%
              </span>
            </div>
          </div>

          {/* Heading & Live Stage Status */}
          <div className="space-y-1.5 text-center px-2">
            <div className="inline-flex items-center space-x-2 px-3 py-0.5 rounded-full bg-cyan-100 dark:bg-cyan-neon/15 text-cyan-800 dark:text-cyan-neon text-xs font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-600 dark:bg-cyan-neon animate-pulse" />
              <span>Cropping & Organizing Labels...</span>
            </div>
            <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
              {processingStage}
            </h3>
            {activeFileName && (
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono truncate max-w-sm sm:max-w-md mx-auto">
                📄 {activeFileName}
              </p>
            )}
          </div>

          {/* Smooth Real-Time Progress Bar */}
          <div className="w-full max-w-md space-y-1.5 px-2">
            <div className="w-full bg-slate-200 dark:bg-navy-900 h-2.5 rounded-full overflow-hidden p-0.5 border border-slate-300/80 dark:border-navy-700">
              <div
                className="bg-gradient-to-r from-cyan-600 via-cyan-500 to-cyan-400 dark:from-cyan-neon dark:via-cyan-400 dark:to-cyan-300 h-full rounded-full transition-all duration-200 ease-out"
                style={{ width: `${Math.min(100, Math.max(3, progressPercent))}%` }}
              />
            </div>
            <div className="flex justify-between items-center text-[11px] text-slate-500 dark:text-slate-400 font-medium px-0.5">
              <span>Fast Thermal Pipeline</span>
              <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">
                {Math.round(progressPercent)}% completed
              </span>
            </div>
          </div>

          {/* Clean Quality & Feature Badges */}
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1 text-xs text-slate-500 dark:text-slate-400">
            <span className="px-2.5 py-0.5 rounded-md bg-slate-100 dark:bg-navy-900 border border-slate-200 dark:border-navy-700">
              4×6 Thermal Isolation
            </span>
            <span className="px-2.5 py-0.5 rounded-md bg-slate-100 dark:bg-navy-900 border border-slate-200 dark:border-navy-700">
              Main SKU & Courier Sort
            </span>
            <span className="px-2.5 py-0.5 rounded-md bg-slate-100 dark:bg-navy-900 border border-slate-200 dark:border-navy-700">
              Consolidated Picklist
            </span>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center space-y-4 max-w-lg mx-auto">
          {/* Animated Upload Icon */}
          <div
            className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-300 ${
              isDragging
                ? "bg-cyan-neon/30 text-cyan-neon shadow-glow"
                : "bg-slate-100 dark:bg-navy-800 text-slate-600 dark:text-slate-300 group-hover:text-cyan-600 dark:group-hover:text-cyan-neon group-hover:bg-cyan-50 dark:group-hover:bg-cyan-neon/10 group-hover:scale-105"
            }`}
          >
            <svg
              className="w-8 h-8"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </div>

          {/* Text Content */}
          <div>
            <h3 className="text-lg sm:text-xl font-semibold text-slate-900 dark:text-white tracking-tight">
              Drop your {platformName} shipping label PDFs here
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5">
              or <span className="text-cyan-600 dark:text-cyan-neon font-medium underline underline-offset-4">browse files</span> from your computer
            </p>
          </div>

          {/* File Specifications & Limits */}
          <div className="flex flex-wrap items-center justify-center gap-2 pt-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="px-2.5 py-1 rounded-md bg-slate-100 dark:bg-navy-900 border border-slate-200 dark:border-navy-700 font-mono">
              *.pdf only
            </span>
            <span className="px-2.5 py-1 rounded-md bg-slate-100 dark:bg-navy-900 border border-slate-200 dark:border-navy-700">
              Multi-file batching supported
            </span>
            <span className="px-2.5 py-1 rounded-md bg-slate-100 dark:bg-navy-900 border border-slate-200 dark:border-navy-700">
              100+ files & large batches supported
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
