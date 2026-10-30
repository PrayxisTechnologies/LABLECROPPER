/**
 * LabelFlow Chrome Extension — Content Script (Manifest V3)
 * Bridges communication between the extension background service worker and LabelFlow website.
 */

const TARGET_ORIGIN = window.location.origin;

// Announce extension presence to the LabelFlow webpage
function broadcastExtensionReady() {
  window.postMessage(
    {
      source: "LABELFLOW_EXTENSION",
      type: "LABELFLOW_EXTENSION_STATUS",
      installed: true,
      vaultActive: true,
      version: "2.0.0",
    },
    "*"
  );
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
