/**
 * LabelFlow Chrome Extension — Vault, Scanner & Printed Labels Controller
 */

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i] || "MB"}`;
}

function formatTimeAgo(timestamp) {
  if (!timestamp) return "";
  const diffSec = Math.floor((Date.now() - timestamp) / 1000);
  if (diffSec < 60) return "Just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

function bufferToBase64(buffer) {
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

document.addEventListener("DOMContentLoaded", () => {
  // DOM Elements: Header & Navigation
  const headerScanBtn = document.getElementById("headerScanBtn");
  const headerAddBtn = document.getElementById("headerAddBtn");
  const refreshBtn = document.getElementById("refreshBtn");
  const pdfFileInput = document.getElementById("pdfFileInput");
  const singleFileInput = document.getElementById("singleFileInput");

  const tabScanBtn = document.getElementById("tabScanBtn");
  const tabPrintedBtn = document.getElementById("tabPrintedBtn");
  const tabTrashBtn = document.getElementById("tabTrashBtn");
  const scanTabCount = document.getElementById("scanTabCount");
  const printedTabCount = document.getElementById("printedTabCount");
  const trashTabCount = document.getElementById("trashTabCount");

  // Tab Views
  const scanView = document.getElementById("scanView");
  const printedView = document.getElementById("printedView");
  const trashView = document.getElementById("trashView");

  // Dashboard Elements
  const summaryTodayDate = document.getElementById("summaryTodayDate");
  const dashboardRescanBtn = document.getElementById("dashboardRescanBtn");
  const countMeesho = document.getElementById("countMeesho");
  const countFlipkart = document.getElementById("countFlipkart");
  const countSnapdeal = document.getElementById("countSnapdeal");
  const countAmazon = document.getElementById("countAmazon");
  const countMyntra = document.getElementById("countMyntra");
  const countTotalEligible = document.getElementById("countTotalEligible");

  const metaLastScan = document.getElementById("metaLastScan");
  const metaTotalPdfs = document.getElementById("metaTotalPdfs");
  const metaStored = document.getElementById("metaStored");
  const metaNewEligible = document.getElementById("metaNewEligible");
  const metaIgnored = document.getElementById("metaIgnored");

  // Filter Elements
  const filterPills = document.querySelectorAll(".filter-pill");
  const filterTodayBtn = document.getElementById("filterTodayBtn");
  const filterAllRecentBtn = document.getElementById("filterAllRecentBtn");
  const platformStatCards = document.querySelectorAll(".platform-stat");

  // Scanned List Elements
  const scanLoadingState = document.getElementById("scanLoadingState");
  const scanEmptyState = document.getElementById("scanEmptyState");
  const scanEmptyActionBtn = document.getElementById("scanEmptyActionBtn");
  const scannedItemsList = document.getElementById("scannedItemsList");

  // Printed & Trash List Elements
  const printedListContainer = document.getElementById("printedListContainer");
  const printedItemsList = document.getElementById("printedItemsList");
  const printedEmptyState = document.getElementById("printedEmptyState");
  const trashItemsList = document.getElementById("trashItemsList");
  const trashEmptyState = document.getElementById("trashEmptyState");

  // Toolbars & Action Buttons
  const selectAllBtn = document.getElementById("selectAllBtn");
  const deselectAllBtn = document.getElementById("deselectAllBtn");
  const trashAllPrintedBtn = document.getElementById("trashAllPrintedBtn");
  const emptyTrashBtn = document.getElementById("emptyTrashBtn");
  const selectedCountBadge = document.getElementById("selectedCountBadge");

  // Footer Elements
  const cropSelectedBtn = document.getElementById("cropSelectedBtn");
  const cropBtnText = document.getElementById("cropBtnText");
  const homeLink = document.getElementById("homeLink");

  // Toast Banner
  const vaultBanner = document.getElementById("vaultBanner");
  const bannerText = document.getElementById("bannerText");
  const bannerIcon = document.getElementById("bannerIcon");
  const bannerCloseBtn = document.getElementById("bannerCloseBtn");

  // App State
  let currentTab = "scan"; // "scan" | "printed" | "trash"
  let readyVaultItems = [];
  let printedVaultItems = [];
  let trashVaultItems = [];
  let scannedDownloads = [];
  let currentFilter = "ALL";
  let currentDateScope = "TODAY";
  let pendingImportDownload = null;

  function showBanner(msg, type = "info") {
    if (!vaultBanner) return;
    bannerText.textContent = msg;
    bannerIcon.textContent = type === "error" ? "⚠️" : type === "success" ? "✓" : "ℹ️";
    vaultBanner.className = `vault-banner ${type}`;
    vaultBanner.style.display = "flex";
  }

  function hideBanner() {
    if (!vaultBanner) return;
    vaultBanner.style.display = "none";
  }

  if (bannerCloseBtn) {
    bannerCloseBtn.addEventListener("click", hideBanner);
  }

  // Switch between Tabs
  function switchTab(tab) {
    currentTab = tab;
    hideBanner();

    tabScanBtn.classList.toggle("active", tab === "scan");
    tabPrintedBtn.classList.toggle("active", tab === "printed");
    tabTrashBtn.classList.toggle("active", tab === "trash");

    scanView.style.display = tab === "scan" ? "flex" : "none";
    printedView.style.display = tab === "printed" ? "flex" : "none";
    trashView.style.display = tab === "trash" ? "flex" : "none";

    if (tab === "scan") {
      renderScannedList();
    } else if (tab === "printed") {
      renderPrintedList(printedVaultItems);
    } else {
      renderTrashList(trashVaultItems);
    }
    updateCtaButton();
  }

  tabScanBtn.addEventListener("click", () => switchTab("scan"));
  tabPrintedBtn.addEventListener("click", () => switchTab("printed"));
  tabTrashBtn.addEventListener("click", () => switchTab("trash"));

  // Update Footer CTA Button & Counters
  function updateCtaButton() {
    const selectedReadyCount = readyVaultItems.filter((i) => i.selected).length;
    cropBtnText.textContent = `PRINT / CROP SELECTED (${selectedReadyCount})`;
    cropSelectedBtn.disabled = selectedReadyCount === 0;
    if (selectedReadyCount > 0) {
      cropSelectedBtn.classList.remove("disabled-btn");
    } else {
      cropSelectedBtn.classList.add("disabled-btn");
    }

    if (selectedCountBadge) {
      selectedCountBadge.textContent = `${selectedReadyCount} / ${readyVaultItems.length} Ready`;
    }
  }

  // Fetch Vault Data (Ready, Printed, Trash)
  function fetchVaultData(showLoading = false) {
    chrome.runtime.sendMessage({ action: "VAULT_GET_DATA" }, (response) => {
      if (chrome.runtime.lastError) {
        showBanner(chrome.runtime.lastError.message, "error");
        return;
      }

      if (response && response.success) {
        readyVaultItems = response.stored || [];
        printedVaultItems = response.printed || [];
        trashVaultItems = response.trash || [];

        if (printedTabCount) printedTabCount.textContent = String(printedVaultItems.length);
        if (trashTabCount) trashTabCount.textContent = String(trashVaultItems.length);

        updateCtaButton();

        if (currentTab === "printed") {
          renderPrintedList(printedVaultItems);
        } else if (currentTab === "trash") {
          renderTrashList(trashVaultItems);
        }
      }
    });
  }

  // Trigger Download Scanner
  function triggerScan(showLoading = true) {
    if (showLoading) {
      if (scanLoadingState) scanLoadingState.style.display = "flex";
      if (scanEmptyState) scanEmptyState.style.display = "none";
      if (headerScanBtn) headerScanBtn.classList.add("spinning");
      if (dashboardRescanBtn) dashboardRescanBtn.classList.add("spinning");
    }

    chrome.runtime.sendMessage({ action: "SCAN_DOWNLOADS" }, (response) => {
      if (scanLoadingState) scanLoadingState.style.display = "none";
      if (headerScanBtn) headerScanBtn.classList.remove("spinning");
      if (dashboardRescanBtn) dashboardRescanBtn.classList.remove("spinning");

      if (chrome.runtime.lastError) {
        showBanner("Scan error: " + chrome.runtime.lastError.message, "error");
        return;
      }

      if (response && response.success) {
        const sum = response.summary || {};
        scannedDownloads = response.downloads || [];

        // Update Today's Summary Dashboard
        if (summaryTodayDate) summaryTodayDate.textContent = sum.todayDate || "--";
        if (countMeesho) countMeesho.textContent = String(sum.meeshoCount || 0);
        if (countFlipkart) countFlipkart.textContent = String(sum.flipkartCount || 0);
        if (countSnapdeal) countSnapdeal.textContent = String(sum.snapdealCount || 0);
        if (countAmazon) countAmazon.textContent = String(sum.amazonCount || 0);
        if (countMyntra) countMyntra.textContent = String(sum.myntraCount || 0);
        if (countTotalEligible) countTotalEligible.textContent = String(sum.totalEligibleToday || 0);

        if (metaLastScan) metaLastScan.textContent = sum.lastScanTime || "--";
        if (metaTotalPdfs) metaTotalPdfs.textContent = String(sum.totalPdfsFoundToday || 0);
        if (metaStored) metaStored.textContent = String(sum.alreadyStoredCount || 0);
        if (metaNewEligible) metaNewEligible.textContent = String(sum.newEligibleCount || 0);
        if (metaIgnored) metaIgnored.textContent = String(sum.ignoredFilesCount || 0);

        if (scanTabCount) scanTabCount.textContent = String(scannedDownloads.length || sum.totalEligibleToday || 0);

        renderScannedList();
        fetchVaultData(false);
      }
    });
  }

  // Filter Pill Listeners
  filterPills.forEach((pill) => {
    pill.addEventListener("click", () => {
      filterPills.forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
      currentFilter = pill.getAttribute("data-filter") || "ALL";
      renderScannedList();
    });
  });

  // Clicking Platform cards sets that filter directly
  platformStatCards.forEach((card) => {
    card.addEventListener("click", () => {
      const platform = card.getAttribute("data-platform");
      if (!platform) return;
      currentFilter = platform;
      filterPills.forEach((p) => {
        p.classList.toggle("active", p.getAttribute("data-filter") === platform);
      });
      renderScannedList();
    });
  });

  // Date Scope Toggles
  if (filterTodayBtn && filterAllRecentBtn) {
    filterTodayBtn.addEventListener("click", () => {
      filterTodayBtn.classList.add("active");
      filterAllRecentBtn.classList.remove("active");
      currentDateScope = "TODAY";
      renderScannedList();
    });

    filterAllRecentBtn.addEventListener("click", () => {
      filterAllRecentBtn.classList.add("active");
      filterTodayBtn.classList.remove("active");
      currentDateScope = "ALL";
      renderScannedList();
    });
  }

  // Render Scanned Downloads List (TAB 1)
  function renderScannedList() {
    if (!scannedItemsList) return;
    scannedItemsList.innerHTML = "";

    // Apply Filter & Date Scope
    const filtered = scannedDownloads.filter((item) => {
      if (currentDateScope === "TODAY" && !item.isToday) {
        return false;
      }
      if (currentFilter !== "ALL" && item.platform !== currentFilter) {
        return false;
      }
      if (currentFilter === "ALL" && !item.isEligible && !item.isReviewNeeded) {
        return false;
      }
      return true;
    });

    if (filtered.length === 0) {
      if (scanEmptyState) scanEmptyState.style.display = "flex";
      return;
    }

    if (scanEmptyState) scanEmptyState.style.display = "none";

    filtered.forEach((item) => {
      const card = document.createElement("div");
      card.className = `item-card ${item.selected ? "selected" : ""}`;

      const left = document.createElement("div");
      left.className = "item-left";

      // If item is ready in vault, show selection Checkbox
      if (item.isReady && item.vaultId) {
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.className = "item-checkbox";
        checkbox.checked = Boolean(item.selected);
        checkbox.addEventListener("change", async (e) => {
          e.stopPropagation();
          item.selected = checkbox.checked;
          card.classList.toggle("selected", item.selected);
          await VaultStorage.updateVaultSelection(item.vaultId, checkbox.checked);
          chrome.runtime.sendMessage({ action: "UPDATE_VAULT_BADGE" });
          fetchVaultData(false);
        });
        left.appendChild(checkbox);
      }

      const details = document.createElement("div");
      details.className = "item-details";

      const name = document.createElement("span");
      name.className = "item-name";
      name.textContent = item.name;
      name.title = `${item.name}\n${item.reason || ""}`;

      const meta = document.createElement("div");
      meta.className = "item-meta";

      const platformClass = (item.platform || "Generic").replace(/\s+/g, "");
      const tag = document.createElement("span");
      tag.className = `platform-tag ${platformClass}`;
      tag.textContent = item.platform || "PDF";

      const size = document.createElement("span");
      size.textContent = formatBytes(item.size);

      const time = document.createElement("span");
      time.textContent = `• ${item.timeStr || ""}`;

      meta.appendChild(tag);
      meta.appendChild(size);
      meta.appendChild(time);

      details.appendChild(name);
      details.appendChild(meta);
      left.appendChild(details);

      // Right Action Buttons Group: Import / Status Tag + DELETE BUTTON
      const right = document.createElement("div");
      right.className = "item-right-actions";

      // If item is ready in Vault: SHOW "✓ Ready to Print" tag (DO NOT SHOW + Import PDF!)
      if (item.isReady) {
        const readyTag = document.createElement("span");
        readyTag.className = "status-tag ready";
        readyTag.textContent = "✓ Ready to Print";
        readyTag.title = "This label is stored in Vault and ready for 1-click cropping.";
        right.appendChild(readyTag);
      } else {
        // If not yet imported: SHOW "+ Import PDF" button
        const importBtn = document.createElement("button");
        importBtn.type = "button";
        importBtn.className = "import-single-btn";
        importBtn.innerHTML = "<span>➕</span> Import PDF";
        importBtn.title = "Pick this PDF from your Downloads folder to activate for 1-click printing";
        importBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          pendingImportDownload = item;

          // Native File Picker with suggestedName so the exact filename is PRE-SELECTED!
          if (typeof window.showOpenFilePicker === "function") {
            try {
              const [fileHandle] = await window.showOpenFilePicker({
                suggestedName: item.name,
                types: [
                  {
                    description: "PDF Shipping Label",
                    accept: {
                      "application/pdf": [".pdf"],
                    },
                  },
                ],
                multiple: false,
              });

              if (fileHandle) {
                const file = await fileHandle.getFile();
                if (file) {
                  await processAndImportFile(file, item);
                  return;
                }
              }
            } catch (err) {
              if (err && err.name === "AbortError") {
                return; // User cancelled dialog
              }
              console.warn("showOpenFilePicker fallback to input:", err);
            }
          }

          singleFileInput.value = "";
          singleFileInput.click();
        });
        right.appendChild(importBtn);
      }

      // DELETE LABEL BUTTON (🗑️) — Present on every card!
      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "action-icon-btn danger";
      deleteBtn.innerHTML = "🗑️";
      deleteBtn.title = "Delete label (Move to Trash)";
      deleteBtn.addEventListener("click", async (e) => {
        e.stopPropagation();

        // 1. Optimistically remove from in-memory list & DOM immediately!
        scannedDownloads = scannedDownloads.filter(
          (it) => it !== item && it.name.toLowerCase().trim() !== item.name.toLowerCase().trim()
        );
        card.remove();

        // 2. Decrement Scan count & Increment Trash count immediately
        if (scanTabCount) {
          const cur = parseInt(scanTabCount.textContent || "0", 10);
          scanTabCount.textContent = String(Math.max(0, cur - 1));
        }
        if (trashTabCount) {
          const cur = parseInt(trashTabCount.textContent || "0", 10);
          trashTabCount.textContent = String(cur + 1);
        }

        showBanner(`Moved "${item.name}" to Trash.`, "info");

        // 3. Persist move to Trash in IndexedDB
        const payload = item.vaultId
          ? item.vaultId
          : {
              name: item.name,
              downloadId: item.downloadId,
              size: item.size,
              platform: item.platform,
            };

        try {
          await VaultStorage.moveVaultFilesToTrash(payload);
          chrome.runtime.sendMessage({ action: "UPDATE_VAULT_BADGE" });
          fetchVaultData(false);

          if (scannedDownloads.length === 0 && scanEmptyState) {
            scanEmptyState.style.display = "flex";
          }
        } catch (err) {
          console.error("Error moving to trash:", err);
        }
      });
      right.appendChild(deleteBtn);

      // Card click toggles checkbox if ready
      if (item.isReady && item.vaultId) {
        card.addEventListener("click", async (e) => {
          if (e.target !== deleteBtn && !e.target.classList.contains("item-checkbox")) {
            item.selected = !item.selected;
            card.classList.toggle("selected", item.selected);
            const cb = card.querySelector(".item-checkbox");
            if (cb) cb.checked = item.selected;

            await VaultStorage.updateVaultSelection(item.vaultId, item.selected);
            chrome.runtime.sendMessage({ action: "UPDATE_VAULT_BADGE" });
            fetchVaultData(false);
          }
        });
      }

      card.appendChild(left);
      card.appendChild(right);
      scannedItemsList.appendChild(card);
    });
  }

  // Render Printed Labels List (TAB 2)
  function renderPrintedList(items) {
    if (!printedItemsList) return;
    if (items.length === 0) {
      if (printedEmptyState) printedEmptyState.style.display = "flex";
      printedItemsList.innerHTML = "";
      return;
    }

    if (printedEmptyState) printedEmptyState.style.display = "none";
    printedItemsList.innerHTML = "";

    items.forEach((item) => {
      const card = document.createElement("div");
      card.className = "item-card printed-card";

      const left = document.createElement("div");
      left.className = "item-left";

      const details = document.createElement("div");
      details.className = "item-details";

      const name = document.createElement("span");
      name.className = "item-name";
      name.textContent = item.name;
      name.title = item.name;

      const meta = document.createElement("div");
      meta.className = "item-meta";

      const platformClass = (item.platform || "Generic").replace(/\s+/g, "");
      const tag = document.createElement("span");
      tag.className = `platform-tag ${platformClass}`;
      tag.textContent = item.platform || "PDF";

      const size = document.createElement("span");
      size.textContent = formatBytes(item.size);

      const time = document.createElement("span");
      time.textContent = `• Printed ${formatTimeAgo(item.printedAt)}`;

      meta.appendChild(tag);
      meta.appendChild(size);
      meta.appendChild(time);

      details.appendChild(name);
      details.appendChild(meta);
      left.appendChild(details);

      // Right actions: Re-Print button & Delete to Trash button
      const right = document.createElement("div");
      right.className = "item-right-actions";

      const reprintBtn = document.createElement("button");
      reprintBtn.type = "button";
      reprintBtn.className = "action-pill-btn";
      reprintBtn.innerHTML = "🔄 Re-Print";
      reprintBtn.title = "Restore this label back to Scan Downloads to print again";
      reprintBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (item.hasBlob) {
          await VaultStorage.reprintVaultFiles([item.id]);
          showBanner(`Restored "${item.name}" to Scan Downloads ready to print!`, "success");
          switchTab("scan");
          triggerScan(false);
          fetchVaultData(false);
        } else {
          showBanner(`File bytes missing. Please re-import "${item.name}" to print again.`, "info");
          pendingImportDownload = { name: item.name, platform: item.platform, downloadId: item.downloadId };
          singleFileInput.value = "";
          singleFileInput.click();
        }
      });
      right.appendChild(reprintBtn);

      const trashBtn = document.createElement("button");
      trashBtn.type = "button";
      trashBtn.className = "action-icon-btn danger";
      trashBtn.innerHTML = "🗑️";
      trashBtn.title = "Move to Trash";
      trashBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        await VaultStorage.moveVaultFilesToTrash([item.id]);
        showBanner(`Moved "${item.name}" to Trash.`, "info");
        fetchVaultData(false);
        triggerScan(false);
      });
      right.appendChild(trashBtn);

      card.appendChild(left);
      card.appendChild(right);
      printedItemsList.appendChild(card);
    });
  }

  // Render Trash List (TAB 3)
  function renderTrashList(items) {
    if (!trashItemsList) return;
    if (items.length === 0) {
      if (trashEmptyState) trashEmptyState.style.display = "flex";
      trashItemsList.innerHTML = "";
      return;
    }

    if (trashEmptyState) trashEmptyState.style.display = "none";
    trashItemsList.innerHTML = "";

    items.forEach((item) => {
      const card = document.createElement("div");
      card.className = "item-card trash-card";

      const left = document.createElement("div");
      left.className = "item-left";

      const details = document.createElement("div");
      details.className = "item-details";

      const name = document.createElement("span");
      name.className = "item-name strike";
      name.textContent = item.name;
      name.title = item.name;

      const meta = document.createElement("div");
      meta.className = "item-meta";

      const platformClass = (item.platform || "Generic").replace(/\s+/g, "");
      const tag = document.createElement("span");
      tag.className = `platform-tag ${platformClass}`;
      tag.textContent = item.platform || "PDF";

      const size = document.createElement("span");
      size.textContent = formatBytes(item.size);

      const time = document.createElement("span");
      time.textContent = `• Trashed ${formatTimeAgo(item.trashedAt)}`;

      meta.appendChild(tag);
      meta.appendChild(size);
      meta.appendChild(time);

      details.appendChild(name);
      details.appendChild(meta);
      left.appendChild(details);

      // Right actions: Restore & Permanent Delete
      const right = document.createElement("div");
      right.className = "trash-actions";

      const restoreBtn = document.createElement("button");
      restoreBtn.type = "button";
      restoreBtn.className = "action-pill-btn";
      restoreBtn.innerHTML = "↩️ Restore";
      restoreBtn.title = "Restore label back to Scan Downloads";
      restoreBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        await VaultStorage.restoreVaultFilesFromTrash([item.id]);
        showBanner(`Restored "${item.name}" to Scan Downloads.`, "success");
        fetchVaultData(false);
        triggerScan(false);
      });
      right.appendChild(restoreBtn);

      const deletePermBtn = document.createElement("button");
      deletePermBtn.type = "button";
      deletePermBtn.className = "action-icon-btn danger";
      deletePermBtn.innerHTML = "✕";
      deletePermBtn.title = "Delete permanently from Vault";
      deletePermBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (confirm(`Permanently delete "${item.name}"? This cannot be undone.`)) {
          await VaultStorage.deleteVaultFilesPermanently([item.id]);
          showBanner(`Permanently deleted "${item.name}".`, "info");
          fetchVaultData(false);
          triggerScan(false);
        }
      });
      right.appendChild(deletePermBtn);

      card.appendChild(left);
      card.appendChild(right);
      trashItemsList.appendChild(card);
    });
  }

  // Core Import Logic: Validates, stores in Vault, and updates card immediately
  async function processAndImportFile(file, downloadItem) {
    if (!file) return;

    // Strict Validation: Detect invalid/non-label files (CV, Resume, Statement, Bill, Generic PDF)
    const classification = VaultStorage.classifyDownloadItem({ filename: file.name });
    if (!classification.isEligible && !classification.isReviewNeeded) {
      showBanner(
        `⚠️ "${file.name}" valid shipping label nahi hai! Kripya sirf Meesho, Flipkart, Snapdeal, Amazon ya Myntra ka shipping label select karein.`,
        "error"
      );
      return;
    }

    const targetPlatform = classification.isEligible
      ? classification.platform
      : (downloadItem && downloadItem.platform) || "Shipping Label";
    const downloadId = downloadItem ? downloadItem.downloadId : null;
    const downloadName = downloadItem ? downloadItem.name : file.name;

    showBanner(`Importing "${file.name}" into Vault...`, "info");

    try {
      const buffer = await file.arrayBuffer();
      const base64 = bufferToBase64(buffer);
      const blob = new Blob([buffer], { type: file.type || "application/pdf" });

      const addedRecords = await VaultStorage.addFilesToVault([
        {
          name: file.name,
          matchedName: downloadName,
          buffer: buffer,
          base64: base64,
          blob: blob,
          size: file.size,
          type: file.type || "application/pdf",
          platform: targetPlatform,
          downloadId: downloadId,
        },
      ]);

      const added = addedRecords[0];

      chrome.runtime.sendMessage({ action: "UPDATE_VAULT_BADGE" });

      // Update in-memory scannedDownloads so the card transforms IMMEDIATELY
      const targetMatchName = (downloadName || file.name).toLowerCase().trim();
      const match = scannedDownloads.find(
        (it) =>
          (downloadId && it.downloadId === downloadId) ||
          it.name.toLowerCase().trim() === targetMatchName
      );
      if (match) {
        match.isReady = true;
        match.isStored = true;
        match.vaultId = added ? added.id : generateVaultId();
        match.selected = true;
        match.size = file.size;
      }

      pendingImportDownload = null;
      showBanner(`✓ Successfully imported "${file.name}"! Ready to print.`, "success");

      // Re-render immediately: + Import button vanishes, ✓ Ready to Print appears!
      renderScannedList();
      fetchVaultData(false);
    } catch (err) {
      showBanner("Error reading PDF file: " + err.message, "error");
    }
  }

  // Handle Single File Import for a Scanned Item (Fallback for standard file input)
  if (singleFileInput) {
    singleFileInput.addEventListener("change", async (e) => {
      const file = (e.target.files || [])[0];
      if (file) {
        await processAndImportFile(file, pendingImportDownload);
      }
    });
  }

  // Multi-File Ingestion via Header "➕ Add PDF" Button
  function triggerFileInput() {
    pdfFileInput.value = "";
    pdfFileInput.click();
  }

  if (headerAddBtn) headerAddBtn.addEventListener("click", triggerFileInput);

  pdfFileInput.addEventListener("change", async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    hideBanner();

    // Validate each file strictly
    const validFiles = [];
    const invalidFiles = [];

    for (const f of files) {
      const cls = VaultStorage.classifyDownloadItem({ filename: f.name });
      if (cls.isEligible || cls.isReviewNeeded) {
        validFiles.push({ file: f, classification: cls });
      } else {
        invalidFiles.push(f.name);
      }
    }

    if (invalidFiles.length > 0) {
      showBanner(
        `⚠️ "${invalidFiles.slice(0, 2).join(", ")}" valid shipping label nahi hai! Kripya sirf Meesho, Flipkart, Snapdeal, Amazon ya Myntra labels upload karein.`,
        "error"
      );
      if (validFiles.length === 0) return;
    }

    showBanner(`Storing ${validFiles.length} label PDF(s) into Vault...`, "info");

    try {
      const itemsToSave = await Promise.all(
        validFiles.map(async ({ file, classification }) => {
          const buffer = await file.arrayBuffer();
          const base64 = bufferToBase64(buffer);
          const blob = new Blob([buffer], { type: file.type || "application/pdf" });
          return {
            name: file.name,
            buffer: buffer,
            base64: base64,
            blob: blob,
            size: file.size,
            type: file.type || "application/pdf",
            platform: classification.isEligible ? classification.platform : "Shipping Label",
          };
        })
      );

      const added = await VaultStorage.addFilesToVault(itemsToSave);
      chrome.runtime.sendMessage({ action: "UPDATE_VAULT_BADGE" });

      showBanner(
        `✓ Successfully stored ${added.length} shipping label(s)! Ready to print.`,
        "success"
      );

      // Re-scan and update so uploaded files are listed right here in this list!
      triggerScan(false);
      fetchVaultData(false);
    } catch (err) {
      showBanner("Error saving selected files: " + err.message, "error");
    }
  });

  // Header Scan Button
  if (headerScanBtn) {
    headerScanBtn.addEventListener("click", () => {
      switchTab("scan");
      triggerScan(true);
    });
  }

  // Dashboard Rescan Button
  if (dashboardRescanBtn) {
    dashboardRescanBtn.addEventListener("click", () => triggerScan(true));
  }

  // Empty State Scan Button
  if (scanEmptyActionBtn) {
    scanEmptyActionBtn.addEventListener("click", () => triggerScan(true));
  }

  // Refresh
  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => {
      refreshBtn.classList.add("spinning");
      triggerScan(true);
      fetchVaultData(false);
      setTimeout(() => refreshBtn.classList.remove("spinning"), 600);
    });
  }

  // Select All Ready Labels
  if (selectAllBtn) {
    selectAllBtn.addEventListener("click", async () => {
      await VaultStorage.setAllVaultSelection(true);
      scannedDownloads.forEach((it) => {
        if (it.isReady) it.selected = true;
      });
      renderScannedList();
      fetchVaultData(false);
    });
  }

  // Deselect All
  if (deselectAllBtn) {
    deselectAllBtn.addEventListener("click", async () => {
      await VaultStorage.setAllVaultSelection(false);
      scannedDownloads.forEach((it) => {
        if (it.isReady) it.selected = false;
      });
      renderScannedList();
      fetchVaultData(false);
    });
  }

  // Move all Printed to Trash
  if (trashAllPrintedBtn) {
    trashAllPrintedBtn.addEventListener("click", async () => {
      if (printedVaultItems.length === 0) return;
      const ids = printedVaultItems.map((i) => i.id);
      await VaultStorage.moveVaultFilesToTrash(ids);
      showBanner(`Moved ${ids.length} printed label(s) to Trash.`, "info");
      fetchVaultData(false);
    });
  }

  // Empty Trash
  if (emptyTrashBtn) {
    emptyTrashBtn.addEventListener("click", async () => {
      if (trashVaultItems.length === 0) return;
      if (confirm(`Permanently delete all ${trashVaultItems.length} item(s) in Trash?`)) {
        await VaultStorage.emptyAllVaultTrash();
        showBanner("Trash emptied successfully.", "success");
        fetchVaultData(false);
        triggerScan(false);
      }
    });
  }

  // Open Webpage Link
  if (homeLink) {
    homeLink.addEventListener("click", (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: "http://localhost:3000/#generator" });
      window.close();
    });
  }

  // Main CTA: Print / Crop Selected
  if (cropSelectedBtn) {
    cropSelectedBtn.addEventListener("click", () => {
      const selected = readyVaultItems.filter((i) => i.selected);
      if (selected.length === 0) {
        showBanner("Please select at least 1 ready PDF label to print & crop.", "error");
        return;
      }

      hideBanner();
      cropSelectedBtn.disabled = true;
      cropBtnText.textContent = `Transferring ${selected.length} PDF(s) to LabelFlow...`;

      chrome.runtime.sendMessage({ action: "SEND_TO_LABELFLOW" }, (response) => {
        if (response && response.success) {
          cropBtnText.textContent = `✓ Transferred! Cropping in LabelFlow...`;
          setTimeout(() => {
            window.close();
          }, 700);
        } else {
          showBanner(response?.error || "Error transferring files to website.", "error");
          updateCtaButton();
        }
      });
    });
  }

  // Initial load
  triggerScan(true);
  fetchVaultData(false);
});
