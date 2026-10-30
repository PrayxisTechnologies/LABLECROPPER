/**
 * LabelFlow Local Processing History Helper
 * Stores guest & unauthenticated label cropping batches in browser localStorage
 * with strict 48-hour auto-expiration.
 */

import { getDownloadPdfUrl, getViewPdfUrl } from "./api";

export interface LocalProcessingItem {
  id: string; // unique identifier (job_id)
  job_id: string;
  filename: string; // output filename e.g. "meesho1prayxis.pdf"
  original_files: string[]; // input filenames
  created_at: number; // timestamp in milliseconds
  total_labels: number;
  total_files: number;
  formatted_size: string; // e.g. "844.68 KB"
  marketplace: string; // "Meesho", "Flipkart", etc.
  type_badge: string; // "Label Only" or "Full Label"
  download_url: string;
  view_url: string;
}

const LOCAL_HISTORY_STORAGE_KEY = "labelflow_local_history_48h";
const LOCAL_TRASH_STORAGE_KEY = "labelflow_local_trash_48h";
const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000; // 48 Hours in milliseconds

/**
 * Get all valid history items stored in localStorage.
 * Automatically purges any entries older than 48 hours.
 */
export function getLocalProcessingHistory(): LocalProcessingItem[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = localStorage.getItem(LOCAL_HISTORY_STORAGE_KEY);
    if (!raw) return [];

    const parsed: LocalProcessingItem[] = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const now = Date.now();
    // Filter strictly to items created within the last 48 hours
    const valid = parsed.filter(
      (item) => item && typeof item.created_at === "number" && now - item.created_at < FORTY_EIGHT_HOURS_MS
    );

    // If any items were expired & pruned, persist the cleaned list back to localStorage
    if (valid.length !== parsed.length) {
      localStorage.setItem(LOCAL_HISTORY_STORAGE_KEY, JSON.stringify(valid));
    }

    // Sort newest first
    return valid.sort((a, b) => b.created_at - a.created_at);
  } catch {
    return [];
  }
}

/**
 * Get all valid trashed items stored in localStorage.
 */
export function getLocalTrash(): LocalProcessingItem[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = localStorage.getItem(LOCAL_TRASH_STORAGE_KEY);
    if (!raw) return [];

    const parsed: LocalProcessingItem[] = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const now = Date.now();
    const valid = parsed.filter(
      (item) => item && typeof item.created_at === "number" && now - item.created_at < FORTY_EIGHT_HOURS_MS
    );
    return valid.sort((a, b) => b.created_at - a.created_at);
  } catch {
    return [];
  }
}

/**
 * Save or update a processing batch in localStorage history.
 */
export function saveLocalProcessingItem(item: LocalProcessingItem): void {
  if (typeof window === "undefined") return;

  try {
    const current = getLocalProcessingHistory();
    // Remove if already exists to avoid duplicates
    const filtered = current.filter((x) => x.job_id !== item.job_id);
    const updated = [item, ...filtered].slice(0, 50); // Keep up to 50 items
    localStorage.setItem(LOCAL_HISTORY_STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // Quota exceeded or private browsing restrictions
  }
}

/**
 * Move a local batch to trash.
 */
export function moveLocalItemToTrash(jobId: string): void {
  if (typeof window === "undefined") return;

  try {
    const currentHistory = getLocalProcessingHistory();
    const itemToTrash = currentHistory.find((x) => x.job_id === jobId);
    const updatedHistory = currentHistory.filter((x) => x.job_id !== jobId);
    localStorage.setItem(LOCAL_HISTORY_STORAGE_KEY, JSON.stringify(updatedHistory));

    if (itemToTrash) {
      const currentTrash = getLocalTrash().filter((x) => x.job_id !== jobId);
      const updatedTrash = [itemToTrash, ...currentTrash].slice(0, 50);
      localStorage.setItem(LOCAL_TRASH_STORAGE_KEY, JSON.stringify(updatedTrash));
    }
  } catch {}
}

/**
 * Restore a trashed local batch back to active history.
 */
export function restoreLocalItemFromTrash(jobId: string): void {
  if (typeof window === "undefined") return;

  try {
    const currentTrash = getLocalTrash();
    const itemToRestore = currentTrash.find((x) => x.job_id === jobId);
    const updatedTrash = currentTrash.filter((x) => x.job_id !== jobId);
    localStorage.setItem(LOCAL_TRASH_STORAGE_KEY, JSON.stringify(updatedTrash));

    if (itemToRestore) {
      const currentHistory = getLocalProcessingHistory().filter((x) => x.job_id !== jobId);
      const updatedHistory = [itemToRestore, ...currentHistory].slice(0, 50);
      localStorage.setItem(LOCAL_HISTORY_STORAGE_KEY, JSON.stringify(updatedHistory));
    }
  } catch {}
}

/**
 * Permanently remove an individual record from both active history and trash.
 */
export function removeLocalProcessingItem(jobId: string): LocalProcessingItem[] {
  if (typeof window === "undefined") return [];

  try {
    const current = getLocalProcessingHistory();
    const updated = current.filter((x) => x.job_id !== jobId);
    localStorage.setItem(LOCAL_HISTORY_STORAGE_KEY, JSON.stringify(updated));

    const currentTrash = getLocalTrash();
    const updatedTrash = currentTrash.filter((x) => x.job_id !== jobId);
    localStorage.setItem(LOCAL_TRASH_STORAGE_KEY, JSON.stringify(updatedTrash));

    return updated;
  } catch {
    return [];
  }
}

/**
 * Move all local history to trash.
 */
export function clearAllLocalHistoryToTrash(): void {
  if (typeof window === "undefined") return;

  try {
    const currentHistory = getLocalProcessingHistory();
    const currentTrash = getLocalTrash();
    const mergedTrash = [...currentHistory, ...currentTrash].slice(0, 50);
    localStorage.setItem(LOCAL_TRASH_STORAGE_KEY, JSON.stringify(mergedTrash));
    localStorage.removeItem(LOCAL_HISTORY_STORAGE_KEY);
  } catch {}
}

/**
 * Empty local trash completely.
 */
export function emptyLocalTrash(): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.removeItem(LOCAL_TRASH_STORAGE_KEY);
  } catch {}
}

