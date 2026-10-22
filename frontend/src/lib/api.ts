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

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "https://lablecropper.onrender.com/api/v1";

/**
 * Check backend health and phase capabilities.
 */
export async function checkBackendHealth(): Promise<{
  online: boolean;
  data?: BackendHealthResponse;
  error?: string;
}> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(`${API_BASE_URL}/health`, {
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
  const formData = new FormData();
  files.forEach((file) => {
    formData.append("files", file);
  });

  const res = await fetch(`${API_BASE_URL}/labels/validate`, {
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
  config: ProcessingConfig
): Promise<ProcessingJobResponse> {
  const formData = new FormData();

  files.forEach((file) => {
    formData.append("files", file);
  });

  formData.append("output_format", config.output_format);
  formData.append("sort_by", config.sort_by);
  formData.append("remove_invoice", String(config.remove_invoice));
  formData.append("enable_sku_picklist", String(config.enable_sku_picklist));

  let res: Response | null = null;
  try {
    res = await fetch(`${API_BASE_URL}/labels/process`, {
      method: "POST",
      body: formData,
    });
  } catch {
    res = null;
  }

  // If direct request failed or returned server error (502, 500), fallback to same-origin proxy
  if (!res || !res.ok) {
    try {
      const proxyRes = await fetch(`/api/proxy/labels/process`, {
        method: "POST",
        body: formData,
      });
      if (proxyRes.ok || !res) {
        res = proxyRes;
      }
    } catch {
      // Retain original response
    }
  }

  if (!res || !res.ok) {
    let errorDetail = res ? `Processing failed with status ${res.status}` : "Could not connect to processing server.";
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
  // Replace /api/v1 prefix if API_BASE_URL already contains it
  const base = API_BASE_URL.replace(/\/api\/v1\/?$/, "");
  return `${base}${relativeUrl.startsWith("/") ? "" : "/"}${relativeUrl}`;
}

/**
 * URL to fetch 1-indexed page PNG thumbnail for live browser preview.
 */
export function getPagePreviewUrl(jobId: string, pageNumber: number): string {
  return `${API_BASE_URL}/labels/jobs/${jobId}/preview/page/${pageNumber}`;
}

/**
 * URL to view complete 4x6 thermal PDF inline in browser.
 */
export function getViewPdfUrl(jobId: string): string {
  return `${API_BASE_URL}/labels/jobs/${jobId}/view/pdf`;
}

/**
 * Instantly inspect uploaded PDFs before cropping to extract SKUs and Couriers.
 */
export async function inspectUploadedBatch(
  files: File[]
): Promise<UploadInspectionResponse> {
  const formData = new FormData();
  files.forEach((file) => {
    formData.append("files", file);
  });

  const res = await fetch(`${API_BASE_URL}/labels/inspect-upload`, {
    method: "POST",
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
