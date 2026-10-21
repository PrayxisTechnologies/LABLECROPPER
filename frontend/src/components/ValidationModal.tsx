"use client";

import React from "react";
import { BackendValidationResponse } from "@/lib/types";

interface ValidationModalProps {
  isOpen: boolean;
  onClose: () => void;
  result: BackendValidationResponse | null;
  clientValidatedCount?: number;
}

export const ValidationModal: React.FC<ValidationModalProps> = ({
  isOpen,
  onClose,
  result,
  clientValidatedCount = 0,
}) => {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="validation-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-950/80 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-xl bg-navy-850 rounded-2xl border border-cyan-neon/30 shadow-glow p-6 sm:p-7 space-y-5 text-white max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-navy-700/80">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-neon/20 border border-cyan-neon/40 flex items-center justify-center text-cyan-neon">
              <svg
                className="w-5 h-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
            <div>
              <h3 id="validation-dialog-title" className="text-lg font-bold text-white">
                PDF Upload Validation Result
              </h3>
              <p className="text-xs text-slate-400">
                Phase 1 Structural Verification
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-navy-800 transition-colors"
          >
            <svg
              className="w-5 h-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Status Callout */}
        <div className="p-4 rounded-xl bg-cyan-neon/10 border border-cyan-neon/30 text-xs text-slate-200 leading-relaxed">
          <p className="font-semibold text-cyan-neon mb-1 flex items-center space-x-1.5">
            <span>Real File Verification Passed</span>
          </p>
          <p>
            Your uploaded documents have undergone genuine structural verification.
            In accordance with the project roadmap, <strong>Phase 1</strong> establishes file ingestion, schema validation, and health checks.
            Automated <strong>4 × 6 inch thermal cropping, courier sorting, and invoice separation</strong> will execute in <strong>Phase 2</strong>.
          </p>
        </div>

        {/* Validation Metrics */}
        {result && (
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="p-3 rounded-xl bg-navy-900 border border-navy-700">
              <span className="text-xs text-slate-400">Total Files</span>
              <p className="text-lg font-bold text-white mt-0.5">{result.total_files}</p>
            </div>
            <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/30">
              <span className="text-xs text-emerald-400">Valid PDFs</span>
              <p className="text-lg font-bold text-emerald-300 mt-0.5">
                {result.valid_files_count}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/30">
              <span className="text-xs text-rose-400">Errors</span>
              <p className="text-lg font-bold text-rose-300 mt-0.5">
                {result.invalid_files_count}
              </p>
            </div>
          </div>
        )}

        {/* File Detail List */}
        {result?.files && result.files.length > 0 && (
          <div className="space-y-2 max-h-48 overflow-y-auto">
            <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
              Validated Documents ({result.files.length})
            </h4>
            {result.files.map((file, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-2.5 rounded-lg bg-navy-900 border border-navy-700/60 text-xs"
              >
                <div className="flex items-center space-x-2 truncate mr-2">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      file.is_valid ? "bg-emerald-400" : "bg-rose-400"
                    }`}
                  />
                  <span className="text-white font-medium truncate" title={file.filename}>
                    {file.filename}
                  </span>
                </div>
                <div className="flex items-center space-x-2 text-slate-400 flex-shrink-0">
                  {file.page_count !== undefined && file.page_count !== null && (
                    <span>{file.page_count} {file.page_count === 1 ? "page" : "pages"}</span>
                  )}
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                      file.is_valid
                        ? "bg-emerald-500/20 text-emerald-300"
                        : "bg-rose-500/20 text-rose-300"
                    }`}
                  >
                    {file.is_valid ? "Verified" : "Invalid"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="pt-3 border-t border-navy-700/80 flex items-center justify-end space-x-3">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-navy-800 hover:bg-navy-700 border border-navy-700 text-white text-xs font-semibold transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
