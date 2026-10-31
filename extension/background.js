/**
 * LabelFlow Chrome Extension — Background Service Worker (Manifest V3)
 * Manages the PDF Vault, detects label downloads, and transfers binary files to LabelFlow website.
 */

importScripts("vault-storage.js");

const PENDING_VAULT_IMPORT_KEY = "labelflow_pending_vault_import";
const AUTH_STORAGE_KEY = "labelflow_auth_state";

// Lightning-Fast In-Memory Cache for Zero-Latency Page Handoff
let memoryVaultPayloads = null;
let memoryVaultTimestamp = 0;

// Primary Production Domain and Fallbacks
const PRIMARY_DOMAIN = "https://labelcropper.prayxis.in";
const GENERATOR_URL = "https://labelcropper.prayxis.in/#generator";
const LOGIN_URL = "https://labelcropper.prayxis.in/login";

// Helper: Check if a URL belongs to LabelFlow (Production or Localhost)
function isLabelFlowUrl(urlStr) {
  if (!urlStr) return false;
  try {
    const u = new URL(urlStr);
    return (
      u.hostname === "labelcropper.prayxis.in" ||
      u.hostname.endsWith(".prayxis.in") ||
      ((u.hostname === "localhost" || u.hostname === "127.0.0.1") && u.port === "3000")
    );
  } catch {
    return false;
  }
}

// Retrieve cached auth status or query active tabs
async function getCachedAuthStatus() {
  try {
    // 1. Direct Chrome Cookie Check (ALWAYS WORKS across all tabs & sessions)
    try {
      const allCookies = await chrome.cookies.getAll({ name: "labelflow_token" });
      if (allCookies && allCookies.length > 0 && allCookies[0].value) {
        const authData = {
          isLoggedIn: true,
          user: { name: "Seller Account", email: "Active Seller" },
          token: allCookies[0].value,
          updatedAt: Date.now(),
        };
        await chrome.storage.local.set({ [AUTH_STORAGE_KEY]: authData });
        return authData;
      }
    } catch (cookieErr) {
      console.debug("Cookie check failed:", cookieErr);
    }

    const stored = await chrome.storage.local.get(AUTH_STORAGE_KEY);
    const auth = stored[AUTH_STORAGE_KEY];
    if (auth && auth.isLoggedIn) {
      return auth;
    }

    // Attempt live check across open LabelFlow tabs
    const allTabs = await chrome.tabs.query({});
    for (const t of allTabs) {
      if (t.id && isLabelFlowUrl(t.url)) {
        try {
          if (chrome.scripting && chrome.scripting.executeScript) {
            const results = await chrome.scripting.executeScript({
              target: { tabId: t.id },
              func: () => {
                try {
                  const token =
                    localStorage.getItem("labelflow_jwt_token") ||
                    localStorage.getItem("labelflow_token");
                  const userStr = localStorage.getItem("labelflow_user_profile");
                  let user = null;
                  if (userStr) {
                    try {
                      user = JSON.parse(userStr);
                    } catch {}
                  }
                  return { token, user };
                } catch {
                  return null;
                }
              },
            });
            if (results && results[0] && results[0].result && results[0].result.token) {
              const liveAuth = {
                isLoggedIn: true,
                user: results[0].result.user || { name: "Seller Account" },
                token: results[0].result.token,
                updatedAt: Date.now(),
              };
              await chrome.storage.local.set({ [AUTH_STORAGE_KEY]: liveAuth });
              return liveAuth;
            }
          }

          const liveAuth = await chrome.tabs.sendMessage(t.id, { type: "GET_AUTH_STATUS" });
          if (liveAuth && liveAuth.isLoggedIn) {
            await chrome.storage.local.set({ [AUTH_STORAGE_KEY]: liveAuth });
            return liveAuth;
          }
        } catch {}
      }
    }
  } catch (err) {
    console.debug("[LabelFlow Background] Auth check error:", err);
  }
  return { isLoggedIn: false, user: null, token: null };
}

// Helper: Extract clean basename from path
function getBasename(fullPath) {
  if (!fullPath) return "";
  const parts = fullPath.split(/[/\\]/);
  return (parts[parts.length - 1] || "").trim();
}

