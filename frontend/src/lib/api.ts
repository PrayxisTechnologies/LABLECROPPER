/**
 * LabelFlow API Client
 */

import {
  BackendHealthResponse,
  BackendValidationResponse,
  ProcessingConfig,
  ProcessingJobResponse,
  UploadInspectionResponse,
} from "./types";
import { getLocalProcessingHistory } from "./localHistory";

function getRequestAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("labelflow_jwt_token");
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
  }
  return headers;
}

/**
 * Dynamic API Base URL resolution:
 * - When in browser on localhost/127.0.0.1 -> targets http://localhost:8000/api/v1 (Local Python backend)
 * - When in browser on Vercel/production -> targets https://lablecropper.onrender.com/api/v1 (Render backend)
 * - Or uses NEXT_PUBLIC_API_URL environment variable if explicitly set
 */
export function getApiBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") {
      return "http://localhost:8000/api/v1";
    }
    // On production custom domain (EC2 / Nginx reverse proxy), use same-origin /api/v1
    return `${window.location.origin}/api/v1`;
  }
  return "https://lablecropper.onrender.com/api/v1";
}

/**
 * Check backend health and phase capabilities.
 */
export async function checkBackendHealth(): Promise<{
  online: boolean;
  data?: BackendHealthResponse;
  error?: string;
}> {
  const baseUrl = getApiBaseUrl();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(`${baseUrl}/health`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      return {
        online: false,
        error: `Backend responded with HTTP status ${res.status}`,
      };
    }

    const data: BackendHealthResponse = await res.json();
    return { online: true, data };
  } catch (err: unknown) {
    const msg =
      err instanceof Error
        ? err.message
        : "Could not establish connection to backend service.";
    return { online: false, error: msg };
  }
}

/**
 * Submit files to backend for genuine validation checks.
 */
export async function validateFilesOnBackend(
  files: File[]
): Promise<BackendValidationResponse> {
  const baseUrl = getApiBaseUrl();
  const formData = new FormData();
  files.forEach((file) => {
    formData.append("files", file);
  });

  const res = await fetch(`${baseUrl}/labels/validate`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    let errorDetail = `Validation request failed with status ${res.status}`;
    try {
      const errJson = await res.json();
      if (errJson?.error?.message) {
        errorDetail = errJson.error.message;
      } else if (errJson?.detail) {
        errorDetail =
          typeof errJson.detail === "string"
            ? errJson.detail
            : JSON.stringify(errJson.detail);
      }
    } catch {
      // Ignore JSON parse errors on fallback
    }
    throw new Error(errorDetail);
  }

  return (await res.json()) as BackendValidationResponse;
}

/**
 * Submit files and configuration to backend for real Phase 2 label processing.
 */
export async function processLabelsOnBackend(
  files: File[],
  config: ProcessingConfig,
  marketplace?: string
): Promise<ProcessingJobResponse> {
  const baseUrl = getApiBaseUrl();
  const formData = new FormData();

  files.forEach((file) => {
    formData.append("files", file);
  });

  formData.append("output_format", config.output_format);
  formData.append("sort_by", config.sort_by);
  formData.append("remove_invoice", String(config.remove_invoice));
  formData.append("enable_sku_picklist", String(config.enable_sku_picklist));
  formData.append("smart_sku_detection", String(Boolean(config.smart_sku_detection)));

  if (marketplace) {
    formData.append("marketplace", marketplace);
  }

  if (config.excluded_main_skus && config.excluded_main_skus.length > 0) {
    formData.append("excluded_main_skus", JSON.stringify(config.excluded_main_skus));
  }
  if (config.excluded_skus && config.excluded_skus.length > 0) {
    formData.append("excluded_skus", JSON.stringify(config.excluded_skus));
  }
  if (config.excluded_couriers && config.excluded_couriers.length > 0) {
    formData.append("excluded_couriers", JSON.stringify(config.excluded_couriers));
  }
  if (config.excluded_order_ids && config.excluded_order_ids.length > 0) {
    formData.append("excluded_order_ids", JSON.stringify(config.excluded_order_ids));
  }
  if (config.excluded_marketplaces && config.excluded_marketplaces.length > 0) {
    formData.append("excluded_marketplaces", JSON.stringify(config.excluded_marketplaces));
  }

  // Include recent job IDs for duplicate order / label detection across past sessions
  try {
    const recent = getLocalProcessingHistory();
    if (recent && recent.length > 0) {
      const recentJobIds = recent.map((r) => r.job_id).slice(0, 30);
      formData.append("recent_job_ids", JSON.stringify(recentJobIds));
    }
  } catch {}

  let res: Response | null = null;
  let lastError: string | null = null;

  // Make request with automatic single retry if server returns 502/503 (e.g. Render spin-up cold start)
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      res = await fetch(`${baseUrl}/labels/process`, {
        method: "POST",
        headers: getRequestAuthHeaders(),
        credentials: "include",
        body: formData,
      });

      if (res.ok) {
        return (await res.json()) as ProcessingJobResponse;
      }

      // If 502 (Bad Gateway / Render Cold Start), wait 3.5s and retry once
      if (res.status === 502 && attempt === 1) {
        await new Promise((r) => setTimeout(r, 3500));
        continue;
      }

      break;
    } catch (err: unknown) {
      lastError = err instanceof Error ? err.message : "Connection failed";
      if (attempt === 1) {
        await new Promise((r) => setTimeout(r, 3500));
      }
    }
  }

  if (!res || !res.ok) {
    let errorDetail = res
      ? res.status === 502
        ? "Render backend is warming up (HTTP 502). Please retry in 5 seconds."
        : `Processing failed with status ${res.status}`
      : (lastError || "Could not connect to processing server.");

    if (res) {
      try {
        const errJson = await res.json();
        if (errJson?.error?.message) {
          errorDetail = errJson.error.message;
        } else if (errJson?.detail) {
          errorDetail =
            typeof errJson.detail === "string"
              ? errJson.detail
              : JSON.stringify(errJson.detail);
        }
      } catch {
        // Ignore JSON parse error
      }
    }
    throw new Error(errorDetail);
  }

  return (await res.json()) as ProcessingJobResponse;
}

