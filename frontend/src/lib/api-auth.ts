/**
 * Authentication and SKU Management API Client
 */

import { getApiBaseUrl } from "./api";
import {
  Decision,
  GoogleDriveStatus,
  JobHistoryResponse,
  MasterSheetResponse,
  ProcessingJobResponse,
  SaveDecisionRequest,
  SaveToDriveResponse,
  SKUImportResult,
  SKUListResponse,
  TokenResponse,
  User,
  UserSettings,
  UserSKU,
} from "./types";

const TOKEN_KEY = "labelflow_jwt_token";
const USER_KEY = "labelflow_user_profile";

export function getStoredToken(): string | null {
  if (typeof window !== "undefined") {
    return localStorage.getItem(TOKEN_KEY);
  }
  return null;
}

export function setStoredToken(token: string | null): void {
  if (typeof window !== "undefined") {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  }
}

export function getStoredUser(): User | null {
  if (typeof window !== "undefined") {
    const raw = localStorage.getItem(USER_KEY);
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch {}
    }
  }
  return null;
}

export function setStoredUser(user: User | null): void {
  if (typeof window !== "undefined") {
    if (user) {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(USER_KEY);
    }
  }
}

export function getAuthHeaders(): Record<string, string> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

/* ========================================================
   AUTHENTICATION APIS
   ======================================================== */

export async function apiRegister(
  email: string,
  password: string,
  name?: string
): Promise<TokenResponse> {
  const baseUrl = getApiBaseUrl();
  const res = await fetch(`${baseUrl}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    credentials: "include",
    body: JSON.stringify({ email, password, name }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || `Registration failed with status ${res.status}`);
  }

  const data: TokenResponse = await res.json();
  setStoredToken(data.access_token);
  setStoredUser(data.user);
  return data;
}

export async function apiLoginWithVerifiedEmail(
  email: string,
  name?: string
): Promise<TokenResponse> {
  const baseUrl = getApiBaseUrl();
  const res = await fetch(`${baseUrl}/auth/verified-email-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    credentials: "include",
    body: JSON.stringify({ email, name }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || "Verification sign-in failed.");
  }

  const data: TokenResponse = await res.json();
  setStoredToken(data.access_token);
  setStoredUser(data.user);
  return data;
}

export async function apiLogin(
  email: string,
  password: string
): Promise<TokenResponse> {
  const baseUrl = getApiBaseUrl();
  const res = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    credentials: "include",
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || "Invalid email or password.");
  }

  const data: TokenResponse = await res.json();
  setStoredToken(data.access_token);
  setStoredUser(data.user);
  return data;
}

export async function apiLoginWithGoogle(data: {
  credential?: string;
  code?: string;
  redirect_uri?: string;
  link_drive?: boolean;
}): Promise<TokenResponse> {
  const baseUrl = getApiBaseUrl();
  const res = await fetch(`${baseUrl}/auth/google`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || "Google authentication failed.");
  }

  const tokenResp: TokenResponse = await res.json();
  setStoredToken(tokenResp.access_token);
  setStoredUser(tokenResp.user);
  return tokenResp;
}

export async function apiGetGoogleDriveConnectUrl(
  redirectUri?: string
): Promise<{ url: string; client_configured: boolean; client_id?: string }> {
  const baseUrl = getApiBaseUrl();
  const params = redirectUri ? `?redirect_uri=${encodeURIComponent(redirectUri)}` : "";
  const res = await fetch(`${baseUrl}/auth/google/drive/connect-url${params}`, {
    headers: getAuthHeaders(),
    credentials: "include",
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || "Failed to get Google Drive connection URL.");
  }

  return await res.json();
}