// Helper: Convert Blob to Base64 safely in Service Worker
async function blobToBase64(blob) {
  if (!blob) return "";
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const len = bytes.byteLength;
  const chunkSize = 8192;
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
    binary += String.fromCharCode.apply(null, chunk);
  }
  return btoa(binary);
}

// Update extension icon badge: strictly reflects pending unprinted labels!
async function updateVaultBadge(customCount = null) {
  try {
    let count = 0;
    if (typeof customCount === "number") {
      count = customCount;
    } else {
      const stats = await VaultStorage.getVaultStats();
      count = stats.readyCount;
    }
    const text = count > 0 ? String(count) : "";
    await chrome.action.setBadgeText({ text });
    // Vibrant eye-catching pop color for pending labels!
    await chrome.action.setBadgeBackgroundColor({ color: count > 0 ? "#EF4444" : "#00D1FF" });
  } catch (err) {
    console.warn("Could not update vault badge:", err);
  }
}

// Attempt automated download ingestion into Vault for active/fresh downloads
async function handleCompletedDownload(downloadId) {
  try {
    const items = await chrome.downloads.search({ id: downloadId });
    if (!items || items.length === 0) return;

    let item = items[0];
    let filename = getBasename(item.filename);

    // If still in crdownload state, wait briefly and re-query
    if (filename.toLowerCase().endsWith(".crdownload") || item.state !== "complete") {
      await new Promise((r) => setTimeout(r, 500));
      const refreshed = await chrome.downloads.search({ id: downloadId });
      if (refreshed && refreshed.length > 0) {
        item = refreshed[0];
        filename = getBasename(item.filename);
      }
    }

    if (item.state !== "complete") return;

    // Do not auto-ingest files that have already been printed
    try {
      const printedFiles = await VaultStorage.getPrintedVaultFiles();
      const cleanLower = filename.toLowerCase().trim();
      const alreadyPrinted = (printedFiles || []).some(
        (p) =>
          (p.name && p.name.toLowerCase().trim() === cleanLower) ||
          (p.filename && p.filename.toLowerCase().trim() === cleanLower)
      );
      if (alreadyPrinted) return;
    } catch {}

    // Strict marketplace classification
    const classification = VaultStorage.classifyDownloadItem(item);
    if (!classification.isEligible) {
      return;
    }

    // Only attempt fetch if URL is an active web URL
    if (
      item.url &&
      (item.url.startsWith("http://") || item.url.startsWith("https://") || item.url.startsWith("blob:"))
    ) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        const resp = await fetch(item.url, {
          credentials: "include",
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (resp && resp.ok) {
          const buffer = await resp.arrayBuffer();
          if (buffer && buffer.byteLength > 100) {
            const base64 = await blobToBase64(new Blob([buffer]));
            await VaultStorage.addFilesToVault([
              {
                name: filename,
                buffer: buffer,
                base64: base64,
                blob: new Blob([buffer], { type: "application/pdf" }),
                size: buffer.byteLength,
                type: "application/pdf",
                platform: classification.platform,
                downloadId: item.id,
              },
            ]);
            await updateVaultBadge();
            return;
          }
        }
      } catch {
        // Fetch failed due to session auth or CORS; user can add via ➕ Import PDF button in popup
      }
    }
  } catch {
    // Suppress unhandled notices
  }
}

