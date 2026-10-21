"use client";

import React, { useState } from "react";
import { ProcessingJobResponse } from "@/lib/types";
import { getAbsoluteDownloadUrl } from "@/lib/api";

interface ProcessingResultModalProps {
  isOpen: boolean;
  onClose: () => void;
  result: ProcessingJobResponse | null;
}

export const ProcessingResultModal: React.FC<ProcessingResultModalProps> = ({
  isOpen,
  onClose,
  result,
}) => {
  const [activeTab, setActiveTab] = useState<"overview" | "couriers" | "picklist" | "warnings">("overview");

  if (!isOpen || !result) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="processing-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-navy-950/85 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-4xl bg-navy-850 rounded-2xl border border-cyan-neon/30 shadow-glow p-5 sm:p-7 space-y-5 text-white max-h-[92vh] flex flex-col justify-between overflow-hidden">
        {/* Top Header */}
        <div className="flex items-start justify-between pb-4 border-b border-navy-700/80 flex-shrink-0">
          <div className="flex items-center space-x-3.5">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-cyan-neon/20 to-purple-brand/20 border border-cyan-neon/40 flex items-center justify-center text-cyan-neon shadow-glow">
              <svg
                className="w-6 h-6"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 id="processing-dialog-title" className="text-lg sm:text-xl font-bold text-white">
                  Batch Processing Complete
                </h3>
                <span
                  className={`text-[11px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider border ${
                    result.status === "completed"
                      ? "bg-emerald-950/60 border-emerald-500/50 text-emerald-300"
                      : "bg-amber-950/60 border-amber-500/50 text-amber-300"
                  }`}
                >
                  {result.status === "completed" ? "All Verified" : "Review Flagged"}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5 font-mono">
                Job ID: {result.job_id} • {new Date(result.created_at).toLocaleTimeString()}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-navy-800 transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Primary Download Actions Bar */}
        <div className="p-4 rounded-xl bg-gradient-to-r from-navy-900 via-navy-800 to-navy-900 border border-cyan-neon/30 flex flex-wrap items-center justify-between gap-3 flex-shrink-0">
          <div className="space-y-0.5">
            <span className="text-xs font-semibold text-cyan-neon uppercase tracking-wider">
              Output Deliverables Ready
            </span>
            <p className="text-xs text-slate-300">
              Download your verified thermal labels and warehouse picklist.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Download 4x6 Thermal PDF */}
            <a
              href={getAbsoluteDownloadUrl(result.downloads.thermal_pdf)}
              download
              target="_blank"
              rel="noreferrer"
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-neon to-purple-brand text-navy-950 font-bold text-xs flex items-center space-x-1.5 hover:shadow-glow hover:brightness-110 transition-all cursor-pointer"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span>Download 4×6 PDF ({result.total_labels_generated})</span>
            </a>

            {/* Download SKU Picklist CSV */}
            {result.downloads.picklist_csv && (
              <a
                href={getAbsoluteDownloadUrl(result.downloads.picklist_csv)}
                download
                target="_blank"
                rel="noreferrer"
                className="px-3.5 py-2 rounded-xl bg-navy-800 hover:bg-navy-700 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer"
              >
                <svg className="w-4 h-4 text-purple-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                </svg>
                <span>Picklist CSV</span>
              </a>
            )}

            {/* Download Report JSON */}
            <a
              href={getAbsoluteDownloadUrl(result.downloads.report_json)}
              download
              target="_blank"
              rel="noreferrer"
              className="px-3 py-2 rounded-xl bg-navy-800 hover:bg-navy-700 border border-slate-700 text-slate-400 hover:text-slate-200 text-xs font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer"
              title="Download JSON Processing Report"
            >
              <span>Audit JSON</span>
            </a>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center flex-shrink-0">
          <div className="p-3 rounded-xl bg-navy-900 border border-navy-700">
            <span className="text-[11px] text-slate-400 font-medium">Pages Inspected</span>
            <p className="text-xl font-bold text-white mt-0.5">{result.total_input_pages}</p>
          </div>
          <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-500/30">
            <span className="text-[11px] text-emerald-400 font-medium">4×6 Labels Generated</span>
            <p className="text-xl font-bold text-emerald-300 mt-0.5">{result.total_labels_generated}</p>
          </div>
          <div className="p-3 rounded-xl bg-purple-brand/10 border border-purple-brand/30">
            <span className="text-[11px] text-purple-300 font-medium">Invoices Removed</span>
            <p className="text-xl font-bold text-purple-200 mt-0.5">{result.total_invoices_removed}</p>
          </div>
          <div className="p-3 rounded-xl bg-navy-900 border border-navy-700">
            <span className="text-[11px] text-slate-400 font-medium">Flagged for Review</span>
            <p className={`text-xl font-bold mt-0.5 ${result.total_pages_flagged > 0 ? "text-amber-400" : "text-slate-400"}`}>
              {result.total_pages_flagged}
            </p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center space-x-2 border-b border-navy-700/60 pb-2 flex-shrink-0 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab("overview")}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              activeTab === "overview"
                ? "bg-cyan-neon/15 text-cyan-neon border border-cyan-neon/30"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Overview & Couriers ({result.courier_breakdown.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("picklist")}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              activeTab === "picklist"
                ? "bg-purple-brand/15 text-purple-300 border border-purple-brand/30"
                : "text-slate-400 hover:text-white"
            }`}
          >
            SKU Picklist ({result.picklist_items.length})
          </button>
          {result.warnings.length > 0 && (
            <button
              type="button"
              onClick={() => setActiveTab("warnings")}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                activeTab === "warnings"
                  ? "bg-amber-950/60 text-amber-300 border border-amber-600/40"
                  : "text-amber-400 hover:text-amber-300"
              }`}
            >
              Review Warnings ({result.warnings.length})
            </button>
          )}
        </div>

        {/* Tab Content Area (Scrollable) */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {activeTab === "overview" && (
            <div className="space-y-4">
              {/* Courier Groups */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Deterministic Courier Sorting Breakdown
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {result.courier_breakdown.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-xl bg-navy-900 border border-navy-700 flex items-center justify-between"
                    >
                      <div className="flex items-center space-x-2.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-cyan-neon" />
                        <div>
                          <p className="text-sm font-semibold text-white">{item.courier}</p>
                          <span className="text-[11px] text-slate-400">{item.percentage}% of batch</span>
                        </div>
                      </div>
                      <span className="text-sm font-mono font-bold text-cyan-neon px-2 py-0.5 rounded bg-cyan-neon/10 border border-cyan-neon/20">
                        {item.label_count}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Page Audit Summary */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Page Disposition Log ({result.pages.length} pages)
                </h4>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {result.pages.map((p, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2.5 rounded-lg bg-navy-900 border border-navy-700/60 text-xs"
                    >
                      <div className="flex items-center space-x-2 truncate mr-2">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            p.is_flagged_for_review
                              ? "bg-amber-400"
                              : p.is_invoice_removed
                              ? "bg-purple-400"
                              : "bg-emerald-400"
                          }`}
                        />
                        <span className="font-mono text-slate-300 truncate">
                          {p.input_filename} (p.{p.page_number})
                        </span>
                        <span className="text-slate-500">•</span>
                        <span className="text-cyan-neon font-medium">{p.courier_partner}</span>
                      </div>
                      <div className="flex items-center space-x-2 text-slate-400 flex-shrink-0">
                        {p.output_page_index && (
                          <span className="text-[10px] text-emerald-300 bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-500/30">
                            Thermal #{p.output_page_index}
                          </span>
                        )}
                        <span className="text-[10px] text-slate-400 uppercase">
                          {p.page_type.replace(/_/g, " ")}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === "picklist" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Consolidated Warehouse SKU Picklist
                </h4>
                <span className="text-[11px] text-slate-400">
                  {result.picklist_items.length} unique SKU lines
                </span>
              </div>

              {result.picklist_items.length === 0 ? (
                <p className="text-xs text-slate-400 p-4 text-center bg-navy-900 rounded-xl">
                  No SKU information found in this batch.
                </p>
              ) : (
                <div className="border border-navy-700 rounded-xl overflow-hidden">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-navy-900 text-slate-400 uppercase tracking-wider border-b border-navy-700">
                      <tr>
                        <th className="px-3 py-2.5">SKU Identifier</th>
                        <th className="px-3 py-2.5 text-center">Unit Qty</th>
                        <th className="px-3 py-2.5 text-center">Labels</th>
                        <th className="px-3 py-2.5">Couriers</th>
                        <th className="px-3 py-2.5 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-navy-700/60 bg-navy-850">
                      {result.picklist_items.map((item, idx) => (
                        <tr key={idx} className="hover:bg-navy-800/60 transition-colors">
                          <td className="px-3 py-2.5 font-mono font-medium text-white">
                            {item.sku}
                          </td>
                          <td className="px-3 py-2.5 text-center font-bold text-cyan-neon">
                            {item.total_quantity}
                          </td>
                          <td className="px-3 py-2.5 text-center text-slate-300">
                            {item.label_count}
                          </td>
                          <td className="px-3 py-2.5 text-slate-400 truncate max-w-[140px]">
                            {item.courier_partners.join(", ")}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                                item.status === "MATCHED"
                                  ? "bg-emerald-950/60 text-emerald-300 border border-emerald-500/40"
                                  : "bg-amber-950/60 text-amber-300 border border-amber-600/40"
                              }`}
                            >
                              {item.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === "warnings" && (
            <div className="space-y-2.5">
              <h4 className="text-xs font-semibold text-amber-300 uppercase tracking-wider">
                Audited Review Warnings ({result.warnings.length})
              </h4>
              <div className="space-y-2">
                {result.warnings.map((warn, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl bg-amber-950/30 border border-amber-600/40 text-xs text-amber-200 flex items-start space-x-2"
                  >
                    <svg className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    <span>{warn}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="pt-3 border-t border-navy-700/80 flex items-center justify-end space-x-3 flex-shrink-0">
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
