"use client";

import React from "react";

interface StatusBannerProps {
  backendOnline: boolean | null;
  errorMessage?: string;
}

export const StatusBanner: React.FC<StatusBannerProps> = ({
  backendOnline,
  errorMessage,
}) => {
  return (
    <div className="w-full bg-gradient-to-r from-navy-850 via-navy-800 to-navy-850 border-y border-navy-700/60 px-4 sm:px-8 py-3 my-4">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs">
        <div className="flex items-center space-x-2 text-slate-300">
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-neon opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-neon"></span>
          </span>
          <span className="font-semibold text-white">Phase 2 Engine Active:</span>
          <span>
            4 × 6 inch thermal cropping, courier sorting, invoice separation, and SKU picklist generation operational.
          </span>
        </div>

        {backendOnline === false && (
          <div className="flex items-center space-x-2 text-amber-300 bg-amber-950/60 px-2.5 py-1 rounded border border-amber-600/40">
            <svg
              className="w-3.5 h-3.5 flex-shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>
              Backend is offline at localhost:8000. Start FastAPI server to test live API validation.
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
