"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  apiClaimLocalHistory,
  apiClearAllJobs,
  apiDeleteJobPermanently,
  apiEmptyTrash,
  apiGetJobHistory,
  apiRestoreJob,
  apiTrashJob,
} from "@/lib/api-auth";
import { getDownloadPdfUrl, getDownloadPicklistUrl, getViewPdfUrl } from "@/lib/api";
import { JobHistoryItem } from "@/lib/types";
import {
  clearAllLocalHistoryToTrash,
  emptyLocalTrash,
  getLocalProcessingHistory,
  getLocalTrash,
  moveLocalItemToTrash,
  removeLocalProcessingItem,
  restoreLocalItemFromTrash,
  syncServerJobsToLocalHistory,
} from "@/lib/localHistory";

// Safe date & time formatter handling timestamps, epoch numbers, and ISO strings
const formatBatchDate = (rawDate: any): { dateStr: string; timeStr: string } => {
  if (!rawDate) return { dateStr: "Recently", timeStr: "" };
  let d: Date;
  if (typeof rawDate === "number") {
    d = new Date(rawDate);
  } else if (typeof rawDate === "string") {
    const num = Number(rawDate);
    if (!isNaN(num) && num > 1000000000) {
      d = new Date(num);
    } else {
      d = new Date(rawDate);
    }
  } else if (rawDate instanceof Date) {
    d = rawDate;
  } else {
    d = new Date();
  }

  if (isNaN(d.getTime())) {
    return { dateStr: "Recently", timeStr: "" };
  }

  return {
    dateStr: d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
    timeStr: d.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    }),
  };
};

