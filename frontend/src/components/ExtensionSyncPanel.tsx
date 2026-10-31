"use client";

import React, { useEffect, useState, useRef } from "react";
import { ExtensionDownloadModal } from "@/components/ExtensionDownloadModal";

export interface VaultIncomingFile {
  id: string;
  name: string;
  size: number;
  type: string;
  buffer?: ArrayBuffer;
  base64?: string;
  platform?: string;
}

interface ExtensionSyncPanelProps {
  onImportFiles: (files: File[]) => void;
  isProcessing?: boolean;
}

export const ExtensionSyncPanel: React.FC<ExtensionSyncPanelProps> = ({
  onImportFiles,
  isProcessing = false,
}) => {
  const [extensionDetected, setExtensionDetected] = useState<boolean>(false);
  const [lastImportCount, setLastImportCount] = useState<number>(0);
  const [lastImportNames, setLastImportNames] = useState<string[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState<boolean>(false);

  const isImportingRef = useRef<boolean>(false);

  // 1. Listen for window messages from Chrome Extension Content Script
  useEffect(() => {
    const handleWindowMessage = (event: MessageEvent) => {
      // Security: origin must match our own website
      if (event.origin !== window.location.origin) return;

      const data = event.data;
      if (!data || typeof data !== "object") return;

      // Extension Presence Heartbeat
      if (data.type === "LABELFLOW_EXTENSION_STATUS") {
        setExtensionDetected(true);
      }

      // Vault 1-Click Import: Direct transfer of actual PDF ArrayBuffers / Base64
      if (data.type === "LABELFLOW_VAULT_IMPORT") {
        setExtensionDetected(true);
        const incomingFiles: any[] = Array.isArray(data.files) ? data.files : [];
        if (data._handledByPage) {
          setLastImportCount(incomingFiles.length);
          setStatusMessage(
            `✓ Successfully received ${incomingFiles.length} PDF label(s) from Extension Vault.`
          );
          setErrorMessage(null);
          return;
        }
        data._handledByPage = true;

        if (!incomingFiles || incomingFiles.length === 0) {
          setErrorMessage("Extension sent an empty file list.");
          return;
        }

        if (isImportingRef.current) return;
        isImportingRef.current = true;

        try {
          // Reconstruct real, native browser File objects from Base64 or ArrayBuffers
          const reconstructedFiles: File[] = incomingFiles.map((item) => {
            let blob: Blob;

            if (
              item.buffer &&
              (item.buffer instanceof ArrayBuffer || ArrayBuffer.isView(item.buffer))
            ) {
              blob = new Blob([item.buffer], {
                type: item.type || "application/pdf",
              });
            } else if (item.base64 && typeof item.base64 === "string") {
              const binaryString = atob(item.base64);
              const bytes = new Uint8Array(binaryString.length);
              for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }
              blob = new Blob([bytes], {
                type: item.type || "application/pdf",
              });
            } else {
              throw new Error(`File payload for "${item.name}" has no valid binary data.`);
            }

            return new File([blob], item.name, {
              type: item.type || "application/pdf",
              lastModified: Date.now(),
            });
          });

          setLastImportCount(reconstructedFiles.length);
          setLastImportNames(reconstructedFiles.map((f) => f.name));
          setStatusMessage(
            `✓ Successfully received ${reconstructedFiles.length} PDF label(s) from Extension Vault. Uploading to cropping engine...`
          );
          setErrorMessage(null);

          // Scroll smoothly to generator
          const el = document.getElementById("generator");
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "start" });
          }

          // Pass real File[] directly to React upload handler
          onImportFiles(reconstructedFiles);

          // Acknowledge receipt of files to extension
          const fileIds = incomingFiles.map((i) => i.id).filter(Boolean);
          if (fileIds.length > 0) {
            window.postMessage(
              {
                source: "LABELFLOW_WEBSITE",
                type: "LABELFLOW_VAULT_IMPORT_RECEIVED",
                fileIds: fileIds,
              },
              window.location.origin
            );
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Failed to import files from Extension.";
          setErrorMessage(msg);
        } finally {
          setTimeout(() => {
            isImportingRef.current = false;
          }, 1500);
        }
      }
    };

    window.addEventListener("message", handleWindowMessage);

    // Announce page mount to extension with retries for hydration stability
    window.postMessage({ type: "LABELFLOW_PAGE_READY" }, window.location.origin);
    const retryTimer = setTimeout(() => {
      window.postMessage({ type: "LABELFLOW_PAGE_READY" }, window.location.origin);
    }, 400);

    return () => {
      window.removeEventListener("message", handleWindowMessage);
      clearTimeout(retryTimer);
    };
  }, [onImportFiles]);

  return (
    <div className="w-full rounded-2xl bg-gradient-to-r from-slate-900 via-navy-900 to-indigo-950 border border-cyan-500/30 p-3 sm:p-4 shadow-lg text-white space-y-2.5 animate-in fade-in">
      {/* Top Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center space-x-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center text-cyan-neon shrink-0 shadow-sm">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs sm:text-sm font-extrabold tracking-tight text-white flex items-center gap-1.5">
                ⚡ Extension PDF Vault Auto-Cropper
              </span>
              {extensionDetected ? (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                  Extension Connected
                </span>
              ) : (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-slate-300 border border-slate-700">
                  Extension Standby
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-300 leading-tight">
              1-Click Vault auto-import active • Direct binary transfer without folder permissions
            </p>
          </div>
        </div>

        {/* Status Pills & Download Extension Button */}
        <div className="flex items-center space-x-2 shrink-0">
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="flex items-center space-x-1.5 px-3 py-1 rounded-xl bg-gradient-to-r from-cyan-500/20 via-indigo-500/20 to-purple-500/20 hover:from-cyan-500/35 hover:to-indigo-500/35 border border-cyan-400/50 text-cyan-300 text-xs font-bold transition-all active:scale-95 cursor-pointer shadow-sm"
            title="Download & Install Chrome Extension (100% Free)"
          >
            <span>⬇️</span>
            <span>Download Extension</span>
          </button>

          {isProcessing ? (
            <div className="flex items-center space-x-1.5 px-3 py-1 rounded-xl bg-cyan-950/60 border border-cyan-500/40 text-cyan-300 text-xs font-semibold animate-pulse">
              <div className="w-2 h-2 rounded-full bg-cyan-400" />
              <span>Cropping Labels...</span>
            </div>
          ) : lastImportCount > 0 ? (
            <div className="flex items-center space-x-1.5 px-3 py-1 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-xs font-medium">
              <span>✓ {lastImportCount} Label(s) Processed</span>
            </div>
          ) : (
            <div className="text-[11px] font-mono text-cyan-300/80 bg-cyan-950/40 border border-cyan-800/40 px-2.5 py-1 rounded-lg">
              Vault Ready
            </div>
          )}
        </div>
      </div>

      {/* Real-time Status or Alert Messages */}
      {statusMessage && !errorMessage && (
        <div className="text-[11px] text-cyan-300 font-medium flex items-center space-x-1.5 bg-cyan-950/30 border border-cyan-800/30 p-2 rounded-lg">
          <span>ℹ️</span>
          <span>{statusMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="text-[11px] text-rose-300 bg-rose-950/40 border border-rose-500/40 p-2 rounded-lg flex items-center space-x-1.5">
          <span>⚠️</span>
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Chrome Extension Download Modal */}
      <ExtensionDownloadModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
      />
    </div>
  );
};