// Auto-ingest eligible recent downloads into Vault if their URL is still accessible
async function autoIngestEligibleDownloads() {
  try {
    const items = await chrome.downloads.search({
      orderBy: ["-startTime"],
      limit: 30,
      state: "complete",
    });

    const storedFiles = await VaultStorage.getStoredVaultFiles(false);
    const trashFiles = await VaultStorage.getTrashVaultFiles();
    const printedFiles = await VaultStorage.getPrintedVaultFiles();

    const storedIds = new Set(storedFiles.map((s) => String(s.downloadId)));
    const storedNames = new Set(storedFiles.map((s) => s.name.toLowerCase().trim()));
    const trashIds = new Set(trashFiles.map((t) => String(t.downloadId)));
    const trashNames = new Set(trashFiles.map((t) => t.name.toLowerCase().trim()));
    const printedIds = new Set((printedFiles || []).map((p) => String(p.downloadId)));
    const printedNames = new Set((printedFiles || []).map((p) => p.name.toLowerCase().trim()));

    for (const item of items) {
      const filename = getBasename(item.filename || item.url);
      const nameLower = filename.toLowerCase().trim();
      const idStr = String(item.id);

      if (
        storedIds.has(idStr) ||
        storedNames.has(nameLower) ||
        trashIds.has(idStr) ||
        trashNames.has(nameLower) ||
        printedIds.has(idStr) ||
        printedNames.has(nameLower)
      ) {
        continue;
      }

      const classification = VaultStorage.classifyDownloadItem(item);
      if (!classification.isEligible) {
        continue;
      }

      if (
        item.url &&
        (item.url.startsWith("http://") ||
          item.url.startsWith("https://") ||
          item.url.startsWith("blob:"))
      ) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000);
          const resp = await fetch(item.url, {
            credentials: "include",
            signal: controller.signal,
          });
          clearTimeout(timeoutId);

          if (resp && resp.ok) {
            const buffer = await resp.arrayBuffer();
            if (buffer && buffer.byteLength > 100) {
              const base64 = await blobToBase64(new Blob([buffer]));
              await VaultStorage.addFilesToVault([
                {
                  name: filename,
                  buffer: buffer,
                  base64: base64,
                  blob: new Blob([buffer], { type: "application/pdf" }),
                  size: buffer.byteLength,
                  type: "application/pdf",
                  platform: classification.platform,
                  downloadId: item.id,
                },
              ]);
              storedIds.add(idStr);
              storedNames.add(nameLower);
            }
          }
        } catch {
          // Fetch failed (e.g. expired signed URL); user will use ➕ Import PDF
        }
      }
    }
  } catch (err) {
    console.debug("[LabelFlow Extension] autoIngestEligibleDownloads error:", err);
  }
}

// 1. Download event listeners
chrome.downloads.onCreated.addListener((item) => {
  if (item && item.state === "complete") {
    handleCompletedDownload(item.id);
  }
});

chrome.downloads.onChanged.addListener((delta) => {
  if (delta.state && delta.state.current === "complete") {
    handleCompletedDownload(delta.id);
  }
});

chrome.runtime.onInstalled.addListener(async () => {
  await updateVaultBadge();
});

chrome.runtime.onStartup.addListener(async () => {
  await updateVaultBadge();
  await syncBackgroundCloudVault();
});

// Periodic background badge refresh
async function syncBackgroundCloudVault() {
  try {
    await updateVaultBadge();
  } catch {}
}

setInterval(() => {
  syncBackgroundCloudVault();
}, 30000);