export async function apiLinkGoogleDrive(
  code: string,
  redirectUri?: string
): Promise<GoogleDriveStatus> {
  const baseUrl = getApiBaseUrl();
  const res = await fetch(`${baseUrl}/auth/google/drive/link`, {
    method: "POST",
    headers: {
      ...getAuthHeaders(),
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({ code, redirect_uri: redirectUri }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || "Failed to link Google Drive.");
  }

  return await res.json();
}

export async function apiGetGoogleDriveStatus(): Promise<GoogleDriveStatus> {
  const baseUrl = getApiBaseUrl();
  const res = await fetch(`${baseUrl}/auth/google/drive/status`, {
    headers: getAuthHeaders(),
    credentials: "include",
  });

  if (!res.ok) {
    return { connected: false };
  }

  return await res.json();
}

export async function apiDisconnectGoogleDrive(): Promise<void> {
  const baseUrl = getApiBaseUrl();
  await fetch(`${baseUrl}/auth/google/drive/disconnect`, {
    method: "POST",
    headers: getAuthHeaders(),
    credentials: "include",
  });
}

export async function apiBackupJobToGoogleDrive(
  jobId: string
): Promise<SaveToDriveResponse> {
  const baseUrl = getApiBaseUrl();
  const res = await fetch(`${baseUrl}/auth/google/drive/backup-job/${jobId}`, {
    method: "POST",
    headers: getAuthHeaders(),
    credentials: "include",
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || "Failed to save job to Google Drive.");
  }

  return await res.json();
}

export async function apiLogout(): Promise<void> {
  const baseUrl = getApiBaseUrl();
  try {
    await fetch(`${baseUrl}/auth/logout`, {
      method: "POST",
      headers: getAuthHeaders(),
      credentials: "include",
    });
  } catch {
    // ignore
  } finally {
    setStoredToken(null);
    setStoredUser(null);
  }
}

export async function apiGetMe(): Promise<User | null> {
  const baseUrl = getApiBaseUrl();
  const headers = getAuthHeaders();
  if (!headers["Authorization"]) {
    return null;
  }

  try {
    const res = await fetch(`${baseUrl}/auth/me`, {
      method: "GET",
      headers,
      credentials: "include",
    });

    if (!res.ok) {
      if (res.status === 401) {
        setStoredToken(null);
        setStoredUser(null);
        return null;
      }
      // On 5xx, cold-start, or network issue, maintain cached user to avoid accidental logout
      return getStoredUser();
    }

    const user: User = await res.json();
    setStoredUser(user);
    return user;
  } catch {
    // Return cached user if available
    return getStoredUser();
  }
}

export async function apiUpdateSettings(
  settings: Partial<UserSettings>
): Promise<User> {
  const baseUrl = getApiBaseUrl();
  const res = await fetch(`${baseUrl}/auth/settings`, {
    method: "PUT",
    headers: {
      ...getAuthHeaders(),
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify(settings),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to update preferences.");
  }

  return await res.json();
}

/* ========================================================
   PERSONAL SKU DATABASE APIS
   ======================================================== */

export async function apiGetSkus(params?: {
  search?: string;
  is_active?: boolean;
  page?: number;
  size?: number;
}): Promise<SKUListResponse> {
  const baseUrl = getApiBaseUrl();
  const searchParams = new URLSearchParams();
  if (params?.search) searchParams.append("search", params.search);
  if (params?.is_active !== undefined)
    searchParams.append("is_active", String(params.is_active));
  if (params?.page) searchParams.append("page", String(params.page));
  if (params?.size) searchParams.append("size", String(params.size));

  const url = `${baseUrl}/skus?${searchParams.toString()}`;
  const res = await fetch(url, {
    method: "GET",
    headers: getAuthHeaders(),
    credentials: "include",
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to fetch SKUs.");
  }

  return await res.json();
}

export async function apiCreateSku(payload: {
  sku_code: string;
  product_name: string;
  keywords?: string[];
  aliases?: string[];
  priority?: number;
  is_active?: boolean;
}): Promise<UserSKU> {
  const baseUrl = getApiBaseUrl();
  const res = await fetch(`${baseUrl}/skus`, {
    method: "POST",
    headers: {
      ...getAuthHeaders(),
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to create SKU.");
  }

  return await res.json();
}

export async function apiUpdateSku(
  skuId: string,
  payload: Partial<UserSKU>
): Promise<UserSKU> {
  const baseUrl = getApiBaseUrl();
  const res = await fetch(`${baseUrl}/skus/${skuId}`, {
    method: "PUT",
    headers: {
      ...getAuthHeaders(),
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to update SKU.");
  }

  return await res.json();
}

export async function apiDeleteSku(skuId: string): Promise<void> {
  const baseUrl = getApiBaseUrl();
  const res = await fetch(`${baseUrl}/skus/${skuId}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
    credentials: "include",
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to delete SKU.");
  }
}

export async function apiImportSkusCsv(file: File): Promise<SKUImportResult> {
  const baseUrl = getApiBaseUrl();
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${baseUrl}/skus/import-csv`, {
    method: "POST",
    headers: getAuthHeaders(),
    credentials: "include",
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to import CSV.");
  }

  return await res.json();
}

export async function apiExportSkusCsv(): Promise<Blob> {
  const baseUrl = getApiBaseUrl();
  const res = await fetch(`${baseUrl}/skus/export-csv`, {
    method: "GET",
    headers: getAuthHeaders(),
    credentials: "include",
  });

  if (!res.ok) {
    throw new Error("Failed to export SKU database.");
  }

  return await res.blob();
}

export async function apiSyncSkusFromJobs(): Promise<{
  success: boolean;
  synced_count: number;
  message: string;
}> {
  const baseUrl = getApiBaseUrl();
  const res = await fetch(`${baseUrl}/skus/sync-from-jobs`, {
    method: "POST",
    headers: getAuthHeaders(),
    credentials: "include",
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to sync SKUs from processing history.");
  }

  return await res.json();
}

/* ========================================================
   JOB HISTORY & AMBIGUITY RESOLUTION APIS
   ======================================================== */

export async function apiGetJobHistory(
  page: number = 1,
  size: number = 20,
  trash: boolean = false
): Promise<JobHistoryResponse> {
  const baseUrl = getApiBaseUrl();
  const res = await fetch(`${baseUrl}/jobs/history?page=${page}&size=${size}&trash=${trash}`, {
    method: "GET",
    headers: getAuthHeaders(),
    credentials: "include",
  });

  if (!res.ok) {
    throw new Error("Failed to load processing history.");
  }

  return await res.json();
}

export async function apiTrashJob(jobId: string): Promise<void> {
  const baseUrl = getApiBaseUrl();
  const res = await fetch(`${baseUrl}/jobs/${jobId}/trash`, {
    method: "POST",
    headers: getAuthHeaders(),
    credentials: "include",
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to move batch to trash.");
  }
}

export async function apiRestoreJob(jobId: string): Promise<void> {
  const baseUrl = getApiBaseUrl();
  const res = await fetch(`${baseUrl}/jobs/${jobId}/restore`, {
    method: "POST",
    headers: getAuthHeaders(),
    credentials: "include",
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to restore batch from trash.");
  }
}

export async function apiDeleteJobPermanently(jobId: string): Promise<void> {
  const baseUrl = getApiBaseUrl();
  const res = await fetch(`${baseUrl}/jobs/${jobId}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
    credentials: "include",
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to permanently delete batch record.");
  }
}

// Alias for existing callers
export const apiDeleteJob = apiDeleteJobPermanently;

export async function apiClearAllJobs(): Promise<{ message: string; cleared_count: number }> {
  const baseUrl = getApiBaseUrl();
  const res = await fetch(`${baseUrl}/jobs/clear-all`, {
    method: "POST",
    headers: getAuthHeaders(),
    credentials: "include",
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to clear all batches.");
  }

  return await res.json();
}

export async function apiEmptyTrash(): Promise<{ message: string; deleted_count: number }> {
  const baseUrl = getApiBaseUrl();
  const res = await fetch(`${baseUrl}/jobs/trash/empty`, {
    method: "DELETE",
    headers: getAuthHeaders(),
    credentials: "include",
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to empty trash.");
  }

  return await res.json();
}

export async function apiResolveAmbiguity(
  jobId: string,
  resolutions: SaveDecisionRequest[]
): Promise<ProcessingJobResponse> {
  const baseUrl = getApiBaseUrl();
  const res = await fetch(`${baseUrl}/labels/jobs/${jobId}/resolve-ambiguity`, {
    method: "POST",
    headers: {
      ...getAuthHeaders(),
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({
      resolutions,
      recompile_output: true,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to resolve ambiguous SKUs.");
  }

  return await res.json();
}

/* ========================================================
   MASTER SHEET & SINGLE-LABEL PRINT APIS
   ======================================================== */

export async function apiGetMasterSheet(params?: {
  search?: string;
  courier?: string;
  marketplace?: string;
  days?: string;
  page?: number;
  size?: number;
}): Promise<MasterSheetResponse> {
  const baseUrl = getApiBaseUrl();
  const searchParams = new URLSearchParams();
  if (params?.search) searchParams.append("search", params.search);
  if (params?.courier) searchParams.append("courier", params.courier);
  if (params?.marketplace) searchParams.append("marketplace", params.marketplace);
  if (params?.days && params.days !== "all") searchParams.append("days", params.days);
  if (params?.page) searchParams.append("page", String(params.page));
  if (params?.size) searchParams.append("size", String(params.size));

  const url = `${baseUrl}/master-sheet?${searchParams.toString()}`;
  const res = await fetch(url, {
    method: "GET",
    headers: getAuthHeaders(),
    credentials: "include",
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to fetch Master Sheet.");
  }

  return await res.json();
}

export async function apiSyncMasterSheetFromHistory(): Promise<{
  message: string;
  synced_count: number;
}> {
  const baseUrl = getApiBaseUrl();
  const res = await fetch(`${baseUrl}/master-sheet/sync-from-history`, {
    method: "POST",
    headers: getAuthHeaders(),
    credentials: "include",
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to sync Master Sheet from history.");
  }

  return await res.json();
}

export async function apiExportMasterSheetCsv(params?: {
  search?: string;
  courier?: string;
  marketplace?: string;
  days?: string;
}): Promise<Blob> {
  const baseUrl = getApiBaseUrl();
  const searchParams = new URLSearchParams();
  if (params?.search) searchParams.append("search", params.search);
  if (params?.courier) searchParams.append("courier", params.courier);
  if (params?.marketplace) searchParams.append("marketplace", params.marketplace);
  if (params?.days && params.days !== "all") searchParams.append("days", params.days);

  const q = searchParams.toString();
  const url = `${baseUrl}/master-sheet/export-csv${q ? `?${q}` : ""}`;
  const res = await fetch(url, {
    method: "GET",
    headers: getAuthHeaders(),
    credentials: "include",
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to export Master Sheet CSV.");
  }

  return await res.blob();
}

export function getSingleLabelPrintUrl(jobId: string, pageNumber: number): string {
  const baseUrl = getApiBaseUrl();
  return `${baseUrl}/labels/jobs/${jobId}/page/${pageNumber}/print-pdf`;
}

export async function apiDeleteMasterLabel(labelId: string): Promise<void> {
  const baseUrl = getApiBaseUrl();
  const res = await fetch(`${baseUrl}/master-sheet/${labelId}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
    credentials: "include",
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to delete label record.");
  }
}

export async function apiClearMasterSheet(marketplace?: string): Promise<void> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}/master-sheet${marketplace && marketplace !== "all" ? `?marketplace=${marketplace}` : ""}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: getAuthHeaders(),
    credentials: "include",
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to clear Master Sheet.");
  }
}

export async function apiClaimLocalHistory(
  jobIds: string[]
): Promise<{ claimed: number; total: number }> {
  if (!jobIds || jobIds.length === 0) return { claimed: 0, total: 0 };
  const baseUrl = getApiBaseUrl();
  try {
    const res = await fetch(`${baseUrl}/jobs/claim-history`, {
      method: "POST",
      headers: {
        ...getAuthHeaders(),
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({ job_ids: jobIds }),
    });

    if (!res.ok) {
      return { claimed: 0, total: jobIds.length };
    }

    return await res.json();
  } catch {
    return { claimed: 0, total: jobIds.length };
  }
}

export async function apiBulkDeleteMasterLabels(
  labelIds: string[]
): Promise<{ deleted_count: number }> {
  if (!labelIds || labelIds.length === 0) return { deleted_count: 0 };
  const baseUrl = getApiBaseUrl();
  const res = await fetch(`${baseUrl}/master-sheet/bulk-delete`, {
    method: "POST",
    headers: {
      ...getAuthHeaders(),
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({ label_ids: labelIds }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to bulk delete selected labels.");
  }

  return await res.json();
}

export async function apiPrintSelectedMasterLabels(
  labelIds: string[]
): Promise<Blob> {
  if (!labelIds || labelIds.length === 0) {
    throw new Error("No labels selected for printing.");
  }
  const baseUrl = getApiBaseUrl();
  const res = await fetch(`${baseUrl}/master-sheet/print-selected`, {
    method: "POST",
    headers: {
      ...getAuthHeaders(),
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({ label_ids: labelIds }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to generate print document for selected labels.");
  }

  return await res.blob();
}