/**
 * Wipe all local history from localStorage.
 */
export function clearLocalProcessingHistory(): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.removeItem(LOCAL_HISTORY_STORAGE_KEY);
  } catch {}
}

/**
 * Sync server processing jobs into local history so both landing page and dashboard
 * reflect identical history seamlessly.
 */
export function syncServerJobsToLocalHistory(
  serverJobs: Array<{
    job_id: string;
    formatted_filename?: string;
    marketplace?: string;
    created_at?: string | number;
    total_labels_generated?: number;
    total_files?: number;
  }>
): LocalProcessingItem[] {
  if (typeof window === "undefined" || !Array.isArray(serverJobs)) {
    return getLocalProcessingHistory();
  }

  try {
    const current = getLocalProcessingHistory();
    const map = new Map<string, LocalProcessingItem>(
      current.map((item) => [item.job_id, item])
    );

    const currentTrash = getLocalTrash();
    const trashedIds = new Set(currentTrash.map((t) => t.job_id));

    // Purge any trashed jobs from the active map immediately
    for (const tId of trashedIds) {
      map.delete(tId);
    }

    for (const job of serverJobs) {
      if (!job || !job.job_id) continue;
      if (trashedIds.has(job.job_id) || (job as any).is_trashed) {
        map.delete(job.job_id);
        continue;
      }
      const existing = map.get(job.job_id);
      const createdMs =
        typeof job.created_at === "number"
          ? job.created_at
          : job.created_at
          ? new Date(job.created_at).getTime()
          : Date.now();

      const mp = job.marketplace || existing?.marketplace || "Meesho";
      const filename =
        job.formatted_filename ||
        existing?.filename ||
        `${mp.toLowerCase()}prayxis.pdf`;

      const item: LocalProcessingItem = {
        id: job.job_id,
        job_id: job.job_id,
        filename,
        original_files: existing?.original_files || [filename],
        created_at: Number.isNaN(createdMs) ? Date.now() : createdMs,
        total_labels: job.total_labels_generated ?? existing?.total_labels ?? 0,
        total_files: job.total_files ?? existing?.total_files ?? 1,
        formatted_size: existing?.formatted_size || "Thermal 4×6",
        marketplace: mp,
        type_badge: existing?.type_badge || "Label Only",
        download_url: existing?.download_url || getDownloadPdfUrl(job.job_id),
        view_url: existing?.view_url || getViewPdfUrl(job.job_id),
      };

      map.set(job.job_id, item);
    }

    const merged = Array.from(map.values())
      .sort((a, b) => b.created_at - a.created_at)
      .slice(0, 50);

    localStorage.setItem(LOCAL_HISTORY_STORAGE_KEY, JSON.stringify(merged));
    return merged;
  } catch {
    return getLocalProcessingHistory();
  }
}


/**
 * Human-friendly date & time formatting matching user requirements:
 * "Today, 11:12 pm", "Yesterday, 04:30 pm", or "24 Oct, 11:12 am"
 */
export function formatHistoryTimestamp(timestamp: number): string {
  if (!timestamp) return "Recently";

  const date = new Date(timestamp);
  const now = new Date();

  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear();

  const timeStr = date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  if (isToday) return `Today, ${timeStr}`;
  if (isYesterday) return `Yesterday, ${timeStr}`;

  const monthDay = date.toLocaleDateString([], { month: "short", day: "numeric" });
  return `${monthDay}, ${timeStr}`;
}
