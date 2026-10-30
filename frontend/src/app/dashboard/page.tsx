"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { apiGetJobHistory, apiGetSkus } from "@/lib/api-auth";
import { getDownloadPdfUrl, getViewPdfUrl } from "@/lib/api";
import { JobHistoryItem, UserSKU } from "@/lib/types";

export default function DashboardOverviewPage() {
  const [skuCount, setSkuCount] = useState<number>(0);
  const [activeSkuCount, setActiveSkuCount] = useState<number>(0);
  const [savedBatchesCount, setSavedBatchesCount] = useState<number>(0);
  const [recentJobs, setRecentJobs] = useState<JobHistoryItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    async function loadStats() {
      try {
        const [skusRes, jobsRes] = await Promise.all([
          apiGetSkus({ page: 1, size: 100 }),
          apiGetJobHistory(1, 5),
        ]);
        setSkuCount(skusRes.total);
        setActiveSkuCount(skusRes.items.filter((s: UserSKU) => s.is_active).length);
        setRecentJobs(jobsRes.items || []);
        setSavedBatchesCount(typeof jobsRes.active_count === "number" ? jobsRes.active_count : jobsRes.total);
      } catch {
        // Fallback gracefully
      } finally {
        setLoading(false);
      }
    }
    loadStats();
  }, []);

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-cyan-50 via-white to-purple-50 dark:from-navy-800 dark:via-navy-800/90 dark:to-purple-brand/20 border border-slate-200 dark:border-navy-700 p-6 sm:p-8 shadow-sm">
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center space-x-2 px-2.5 py-1 rounded-full bg-cyan-100 dark:bg-cyan-neon/10 border border-cyan-300 dark:border-cyan-neon/30 text-[11px] font-bold text-cyan-700 dark:text-cyan-neon mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-600 dark:bg-cyan-neon animate-pulse" />
            <span>Smart SKU Intelligence Active</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Personal SKU Intelligence Hub
          </h1>
          <p className="text-slate-600 dark:text-slate-300 text-xs sm:text-sm mt-2 leading-relaxed">
            Your personal SKU keywords, aliases, and confirmed choices are automatically
            applied to incoming Meesho shipping labels for fast, accurate 4×6 cropping and warehouse picking.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/"
              className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-cyan-500 dark:bg-cyan-neon text-white dark:text-navy-950 font-bold text-xs shadow-sm dark:shadow-glow hover:bg-cyan-600 dark:hover:bg-cyan-400 transition-all active:scale-95"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <span>Process New Label Batch</span>
            </Link>
            <Link
              href="/dashboard/skus"
              className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-white dark:bg-navy-900 border border-slate-200 dark:border-navy-700 text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-navy-700/60 font-semibold text-xs transition-colors shadow-sm"
            >
              <svg className="w-4 h-4 text-cyan-600 dark:text-cyan-neon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 7h16" />
                <path d="M4 12h16" />
                <path d="M4 17h10" />
              </svg>
              <span>Manage Personal SKUs</span>
            </Link>
            <Link
              href="/dashboard/master-sheet"
              className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-purple-50 dark:bg-purple-brand/20 border border-purple-200 dark:border-purple-brand/40 text-purple-700 dark:text-purple-200 hover:text-purple-900 dark:hover:text-white hover:bg-purple-100 dark:hover:bg-purple-brand/30 font-semibold text-xs transition-colors shadow-sm"
            >
              <svg className="w-4 h-4 text-purple-600 dark:text-purple-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <span>Master Label Sheet</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-navy-900 border border-slate-200 dark:border-navy-800 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Total Defined SKUs</span>
            <div className="w-8 h-8 rounded-lg bg-cyan-100 dark:bg-cyan-neon/10 flex items-center justify-center text-cyan-600 dark:text-cyan-neon">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                <path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16" />
              </svg>
            </div>
          </div>
          <div className="mt-3 flex items-baseline space-x-2">
            <span className="text-2xl font-bold text-slate-900 dark:text-white">
              {loading ? "..." : skuCount}
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">SKUs in catalog</span>
          </div>
        </div>

        <div className="bg-white dark:bg-navy-900 border border-slate-200 dark:border-navy-800 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Active Matching SKUs</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
          </div>
          <div className="mt-3 flex items-baseline space-x-2">
            <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {loading ? "..." : activeSkuCount}
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">Active rules</span>
          </div>
        </div>

        <div className="bg-white dark:bg-navy-900 border border-slate-200 dark:border-navy-800 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Saved Batches</span>
            <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-brand/20 flex items-center justify-center text-purple-600 dark:text-purple-300">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            </div>
          </div>
          <div className="mt-3 flex items-baseline space-x-2">
            <span className="text-2xl font-bold text-slate-900 dark:text-white">
              {loading ? "..." : savedBatchesCount}
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">Active batches</span>
          </div>
        </div>

        <div className="bg-white dark:bg-navy-900 border border-slate-200 dark:border-navy-800 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Engine Sensitivity</span>
            <div className="w-8 h-8 rounded-lg bg-cyan-100 dark:bg-cyan-neon/10 flex items-center justify-center text-cyan-600 dark:text-cyan-neon">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
              </svg>
            </div>
          </div>
          <div className="mt-3 flex items-baseline space-x-2">
            <span className="text-xl font-bold text-cyan-600 dark:text-cyan-neon uppercase">
              Balanced
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">Strict keywords</span>
          </div>
        </div>
      </div>

      {/* Recent Processing History Table */}
      <div className="bg-white dark:bg-navy-900 border border-slate-200 dark:border-navy-800 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Recent Label Batches</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Past cropped shipping label archives</p>
          </div>
          <Link
            href="/dashboard/history"
            className="text-xs font-semibold text-cyan-600 dark:text-cyan-neon hover:underline"
          >
            View All History →
          </Link>
        </div>

        {recentJobs.length === 0 ? (
          <div className="text-center py-8 border border-dashed border-slate-200 dark:border-navy-700/70 rounded-xl">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              No processing jobs recorded yet. Upload your first Meesho batch!
            </p>
            <Link
              href="/"
              className="mt-3 inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-cyan-500 dark:bg-cyan-neon text-white dark:text-navy-950 font-bold text-xs"
            >
              <span>Crop First PDF</span>
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-navy-800 text-slate-500 dark:text-slate-400 font-semibold bg-slate-50/80 dark:bg-navy-950/40">
                  <th className="py-2.5 px-3">Job ID</th>
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Labels</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-navy-800/60">
                {recentJobs.map((job) => (
                  <tr key={job.id} className="hover:bg-slate-50/80 dark:hover:bg-navy-800/40 transition-colors">
                    <td className="py-3 px-3 font-mono font-medium text-cyan-700 dark:text-cyan-neon">
                      {job.job_id}
                    </td>
                    <td className="py-3 px-3 text-slate-600 dark:text-slate-300">
                      {new Date(job.created_at).toLocaleDateString()}{" "}
                      <span className="text-[10px] text-slate-400 dark:text-slate-500">
                        {new Date(job.created_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-semibold text-slate-900 dark:text-white">
                      {job.total_labels_generated} labels
                    </td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-500/30">
                        {job.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right">
                      <div className="inline-flex items-center justify-end space-x-1.5">
                        <a
                          href={getViewPdfUrl(job.job_id)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-md bg-slate-100 dark:bg-navy-800 hover:bg-slate-200 dark:hover:bg-cyan-neon hover:text-slate-900 dark:hover:text-navy-950 text-slate-700 dark:text-slate-200 text-[11px] font-semibold border border-slate-200 dark:border-navy-700 transition-all shadow-sm"
                          title="View 4x6 Thermal PDF in new browser tab"
                        >
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                          <span>View</span>
                        </a>

                        <a
                          href={getDownloadPdfUrl(job.job_id)}
                          target="_blank"
                          rel="noreferrer"
                          download
                          className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-md bg-cyan-500 dark:bg-cyan-neon text-white dark:text-navy-950 font-bold text-[11px] shadow-sm hover:bg-cyan-600 dark:hover:bg-cyan-400 transition-all"
                          title="Download 4x6 Thermal PDF"
                        >
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                            <polyline points="7 10 12 15 17 10" />
                            <line x1="12" y1="3" x2="12" y2="15" />
                          </svg>
                          <span>PDF</span>
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
