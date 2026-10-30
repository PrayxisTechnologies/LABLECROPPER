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
      version: "2.1.0",
      auth: auth,
    },
    "*"
  );
  syncAuthToExtension();
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
        console.log(
          "[LabelFlow Extension] Delivering pending vault files to page:",
          response.pendingImport.files.length
        );
        window.postMessage(
          {
            source: "LABELFLOW_EXTENSION",
            type: "LABELFLOW_VAULT_IMPORT",
            files: response.pendingImport.files,
          },
          "*"
        );
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

  if (message && message.type === "IMPORT_VAULT_FILES") {
    console.log(
      "[LabelFlow Extension] Received live IMPORT_VAULT_FILES from background:",
      message.files?.length
    );
    window.postMessage(
      {
        source: "LABELFLOW_EXTENSION",
        type: "LABELFLOW_VAULT_IMPORT",
        files: message.files,
      },
      "*"
    );
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

// Real-time synchronization when user logs in or out on the website
window.addEventListener("storage", (e) => {
  if (e.key === "labelflow_jwt_token" || e.key === "labelflow_user_profile") {
    syncAuthToExtension();
  }
});

// 4. Listen for messages from the LabelFlow webpage window
window.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || typeof data !== "object") return;

  // Webpage announces it has mounted
  if (data.type === "LABELFLOW_PAGE_READY") {
    broadcastExtensionReady();
    checkAndDeliverPendingVaultImport();
  }

  // Webpage reports successful crop & processing -> move processed files to Printed in extension
  if (data.type === "LABELFLOW_PROCESSING_SUCCESS") {
    if (data.fileIds && data.fileIds.length > 0) {
      chrome.runtime.sendMessage({
        action: "MARK_PROCESSED_TO_TRASH",
        ids: data.fileIds,
      });
    }
  }
});

// Initial announcement on page load
broadcastExtensionReady();
checkAndDeliverPendingVaultImport();

setTimeout(() => {
  broadcastExtensionReady();
  checkAndDeliverPendingVaultImport();
}, 400);

setTimeout(() => {
  broadcastExtensionReady();
  checkAndDeliverPendingVaultImport();
}, 1000);
