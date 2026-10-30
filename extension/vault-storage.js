/**
 * LabelFlow PDF Vault — IndexedDB Storage Engine & Marketplace Scanner
 * Persists actual PDF binary Blobs, Buffers, and Base64 inside the Chrome Extension.
 * Shared between background service worker and popup UI.
 */

const DB_NAME = "LabelFlowVaultDB";
const DB_VERSION = 2;
const STORE_NAME = "pdf_vault";

function openVaultDB() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not supported in this environment."));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e) => {
      const db = request.result;
      let store;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
      } else {
        store = request.transaction.objectStore(STORE_NAME);
      }

      if (!store.indexNames.contains("status")) {
        store.createIndex("status", "status", { unique: false });
      }
      if (!store.indexNames.contains("dateAdded")) {
        store.createIndex("dateAdded", "dateAdded", { unique: false });
      }
      if (!store.indexNames.contains("name")) {
        store.createIndex("name", "name", { unique: false });
      }
      if (!store.indexNames.contains("fingerprint")) {
        store.createIndex("fingerprint", "fingerprint", { unique: false });
      }
      if (!store.indexNames.contains("downloadId")) {
        store.createIndex("downloadId", "downloadId", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Failed to open Vault database"));
  });
}

// Generate unique identifier for each stored PDF
function generateVaultId() {
  return `pdf_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// Helper: Extract clean basename from full path or URL
function getBasename(pathOrUrl = "") {
  if (!pathOrUrl) return "";
  const cleaned = pathOrUrl.split("?")[0].split("#")[0];
  const parts = cleaned.split(/[/\\]/);
  return (parts[parts.length - 1] || "").trim();
}

// Helper: Generate deterministic fingerprint for deduplication
function getFileFingerprint(name = "", size = 0) {
  return `${getBasename(name).toLowerCase()}_${size}`;
}

// Helper: Check if download is a PDF
function isPdfDownload(item, filename) {
  if (!item) return false;
  const lowerName = (filename || "").toLowerCase();
  const lowerMime = (item.mime || "").toLowerCase();
  const lowerUrl = (item.url || "").toLowerCase();

  if (lowerName.endsWith(".crdownload") || lowerName.endsWith(".tmp")) {
    return false;
  }

  return (
    lowerName.endsWith(".pdf") ||
    lowerMime === "application/pdf" ||
    lowerMime.includes("pdf") ||
    lowerUrl.includes(".pdf")
  );
}

// Helper: Local computer date comparison (in local timezone)
function isToday(dateStringOrTimestamp) {
  if (!dateStringOrTimestamp) return false;
  const d = new Date(dateStringOrTimestamp);
  if (isNaN(d.getTime())) return false;
  const now = new Date();
  return (
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear()
  );
}

// Helper: Formatted local date string, e.g. "30 Oct 2026"
function getTodayDateString() {
  const now = new Date();
  return now.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// Helper: Formatted local download time, e.g. "01:15:30 PM"
function formatLocalDownloadTime(dateStringOrTimestamp) {
  if (!dateStringOrTimestamp) return "Unknown time";
  const d = new Date(dateStringOrTimestamp);
  if (isNaN(d.getTime())) return "Unknown time";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/**
 * Strict Marketplace Classification
 * Identifies genuine shipping-label PDFs from:
 * - Meesho
 * - Flipkart
 * - Snapdeal
 * - Amazon
 * - Myntra
 *
 * Rejects unrelated PDFs (CVs, Resumes, Bank Statements, Invoices without labels, Generic PDFs).
 */
function classifyDownloadItem(item) {
  if (!item) {
    return {
      isEligible: false,
      isInvalidFile: true,
      platform: "Invalid",
      isShippingLabel: false,
      isReviewNeeded: false,
      reason: "No file data provided",
    };
  }

  const rawFilename = item.filename || (item.file && item.file.name) || item.name || item.url || "";
  const filename = getBasename(rawFilename);
  const lowerName = filename.toLowerCase().trim();
  const url = (item.url || "").toLowerCase();
  const finalUrl = (item.finalUrl || "").toLowerCase();

  // 1. Strict validation: Must be a completed PDF file
  if (!isPdfDownload(item, filename)) {
    return {
      isEligible: false,
      isInvalidFile: true,
      platform: "Invalid File Type",
      isShippingLabel: false,
      isReviewNeeded: false,
      reason: "Sirf completed PDF files (.pdf) accept kiye jaate hain.",
    };
  }

  // 2. Reject obvious non-shipping-label documents (CV, Resume, Statements, Bills, etc.)
  const isObviousNonLabel =
    lowerName.includes("resume") ||
    lowerName.includes("cv") ||
    lowerName.includes("curriculum_vitae") ||
    lowerName.includes("biodata") ||
    lowerName.includes("portfolio") ||
    lowerName.includes("bank_statement") ||
    lowerName.includes("passbook") ||
    lowerName.includes("transaction") ||
    lowerName.includes("statement") ||
    lowerName.includes("salary") ||
    lowerName.includes("payslip") ||
    lowerName.includes("pay_slip") ||
    lowerName.includes("form16") ||
    lowerName.includes("tax_return") ||
    lowerName.includes("gst_return") ||
    lowerName.includes("itr") ||
    lowerName.includes("presentation") ||
    lowerName.includes("slides") ||
    lowerName.includes("assignment") ||
    lowerName.includes("homework") ||
    lowerName.includes("certificate") ||
    lowerName.includes("marksheet") ||
    lowerName.includes("ticket") ||
    lowerName.includes("boarding_pass") ||
    lowerName.includes("boardingpass") ||
    lowerName.includes("utility_bill") ||
    lowerName.includes("electricity_bill") ||
    lowerName.includes("water_bill");

  if (isObviousNonLabel) {
    return {
      isEligible: false,
      isInvalidFile: true,
      platform: "Invalid Document",
      isShippingLabel: false,
      isReviewNeeded: false,
      reason: "Ye document shipping label nahi hai (CV/Statement/Bill/etc.). Hume bas marketplace shipping labels chahiye.",
    };
  }

  // 3. Platform Detection: Meesho
  const isMeeshoUrl = url.includes("meesho.com") || finalUrl.includes("meesho.com");
  const isMeeshoPattern =
    lowerName.startsWith("sub_order_labels_") ||
    lowerName.includes("sub_order_labels") ||
    lowerName.includes("sub_order_") ||
    lowerName.includes("orders_labels_") ||
    lowerName.includes("order_labels") ||
    (lowerName.includes("meesho") &&
      (lowerName.includes("label") || lowerName.includes("order") || lowerName.includes("batch") || lowerName.includes("prayxis")));

  if (isMeeshoUrl || isMeeshoPattern) {
    return {
      isEligible: true,
      isInvalidFile: false,
      platform: "Meesho",
      isShippingLabel: true,
      isReviewNeeded: false,
      reason: "Verified Meesho shipping label",
    };
  }

  // 4. Platform Detection: Flipkart / Shopsy
  const isFlipkartUrl =
    url.includes("flipkart.com") ||
    finalUrl.includes("flipkart.com") ||
    url.includes("shopsy.in") ||
    finalUrl.includes("shopsy.in");

  const isFlipkartPattern =
    lowerName.includes("dispatch_labels") ||
    lowerName.includes("flipkart_label") ||
    lowerName.includes("flipkart-label") ||
    lowerName.includes("flipkartlabel") ||
    lowerName.includes("shopsy_label") ||
    lowerName.includes("shopsylabel") ||
    /^od\d{14,24}/i.test(lowerName) ||
    lowerName.includes("fmpp") ||
    (lowerName.includes("ekart") && lowerName.includes("label"));

  if (isFlipkartUrl || isFlipkartPattern) {
    return {
      isEligible: true,
      isInvalidFile: false,
      platform: "Flipkart",
      isShippingLabel: true,
      isReviewNeeded: false,
      reason: "Verified Flipkart / Shopsy shipping label",
    };
  }

  // 5. Platform Detection: Snapdeal
  const isSnapdealUrl = url.includes("snapdeal.com") || finalUrl.includes("snapdeal.com");
  const isSnapdealPattern =
    lowerName.startsWith("invoice_packslip") ||
    lowerName.includes("invoice_packslip") ||
    lowerName.includes("ecropper_snapdeal") ||
    lowerName.includes("snapdeal_label") ||
    lowerName.includes("snapdeal-label") ||
    lowerName.includes("snapdeallabel") ||
    (lowerName.includes("snapdeal") &&
      (lowerName.includes("label") || lowerName.includes("slip") || lowerName.includes("pack")));

  if (isSnapdealUrl || isSnapdealPattern) {
    return {
      isEligible: true,
      isInvalidFile: false,
      platform: "Snapdeal",
      isShippingLabel: true,
      isReviewNeeded: false,
      reason: "Verified Snapdeal shipping label",
    };
  }

  // 6. Platform Detection: Amazon
  const isAmazonUrl =
    url.includes("amazon.in") ||
    finalUrl.includes("amazon.in") ||
    url.includes("amazon.com") ||
    finalUrl.includes("amazon.com") ||
    url.includes("sellercentral.amazon") ||
    finalUrl.includes("sellercentral.amazon");

  const isAmazonPattern =
    lowerName.includes("package-label") ||
    lowerName.includes("package_label") ||
    lowerName.includes("packagelabel") ||
    lowerName.includes("merchant-shipping-label") ||
    lowerName.includes("merchant_shipping_label") ||
    lowerName.includes("amazon_label") ||
    lowerName.includes("amazon-label") ||
    (lowerName.includes("amazon") &&
      (lowerName.includes("label") || lowerName.includes("ship") || lowerName.includes("fba")));

  if (isAmazonUrl || isAmazonPattern) {
    return {
      isEligible: true,
      isInvalidFile: false,
      platform: "Amazon",
      isShippingLabel: true,
      isReviewNeeded: false,
      reason: "Verified Amazon shipping label",
    };
  }

  // 7. Platform Detection: Myntra
  const isMyntraUrl =
    url.includes("myntra.com") ||
    finalUrl.includes("myntra.com") ||
    url.includes("partners.myntra.com");

  const isMyntraPattern =
    lowerName.includes("myntra_label") ||
    lowerName.includes("myntra-label") ||
    lowerName.includes("myntralabel") ||
    (lowerName.includes("myntra") &&
      (lowerName.includes("label") || lowerName.includes("packslip") || lowerName.includes("manifest")));

  if (isMyntraUrl || isMyntraPattern) {
    return {
      isEligible: true,
      isInvalidFile: false,
      platform: "Myntra",
      isShippingLabel: true,
      isReviewNeeded: false,
      reason: "Verified Myntra shipping label",
    };
  }

  // 8. Standalone Courier Labels (Delhivery, Shadowfax, Xpressbees, Valmo, DTDC, Bluedart)
  if (
    lowerName.includes("delhivery") ||
    lowerName.includes("shadowfax") ||
    lowerName.includes("xpressbees") ||
    lowerName.includes("valmo") ||
    lowerName.includes("dtdc") ||
    lowerName.includes("bluedart")
  ) {
    return {
      isEligible: true,
      isInvalidFile: false,
      platform: "Courier Label",
      isShippingLabel: true,
      isReviewNeeded: false,
      reason: "Recognized e-commerce courier label",
    };
  }

  // 9. Generic Shipping Label keywords
  if (
    lowerName.includes("label") ||
    lowerName.includes("shipping") ||
    lowerName.includes("waybill") ||
    lowerName.includes("awb")
  ) {
    return {
      isEligible: true,
      isInvalidFile: false,
      platform: "Shipping Label",
      isShippingLabel: true,
      isReviewNeeded: false,
      reason: "Generic shipping label / waybill",
    };
  }

  // 10. Anything else is an INVALID file!
  return {
    isEligible: false,
    isInvalidFile: true,
    platform: "Invalid File",
    isShippingLabel: false,
    isReviewNeeded: false,
    reason: "Ye file valid shipping label nahi hai. Hum bas Meesho, Flipkart, Snapdeal, Amazon aur Myntra ke shipping labels accept karte hain.",
  };
}

/**
 * Add one or more PDF File/Blob/Buffer objects into the Vault with deduplication.
 */
async function addFilesToVault(items) {
  if (!items || items.length === 0) return [];
  const db = await openVaultDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const addedRecords = [];

    const getAllReq = store.getAll();

    getAllReq.onsuccess = () => {
      const existing = getAllReq.result || [];

      for (const it of items) {
        const name = it.name || (it.file && it.file.name) || "document.pdf";
        const cleanName = getBasename(name).trim();
        const lowerName = cleanName.toLowerCase();
        const size =
          it.size ||
          (it.file && it.file.size) ||
          (it.blob && it.blob.size) ||
          (it.buffer && it.buffer.byteLength) ||
          0;
        const type =
          it.type ||
          (it.file && it.file.type) ||
          (it.blob && it.blob.type) ||
          "application/pdf";
        const classification = classifyDownloadItem({ filename: cleanName, url: it.url || "" });
        const platform =
          it.platform || (classification.isEligible ? classification.platform : "Shipping Label");
        const fingerprint = getFileFingerprint(cleanName, size);
        const downloadId = it.downloadId ? String(it.downloadId) : null;
        const matchedName = it.matchedName ? getBasename(it.matchedName).trim().toLowerCase() : null;

        // Check if matching record already exists
        const matchIndex = existing.findIndex((r) => {
          if (downloadId && r.downloadId && String(r.downloadId) === downloadId) return true;
          if (matchedName && r.name && getBasename(r.name).trim().toLowerCase() === matchedName) return true;
          if (r.name && getBasename(r.name).trim().toLowerCase() === lowerName) return true;
          if (r.fingerprint && r.fingerprint === fingerprint) return true;
          return false;
        });

        let record;
        if (matchIndex >= 0) {
          // Re-activate existing record with fresh bytes & mark ready!
          record = existing[matchIndex];
          record.name = cleanName;
          record.size = size;
          record.type = type;
          record.platform = platform;
          record.status = "ready";
          record.selected = true;
          record.dateAdded = Date.now();
          record.trashedAt = null;
          record.printedAt = null;
          if (it.buffer) record.buffer = it.buffer;
          if (it.base64) record.base64 = it.base64;
          if (it.blob || it.file) record.blob = it.blob || it.file;
          if (downloadId) record.downloadId = downloadId;
          if (matchedName) record.matchedName = matchedName;
        } else {
          // Insert new ready record
          record = {
            id: generateVaultId(),
            downloadId: downloadId,
            matchedName: matchedName,
            fingerprint: fingerprint,
            name: cleanName,
            size: size,
            type: type,
            platform: platform,
            buffer: it.buffer || null,
            base64: it.base64 || null,
            blob: it.blob || it.file || null,
            dateAdded: Date.now(),
            selected: true,
            status: "ready",
            trashedAt: null,
            printedAt: null,
            lastProcessedAt: null,
          };
        }

        store.put(record);
        addedRecords.push(record);
      }
    };

    tx.oncomplete = () => resolve(addedRecords);
    tx.onerror = () => reject(tx.error || new Error("Failed to store PDFs in Vault"));
  });
}

/**
 * Retrieve all active ready PDFs from the Vault.
 */
async function getStoredVaultFiles(includeBlobs = false) {
  const db = await openVaultDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      const all = request.result || [];
      const stored = all
        .filter((r) => r.status === "ready")
        .sort((a, b) => b.dateAdded - a.dateAdded);

      if (includeBlobs) {
        resolve(stored);
      } else {
        resolve(
          stored.map((r) => ({
            id: r.id,
            downloadId: r.downloadId,
            fingerprint: r.fingerprint,
            name: r.name,
            size: r.size,
            type: r.type,
            platform: r.platform,
            dateAdded: r.dateAdded,
            selected: Boolean(r.selected),
            status: r.status,
            hasBlob: Boolean(r.blob || r.buffer || r.base64),
            lastProcessedAt: r.lastProcessedAt,
          }))
        );
      }
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Retrieve all printed PDFs from the Vault.
 */
async function getPrintedVaultFiles() {
  const db = await openVaultDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      const all = request.result || [];
      const printed = all
        .filter((r) => r.status === "printed")
        .sort((a, b) => (b.printedAt || 0) - (a.printedAt || 0))
        .map((r) => ({
          id: r.id,
          downloadId: r.downloadId,
          fingerprint: r.fingerprint,
          name: r.name,
          size: r.size,
          type: r.type,
          platform: r.platform,
          dateAdded: r.dateAdded,
          status: r.status,
          printedAt: r.printedAt,
          hasBlob: Boolean(r.blob || r.buffer || r.base64),
        }));
      resolve(printed);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Retrieve all items in the Trash tab.
 */
async function getTrashVaultFiles() {
  const db = await openVaultDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      const all = request.result || [];
      const trash = all
        .filter((r) => r.status === "trash")
        .sort((a, b) => (b.trashedAt || 0) - (a.trashedAt || 0))
        .map((r) => ({
          id: r.id,
          downloadId: r.downloadId,
          fingerprint: r.fingerprint,
          name: r.name,
          size: r.size,
          type: r.type,
          platform: r.platform,
          dateAdded: r.dateAdded,
          status: r.status,
          trashedAt: r.trashedAt,
          hasBlob: Boolean(r.blob || r.buffer || r.base64),
        }));
      resolve(trash);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Toggle or update selection of a stored PDF.
 */
async function updateVaultSelection(id, selected) {
  const db = await openVaultDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.get(id);

    getReq.onsuccess = () => {
      const record = getReq.result;
      if (record) {
        record.selected = Boolean(selected);
        store.put(record);
      }
    };
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Set selection status for all active stored PDFs.
 */
async function setAllVaultSelection(selected) {
  const db = await openVaultDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.getAll();

    getReq.onsuccess = () => {
      const all = getReq.result || [];
      for (const record of all) {
        if (record.status === "ready") {
          record.selected = Boolean(selected);
          store.put(record);
        }
      }
    };
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Move specified files to Printed section after processing.
 */
async function moveVaultFilesToPrinted(ids) {
  if (!ids || ids.length === 0) return true;
  const db = await openVaultDB();
  const idSet = new Set(Array.isArray(ids) ? ids : [ids]);

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.getAll();

    getReq.onsuccess = () => {
      const all = getReq.result || [];
      for (const record of all) {
        if (idSet.has(record.id)) {
          record.status = "printed";
          record.selected = false;
          record.printedAt = Date.now();
          store.put(record);
        }
      }
    };
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Move specified files from Printed back to Ready (re-print).
 */
async function reprintVaultFiles(ids) {
  if (!ids || ids.length === 0) return true;
  const db = await openVaultDB();
  const idSet = new Set(Array.isArray(ids) ? ids : [ids]);

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.getAll();

    getReq.onsuccess = () => {
      const all = getReq.result || [];
      for (const record of all) {
        if (idSet.has(record.id)) {
          record.status = "ready";
          record.selected = true;
          record.printedAt = null;
          store.put(record);
        }
      }
    };
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Move specified files to Trash.
 * Handles IDs, string names, or { name, downloadId } objects.
 */
async function moveVaultFilesToTrash(idsOrItems) {
  if (!idsOrItems || idsOrItems.length === 0) return true;
  const db = await openVaultDB();
  const itemsList = Array.isArray(idsOrItems) ? idsOrItems : [idsOrItems];

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.getAll();

    getReq.onsuccess = () => {
      const all = getReq.result || [];
      const idSet = new Set();
      const nameSet = new Set();
      const downloadIdSet = new Set();

      for (const it of itemsList) {
        if (typeof it === "string") {
          idSet.add(it);
          nameSet.add(it.toLowerCase().trim());
          nameSet.add(getBasename(it).toLowerCase().trim());
        } else if (it && typeof it === "object") {
          if (it.id) idSet.add(it.id);
          if (it.name) {
            nameSet.add(it.name.toLowerCase().trim());
            nameSet.add(getBasename(it.name).toLowerCase().trim());
          }
          if (it.downloadId) downloadIdSet.add(String(it.downloadId));
        }
      }

      for (const record of all) {
        const recName = record.name ? record.name.toLowerCase().trim() : "";
        const recBaseName = getBasename(recName);
        if (
          idSet.has(record.id) ||
          (recName && nameSet.has(recName)) ||
          (recBaseName && nameSet.has(recBaseName)) ||
          (record.downloadId && downloadIdSet.has(String(record.downloadId)))
        ) {
          record.status = "trash";
          record.selected = false;
          record.trashedAt = Date.now();
          store.put(record);
        }
      }

      // If item was a scanned download not yet in DB, create a trash record for it so it never shows up in active scan!
      for (const it of itemsList) {
        if (it && typeof it === "object" && it.name) {
          const itNameLower = it.name.toLowerCase().trim();
          const itBaseLower = getBasename(it.name).toLowerCase().trim();
          const match = all.find(
            (r) =>
              (it.id && r.id === it.id) ||
              (it.downloadId && String(r.downloadId) === String(it.downloadId)) ||
              (r.name && r.name.toLowerCase().trim() === itNameLower) ||
              (r.name && getBasename(r.name).toLowerCase().trim() === itBaseLower)
          );
          if (!match) {
            const tr = {
              id: generateVaultId(),
              downloadId: it.downloadId ? String(it.downloadId) : null,
              fingerprint: getFileFingerprint(it.name, it.size || 0),
              name: it.name,
              size: it.size || 0,
              type: it.type || "application/pdf",
              platform: it.platform || "Shipping Label",
              blob: null,
              buffer: null,
              base64: null,
              dateAdded: Date.now(),
              selected: false,
              status: "trash",
              trashedAt: Date.now(),
              printedAt: null,
              lastProcessedAt: null,
            };
            store.put(tr);
          }
        }
      }
    };

    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Restore specified files from Trash back to Ready.
 */
async function restoreVaultFilesFromTrash(ids) {
  if (!ids || ids.length === 0) return true;
  const db = await openVaultDB();
  const idSet = new Set(Array.isArray(ids) ? ids : [ids]);

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.getAll();

    getReq.onsuccess = () => {
      const all = getReq.result || [];
      for (const record of all) {
        if (idSet.has(record.id)) {
          record.status = "ready";
          record.selected = true;
          record.trashedAt = null;
          store.put(record);
        }
      }
    };
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Permanently delete specified files from the Vault.
 */
async function deleteVaultFilesPermanently(ids) {
  if (!ids || ids.length === 0) return true;
  const db = await openVaultDB();
  const idList = Array.isArray(ids) ? ids : [ids];

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);

    for (const id of idList) {
      store.delete(id);
    }
  });
}

/**
 * Empty all items currently in the Trash tab.
 */
async function emptyAllVaultTrash() {
  const db = await openVaultDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.getAll();

    getReq.onsuccess = () => {
      const all = getReq.result || [];
      for (const record of all) {
        if (record.status === "trash") {
          store.delete(record.id);
        }
      }
    };
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Get all selected stored PDFs with full binary Blobs/Buffers for website transfer.
 */
async function getSelectedVaultFilesWithBlobs() {
  const db = await openVaultDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.getAll();

    getReq.onsuccess = () => {
      const all = getReq.result || [];
      const selected = all.filter(
        (r) => r.status === "ready" && r.selected && (r.blob || r.buffer || r.base64)
      );
      for (const rec of selected) {
        if (!rec.blob && rec.buffer) {
          rec.blob = new Blob([rec.buffer], { type: rec.type || "application/pdf" });
        }
      }
      resolve(selected);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

/**
 * Get specific vault records with binary Blobs by their IDs.
 */
async function getVaultFilesWithBlobsByIds(ids) {
  if (!ids || ids.length === 0) return [];
  const db = await openVaultDB();
  const idSet = new Set(ids);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.getAll();

    getReq.onsuccess = () => {
      const all = getReq.result || [];
      const matched = all.filter(
        (r) => idSet.has(r.id) && (r.blob || r.buffer || r.base64)
      );
      for (const rec of matched) {
        if (!rec.blob && rec.buffer) {
          rec.blob = new Blob([rec.buffer], { type: rec.type || "application/pdf" });
        }
      }
      resolve(matched);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

/**
 * Get summary statistics for popup badge and UI counters.
 */
async function getVaultStats() {
  try {
    const db = await openVaultDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.getAll();

      getReq.onsuccess = () => {
        const all = getReq.result || [];
        const ready = all.filter((r) => r.status === "ready");
        const selected = ready.filter((r) => r.selected);
        const printed = all.filter((r) => r.status === "printed");
        const trash = all.filter((r) => r.status === "trash");
        const totalBytes = ready.reduce((sum, r) => sum + (r.size || 0), 0);

        resolve({
          readyCount: ready.length,
          selectedCount: selected.length,
          printedCount: printed.length,
          trashCount: trash.length,
          totalBytes: totalBytes,
        });
      };
      getReq.onerror = () =>
        resolve({ readyCount: 0, selectedCount: 0, printedCount: 0, trashCount: 0, totalBytes: 0 });
    });
  } catch {
    return { readyCount: 0, selectedCount: 0, printedCount: 0, trashCount: 0, totalBytes: 0 };
  }
}

/**
 * Comprehensive Recent Downloads Scanner
 * Queries chrome.downloads.search() for recent downloads and merges
 * all ready records from IndexedDB so manually uploaded / imported files
 * are also listed immediately in Scan Downloads.
 */
async function scanRecentDownloads() {
  let items = [];
  if (typeof chrome !== "undefined" && chrome.downloads) {
    try {
      items = await chrome.downloads.search({
        orderBy: ["-startTime"],
        limit: 300,
      });
    } catch (err) {
      console.warn("Could not query chrome.downloads:", err);
    }
  }

  // 2. Fetch all vault records from IndexedDB
  const db = await openVaultDB();
  const allVaultRecords = await new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => resolve([]);
  });

  const readyMap = new Map();
  const trashSet = new Set();
  const readyRecords = [];
  const matchedVaultIds = new Set();

  for (const rec of allVaultRecords) {
    const nameLower = rec.name ? rec.name.toLowerCase().trim() : "";
    const baseLower = getBasename(nameLower);
    const downloadIdStr = rec.downloadId ? String(rec.downloadId) : null;
    const fingerprint = rec.fingerprint || null;

    if (rec.status === "trash") {
      if (nameLower) trashSet.add(nameLower);
      if (baseLower) trashSet.add(baseLower);
      if (downloadIdStr) trashSet.add(downloadIdStr);
      if (fingerprint) trashSet.add(fingerprint);
    } else if (rec.status === "ready") {
      readyRecords.push(rec);
      if (nameLower) readyMap.set(nameLower, rec);
      if (baseLower) readyMap.set(baseLower, rec);
      if (rec.matchedName) readyMap.set(rec.matchedName.toLowerCase().trim(), rec);
      if (downloadIdStr) readyMap.set(downloadIdStr, rec);
      if (fingerprint) readyMap.set(fingerprint, rec);
    }
  }

  // 3. Process downloads and calculate metrics
  let meeshoCount = 0;
  let flipkartCount = 0;
  let snapdealCount = 0;
  let amazonCount = 0;
  let myntraCount = 0;
  let totalEligibleToday = 0;
  let totalPdfsFoundToday = 0;
  let alreadyStoredCount = 0;
  let newEligibleCount = 0;
  let ignoredFilesCount = 0;

  const scannedList = [];

  for (const item of items) {
    const filename = getBasename(item.filename || item.url);
    const isPdf = isPdfDownload(item, filename);

    if (!isPdf) {
      continue; // Filter out non-PDF files
    }

    const itemIsToday = isToday(item.startTime);
    if (itemIsToday) {
      totalPdfsFoundToday++;
    }

    const classification = classifyDownloadItem(item);
    const fingerprint = getFileFingerprint(filename, item.fileSize || 0);
    const downloadIdStr = String(item.id);
    const nameLower = filename.toLowerCase().trim();

    // Check if user previously moved this to Trash
    const isTrash =
      trashSet.has(fingerprint) ||
      trashSet.has(downloadIdStr) ||
      trashSet.has(nameLower);

    if (isTrash) {
      continue; // Trashed items do not appear in active Scan Downloads
    }

    // Check if ready in vault with blob or buffer
    const readyRec =
      readyMap.get(nameLower) ||
      readyMap.get(downloadIdStr) ||
      readyMap.get(fingerprint) ||
      null;

    const isStored = Boolean(readyRec);
    const vaultId = readyRec ? readyRec.id : null;
    const isSelected = readyRec ? Boolean(readyRec.selected) : false;

    if (readyRec) {
      matchedVaultIds.add(readyRec.id);
    }

    // Platform-specific today's counts
    if (classification.isEligible && itemIsToday) {
      if (classification.platform === "Meesho") meeshoCount++;
      else if (classification.platform === "Flipkart") flipkartCount++;
      else if (classification.platform === "Snapdeal") snapdealCount++;
      else if (classification.platform === "Amazon") amazonCount++;
      else if (classification.platform === "Myntra") myntraCount++;

      totalEligibleToday++;

      if (isStored) {
        alreadyStoredCount++;
      } else {
        newEligibleCount++;
      }
    } else if (itemIsToday && !classification.isEligible) {
      ignoredFilesCount++;
    }

    scannedList.push({
      downloadId: item.id,
      name: filename,
      size: item.fileSize || (readyRec && readyRec.size) || 0,
      mime: item.mime || "application/pdf",
      url: item.url,
      startTime: item.startTime,
      timeStr: formatLocalDownloadTime(item.startTime),
      state: item.state,
      platform: classification.platform,
      isEligible: classification.isEligible,
      isReviewNeeded: classification.isReviewNeeded,
      reason: classification.reason,
      isToday: itemIsToday,
      isStored: isStored,
      isReady: isStored,
      selected: isSelected,
      vaultId: vaultId,
      fingerprint: fingerprint,
    });
  }

  // 4. Merge any ready vault records not present in Chrome downloads history (e.g. Added via ➕ Add PDF)
  for (const rec of readyRecords) {
    if (!matchedVaultIds.has(rec.id)) {
      const recIsToday = isToday(rec.dateAdded);
      if (recIsToday) {
        totalPdfsFoundToday++;
        alreadyStoredCount++;
        totalEligibleToday++;
        if (rec.platform === "Meesho") meeshoCount++;
        else if (rec.platform === "Flipkart") flipkartCount++;
        else if (rec.platform === "Snapdeal") snapdealCount++;
        else if (rec.platform === "Amazon") amazonCount++;
        else if (rec.platform === "Myntra") myntraCount++;
      }

      scannedList.unshift({
        downloadId: rec.downloadId ? Number(rec.downloadId) : null,
        name: rec.name,
        size: rec.size || 0,
        mime: rec.type || "application/pdf",
        url: "",
        startTime: rec.dateAdded,
        timeStr: formatLocalDownloadTime(rec.dateAdded),
        state: "complete",
        platform: rec.platform || "Shipping Label",
        isEligible: true,
        isReviewNeeded: false,
        reason: "Imported Shipping Label",
        isToday: recIsToday,
        isStored: true,
        isReady: true,
        selected: Boolean(rec.selected),
        vaultId: rec.id,
        fingerprint: rec.fingerprint,
      });
    }
  }

  const summary = {
    todayDate: getTodayDateString(),
    lastScanTime: formatLocalDownloadTime(Date.now()),
    meeshoCount,
    flipkartCount,
    snapdealCount,
    amazonCount,
    myntraCount,
    totalEligibleToday,
    totalPdfsFoundToday,
    alreadyStoredCount,
    newEligibleCount,
    ignoredFilesCount,
  };

  return {
    summary,
    downloads: scannedList,
  };
}

// Export for module / window / service-worker contexts
if (typeof self !== "undefined") {
  self.VaultStorage = {
    openVaultDB,
    addFilesToVault,
    getStoredVaultFiles,
    getPrintedVaultFiles,
    getTrashVaultFiles,
    updateVaultSelection,
    setAllVaultSelection,
    moveVaultFilesToPrinted,
    reprintVaultFiles,
    moveVaultFilesToTrash,
    restoreVaultFilesFromTrash,
    deleteVaultFilesPermanently,
    emptyAllVaultTrash,
    getSelectedVaultFilesWithBlobs,
    getVaultFilesWithBlobsByIds,
    getVaultStats,
    classifyDownloadItem,
    scanRecentDownloads,
    isToday,
    getTodayDateString,
    formatLocalDownloadTime,
    getBasename,
    getFileFingerprint,
  };
}
