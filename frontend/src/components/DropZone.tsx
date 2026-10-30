"use client";

import React, { useRef, useState } from "react";
import { validateClientPdf } from "@/lib/utils";

interface DropZoneProps {
  onFilesSelected: (files: File[]) => void;
  onError: (message: string) => void;
  disabled?: boolean;
  platformName?: string;
}

export const DropZone: React.FC<DropZoneProps> = ({
  onFilesSelected,
  onError,
  disabled = false,
  platformName = "Meesho",
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
      tabIndex={0}
      aria-label={`Upload ${platformName} shipping label PDFs`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`relative w-full rounded-2xl border-2 border-dashed transition-all duration-200 cursor-pointer p-8 sm:p-12 text-center group ${
        isDragging
          ? "border-cyan-neon bg-cyan-50 dark:bg-cyan-neon/10 shadow-glow scale-[1.008]"
          : "border-slate-300 dark:border-navy-700 bg-white/80 dark:bg-navy-850/70 hover:border-cyan-500 dark:hover:border-cyan-neon/50 hover:bg-slate-50 dark:hover:bg-navy-800/80 shadow-sm dark:shadow-none"
      } ${disabled ? "opacity-50 pointer-events-none cursor-not-allowed" : ""}`}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,application/pdf"
        onChange={handleInputChange}
        className="hidden"
        disabled={disabled}
      />

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
    </div>
  );
};
