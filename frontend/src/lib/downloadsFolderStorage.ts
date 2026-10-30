/**
 * LabelFlow File System Access & IndexedDB Storage Service
 * Persists and reuses the user's Downloads folder handle across browser sessions.
 */

const DB_NAME = "LabelFlowDB";
const DB_VERSION = 1;
const STORE_NAME = "directory_handles";
const KEY_NAME = "downloads_folder";

/**
 * Open or create the IndexedDB database.
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      reject(new Error("IndexedDB is not supported in this browser."));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Failed to open IndexedDB"));
  });
}

/**
 * Check if the File System Access API is supported in the current browser.
 */
export function isFileSystemAccessSupported(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

/**
 * Retrieve the saved DirectoryHandle from IndexedDB.
 */
export async function getSavedDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(KEY_NAME);

      request.onsuccess = () => {
        resolve((request.result as FileSystemDirectoryHandle) || null);
      };
      request.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/**
 * Save a DirectoryHandle to IndexedDB for persistent access.
 */
export async function saveDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(handle, KEY_NAME);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || new Error("Failed to save folder handle"));
  });
}

/**
 * Remove the saved DirectoryHandle from IndexedDB.
 */
export async function clearSavedDirectoryHandle(): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(KEY_NAME);

      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
    });
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Verify whether read permission is already granted for the directory handle.
 */
export async function verifyDirectoryPermission(
  handle: FileSystemDirectoryHandle
): Promise<"granted" | "prompt" | "denied"> {
  try {
    if (!handle || typeof (handle as any).queryPermission !== "function") {
      return "denied";
    }
    const status = await (handle as any).queryPermission({ mode: "read" });
    return status;
  } catch {
    return "denied";
  }
}

/**
 * Request read permission from the user for an existing DirectoryHandle.
 * Note: Must be invoked in response to a user gesture (e.g. click).
 */
export async function requestDirectoryPermission(
  handle: FileSystemDirectoryHandle
): Promise<boolean> {
  try {
    if (!handle || typeof (handle as any).requestPermission !== "function") {
      return false;
    }
    const status = await (handle as any).requestPermission({ mode: "read" });
    return status === "granted";
  } catch {
    return false;
  }
}

/**
 * Prompt user to select their Downloads folder and store the handle in IndexedDB.
 * Note: Must be invoked in response to a user gesture (e.g. click).
 */
export async function pickAndRememberDownloadsFolder(): Promise<FileSystemDirectoryHandle> {
  if (!isFileSystemAccessSupported()) {
    throw new Error(
      "Your browser does not support the File System Access API. Please use Google Chrome or Edge."
    );
  }

  // Open directory picker starting at downloads if browser permits
  const dirHandle = await (window as any).showDirectoryPicker({
    id: "labelflow_downloads_folder",
    mode: "read",
    startIn: "downloads",
  });

  await saveDirectoryHandle(dirHandle);
  return dirHandle;
}

/**
 * Find and read an actual PDF File object from the connected Downloads folder handle.
 * Matches exact filenames, case-insensitive variations, or Chrome-appended duplicate names (e.g. "label (1).pdf").
 */
export async function resolvePdfFileFromHandle(
  dirHandle: FileSystemDirectoryHandle,
  targetFilename: string
): Promise<File | null> {
  if (!dirHandle || !targetFilename) return null;

  const cleanTarget = targetFilename.trim();
  const lowerTarget = cleanTarget.toLowerCase();
  const baseNameWithoutExt = cleanTarget.replace(/\.pdf$/i, "").toLowerCase();

  // 1. Direct lookup by exact filename
  try {
    const fileHandle = await dirHandle.getFileHandle(cleanTarget, { create: false });
    const file = await fileHandle.getFile();
    if (file && file.size > 0 && !file.name.endsWith(".crdownload")) {
      return file;
    }
  } catch {
    // Direct lookup failed, fallback to scanning directory entries
  }

  // 2. Scan directory entries for case-insensitive match or Chrome duplicate suffix
  let bestCandidateFile: File | null = null;
  let latestMtime = 0;

  try {
    const entries = (dirHandle as any).entries
      ? (dirHandle as any).entries()
      : (dirHandle as any).values();

    for await (const entry of entries) {
      const [name, handle] = Array.isArray(entry) ? entry : [entry.name, entry];
      if (handle.kind !== "file") continue;

      const lowerName = name.toLowerCase();

      // Skip partial downloads
      if (lowerName.endsWith(".crdownload") || lowerName.endsWith(".tmp")) {
        continue;
      }

      // Exact case-insensitive match
      if (lowerName === lowerTarget) {
        const fHandle = handle as FileSystemFileHandle;
        const file = await fHandle.getFile();
        if (file && file.size > 0) {
          return file;
        }
      }

      // Check if Chrome added an incremental index (e.g. "my_label (1).pdf" matching "my_label.pdf")
      if (
        lowerName.startsWith(baseNameWithoutExt) &&
        lowerName.endsWith(".pdf")
      ) {
        try {
          const fHandle = handle as FileSystemFileHandle;
          const file = await fHandle.getFile();
          if (file && file.size > 0 && file.lastModified > latestMtime) {
            latestMtime = file.lastModified;
            bestCandidateFile = file;
          }
        } catch {
          // Ignore read error on locked file
        }
      }

      // Fallback prefix match for long UUID filenames like Sub_Order_Labels_...
      if (
        baseNameWithoutExt.length > 20 &&
        lowerName.endsWith(".pdf") &&
        (lowerName.includes(baseNameWithoutExt.slice(0, 20)) ||
          baseNameWithoutExt.includes(lowerName.replace(/\.pdf$/i, "").slice(0, 20)))
      ) {
        try {
          const fHandle = handle as FileSystemFileHandle;
          const file = await fHandle.getFile();
          if (file && file.size > 0 && file.lastModified > latestMtime) {
            latestMtime = file.lastModified;
            bestCandidateFile = file;
          }
        } catch {
          // Ignore read error
        }
      }
    }
  } catch (err) {
    console.warn("Error scanning directory entries:", err);
  }

  return bestCandidateFile;
}
