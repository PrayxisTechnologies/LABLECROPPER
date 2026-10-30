"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { getExtensionDownloadUrl } from "@/lib/api";

interface ExtensionDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ExtensionDownloadModal: React.FC<ExtensionDownloadModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [mounted, setMounted] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.body.style.overflow = "unset";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !mounted) return null;

  const downloadUrl = getExtensionDownloadUrl();

  const handleDownload = () => {
    setDownloading(true);
    try {
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.setAttribute("download", "LabelFlow-Chrome-Extension.zip");
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      window.open(downloadUrl, "_blank");
    } finally {
      setTimeout(() => setDownloading(false), 2000);
    }
  };

  const modalContent = (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-6 bg-slate-950/80 backdrop-blur-md overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg my-auto rounded-3xl border border-cyan-400/40 dark:border-cyan-neon/30 bg-white dark:bg-[#07111F] p-5 sm:p-6 shadow-2xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-navy-800 transition-colors cursor-pointer"
          aria-label="Close extension modal"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Header with Chrome Icon & Branding */}
        <div className="flex items-start space-x-3.5 pr-8">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-cyan-500 via-indigo-600 to-purple-600 p-0.5 shadow-[0_0_15px_rgba(0,209,255,0.4)] shrink-0 flex items-center justify-center text-white">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
              <line x1="12" y1="22.08" x2="12" y2="12" />
            </svg>
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white tracking-tight">
                LabelFlow Chrome Extension
              </h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
                100% Free
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 leading-snug">
              Meesho, Flipkart, Snapdeal, Amazon &amp; Myntra label downloads ko detect karke 1-click me thermal 4×6 crop karein.
            </p>
          </div>
        </div>

        {/* Big Action: Download ZIP Card */}
        <div className="p-4 rounded-2xl bg-gradient-to-r from-cyan-500/15 via-indigo-500/10 to-purple-500/15 border-2 border-cyan-400/50 dark:border-cyan-neon/40 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-lg">
          <div>
            <span className="text-xs font-black text-slate-900 dark:text-white flex items-center space-x-1.5">
              <span>📦</span>
              <span>LabelFlow-Chrome-Extension.zip</span>
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">
              Version 2.1.0 • Manifest V3 • 1-Click Browser Install
            </span>
          </div>

          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            className="inline-flex items-center justify-center space-x-2 px-5 py-2.5 rounded-xl text-xs font-black bg-gradient-to-r from-cyan-500 via-indigo-600 to-cyan-400 hover:from-cyan-400 hover:to-indigo-500 text-white shadow-lg shadow-cyan-500/30 active:scale-95 transition-all cursor-pointer whitespace-nowrap disabled:opacity-60"
          >
            {downloading ? (
              <>
                <svg className="w-4 h-4 animate-spin text-white" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                <span>Downloading ZIP...</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                <span>⬇️ Download Extension (.ZIP)</span>
              </>
            )}
          </button>
        </div>

        {/* 3-Step Simple Install Guide */}
        <div className="space-y-2">
          <span className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-cyan-neon block">
            Install Kaise Karein (Sirf 1 Minute)
          </span>

          <div className="grid grid-cols-1 gap-2">
            {/* Step 1 */}
            <div className="flex items-start space-x-3 p-2.5 rounded-xl bg-slate-50 dark:bg-navy-900/60 border border-slate-200 dark:border-navy-800 text-xs">
              <span className="w-5 h-5 rounded-full bg-cyan-100 dark:bg-cyan-neon/20 text-cyan-700 dark:text-cyan-neon font-black flex items-center justify-center shrink-0 text-[11px]">
                1
              </span>
              <div>
                <span className="font-bold text-slate-900 dark:text-white block">
                  ZIP File ko Extract (Unzip) karein
                </span>
                <span className="text-slate-500 dark:text-slate-400 text-[11px] leading-relaxed block mt-0.5">
                  Downloaded <code className="text-cyan-600 dark:text-cyan-neon font-bold">LabelFlow-Chrome-Extension.zip</code> par right-click karein aur <strong>Extract All...</strong> select karein.
                </span>
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex items-start space-x-3 p-2.5 rounded-xl bg-slate-50 dark:bg-navy-900/60 border border-slate-200 dark:border-navy-800 text-xs">
              <span className="w-5 h-5 rounded-full bg-cyan-100 dark:bg-cyan-neon/20 text-cyan-700 dark:text-cyan-neon font-black flex items-center justify-center shrink-0 text-[11px]">
                2
              </span>
              <div>
                <span className="font-bold text-slate-900 dark:text-white block">
                  Chrome me Developer Mode ON karein
                </span>
                <span className="text-slate-500 dark:text-slate-400 text-[11px] leading-relaxed block mt-0.5">
                  Chrome me naya tab kholein: <code className="text-cyan-600 dark:text-cyan-neon font-bold">chrome://extensions</code> aur top-right me <strong>Developer mode toggle ON</strong> karein.
                </span>
              </div>
            </div>

            {/* Step 3 */}
            <div className="flex items-start space-x-3 p-2.5 rounded-xl bg-slate-50 dark:bg-navy-900/60 border border-slate-200 dark:border-navy-800 text-xs">
              <span className="w-5 h-5 rounded-full bg-cyan-100 dark:bg-cyan-neon/20 text-cyan-700 dark:text-cyan-neon font-black flex items-center justify-center shrink-0 text-[11px]">
                3
              </span>
              <div>
                <span className="font-bold text-slate-900 dark:text-white block">
                  &quot;Load unpacked&quot; dabakar folder select karein
                </span>
                <span className="text-slate-500 dark:text-slate-400 text-[11px] leading-relaxed block mt-0.5">
                  Top-left me <strong>Load unpacked</strong> button dabayein aur apna unzipped folder select karein. Extension active ho jayegi!
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Notice on Free Login Rule */}
        <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/60 text-xs flex items-center space-x-2.5">
          <span className="text-base shrink-0">🔒</span>
          <p className="text-[11px] text-amber-900 dark:text-amber-200 leading-snug">
            <strong>Free Account:</strong> Extension se shipping labels send karne ke liye LabelFlow par login hona zaroori hai. Account bilkul 100% Free hai!
          </p>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-navy-800">
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-cyan-600 dark:text-cyan-neon bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-400/30 transition-colors cursor-pointer"
          >
            <span>⬇️</span>
            <span>Download ZIP</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-navy-800 hover:bg-slate-200 dark:hover:bg-navy-700 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};