// 2. Chrome runtime messaging dispatcher
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      if (!message || !message.action) {
        sendResponse({ success: false, error: "Missing message action." });
        return;
      }

      // Action: SCAN_DOWNLOADS
      if (message.action === "SCAN_DOWNLOADS") {
        await autoIngestEligibleDownloads();
        const scanResult = await VaultStorage.scanRecentDownloads();
        await updateVaultBadge();
        const stats = await VaultStorage.getVaultStats();
        sendResponse({
          success: true,
          summary: scanResult.summary,
          downloads: scanResult.downloads,
          stats,
        });
        return;
      }

      // Action: VAULT_GET_DATA
      if (message.action === "VAULT_GET_DATA") {
        const stored = await VaultStorage.getStoredVaultFiles(false);
        const printed = await VaultStorage.getPrintedVaultFiles();
        const trash = await VaultStorage.getTrashVaultFiles();
        const stats = await VaultStorage.getVaultStats();
        sendResponse({ success: true, stored, printed, trash, stats });
        return;
      }

      // Action: VAULT_ADD_ITEMS
      if (message.action === "VAULT_ADD_ITEMS") {
        const itemsToSave = (message.items || []).map((it) => {
          const blob = it.buffer
            ? new Blob([it.buffer], { type: it.type || "application/pdf" })
            : it.blob;
          const classification = VaultStorage.classifyDownloadItem({ filename: it.name });
          return {
            name: it.name,
            buffer: it.buffer || null,
            base64: it.base64 || null,
            blob: blob,
            size: it.size || (blob ? blob.size : 0),
            type: it.type || "application/pdf",
            platform:
              it.platform || (classification.isEligible ? classification.platform : "Shipping Label"),
            downloadId: it.downloadId || null,
            matchedName: it.matchedName || null,
          };
        });

        const added = await VaultStorage.addFilesToVault(itemsToSave);
        await updateVaultBadge();
        const stats = await VaultStorage.getVaultStats();
        sendResponse({ success: true, addedCount: added.length, stats });
        return;
      }

      // Action: VAULT_TOGGLE_SELECT
      if (message.action === "VAULT_TOGGLE_SELECT") {
        await VaultStorage.updateVaultSelection(message.id, message.selected);
        await updateVaultBadge();
        const stats = await VaultStorage.getVaultStats();
        sendResponse({ success: true, stats });
        return;
      }

      // Action: VAULT_SET_ALL_SELECTION
      if (message.action === "VAULT_SET_ALL_SELECTION") {
        await VaultStorage.setAllVaultSelection(message.selected);
        await updateVaultBadge();
        const stats = await VaultStorage.getVaultStats();
        sendResponse({ success: true, stats });
        return;
      }

      // Action: VAULT_MOVE_TRASH
      if (message.action === "VAULT_MOVE_TRASH") {
        await VaultStorage.moveVaultFilesToTrash(message.ids);
        await updateVaultBadge();
        const stats = await VaultStorage.getVaultStats();
        sendResponse({ success: true, stats });
        return;
      }

      // Action: VAULT_RESTORE
      if (message.action === "VAULT_RESTORE") {
        await VaultStorage.restoreVaultFilesFromTrash(message.ids);
        await updateVaultBadge();
        const stats = await VaultStorage.getVaultStats();
        sendResponse({ success: true, stats });
        return;
      }

      // Action: VAULT_REPRINT
      if (message.action === "VAULT_REPRINT") {
        await VaultStorage.reprintVaultFiles(message.ids);
        await updateVaultBadge();
        const stats = await VaultStorage.getVaultStats();
        sendResponse({ success: true, stats });
        return;
      }

      // Action: VAULT_DELETE_PERM
      if (message.action === "VAULT_DELETE_PERM") {
        await VaultStorage.deleteVaultFilesPermanently(message.ids);
        await updateVaultBadge();
        const stats = await VaultStorage.getVaultStats();
        sendResponse({ success: true, stats });
        return;
      }

      // Action: VAULT_EMPTY_TRASH
      if (message.action === "VAULT_EMPTY_TRASH") {
        await VaultStorage.emptyAllVaultTrash();
        await updateVaultBadge();
        const stats = await VaultStorage.getVaultStats();
        sendResponse({ success: true, stats });
        return;
      }

      // Action: CHECK_AUTH_STATUS
      if (message.action === "CHECK_AUTH_STATUS") {
        const auth = await getCachedAuthStatus();
        sendResponse({ success: true, auth });
        return;
      }

      // Action: SYNC_AUTH_STATUS
      if (message.action === "SYNC_AUTH_STATUS") {
        if (message.auth) {
          await chrome.storage.local.set({ [AUTH_STORAGE_KEY]: message.auth });
        }
        sendResponse({ success: true });
        return;
      }

      // Action: UPDATE_VAULT_BADGE
      if (message.action === "UPDATE_VAULT_BADGE") {
        await updateVaultBadge(message.count);
        sendResponse({ success: true });
        return;
      }

      // Action: CHECK_PENDING_VAULT_IMPORT (Called by content script on page load / sync)
      if (message.action === "CHECK_PENDING_VAULT_IMPORT") {
        // Fast-path: deliver cached in-memory payload instantly (< 1ms)!
        if (memoryVaultPayloads && memoryVaultPayloads.length > 0 && Date.now() - memoryVaultTimestamp < 120000) {
          sendResponse({ success: true, pendingImport: { files: memoryVaultPayloads } });
          return;
        }

        const stored = await chrome.storage.local.get(PENDING_VAULT_IMPORT_KEY);
        const importData = stored[PENDING_VAULT_IMPORT_KEY];
        if (importData && Date.now() - (importData.timestamp || 0) < 180000) {
          if (Array.isArray(importData.files) && importData.files.length > 0) {
            sendResponse({ success: true, pendingImport: { files: importData.files } });
            return;
          }
          if (importData.fileIds && importData.fileIds.length > 0) {
            const matchedRecords = await VaultStorage.getVaultFilesWithBlobsByIds(importData.fileIds);
            const filePayloads = await Promise.all(
              matchedRecords.map(async (rec) => {
                let base64 = rec.base64;
                if (!base64 && rec.blob) {
                  base64 = await blobToBase64(rec.blob);
                } else if (!base64 && rec.buffer) {
                  base64 = await blobToBase64(new Blob([rec.buffer]));
                }
                return {
                  id: rec.id,
                  name: rec.name,
                  size: rec.size,
                  type: rec.type || "application/pdf",
                  platform: rec.platform,
                  base64: base64,
                };
              })
            );
            if (filePayloads.length > 0) {
              sendResponse({ success: true, pendingImport: { files: filePayloads } });
              return;
            }
          }
        }
        sendResponse({ success: true, pendingImport: null });
        return;
      }

      // Action: VAULT_IMPORT_ACKNOWLEDGED (Webpage confirmed receipt of imported files)
      if (message.action === "VAULT_IMPORT_ACKNOWLEDGED") {
        memoryVaultPayloads = null;
        await chrome.storage.local.remove(PENDING_VAULT_IMPORT_KEY);
        sendResponse({ success: true });
        return;
      }

      // Action: RECORD_PROCESSED_JOB (Live crop job finished on website -> archive with rich metadata)
      if (message.action === "RECORD_PROCESSED_JOB") {
        memoryVaultPayloads = null;
        await chrome.storage.local.remove(PENDING_VAULT_IMPORT_KEY);
        await VaultStorage.recordProcessedJob(
          message.historyItem,
          message.filenames || [],
          message.fileIds || []
        );
        await updateVaultBadge();
        try {
          chrome.runtime.sendMessage({ action: "VAULT_DATA_CHANGED" });
        } catch {}
        sendResponse({ success: true });
        return;
      }

      // Action: SYNC_LOCAL_HISTORY (Sync 48h history from website localStorage)
      if (message.action === "SYNC_LOCAL_HISTORY") {
        if (Array.isArray(message.items)) {
          await VaultStorage.syncLocalHistoryItems(message.items);
          await updateVaultBadge();
        }
        sendResponse({ success: true });
        return;
      }

      // Action: MARK_PROCESSED_TO_TRASH (Website reports success -> move files to PRINTED section and clear pending)
      if (message.action === "MARK_PROCESSED_TO_TRASH") {
        memoryVaultPayloads = null;
        await chrome.storage.local.remove(PENDING_VAULT_IMPORT_KEY);
        if (message.ids && message.ids.length > 0) {
          await VaultStorage.moveVaultFilesToPrinted(message.ids);
          await updateVaultBadge();
        }
        sendResponse({ success: true });
        return;
      }

      // Action: SEND_TO_LABELFLOW (1-Click Crop Selected)
      if (message.action === "SEND_TO_LABELFLOW") {
        // 0. AUTH GATEKEEPER CHECK: User MUST be logged in on LabelFlow website
        const auth = await getCachedAuthStatus();
        if (!auth || !auth.isLoggedIn) {
          // Open or focus login page on LabelFlow
          await chrome.tabs.create({ url: LOGIN_URL });
          sendResponse({
            success: false,
            needsLogin: true,
            error: "🔒 Login Required (Free): Kripya LabelFlow par login karein. Account bilkul free hai!",
          });
          return;
        }

        let filePayloads = [];

        // Preference 1: Direct payloads passed from popup (guaranteed binary)
        if (Array.isArray(message.filePayloads) && message.filePayloads.length > 0) {
          filePayloads = message.filePayloads.filter((f) => f && f.base64 && f.base64.length > 20);
        }

        // Preference 2: Fallback query from IndexedDB
        if (filePayloads.length === 0) {
          const selectedRecords = await VaultStorage.getSelectedVaultFilesWithBlobs();
          if (selectedRecords && selectedRecords.length > 0) {
            filePayloads = await Promise.all(
              selectedRecords.map(async (rec) => {
                let base64 = rec.base64;
                if (!base64 && rec.blob) {
                  base64 = await blobToBase64(rec.blob);
                } else if (!base64 && rec.buffer) {
                  base64 = await blobToBase64(new Blob([rec.buffer]));
                }
                return {
                  id: rec.id,
                  name: rec.name,
                  size: rec.size,
                  type: rec.type || "application/pdf",
                  platform: rec.platform,
                  base64: base64,
                };
              })
            );
            filePayloads = filePayloads.filter((f) => f && f.base64 && f.base64.length > 20);
          }
        }

        if (!filePayloads || filePayloads.length === 0) {
          sendResponse({
            success: false,
            error: "Selected PDF file me valid data nahi mila (0 B). Kripya '✕' se remove karke '+ Upload PDFs' se fresh PDF upload karein.",
          });
          return;
        }

        // 1. Store in memory and chrome.storage.local
        memoryVaultPayloads = filePayloads;
        memoryVaultTimestamp = Date.now();

        await chrome.storage.local.set({
          [PENDING_VAULT_IMPORT_KEY]: {
            files: filePayloads,
            fileIds: filePayloads.map((r) => r.id),
            timestamp: Date.now(),
          },
        });

        // 3. Find any open LabelFlow tab (Production domain or Localhost)
        const allTabs = await chrome.tabs.query({});
        // Prefer active tab if on LabelFlow
        let targetTab = allTabs.find((t) => t.active && isLabelFlowUrl(t.url));
        if (!targetTab) {
          // Prefer any tab currently on a cropper page
          targetTab = allTabs.find((t) => {
            if (!t.url || !isLabelFlowUrl(t.url)) return false;
            try {
              const u = new URL(t.url);
              return (
                u.pathname === "/" ||
                u.pathname.includes("label-cropper") ||
                u.pathname.includes("crop-labels") ||
                u.hash.includes("generator")
              );
            } catch {
              return false;
            }
          });
        }
        if (!targetTab) {
          targetTab = allTabs.find((t) => t.url && isLabelFlowUrl(t.url));
        }

        if (targetTab && targetTab.id) {
          // Bring window to focus
          if (targetTab.windowId) {
            await chrome.windows.update(targetTab.windowId, { focused: true });
          }

          // Check if tab is currently on a non-cropper page (e.g. /login, /blogs, /dashboard, etc.)
          let isCropperPage = false;
          let targetOrigin = PRIMARY_DOMAIN;
          try {
            const currentU = new URL(targetTab.url);
            targetOrigin = currentU.origin;
            isCropperPage =
              currentU.pathname === "/" ||
              currentU.pathname.includes("label-cropper") ||
              currentU.pathname.includes("crop-labels") ||
              currentU.hash.includes("generator");
          } catch {}

          if (!isCropperPage) {
            // Navigate directly to the cropper page on the active origin
            const targetUrl = targetOrigin.includes("localhost")
              ? `${targetOrigin}/meesho-label-cropper`
              : `${targetOrigin}/#generator`;
            await chrome.tabs.update(targetTab.id, {
              url: targetUrl,
              active: true,
            });
            sendResponse({ success: true, count: filePayloads.length, navigated: true });
            return;
          }

          // Tab is on LabelFlow cropper page
          await chrome.tabs.update(targetTab.id, { active: true });

          let delivered = false;
          try {
            const resp = await chrome.tabs.sendMessage(targetTab.id, {
              type: "IMPORT_VAULT_FILES",
              files: filePayloads,
            });
            if (resp && resp.received) {
              delivered = true;
              memoryVaultPayloads = null;
              await chrome.storage.local.remove(PENDING_VAULT_IMPORT_KEY);
            }
          } catch (err) {
            console.warn("[LabelFlow Extension] Live tabs.sendMessage failed:", err);
          }

          // If sendMessage failed (e.g. extension freshly reloaded), reload tab to re-inject & sync
          if (!delivered) {
            await chrome.tabs.reload(targetTab.id);
          }

          sendResponse({ success: true, count: filePayloads.length, delivered });
        } else {
          // Open new tab directly to LabelFlow generator
          await chrome.tabs.create({ url: GENERATOR_URL });
          sendResponse({ success: true, count: filePayloads.length, created: true });
        }
        return;
      }
    } catch (err) {
      console.error("Error in background worker:", err);
      sendResponse({ success: false, error: err.message });
    }
  })();
  return true;
});