export default function HistoryPage() {
  const [activeTab, setActiveTab] = useState<"history" | "trash">("history");
  const [jobs, setJobs] = useState<JobHistoryItem[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [activeCount, setActiveCount] = useState<number>(0);
  const [trashCount, setTrashCount] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoadingJobId, setActionLoadingJobId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastUndoJobId, setToastUndoJobId] = useState<string | null>(null);

  // Modal Dialog States
  const [showClearAllModal, setShowClearAllModal] = useState<boolean>(false);
  const [showEmptyTrashModal, setShowEmptyTrashModal] = useState<boolean>(false);
  const [permanentDeleteCandidate, setPermanentDeleteCandidate] = useState<string | null>(null);
  const [bulkActionLoading, setBulkActionLoading] = useState<boolean>(false);

  // 1. Instant cache load on initial mount (0ms latency)
  useEffect(() => {
    try {
      const cachedActive = getLocalProcessingHistory();
      const cachedTrash = getLocalTrash();
      setActiveCount(cachedActive.length);
      setTrashCount(cachedTrash.length);

      if (activeTab === "history" && cachedActive.length > 0) {
        const initialJobs: JobHistoryItem[] = cachedActive.map((c) => ({
          id: c.job_id,
          job_id: c.job_id,
          status: "completed",
          created_at: typeof c.created_at === "number" ? new Date(c.created_at).toISOString() : String(c.created_at || Date.now()),
          total_files: c.total_files || 1,
          total_labels_generated: c.total_labels || 0,
          courier_breakdown: [],
          main_skus: [],
          downloads: {
            thermal_pdf: `/api/v1/labels/jobs/${c.job_id}/download/pdf`,
            picklist_csv: `/api/v1/labels/jobs/${c.job_id}/download/picklist`,
            report_json: `/api/v1/labels/jobs/${c.job_id}/download/report`,
          },
          formatted_filename: c.filename,
          marketplace: c.marketplace || "Meesho",
        }));
        setJobs(initialJobs);
        setTotal(initialJobs.length);
        setLoading(false);
      }
    } catch {
      // ignore
    }
  }, []);

  // 2. Fetch history or trash from backend with Stale-While-Revalidate
  const loadHistory = async (targetTab = activeTab, targetPage = page, isBackground = false) => {
    if (!isBackground) setLoading(true);
    setError(null);
    const isTrash = targetTab === "trash";

    try {
      const res = await apiGetJobHistory(targetPage, 20, isTrash);
      if (res && Array.isArray(res.items)) {
        setJobs(res.items);
        setTotal(res.total);
        if (typeof res.active_count === "number") setActiveCount(res.active_count);
        if (typeof res.trash_count === "number") setTrashCount(res.trash_count);

        if (!isTrash) {
          syncServerJobsToLocalHistory(res.items);
        }
      }
    } catch (err: unknown) {
      if (!isBackground) {
        setError(
          err instanceof Error ? err.message : "Failed to load processing history."
        );
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const hasInitialData = jobs.length > 0;
    loadHistory(activeTab, page, hasInitialData);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, page]);

  // Tab switcher
  const handleTabChange = (tab: "history" | "trash") => {
    setActiveTab(tab);
    setPage(1);
  };

  // Move a single job to Trash (Soft delete) - Instant (<10ms) Optimistic UI
  const handleMoveToTrash = async (jobId: string) => {
    const jobToTrash = jobs.find((j) => j.job_id === jobId);

    // 1. Instant optimistic update: Remove from view immediately!
    setJobs((prev) => prev.filter((j) => j.job_id !== jobId));
    setTotal((prev) => Math.max(0, prev - 1));
    setActiveCount((prev) => Math.max(0, prev - 1));
    setTrashCount((prev) => prev + 1);
    moveLocalItemToTrash(jobId);

    // 2. Immediate feedback toast with instant undo
    setToastUndoJobId(jobId);
    setToastMessage(`Batch ${jobId} moved to Trash.`);
    setTimeout(() => {
      setToastMessage((msg) => (msg?.includes(jobId) ? null : msg));
      setToastUndoJobId((id) => (id === jobId ? null : id));
    }, 6000);

    // 3. Fast server persist in background
    try {
      await apiTrashJob(jobId);
    } catch (err: unknown) {
      // Rollback if background sync fails
      if (jobToTrash) {
        setJobs((prev) => [jobToTrash, ...prev]);
        setTotal((prev) => prev + 1);
        setActiveCount((prev) => prev + 1);
        setTrashCount((prev) => Math.max(0, prev - 1));
        restoreLocalItemFromTrash(jobId);
      }
      alert(err instanceof Error ? err.message : "Failed to move batch to Trash.");
    }
  };

  // Restore a job from Trash back to active history - Instant (<10ms) Optimistic UI
  const handleRestore = async (jobId: string) => {
    const jobToRestore = jobs.find((j) => j.job_id === jobId);

    // 1. Instant optimistic update
    setJobs((prev) => prev.filter((j) => j.job_id !== jobId));
    setTotal((prev) => Math.max(0, prev - 1));
    setTrashCount((prev) => Math.max(0, prev - 1));
    setActiveCount((prev) => prev + 1);
    restoreLocalItemFromTrash(jobId);

    setToastMessage(`Batch ${jobId} restored to Processing History.`);
    setToastUndoJobId(null);
    setTimeout(() => setToastMessage(null), 4000);

    // 2. Fast server persist in background
    try {
      await apiRestoreJob(jobId);
    } catch (err: unknown) {
      if (jobToRestore) {
        setJobs((prev) => [jobToRestore, ...prev]);
        setTotal((prev) => prev + 1);
        setTrashCount((prev) => prev + 1);
        setActiveCount((prev) => Math.max(0, prev - 1));
        moveLocalItemToTrash(jobId);
      }
      alert(err instanceof Error ? err.message : "Failed to restore batch.");
    }
  };

  // Permanently delete single job from Trash - Instant (<10ms) Optimistic UI
  const handleConfirmPermanentDelete = async () => {
    if (!permanentDeleteCandidate) return;
    const jobId = permanentDeleteCandidate;
    setPermanentDeleteCandidate(null);

    // 1. Instant optimistic update
    setJobs((prev) => prev.filter((j) => j.job_id !== jobId));
    setTotal((prev) => Math.max(0, prev - 1));
    if (activeTab === "trash") {
      setTrashCount((prev) => Math.max(0, prev - 1));
    } else {
      setActiveCount((prev) => Math.max(0, prev - 1));
    }
    removeLocalProcessingItem(jobId);

    setToastMessage(`Batch ${jobId} permanently deleted.`);
    setToastUndoJobId(null);
    setTimeout(() => setToastMessage(null), 4000);

    // 2. Background async delete
    try {
      await apiDeleteJobPermanently(jobId);
    } catch (err: unknown) {
      console.warn("apiDeleteJobPermanently background sync failed:", err);
    }
  };

  // Move All Active batches to Trash (Clear All) - Instant Optimistic UI
  const handleClearAllActive = async () => {
    setShowClearAllModal(false);
    const countToMove = activeCount;

    // Instant optimistic update
    setJobs([]);
    setTotal(0);
    setTrashCount((prev) => prev + countToMove);
    setActiveCount(0);
    clearAllLocalHistoryToTrash();

    setToastMessage("All batches moved to Trash.");
    setToastUndoJobId(null);
    setTimeout(() => setToastMessage(null), 4000);

    try {
      await apiClearAllJobs();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to clear all batches.");
      loadHistory(activeTab, page);
    }
  };

  // Empty Trash (Permanently delete all trashed batches) - Instant Optimistic UI
  const handleEmptyTrash = async () => {
    setShowEmptyTrashModal(false);

    // Instant optimistic update
    setJobs([]);
    setTotal(0);
    setTrashCount(0);
    emptyLocalTrash();

    setToastMessage("Trash emptied permanently.");
    setToastUndoJobId(null);
    setTimeout(() => setToastMessage(null), 4000);

    try {
      await apiEmptyTrash();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to empty trash.");
      loadHistory(activeTab, page);
    }
  };

  const handleViewJob = (job: JobHistoryItem) => {
    const viewUrl = getViewPdfUrl(job.job_id);
    window.open(viewUrl, "_blank");
  };

  const totalPages = Math.ceil(total / 20) || 1;

  return (
    <div className="space-y-6">
      {/* Toast Notification with Undo */}
      {toastMessage && (
        <div className="p-3.5 rounded-xl bg-slate-900 dark:bg-navy-800 text-white border border-slate-700 dark:border-cyan-neon/30 text-xs flex items-center justify-between shadow-lg animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center space-x-2.5">
            <svg className="w-4 h-4 shrink-0 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span className="font-medium">{toastMessage}</span>
          </div>
          <div className="flex items-center space-x-3">
            {toastUndoJobId && (
              <button
                type="button"
                onClick={() => {
                  handleRestore(toastUndoJobId);
                  setToastMessage(null);
                  setToastUndoJobId(null);
                }}
                className="text-xs font-bold text-cyan-400 hover:text-cyan-300 underline underline-offset-2 transition-colors"
              >
                Undo
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setToastMessage(null);
                setToastUndoJobId(null);
              }}
              className="text-slate-400 hover:text-white font-bold ml-2"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center space-x-2.5">
            <span>Processing History</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-cyan-100 dark:bg-cyan-neon/15 text-cyan-700 dark:text-cyan-neon font-bold border border-cyan-300 dark:border-cyan-neon/30">
              {activeCount} Batches
            </span>
            {trashCount > 0 && (
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-rose-100 dark:bg-rose-500/15 text-rose-700 dark:text-rose-400 font-bold border border-rose-300 dark:border-rose-500/30 flex items-center space-x-1">
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                </svg>
                <span>{trashCount} in Trash</span>
              </span>
            )}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Access previous thermal shipping label outputs, manage batches, or recover from Trash
          </p>
        </div>

        {/* Header Action Buttons */}
        <div className="flex items-center space-x-2.5 self-start sm:self-auto">
          {/* Clear All Batches (when on Active Tab and has batches) */}
          {activeTab === "history" && activeCount > 0 && (
            <button
              type="button"
              onClick={() => setShowClearAllModal(true)}
              disabled={bulkActionLoading}
              className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-white dark:bg-navy-900 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/15 border border-rose-200 dark:border-rose-500/30 font-semibold text-xs transition-all shadow-sm active:scale-95 disabled:opacity-50"
              title="Move all batches to Trash"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
              </svg>
              <span>Clear All</span>
            </button>
          )}

          {/* Empty Trash Button (when on Trash Tab and has trashed batches) */}
          {activeTab === "trash" && trashCount > 0 && (
            <button
              type="button"
              onClick={() => setShowEmptyTrashModal(true)}
              disabled={bulkActionLoading}
              className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-sm transition-all active:scale-95 disabled:opacity-50"
              title="Permanently delete all batches in Trash"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
              </svg>
              <span>Empty Trash Permanently</span>
            </button>
          )}

          <Link
            href="/"
            className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-cyan-500 dark:bg-cyan-neon text-white dark:text-navy-950 font-bold text-xs shadow-sm dark:shadow-glow hover:bg-cyan-600 dark:hover:bg-cyan-400 transition-all active:scale-95"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>Crop New Batch</span>
          </Link>
        </div>
      </div>

      {/* Tabs: Active Batches vs Trash */}
      <div className="flex items-center space-x-2 border-b border-slate-200 dark:border-navy-800 pb-3">
        <button
          type="button"
          onClick={() => handleTabChange("history")}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === "history"
              ? "bg-cyan-50 dark:bg-cyan-neon/15 text-cyan-600 dark:text-cyan-neon border border-cyan-300 dark:border-cyan-neon/30 shadow-sm"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-navy-800"
          }`}
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <span>Active Batches</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-cyan-200/60 dark:bg-cyan-neon/20 text-cyan-800 dark:text-cyan-neon font-black">
            {activeCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange("trash")}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === "trash"
              ? "bg-rose-50 dark:bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-300 dark:border-rose-500/30 shadow-sm"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-navy-800"
          }`}
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
          </svg>
          <span>Trash</span>
          <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
            trashCount > 0
              ? "bg-rose-200/70 dark:bg-rose-500/25 text-rose-800 dark:text-rose-300"
              : "bg-slate-200 dark:bg-navy-800 text-slate-600 dark:text-slate-400"
          }`}>
            {trashCount}
          </span>
        </button>
      </div>

      {/* Info Banner when in Trash */}
      {activeTab === "trash" && (
        <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-amber-800 dark:text-amber-300 text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <svg className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>
              Batches in Trash are safely preserved. You can restore them back to history anytime, or delete them permanently.
            </span>
          </div>
          {trashCount > 0 && (
            <button
              type="button"
              onClick={() => setShowEmptyTrashModal(true)}
              className="text-xs font-bold text-rose-600 dark:text-rose-400 hover:underline shrink-0 ml-3"
            >
              Empty Trash
            </button>
          )}
        </div>
      )}

      {error && (
        <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs">
          {error}
        </div>
      )}

      {/* Main Batches Table */}
      <div className="bg-white dark:bg-navy-900 border border-slate-200 dark:border-navy-800 rounded-2xl overflow-hidden shadow-sm">
        {loading && jobs.length === 0 ? (
          <div className="py-16 flex flex-col items-center justify-center space-y-3">
            <div className="w-7 h-7 border-2 border-cyan-500 dark:border-cyan-neon border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {activeTab === "trash" ? "Loading Trash archives..." : "Loading batch archives..."}
            </p>
          </div>
        ) : jobs.length === 0 ? (
          <div className="py-16 text-center px-4">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-navy-800 border border-slate-200 dark:border-navy-700 mx-auto flex items-center justify-center text-slate-400 dark:text-slate-500 mb-3">
              {activeTab === "trash" ? (
                <svg className="w-6 h-6 text-slate-400 dark:text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                </svg>
              ) : (
                <svg className="w-6 h-6 text-slate-400 dark:text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
            </div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {activeTab === "trash" ? "Trash is Empty" : "No Processing History Yet"}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
              {activeTab === "trash"
                ? "Batches you delete from Processing History will appear here before permanent deletion."
                : "Your cropped PDF batches and picklists will be safely archived here for instant 1-click re-download."}
            </p>
            {activeTab === "history" && (
              <Link
                href="/"
                className="mt-4 inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-cyan-500 dark:bg-cyan-neon text-white dark:text-navy-950 font-bold text-xs shadow-sm hover:bg-cyan-600 dark:hover:bg-cyan-400 transition-all"
              >
                <span>Crop Your First Batch</span>
              </Link>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-navy-800 text-slate-600 dark:text-slate-400 font-semibold bg-slate-50/80 dark:bg-navy-950/50">
                  <th className="py-3.5 px-4 font-bold">Batch ID</th>
                  <th className="py-3.5 px-4">{activeTab === "trash" ? "Trashed Date" : "Processed Date"}</th>
                  <th className="py-3.5 px-4">Labels Count</th>
                  <th className="py-3.5 px-4">Delivery Couriers</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-navy-800/60">
                {jobs.map((job) => {
                  const hasPicklist = job.downloads?.picklist_csv != null;
                  const isActionLoading = actionLoadingJobId === job.job_id;

                  return (
                    <tr
                      key={job.id || job.job_id}
                      className="hover:bg-slate-50/80 dark:hover:bg-navy-800/35 transition-colors"
                    >
                      <td className="py-3.5 px-4">
                        <div className="flex items-center space-x-2">
                          <span className="font-mono font-bold text-slate-900 dark:text-white">
                            {job.job_id}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              job.is_trashed
                                ? "bg-rose-100 dark:bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-300 dark:border-rose-500/30"
                                : job.status === "completed"
                                ? "bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-500/30"
                                : "bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-500/30"
                            }`}
                          >
                            {job.is_trashed ? "Trashed" : job.status}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 block mt-0.5">
                          {job.total_files} input PDF document(s)
                          {job.formatted_filename ? ` • ${job.formatted_filename}` : ""}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300">
                        {formatBatchDate(job.created_at).dateStr}
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 block">
                          {formatBatchDate(job.created_at).timeStr}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 font-semibold text-slate-900 dark:text-white">
                        {job.total_labels_generated} thermal labels
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex flex-wrap gap-1">
                          {job.courier_breakdown && job.courier_breakdown.length > 0 ? (
                            job.courier_breakdown.map((c, i) => (
                              <span
                                key={i}
                                className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-navy-950 border border-slate-200 dark:border-navy-700 text-slate-700 dark:text-slate-300 text-[10px]"
                              >
                                {c.courier}: {c.label_count}
                              </span>
                            ))
                          ) : (
                            <span className="text-slate-400 dark:text-slate-500 text-[11px]">-</span>
                          )}
                        </div>
                      </td>

                      {/* Action Buttons */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center space-x-1.5">
                          {activeTab === "history" ? (
                            <>
                              {/* 1. View Button */}
                              <button
                                type="button"
                                onClick={() => handleViewJob(job)}
                                className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-navy-800 hover:bg-slate-200 dark:hover:bg-cyan-neon hover:text-slate-900 dark:hover:text-navy-950 text-slate-700 dark:text-slate-200 text-xs font-semibold border border-slate-200 dark:border-navy-700 transition-all shadow-sm"
                                title="View 4x6 Thermal PDF in browser"
                              >
                                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                  <circle cx="12" cy="12" r="3" />
                                </svg>
                                <span>View</span>
                              </button>

                              {/* 2. Download 4x6 PDF Button */}
                              <a
                                href={getDownloadPdfUrl(job.job_id)}
                                target="_blank"
                                rel="noreferrer"
                                download
                                className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-cyan-500 dark:bg-cyan-neon text-white dark:text-navy-950 font-bold text-xs shadow-sm hover:bg-cyan-600 dark:hover:bg-cyan-400 transition-all"
                                title="Download 4x6 Thermal PDF"
                              >
                                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                                  <polyline points="7 10 12 15 17 10" />
                                  <line x1="12" y1="15" x2="12" y2="3" />
                                </svg>
                                <span>4×6 PDF</span>
                              </a>

                              {/* 3. Picklist CSV Button */}
                              {hasPicklist && (
                                <a
                                  href={getDownloadPicklistUrl(job.job_id)}
                                  target="_blank"
                                  rel="noreferrer"
                                  download
                                  className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-navy-800 hover:bg-slate-200 dark:hover:bg-navy-700 text-slate-700 dark:text-slate-300 text-xs font-semibold border border-slate-200 dark:border-navy-700 transition-all shadow-sm"
                                  title="Download SKU Picklist CSV"
                                >
                                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                                    <polyline points="14 2 14 8 20 8" />
                                  </svg>
                                  <span>Picklist</span>
                                </a>
                              )}

                              {/* 4. Move to Trash Button */}
                              <button
                                type="button"
                                onClick={() => handleMoveToTrash(job.job_id)}
                                disabled={isActionLoading}
                                className="inline-flex items-center justify-center p-1.5 rounded-lg bg-slate-100 dark:bg-navy-800 hover:bg-rose-50 dark:hover:bg-rose-500/20 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 border border-slate-200 dark:border-navy-700 hover:border-rose-300 dark:hover:border-rose-500/40 text-xs font-semibold transition-all disabled:opacity-50 shadow-sm"
                                title="Move batch to Trash"
                              >
                                {isActionLoading ? (
                                  <span className="w-3.5 h-3.5 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" />
                                ) : (
                                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <polyline points="3 6 5 6 21 6" />
                                    <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                                  </svg>
                                )}
                              </button>
                            </>
                          ) : (
                            /* Actions when viewing Trash tab */
                            <>
                              {/* Restore Button */}
                              <button
                                type="button"
                                onClick={() => handleRestore(job.job_id)}
                                disabled={isActionLoading}
                                className="inline-flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-500/25 border border-emerald-300 dark:border-emerald-500/40 font-bold text-xs transition-all shadow-sm disabled:opacity-50"
                                title="Restore batch to Active History"
                              >
                                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                  <path d="M3 12a9 9 0 0115.54-6.36L21 8" />
                                  <path d="M21 3v5h-5" />
                                  <path d="M21 12a9 9 0 01-15.54 6.36L3 16" />
                                  <path d="M3 21v-5h5" />
                                </svg>
                                <span>Restore</span>
                              </button>

                              {/* Delete Permanently Button */}
                              <button
                                type="button"
                                onClick={() => setPermanentDeleteCandidate(job.job_id)}
                                disabled={isActionLoading}
                                className="inline-flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-500/15 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-500/25 border border-rose-300 dark:border-rose-500/40 font-bold text-xs transition-all shadow-sm disabled:opacity-50"
                                title="Permanently delete batch forever"
                              >
                                {isActionLoading ? (
                                  <span className="w-3.5 h-3.5 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" />
                                ) : (
                                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <polyline points="3 6 5 6 21 6" />
                                    <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                                    <line x1="10" y1="11" x2="10" y2="17" />
                                    <line x1="14" y1="11" x2="14" y2="17" />
                                  </svg>
                                )}
                                <span>Delete Permanently</span>
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {total > 20 && (
          <div className="p-4 border-t border-slate-200 dark:border-navy-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>
              Showing {(page - 1) * 20 + 1} - {Math.min(page * 20, total)} of{" "}
              {total} Batches
            </span>
            <div className="flex items-center space-x-1.5">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className="px-2.5 py-1 rounded-lg bg-white dark:bg-navy-800 border border-slate-200 dark:border-navy-700 hover:bg-slate-50 dark:hover:bg-navy-700 disabled:opacity-40 text-slate-700 dark:text-white shadow-sm"
              >
                Previous
              </button>
              <span className="px-2 text-slate-700 dark:text-slate-300 font-semibold">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
                className="px-2.5 py-1 rounded-lg bg-white dark:bg-navy-800 border border-slate-200 dark:border-navy-700 hover:bg-slate-50 dark:hover:bg-navy-700 disabled:opacity-40 text-slate-700 dark:text-white shadow-sm"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* MODAL 1: Confirm Move All to Trash */}
      {showClearAllModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white dark:bg-navy-900 border border-slate-200 dark:border-navy-700 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-start space-x-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-500/15 border border-amber-300 dark:border-amber-500/30 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Move All Batches to Trash?
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                  All <span className="font-bold text-slate-900 dark:text-white">{activeCount} active batches</span> will be moved to Trash. You can still access, view, or restore them anytime from the Trash tab.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100 dark:border-navy-800">
              <button
                type="button"
                onClick={() => setShowClearAllModal(false)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-navy-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleClearAllActive}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-sm transition-all"
              >
                Yes, Move All to Trash
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Confirm Empty Trash (Permanent Delete All) */}
      {showEmptyTrashModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white dark:bg-navy-900 border border-rose-300 dark:border-rose-500/40 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-start space-x-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-500/20 border border-rose-300 dark:border-rose-500/30 flex items-center justify-center text-rose-600 dark:text-rose-400 shrink-0">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-base font-bold text-rose-600 dark:text-rose-400">
                  Empty Trash Permanently?
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                  This will permanently delete all <span className="font-bold text-slate-900 dark:text-white">{trashCount} batches</span> in Trash, including their thermal PDF files, picklists, and audit logs. <span className="font-bold text-rose-600 dark:text-rose-400">This action cannot be undone.</span>
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100 dark:border-navy-800">
              <button
                type="button"
                onClick={() => setShowEmptyTrashModal(false)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-navy-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleEmptyTrash}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-sm transition-all"
              >
                Yes, Empty Trash Forever
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Confirm Single Batch Permanent Delete */}
      {permanentDeleteCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white dark:bg-navy-900 border border-rose-300 dark:border-rose-500/40 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-start space-x-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-500/20 border border-rose-300 dark:border-rose-500/30 flex items-center justify-center text-rose-600 dark:text-rose-400 shrink-0">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-base font-bold text-rose-600 dark:text-rose-400">
                  Delete Batch Permanently?
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                  Are you sure you want to permanently delete batch <span className="font-mono font-bold text-slate-900 dark:text-white">{permanentDeleteCandidate}</span>? All files, label entries, and downloads for this batch will be wiped forever and cannot be recovered.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100 dark:border-navy-800">
              <button
                type="button"
                onClick={() => setPermanentDeleteCandidate(null)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-navy-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmPermanentDelete}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-sm transition-all"
              >
                Delete Forever
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
