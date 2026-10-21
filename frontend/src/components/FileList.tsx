"use client";

import React from "react";
import { UploadedFileItem } from "@/lib/types";
import { formatBytes } from "@/lib/utils";

interface FileListProps {
  files: UploadedFileItem[];
  onRemoveFile: (id: string) => void;
  onClearAll: () => void;
  disabled?: boolean;
}

export const FileList: React.FC<FileListProps> = ({
  files,
  onRemoveFile,
  onClearAll,
  disabled = false,
}) => {
  if (files.length === 0) {
    return null;
  }

  const totalBytes = files.reduce((acc, curr) => acc + curr.size, 0);

  return (
    <div className="w-full bg-navy-850 rounded-2xl border border-navy-700/80 p-5 sm:p-6 shadow-card space-y-4">
      {/* List Header */}
      <div className="flex items-center justify-between pb-3 border-b border-navy-700/60">
        <div className="flex items-center space-x-2">
          <h3 className="font-semibold text-white text-base">
            Selected Batch Documents
          </h3>
          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-cyan-neon/15 text-cyan-neon border border-cyan-neon/30">
            {files.length} {files.length === 1 ? "PDF" : "PDFs"}
          </span>
          <span className="text-xs text-slate-400">
            ({formatBytes(totalBytes)} total)
          </span>
        </div>

        <button
          type="button"
          onClick={onClearAll}
          disabled={disabled}
          className="text-xs text-slate-400 hover:text-rose-400 transition-colors disabled:opacity-50"
        >
          Clear all
        </button>
      </div>

      {/* File Items Grid / List */}
      <div className="space-y-2.5 max-h-[320px] overflow-y-auto pr-1">
        {files.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between p-3.5 rounded-xl bg-navy-900/90 border border-navy-700/60 hover:border-navy-600 transition-all group"
          >
            {/* File Info */}
            <div className="flex items-center space-x-3.5 min-w-0 flex-1 mr-3">
              <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-red-950/40 border border-red-500/30 flex items-center justify-center text-red-400">
                <svg
                  className="w-5 h-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-white truncate" title={item.name}>
                  {item.name}
                </p>
                <div className="flex items-center space-x-2 text-xs text-slate-400 mt-0.5">
                  <span>{item.formattedSize}</span>
                  {item.pageCount !== undefined && item.pageCount > 0 && (
                    <>
                      <span>•</span>
                      <span className="text-cyan-neon font-medium">
                        {item.pageCount} {item.pageCount === 1 ? "page" : "pages"}
                      </span>
                    </>
                  )}
                  <span>•</span>
                  <span className="text-emerald-400/90 flex items-center space-x-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                    <span>Ready</span>
                  </span>
                </div>
              </div>
            </div>

            {/* Remove Action Button */}
            <button
              type="button"
              onClick={() => onRemoveFile(item.id)}
              disabled={disabled}
              title={`Remove ${item.name}`}
              className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 border border-transparent hover:border-rose-500/30 transition-all flex-shrink-0 disabled:opacity-50"
            >
              <svg
                className="w-4 h-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                <line x1="10" y1="11" x2="10" y2="17" />
                <line x1="14" y1="11" x2="14" y2="17" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
