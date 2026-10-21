/**
 * LabelFlow Helper Utilities
 */

/**
 * Format raw byte size into human-readable units.
 */
export function formatBytes(bytes: number, decimals: number = 1): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

/**
 * Validate a candidate file before local staging.
 */
export function validateClientPdf(
  file: File,
  maxSizeMb: number = 50
): { valid: boolean; error?: string } {
  // Check extension
  if (!file.name.toLowerCase().endsWith(".pdf")) {
    return {
      valid: false,
      error: `"${file.name}" is not a PDF file. Only PDF files are supported.`,
    };
  }

  // Check MIME type if present
  if (file.type && file.type !== "application/pdf") {
    return {
      valid: false,
      error: `File type "${file.type}" is not recognized as a valid PDF document.`,
    };
  }

  // Check 0 bytes
  if (file.size === 0) {
    return {
      valid: false,
      error: `"${file.name}" is an empty file (0 bytes).`,
    };
  }

  // Check max size
  const maxBytes = maxSizeMb * 1024 * 1024;
  if (file.size > maxBytes) {
    return {
      valid: false,
      error: `"${file.name}" exceeds the maximum file size limit of ${maxSizeMb} MB (${formatBytes(file.size)}).`,
    };
  }

  return { valid: true };
}

/**
 * Generate a unique ID for a file item.
 */
export function generateFileId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Rapid client-side inspection to estimate PDF page count in sub-millisecond time.
 * Reads small 4KB boundary slices rather than megabytes of binary data.
 */
export async function getPdfPageCount(file: File): Promise<number | undefined> {
  try {
    // 1. Fast probe end chunk (PDF trailer & catalog /Count)
    const endSize = Math.min(file.size, 8192);
    const endChunk = await file.slice(file.size - endSize).text();
    const countMatches = Array.from(endChunk.matchAll(/\/Count\s+(\d+)/g));
    if (countMatches.length > 0) {
      const lastMatch = countMatches[countMatches.length - 1];
      const parsed = parseInt(lastMatch[1], 10);
      if (parsed > 0 && parsed < 20000) {
        return parsed;
      }
    }

    // 2. Fast probe beginning chunk (PDF root pages dict)
    const startSize = Math.min(file.size, 8192);
    const startChunk = await file.slice(0, startSize).text();
    const startMatch = startChunk.match(/\/Count\s+(\d+)/);
    if (startMatch && startMatch[1]) {
      const parsed = parseInt(startMatch[1], 10);
      if (parsed > 0 && parsed < 20000) {
        return parsed;
      }
    }
  } catch {
    // Non-fatal, page count will be populated by server inspection
  }
  return undefined;
}
