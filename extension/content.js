/**
 * LabelFlow Chrome Extension — Content Script (Manifest V3)
 * Bridges communication between the extension background service worker and LabelFlow website.
 */

const TARGET_ORIGIN = window.location.origin;

// 0. Extract current authentication state from LabelFlow website localStorage or cookies
function getLocalAuthStatus() {
  try {
    let token = localStorage.getItem("labelflow_jwt_token");
    const userRaw = localStorage.getItem("labelflow_user_profile");
    let user = null;
    if (userRaw) {
      try {
        user = JSON.parse(userRaw);
      } catch {}
    }

    // Also check document.cookie fallback
    if (!token && typeof document !== "undefined" && document.cookie) {
      const match = document.cookie.match(/labelflow_token=([^;]+)/);
      if (match && match[1]) {
        token = match[1];
      }
    }

    const isLoggedIn = Boolean(token && typeof token === "string" && token.trim().length > 10);
    return {
      isLoggedIn,
      user: isLoggedIn ? (user || { name: "Seller Account" }) : null,
      token: isLoggedIn ? token : null,
      origin: window.location.origin,
      updatedAt: Date.now(),
    };
  } catch {
    return { isLoggedIn: false, user: null, token: null, origin: window.location.origin, updatedAt: Date.now() };
  }
}

function syncAuthToExtension() {
  const auth = getLocalAuthStatus();
  try {
    chrome.runtime.sendMessage({
      action: "SYNC_AUTH_STATUS",
      auth: auth,
    });
  } catch (err) {
    // Service worker might be sleeping
  }
}

// Announce extension presence to the LabelFlow webpage
function broadcastExtensionReady() {
  const auth = getLocalAuthStatus();
  window.postMessage(
    {
      source: "LABELFLOW_EXTENSION",
      type: "LABELFLOW_EXTENSION_STATUS",
      installed: true,
      vaultActive: true,
      version: "2.8.4",
      auth: auth,
    },
    "*"
  );
  syncAuthToExtension();
}

// Deduplication guard to avoid firing duplicate window postMessages for the same batch
let lastDeliveredBatchHash = "";
let lastDeliveredTime = 0;
function deliverFilesToPage(files, sourceDesc) {
  if (!files || files.length === 0) return;
  const hash = files.map((f) => `${f.name || f.id}_${f.size || 0}`).sort().join("|");
  const now = Date.now();
  if (hash === lastDeliveredBatchHash && now - lastDeliveredTime < 10000) {
    return;
  }
  lastDeliveredBatchHash = hash;
  lastDeliveredTime = now;

  console.log(`[LabelFlow Extension] Delivering ${files.length} vault file(s) via ${sourceDesc}`);
  window.postMessage(
    {
      source: "LABELFLOW_EXTENSION",
      type: "LABELFLOW_VAULT_IMPORT",
      files: files,
    },
    "*"
  );

  // Immediately notify background service worker to clear memory queue so focus/re-render won't re-deliver
  try {
    chrome.runtime.sendMessage({ action: "VAULT_IMPORT_ACKNOWLEDGED" });
  } catch {}
}

// Check for pending vault import files queued by the extension
function checkAndDeliverPendingVaultImport() {
  try {
    chrome.runtime.sendMessage({ action: "CHECK_PENDING_VAULT_IMPORT" }, (response) => {
      if (
        response &&
        response.success &&
        response.pendingImport &&
        response.pendingImport.files &&
        response.pendingImport.files.length > 0
      ) {
        deliverFilesToPage(response.pendingImport.files, "CHECK_PENDING_VAULT_IMPORT");
      }
    });
  } catch (err) {
    console.debug("[LabelFlow Extension] Pending vault import check:", err);
  }
}

// 1. Listen for background service worker live messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === "GET_AUTH_STATUS") {
    sendResponse(getLocalAuthStatus());
    return true;
  }

  // Query 48-hour local history stored on the LabelFlow webpage
  if (message && message.type === "GET_PAGE_HISTORY") {
    try {
      const raw = localStorage.getItem("labelflow_local_history_48h");
      const items = raw ? JSON.parse(raw) : [];
      sendResponse({ success: true, items: Array.isArray(items) ? items : [] });
    } catch (e) {
      sendResponse({ success: false, items: [] });
    }
    return true;
  }

  if (message && message.type === "IMPORT_VAULT_FILES") {
    deliverFilesToPage(message.files, "IMPORT_VAULT_FILES");
    sendResponse({ received: true });
  }
});

// 2. Listen for storage changes in real time (instant wakeup when site is already open)
if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes.labelflow_pending_vault_import) {
      const val = changes.labelflow_pending_vault_import.newValue;
      if (val && val.fileIds && val.fileIds.length > 0) {
        console.log("[LabelFlow Extension] Detected pending vault import via storage.onChanged");
        checkAndDeliverPendingVaultImport();
      }
    }
  });
}

// 3. Tab visibility / focus triggers (delivers immediately when tab is brought to foreground)
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    broadcastExtensionReady();
    checkAndDeliverPendingVaultImport();
  }
});

window.addEventListener("focus", () => {
  broadcastExtensionReady();
  checkAndDeliverPendingVaultImport();
});

// Real-time synchronization when user logs in/out or crops labels on website
window.addEventListener("storage", (e) => {
  if (e.key === "labelflow_jwt_token" || e.key === "labelflow_user_profile") {
    syncAuthToExtension();
  }
  if (e.key === "labelflow_local_history_48h") {
    syncWebsiteHistoryToExtension();
  }
});

function syncWebsiteHistoryToExtension() {
  try {
    const raw = localStorage.getItem("labelflow_local_history_48h");
    if (raw) {
      const items = JSON.parse(raw);
      if (Array.isArray(items) && items.length > 0) {
        chrome.runtime.sendMessage({
          action: "SYNC_LOCAL_HISTORY",
          items: items,
        });
      }
    }
  } catch (err) {}
}

// 4. Listen for messages from the LabelFlow webpage window
window.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || typeof data !== "object") return;

  // Webpage announces it has mounted
  if (data.type === "LABELFLOW_PAGE_READY") {
    broadcastExtensionReady();
    checkAndDeliverPendingVaultImport();
    syncWebsiteHistoryToExtension();
  }

  // Webpage acknowledges receiving imported files from extension
  if (data.type === "LABELFLOW_VAULT_IMPORT_RECEIVED") {
    chrome.runtime.sendMessage({
      action: "VAULT_IMPORT_ACKNOWLEDGED",
      fileIds: data.fileIds,
    });
  }

  // Webpage reports successful crop & processing -> move processed files to Printed / History in extension
  if (data.type === "LABELFLOW_PROCESSING_SUCCESS") {
    chrome.runtime.sendMessage({
      action: "RECORD_PROCESSED_JOB",
      historyItem: data.historyItem,
      filenames: data.filenames || [],
      job_id: data.job_id,
      fileIds: data.fileIds || [],
    });
    syncWebsiteHistoryToExtension();
  }
});

// Initial announcement on page load - immediate handoff exactly once
broadcastExtensionReady();
checkAndDeliverPendingVaultImport();
syncWebsiteHistoryToExtension();
