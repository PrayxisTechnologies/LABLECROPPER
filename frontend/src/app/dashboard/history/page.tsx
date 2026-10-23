"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  apiBackupJobToGoogleDrive,
  apiDeleteJob,
  apiDisconnectGoogleDrive,
  apiGetGoogleDriveStatus,
  apiGetJobHistory,
} from "@/lib/api-auth";
import { getAbsoluteDownloadUrl, getDownloadPdfUrl, getViewPdfUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { GoogleDriveStatus, JobHistoryItem } from "@/lib/types";

export default function HistoryPage() {
  const searchParams = useSearchParams();
  const { user, updateSettings } = useAuth();

  const [jobs, setJobs] = useState<JobHistoryItem[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Google Drive state
  const [driveStatus, setDriveStatus] = useState<GoogleDriveStatus>({ connected: false });
  const [driveLoading, setDriveLoading] = useState<boolean>(true);
  const [backingUpJobId, setBackingUpJobId] = useState<string | null>(null);
  const [deletingJobId, setDeletingJobId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Detect ?drive=connected in query params
  useEffect(() => {
    if (searchParams.get("drive") === "connected") {
      setToastMessage("Google Drive successfully linked! All label outputs will now backup to your Drive.");
      const timer = setTimeout(() => setToastMessage(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [searchParams]);

  const loadDriveStatus = async () => {
    try {
      const status = await apiGetGoogleDriveStatus();
      setDriveStatus(status);
    } catch {
      setDriveStatus({ connected: false });
    } finally {
      setDriveLoading(false);
    }
  };

  const loadHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGetJobHistory(page, 20);
      setJobs(res.items);
      setTotal(res.total);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load processing history."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDriveStatus();
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const handleDisconnectDrive = async () => {
    if (!confirm("Are you sure you want to disconnect Google Drive? New batches will not be automatically saved to your Drive.")) {
      return;
    }
    setDriveLoading(true);
    try {
      await apiDisconnectGoogleDrive();
      setDriveStatus({ connected: false });
      setToastMessage("Google Drive disconnected.");
      setTimeout(() => setToastMessage(null), 4000);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to disconnect Drive.");
    } finally {
      setDriveLoading(false);
    }
  };

  const handleToggleAutoSave = async () => {
    const nextVal = !(driveStatus.auto_save ?? true);
    try {
      await updateSettings({ auto_save_to_drive: nextVal });
      setDriveStatus((prev) => ({ ...prev, auto_save: nextVal }));
      setToastMessage(nextVal ? "Auto-save to Google Drive enabled." : "Auto-save to Google Drive paused.");
      setTimeout(() => setToastMessage(null), 3500);
    } catch {
      alert("Failed to update auto-save setting.");
    }
  };

  const handleSaveToDrive = async (jobId: string) => {
    if (!driveStatus.connected) {
      alert("Please connect your Google Drive first from the banner above.");
      return;
    }

    setBackingUpJobId(jobId);
    try {
      const res = await apiBackupJobToGoogleDrive(jobId);
      if (res.success) {
        setToastMessage(`Job ${jobId} successfully saved to your Google Drive!`);
        setTimeout(() => setToastMessage(null), 5000);

        // Update local jobs state with drive urls
        setJobs((prev) =>
          prev.map((j) => {
            if (j.job_id === jobId) {
              return {
                ...j,
                downloads: {
                  ...j.downloads,
                  google_drive_folder: res.folder_url,
                  google_drive_pdf: res.pdf_drive_url,
                  google_drive_picklist: res.picklist_drive_url,
                },
                google_drive: {
                  saved: true,
                  folder_url: res.folder_url,
                  pdf_drive_url: res.pdf_drive_url,
                  picklist_drive_url: res.picklist_drive_url,
                },
              };
            }
            return j;
          })
        );
      } else {
        alert(res.message || "Failed to backup job to Google Drive.");
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to backup to Google Drive.");
    } finally {
      setBackingUpJobId(null);
    }
  };

  const handleDeleteJob = async (jobId: string) => {
    if (!confirm(`Are you sure you want to delete batch ${jobId}? This will remove it from your history.`)) {
      return;
    }

    setDeletingJobId(jobId);
    try {
      await apiDeleteJob(jobId);
      setJobs((prev) => prev.filter((j) => j.job_id !== jobId));
      setTotal((prev) => Math.max(0, prev - 1));
      setToastMessage(`Batch ${jobId} deleted successfully.`);
      setTimeout(() => setToastMessage(null), 4000);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to delete batch.");
    } finally {
      setDeletingJobId(null);
    }
  };

  const handleViewJob = (job: JobHistoryItem) => {
    const viewUrl = getViewPdfUrl(job.job_id);
    window.open(viewUrl, "_blank");
  };

  const totalPages = Math.ceil(total / 20) || 1;

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs flex items-center justify-between shadow-lg animate-fade-in">
          <div className="flex items-center space-x-2.5">
            <svg className="w-4 h-4 shrink-0 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>{toastMessage}</span>
          </div>
          <button onClick={() => setToastMessage(null)} className="text-emerald-400 hover:text-white font-bold ml-3">
            ✕
          </button>
        </div>
      )}

      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight flex items-center space-x-2.5">
            <span>Processing History</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-cyan-neon/15 text-cyan-neon font-bold border border-cyan-neon/30">
              {total} Batches
            </span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Access previous thermal shipping label outputs and download picklist archives
          </p>
        </div>

        <Link
          href="/"
          className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-cyan-neon text-navy-950 font-bold text-xs shadow-glow hover:bg-cyan-400 transition-all self-start sm:self-auto"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span>Crop New Batch</span>
        </Link>
      </div>

      {/* =========================================================================
          GOOGLE DRIVE INTEGRATION BANNER ("Bring Your Own Storage - Calling System")
          ========================================================================= */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-navy-900 via-navy-900 to-cyan-950/40 border border-navy-700/80 p-5 shadow-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start space-x-3.5">
            <div className="w-10 h-10 rounded-xl bg-[#4285F4]/10 border border-[#4285F4]/30 flex items-center justify-center shrink-0 mt-0.5">
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
            </div>

            <div className="space-y-1">
              <div className="flex items-center space-x-2">
                <h3 className="text-sm font-bold text-white">
                  Google Drive Storage Link
                </h3>
                {driveStatus.connected ? (
                  <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-bold text-emerald-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span>Active & Linked</span>
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-[10px] font-bold text-amber-400">
                    Not Linked
                  </span>
                )}
              </div>

              <p className="text-xs text-slate-300 leading-relaxed max-w-xl">
                {driveStatus.connected ? (
                  <>
                    Aapka account <strong className="text-cyan-neon font-medium">{driveStatus.email || user?.email}</strong> ke Google Drive se linked hai. Saare processed labels automatically aapke Drive me marketplace folders (jaise <strong className="text-white">Meesho</strong>, <strong className="text-white">Flipkart</strong>) me save hote hain.
                  </>
                ) : (
                  <>
                    Google Drive link karein taaki storage bilkul free rahe! Aapke saare 4×6 shipping labels aur picklists directly aapke Google Drive me marketplace-wise folders me save honge.
                  </>
                )}
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center space-x-2.5 self-start md:self-center shrink-0">
            {driveStatus.connected ? (
              <>
                {driveStatus.folder_url && (
                  <a
                    href={driveStatus.folder_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-cyan-neon/15 hover:bg-cyan-neon/25 border border-cyan-neon/30 text-cyan-neon font-bold text-xs transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
                    </svg>
                    <span>Open Drive Folder</span>
                  </a>
                )}

                <button
                  type="button"
                  onClick={handleToggleAutoSave}
                  title="Toggle automatic Google Drive backup"
                  className={`px-3 py-2 rounded-xl border text-xs font-semibold transition-colors ${
                    driveStatus.auto_save ?? true
                      ? "bg-navy-800 border-navy-700 text-slate-200 hover:bg-navy-700"
                      : "bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20"
                  }`}
                >
                  Auto-Save: {(driveStatus.auto_save ?? true) ? "ON" : "OFF"}
                </button>

                <button
                  type="button"
                  onClick={handleDisconnectDrive}
                  disabled={driveLoading}
                  className="px-2.5 py-2 rounded-xl border border-navy-700 bg-navy-950 text-slate-400 hover:text-rose-400 text-xs transition-colors"
                  title="Disconnect Google Drive"
                >
                  Unlink
                </button>
              </>
            ) : (
              <div className="min-w-[220px]">
                <GoogleSignInButton
                  mode="link_drive"
                  label="Link Google Drive"
                  className="shadow-glow"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
          {error}
        </div>
      )}

      {/* History Table */}
      <div className="bg-navy-900 border border-navy-800 rounded-2xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="py-16 flex flex-col items-center justify-center space-y-3">
            <div className="w-7 h-7 border-2 border-cyan-neon border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-slate-400">Loading batch archives...</p>
          </div>
        ) : jobs.length === 0 ? (
          <div className="py-16 text-center px-4">
            <div className="w-12 h-12 rounded-2xl bg-navy-800 border border-navy-700 mx-auto flex items-center justify-center text-slate-500 mb-3">
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            </div>
            <h3 className="text-sm font-bold text-white">No Batches Yet</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              Any Meesho PDF shipping label batches you process will be safely preserved here and in your Google Drive.
            </p>
            <Link
              href="/"
              className="mt-4 inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-cyan-neon text-navy-950 font-bold text-xs shadow-glow"
            >
              <span>Upload PDF Files</span>
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-navy-800 text-slate-400 font-semibold bg-navy-950/40">
                  <th className="py-3 px-4">Job Identifier</th>
                  <th className="py-3 px-4">Processed Date</th>
                  <th className="py-3 px-4">Labels Cropped</th>
                  <th className="py-3 px-4">Couriers Serviced</th>
                  <th className="py-3 px-4">Google Drive</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-800/60">
                {jobs.map((job) => {
                  const drivePdfUrl =
                    job.downloads?.google_drive_pdf ||
                    job.google_drive?.pdf_drive_url;
                  const driveFolderUrl =
                    job.downloads?.google_drive_folder ||
                    job.google_drive?.folder_url;
                  const isSavedToDrive = Boolean(drivePdfUrl || job.google_drive?.saved);

                  return (
                    <tr key={job.id} className="hover:bg-navy-800/30 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-cyan-neon">
                        {job.job_id}
                      </td>

                      <td className="py-3.5 px-4 text-slate-300">
                        {new Date(job.created_at).toLocaleDateString()}{" "}
                        <span className="text-[10px] text-slate-500">
                          {new Date(job.created_at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 font-semibold text-white">
                        {job.total_labels_generated} thermal labels
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex flex-wrap gap-1">
                          {job.courier_breakdown && job.courier_breakdown.length > 0 ? (
                            job.courier_breakdown.map((c, i) => (
                              <span
                                key={i}
                                className="px-2 py-0.5 rounded-md bg-navy-950 border border-navy-700 text-slate-300 text-[10px]"
                              >
                                {c.courier}: {c.label_count}
                              </span>
                            ))
                          ) : (
                            <span className="text-slate-500 text-[11px]">-</span>
                          )}
                        </div>
                      </td>

                      {/* Google Drive Status Column ("Calling System") */}
                      <td className="py-3.5 px-4">
                        {isSavedToDrive ? (
                          <div className="inline-flex items-center space-x-1.5">
                            <a
                              href={drivePdfUrl || driveFolderUrl || "#"}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 font-bold text-[11px] transition-colors"
                              title="Open cropped PDF in Google Drive"
                            >
                              <svg className="w-3.5 h-3.5 text-emerald-400 shrink-0" viewBox="0 0 24 24">
                                <path
                                  fill="#4285F4"
                                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                                />
                              </svg>
                              <span>Open in Drive ➔</span>
                            </a>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleSaveToDrive(job.job_id)}
                            disabled={backingUpJobId === job.job_id}
                            className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-navy-800 hover:bg-cyan-neon hover:text-navy-950 text-slate-300 font-semibold text-[11px] border border-navy-700 transition-all disabled:opacity-50"
                          >
                            {backingUpJobId === job.job_id ? (
                              <>
                                <span className="w-3 h-3 border-2 border-cyan-neon border-t-transparent rounded-full animate-spin" />
                                <span>Saving...</span>
                              </>
                            ) : (
                              <>
                                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                                  <polyline points="17 8 12 3 7 8" />
                                  <line x1="12" y1="3" x2="12" y2="15" />
                                </svg>
                                <span>Save to Drive</span>
                              </>
                            )}
                          </button>
                        )}
                      </td>

                      {/* Action Buttons: View, Download 4x6, Delete */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center space-x-1.5">
                          {/* 1. View Button */}
                          <button
                            type="button"
                            onClick={() => handleViewJob(job)}
                            className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-navy-800 hover:bg-cyan-neon hover:text-navy-950 text-slate-200 text-xs font-semibold border border-navy-700 hover:border-cyan-neon transition-all"
                            title="View 4x6 Thermal PDF in new browser tab"
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
                            className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-navy-800 hover:bg-cyan-400 hover:text-navy-950 text-slate-200 text-xs font-semibold border border-navy-700 transition-all"
                            title="Download 4x6 Thermal PDF"
                          >
                              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                                <polyline points="7 10 12 15 17 10" />
                                <line x1="12" y1="15" x2="12" y2="3" />
                              </svg>
                              <span>4×6 PDF</span>
                            </a>
                          )}

                          {/* 3. Delete Batch Button */}
                          <button
                            type="button"
                            onClick={() => handleDeleteJob(job.job_id)}
                            disabled={deletingJobId === job.job_id}
                            className="inline-flex items-center justify-center p-1.5 rounded-lg bg-navy-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-navy-700 hover:border-rose-500/40 text-xs font-semibold transition-all disabled:opacity-50"
                            title="Delete batch from history"
                          >
                            {deletingJobId === job.job_id ? (
                              <span className="w-3.5 h-3.5 border-2 border-rose-400 border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                                <line x1="10" y1="11" x2="10" y2="17" />
                                <line x1="14" y1="11" x2="14" y2="17" />
                              </svg>
                            )}
                          </button>
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
          <div className="p-4 border-t border-navy-800 flex items-center justify-between text-xs text-slate-400">
            <span>
              Showing {(page - 1) * 20 + 1} - {Math.min(page * 20, total)} of{" "}
              {total} Batches
            </span>
            <div className="flex items-center space-x-1.5">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className="px-2.5 py-1 rounded-lg bg-navy-800 border border-navy-700 hover:bg-navy-700 disabled:opacity-40 text-white"
              >
                Previous
              </button>
              <span className="px-2 text-slate-300 font-semibold">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
                className="px-2.5 py-1 rounded-lg bg-navy-800 border border-navy-700 hover:bg-navy-700 disabled:opacity-40 text-white"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
