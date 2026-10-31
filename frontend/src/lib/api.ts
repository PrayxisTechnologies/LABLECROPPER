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
    const token =
      localStorage.getItem("labelflow_jwt_token") ||
      localStorage.getItem("labelflow_token");
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

export function getExtensionDownloadUrl(): string {
  return `${getApiBaseUrl()}/extension/download`;
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
  marketplace?: string,
  onProgress?: (percent: number, stage: string) => void
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

  const sendXhr = (): Promise<ProcessingJobResponse> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${baseUrl}/labels/process`);
      xhr.withCredentials = true;

      const headers = getRequestAuthHeaders();
      for (const [key, value] of Object.entries(headers)) {
        xhr.setRequestHeader(key, value);
      }

      let currentPct = 20;
      let stageInterval: NodeJS.Timeout | null = null;

      const clearTicker = () => {
        if (stageInterval) {
          clearInterval(stageInterval);
          stageInterval = null;
        }
      };

      const fileCount = files.length;
      const totalBytes = files.reduce((acc, f) => acc + f.size, 0);

      onProgress?.(20, `Uploading ${fileCount > 1 ? `${fileCount} PDFs` : "PDF"} to engine...`);

      // 1. Real Network Upload Progress (20% -> 32%)
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && event.total > 0) {
          const ratio = event.loaded / event.total;
          const pct = Math.min(32, Math.max(20, Math.round(20 + ratio * 12)));
          currentPct = pct;
          const loadedKb = Math.round(event.loaded / 1024);
          const totalKb = Math.round(event.total / 1024);
          onProgress?.(
            pct,
            event.loaded < event.total
              ? `Uploading ${fileCount > 1 ? `${fileCount} PDFs` : "PDF"} (${loadedKb} KB / ${totalKb} KB)...`
              : "Uploaded. Starting thermal page extraction..."
          );
        }
      };

      // 2. Slow, Steady & Continuous Progression (Starts 32% -> 98% with ZERO STOPPAGE)
      xhr.upload.onload = () => {
        const serverStartTime = Date.now();
        currentPct = Math.max(currentPct, 32);
        onProgress?.(32, `Extracting 4×6 thermal pages (${fileCount} PDF${fileCount > 1 ? "s" : ""})...`);

        clearTicker();
        let lastIncrementTime = Date.now();

        stageInterval = setInterval(() => {
          const now = Date.now();
          const elapsedSec = (now - serverStartTime) / 1000;

          // Asymptotic smooth progression curve: ~50% at 3s, ~70% at 6s, ~84% at 10s, ~92% at 14s
          const target = Math.round(32 + 66 * (1 - Math.exp(-elapsedSec / 8.0)));

          // Strict guarantee of forward momentum: never pause for more than 320ms
          if (target > currentPct) {
            currentPct = target;
            lastIncrementTime = now;
          } else if (now - lastIncrementTime >= 320 && currentPct < 98) {
            currentPct += 1;
            lastIncrementTime = now;
          }

          currentPct = Math.min(98, currentPct);

          let stageText = `Extracting 4×6 thermal pages (${fileCount} PDF${fileCount > 1 ? "s" : ""})...`;
          if (currentPct >= 48 && currentPct < 65) {
            stageText = "Isolating barcodes & detecting delivery couriers...";
          } else if (currentPct >= 65 && currentPct < 80) {
            stageText = "Detecting SKUs & Delivery Partners (Shadowfax, Delhivery...)...";
          } else if (currentPct >= 80 && currentPct < 92) {
            stageText = "Grouping by Main SKU & sorting picklist...";
          } else if (currentPct >= 92) {
            stageText = "Assembling print-ready vector PDF...";
          }

          onProgress?.(currentPct, stageText);
        }, 90);
      };

      // 3. Fast Swift Sweep from wherever it is to 100% as soon as server finishes
      const animateToCompletion = (fromPct: number): Promise<void> => {
        return new Promise((res) => {
          let p = Math.max(fromPct, 35);
          const finishInterval = setInterval(() => {
            p += p < 70 ? 8 : (p < 90 ? 6 : 4);
            if (p >= 100) {
              clearInterval(finishInterval);
              onProgress?.(100, "✓ Complete! Opening preview...");
              res();
            } else {
              let stageText = "Assembling print-ready vector PDF...";
              if (p >= 90) stageText = "Finalizing print-ready batch...";
              onProgress?.(p, stageText);
            }
          }, 20); // 20ms per step = ~180ms smooth fluid sweep to 100%
        });
      };

      xhr.onload = async () => {
        clearTicker();
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText) as ProcessingJobResponse;
            // Fast sweep from current percentage (50-80%) to 100%
            await animateToCompletion(currentPct);
            resolve(data);
          } catch {
            reject(new Error("Invalid JSON response received from backend server."));
          }
        } else {
          let errorDetail = `Processing failed with status ${xhr.status}`;
          if (xhr.status === 502) {
            errorDetail = "Cropper backend is warming up (HTTP 502). Please retry in a few seconds.";
          } else {
            try {
              const errJson = JSON.parse(xhr.responseText);
              if (errJson?.error?.message) {
                errorDetail = errJson.error.message;
              } else if (errJson?.detail) {
                errorDetail =
                  typeof errJson.detail === "string"
                    ? errJson.detail
                    : JSON.stringify(errJson.detail);
              }
            } catch {
              // fallback
            }
          }
          reject(new Error(errorDetail));
        }
      };

      xhr.onerror = () => {
        clearTicker();
        reject(
          new Error("Network connection error. Please check your internet connection or backend server status.")
        );
      };

      xhr.ontimeout = () => {
        clearTicker();
        reject(new Error("Request timed out while waiting for cropper engine."));
      };

      xhr.send(formData);
    });
  };

  try {
    return await sendXhr();
  } catch (err) {
    const errMessage = err instanceof Error ? err.message : String(err);
    if (errMessage.includes("502") || errMessage.includes("warming up")) {
      onProgress?.(20, "Backend warming up. Retrying in 3 seconds...");
      await new Promise((r) => setTimeout(r, 3200));
      return await sendXhr();
    }
    throw err;
  }
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
