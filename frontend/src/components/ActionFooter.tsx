"use client";

import React from "react";

interface ActionFooterProps {
  filesCount: number;
  isValidating: boolean;
  onStartProcessing: () => void;
  disabled?: boolean;
}

export const ActionFooter: React.FC<ActionFooterProps> = ({
  filesCount,
  isValidating,
  onStartProcessing,
  disabled = false,
}) => {
  const isButtonDisabled = disabled || filesCount === 0 || isValidating;

  return (
    <div className="w-full bg-navy-850 rounded-2xl border border-navy-700/80 p-5 sm:p-6 shadow-card flex flex-col sm:flex-row items-center justify-between gap-4">
      {/* Status info */}
      <div className="flex items-center space-x-3 text-center sm:text-left">
        <div className="w-10 h-10 rounded-xl bg-navy-800 border border-navy-700 flex items-center justify-center flex-shrink-0">
          <svg
            className={`w-5 h-5 ${filesCount > 0 ? "text-cyan-neon" : "text-slate-500"}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M12 2v4" />
            <path d="M12 18v4" />
            <path d="M4.93 4.93l2.83 2.83" />
            <path d="M16.24 16.24l2.83 2.83" />
            <path d="M2 12h4" />
            <path d="M18 12h4" />
            <path d="M4.93 19.07l2.83-2.83" />
            <path d="M16.24 7.76l2.83-2.83" />
          </svg>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-white">
            {filesCount === 0
              ? "No Meesho PDFs uploaded yet"
              : `${filesCount} ${filesCount === 1 ? "document" : "documents"} staged for processing`}
          </h4>
          <p className="text-xs text-slate-400 mt-0.5">
            {filesCount === 0
              ? "Drag and drop shipping label PDFs above to stage your batch"
              : "Click below to execute 4×6 thermal cropping, courier sorting, and picklist generation"}
          </p>
        </div>
      </div>

      {/* Start Processing Action */}
      <button
        type="button"
        onClick={onStartProcessing}
        disabled={isButtonDisabled}
        className={`w-full sm:w-auto px-7 py-3 rounded-xl font-semibold text-sm transition-all duration-200 flex items-center justify-center space-x-2.5 ${
          isButtonDisabled
            ? "bg-navy-800 text-slate-500 border border-navy-700 cursor-not-allowed"
            : "bg-gradient-to-r from-cyan-neon to-purple-brand text-navy-950 font-bold hover:shadow-glow hover:brightness-110 active:scale-95 cursor-pointer"
        }`}
      >
        {isValidating ? (
          <>
            <svg
              className="animate-spin -ml-1 mr-2 h-4 w-4 text-navy-950"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
            <span>Processing Meesho batch...</span>
          </>
        ) : (
          <>
            <span>Start Processing</span>
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </>
        )}
      </button>
    </div>
  );
};