/**
 * Build absolute download URL for a generated artifact.
 */
export function getAbsoluteDownloadUrl(relativeUrl: string): string {
  if (relativeUrl.startsWith("http://") || relativeUrl.startsWith("https://")) {
    return relativeUrl;
  }
  const baseUrl = getApiBaseUrl();
  // Replace /api/v1 prefix if baseUrl already contains it
  const base = baseUrl.replace(/\/api\/v1\/?$/, "");
  return `${base}${relativeUrl.startsWith("/") ? "" : "/"}${relativeUrl}`;
}

/**
 * URL to fetch 1-indexed page PNG thumbnail for live browser preview.
 */
export function getPagePreviewUrl(jobId: string, pageNumber: number): string {
  const baseUrl = getApiBaseUrl();
  return `${baseUrl}/labels/jobs/${jobId}/preview/page/${pageNumber}`;
}

/**
 * URL to view complete 4x6 thermal PDF inline in browser.
 */
export function getViewPdfUrl(jobId: string): string {
  const baseUrl = getApiBaseUrl();
  return `${baseUrl}/labels/jobs/${jobId}/view/pdf`;
}

/**
 * URL to download complete 4x6 thermal PDF.
 */
export function getDownloadPdfUrl(jobId: string): string {
  const baseUrl = getApiBaseUrl();
  return `${baseUrl}/labels/jobs/${jobId}/download/pdf`;
}

/**
 * URL to download consolidated SKU picklist CSV.
 */
export function getDownloadPicklistUrl(jobId: string): string {
  const baseUrl = getApiBaseUrl();
  return `${baseUrl}/labels/jobs/${jobId}/download/picklist`;
}

/**
 * Instantly inspect uploaded PDFs before cropping to extract SKUs and Couriers.
 */
export async function inspectUploadedBatch(
  files: File[]
): Promise<UploadInspectionResponse> {
  const baseUrl = getApiBaseUrl();
  const formData = new FormData();
  files.forEach((file) => {
    formData.append("files", file);
  });

  const res = await fetch(`${baseUrl}/labels/inspect-upload`, {
    method: "POST",
    headers: getRequestAuthHeaders(),
    credentials: "include",
    body: formData,
  });

  if (!res.ok) {
    let errorDetail = `Pre-crop inspection failed with status ${res.status}`;
    try {
      const errJson = await res.json();
      if (errJson?.error?.message) {
        errorDetail = errJson.error.message;
      } else if (errJson?.detail) {
        errorDetail =
          typeof errJson.detail === "string"
            ? errJson.detail
            : JSON.stringify(errJson.detail);
      }
    } catch {
      // Ignore JSON parse error
    }
    throw new Error(errorDetail);
  }

  return (await res.json()) as UploadInspectionResponse;
}
