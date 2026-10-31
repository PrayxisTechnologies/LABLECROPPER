/**
 * LabelFlow Chrome Extension — Minimal & Professional Popup Controller
 * Version: 2.5.0 — Multi-Device Cloud Sync & Centralized Thermal Printing
 */

// Helper: Format byte sizes cleanly
function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i] || "MB"}`;
}

// Helper: Format timestamps cleanly
function formatRelativeOrDate(timestamp) {
  if (!timestamp) return "";
  const d = new Date(timestamp);
  if (isNaN(d.getTime())) return "";

  const now = new Date();
  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();

  const timeStr = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (isToday) {
    return `Today, ${timeStr}`;
  }
  const dateStr = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${dateStr}, ${timeStr}`;
}

// Helper: Convert ArrayBuffer to Base64
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
  // --- DOM Elements: Header & Navigation ---
  const headerUploadBtn = document.getElementById("headerUploadBtn");
  const authPill = document.getElementById("authPill");
  const authDot = document.getElementById("authDot");
  const authStatusText = document.getElementById("authStatusText");

  const tabPendingBtn = document.getElementById("tabPendingBtn");
  const tabHistoryBtn = document.getElementById("tabHistoryBtn");
  const pendingTabCount = document.getElementById("pendingTabCount");
  const historyTabCount = document.getElementById("historyTabCount");

  const pendingView = document.getElementById("pendingView");
  const historyView = document.getElementById("historyView");

  // --- DOM Elements: Banner ---
  const vaultBanner = document.getElementById("vaultBanner");
  const bannerText = document.getElementById("bannerText");
  const bannerCloseBtn = document.getElementById("bannerCloseBtn");

  // --- DOM Elements: Pending Queue ---
  const addMoreBtn = document.getElementById("addMoreBtn");
  const selectAllBtn = document.getElementById("selectAllBtn");
  const deselectAllBtn = document.getElementById("deselectAllBtn");
  const selectedCountBadge = document.getElementById("selectedCountBadge");
  const trashSelectedBtn = document.getElementById("trashSelectedBtn");

  const pendingLoadingState = document.getElementById("pendingLoadingState");
  const pendingEmptyState = document.getElementById("pendingEmptyState");
  const emptyUploadBtn = document.getElementById("emptyUploadBtn");
  const pendingItemsList = document.getElementById("pendingItemsList");

  const cropSelectedBtn = document.getElementById("cropSelectedBtn");
  const cropBtnText = document.getElementById("cropBtnText");

  // --- DOM Elements: Printed History ---
  const selectAllHistoryBtn = document.getElementById("selectAllHistoryBtn");
  const deselectAllHistoryBtn = document.getElementById("deselectAllHistoryBtn");
  const reprintSelectedBtn = document.getElementById("reprintSelectedBtn");
  const clearHistoryBtn = document.getElementById("clearHistoryBtn");

  const historyEmptyState = document.getElementById("historyEmptyState");
  const historyItemsList = document.getElementById("historyItemsList");

  // --- Hidden File Inputs ---
  const pdfFileInput = document.getElementById("pdfFileInput");

  // --- DOM Elements: Already Printed Confirmation Modal ---
  const duplicateModal = document.getElementById("duplicateModal");
  const duplicateModalMessage = document.getElementById("duplicateModalMessage");
  const duplicateModalFilesList = document.getElementById("duplicateModalFilesList");
  const duplicateModalYesBtn = document.getElementById("duplicateModalYesBtn");
  const duplicateModalNoBtn = document.getElementById("duplicateModalNoBtn");

  // --- State Variables ---
  let currentTab = "pending"; // "pending" | "history"
  let pendingItems = [];
  let historyItems = [];
  let currentAuthState = { isLoggedIn: false, user: null, token: null };
  let activeApiBase = "https://labelcropper.prayxis.in/api/v1";

  // Dynamic API Base URL resolution: matches localhost vs production
  async function resolveApiBase() {
    try {
      // 1. Prioritize active tab in the current window
      const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const currentUrl = activeTabs && activeTabs[0] && activeTabs[0].url ? activeTabs[0].url : "";

      if (currentUrl.includes("localhost:3000") || currentUrl.includes("127.0.0.1:3000")) {
        activeApiBase = "http://localhost:8000/api/v1";
        return activeApiBase;
      }
      if (currentUrl.includes("labelcropper.prayxis.in") || currentUrl.includes("prayxis.in")) {
        activeApiBase = "https://labelcropper.prayxis.in/api/v1";
        return activeApiBase;
      }

      // 2. Fallback to any open tab
      const allTabs = await chrome.tabs.query({});
      const prodTab = allTabs.find((t) => t.url && (t.url.includes("labelcropper.prayxis.in") || t.url.includes("prayxis.in")));
      if (prodTab) {
        activeApiBase = "https://labelcropper.prayxis.in/api/v1";
        return activeApiBase;
      }
      const localTab = allTabs.find((t) => t.url && t.url.includes("localhost:3000"));
      if (localTab) {
        activeApiBase = "http://localhost:8000/api/v1";
        return activeApiBase;
      }
    } catch {}
    activeApiBase = "https://labelcropper.prayxis.in/api/v1";
    return activeApiBase;
  }

  // --- Banner Notification ---
  function showBanner(msg, type = "info") {
    if (!vaultBanner || !bannerText) return;
    bannerText.textContent = msg;
    vaultBanner.className = `app-banner ${type}`;
    vaultBanner.style.display = "flex";
  }

  function hideBanner() {
    if (vaultBanner) vaultBanner.style.display = "none";
  }

  if (bannerCloseBtn) {
    bannerCloseBtn.addEventListener("click", hideBanner);
  }

  // --- Tab Switching ---
  function switchTab(tab) {
    currentTab = tab;
    hideBanner();

    if (tabPendingBtn) tabPendingBtn.classList.toggle("active", tab === "pending");
    if (tabHistoryBtn) tabHistoryBtn.classList.toggle("active", tab === "history");

    if (pendingView) pendingView.style.display = tab === "pending" ? "flex" : "none";
    if (historyView) historyView.style.display = tab === "history" ? "flex" : "none";

    if (tab === "pending") {
      renderPendingList();
    } else {
      renderHistoryList();
      syncCloudVaultState();
    }
    updateCtaButton();
  }

  if (tabPendingBtn) tabPendingBtn.addEventListener("click", () => switchTab("pending"));
  if (tabHistoryBtn) tabHistoryBtn.addEventListener("click", () => switchTab("history"));

  // --- Auth & Connect UI Management ---
  function updateAuthUI(auth) {
    if (auth && auth.isLoggedIn) {
      currentAuthState = auth;
      const uName = auth.user?.name || "Connected";
      const shortName = uName.length > 11 ? uName.slice(0, 9) + "…" : uName;

      if (authPill) {
        authPill.className = "auth-pill connected";
        authPill.title = `☁️ Connected as ${uName}. Multi-device cloud sync active. Click to open Dashboard.`;
        authPill.onclick = () => {
          const dashUrl = activeApiBase.includes("localhost")
            ? "http://localhost:3000/dashboard"
            : "https://labelcropper.prayxis.in/dashboard";
          chrome.tabs.create({ url: dashUrl });
        };
      }
      if (authDot) authDot.style.background = "#10B981";
      if (authStatusText) authStatusText.textContent = `☁️ ${shortName}`;
    } else {
      currentAuthState = { isLoggedIn: false, user: null, token: null };
      if (authPill) {
        authPill.className = "auth-pill disconnected";
        authPill.title = "Click to Connect your LabelFlow account to access PDFs from any device/browser.";
        authPill.onclick = async () => {
          showBanner("Connecting to LabelFlow account...", "info");
          await syncFromOpenTabs();
          if (currentAuthState && currentAuthState.isLoggedIn) {
            showBanner(`✓ Connected as ${currentAuthState.user?.name || "Seller"}!`, "success");
            await loadExtensionData(false);
          } else {
            const loginUrl = activeApiBase.includes("localhost")
              ? "http://localhost:3000/login"
              : "https://labelcropper.prayxis.in/login";
            chrome.tabs.create({ url: loginUrl });
          }
        };
      }
      if (authDot) authDot.style.background = "#F59E0B";
      if (authStatusText) authStatusText.textContent = "⚡ Connect";
    }
  }

  // Live Auth & History Extraction using chrome.scripting across open tabs
  async function syncFromOpenTabs() {
    try {
      const tabs = await chrome.tabs.query({});
      for (const t of tabs) {
        if (!t.id || !t.url) continue;
        const isTarget =
          t.url.includes("localhost:3000") ||
          t.url.includes("labelcropper.prayxis.in") ||
          t.url.includes("prayxis.in");

        if (isTarget) {
          try {
            if (chrome.scripting && chrome.scripting.executeScript) {
              const injectionResults = await chrome.scripting.executeScript({
                target: { tabId: t.id },
                func: () => {
                  try {
                    const token =
                      localStorage.getItem("labelflow_jwt_token") ||
                      localStorage.getItem("labelflow_token");
                    const userStr = localStorage.getItem("labelflow_user_profile");
                    const historyStr = localStorage.getItem("labelflow_local_history_48h");
                    let user = null;
                    if (userStr) {
                      try {
                        user = JSON.parse(userStr);
                      } catch {}
                    }
                    return { token, user, historyStr };
                  } catch {
                    return null;
                  }
                },
              });

              if (injectionResults && injectionResults[0] && injectionResults[0].result) {
                const { token, user, historyStr } = injectionResults[0].result;
                if (token) {
                  updateAuthUI({
                    isLoggedIn: true,
                    user: user || { name: "Seller" },
                    token: token,
                  });
                }
                if (historyStr) {
                  try {
                    const items = JSON.parse(historyStr);
                    if (Array.isArray(items) && items.length > 0) {
                      historyItems = items;
                      if (historyTabCount) historyTabCount.textContent = String(items.length);
                      await VaultStorage.syncLocalHistoryItems(items);
                      if (currentTab === "history") {
                        renderHistoryList();
                      }
                    }
                  } catch {}
                }
              }
            }
          } catch (e) {
            console.debug("Script injection check:", e);
          }
        }
      }
    } catch (err) {
      console.debug("Tab query error:", err);
    }
  }

  // --- CTA Button & Badge Synchronization ---
  function updateCtaButton() {
    const selectedCount = pendingItems.filter((i) => i.selected).length;
    if (cropBtnText) {
      cropBtnText.textContent = `Print Selected (${selectedCount})`;
    }
    if (cropSelectedBtn) {
      cropSelectedBtn.disabled = selectedCount === 0;
      if (selectedCount > 0) {
        cropSelectedBtn.classList.remove("disabled-btn");
      } else {
        cropSelectedBtn.classList.add("disabled-btn");
      }
    }
    if (selectedCountBadge) {
      selectedCountBadge.textContent = `${selectedCount} / ${pendingItems.length} Selected`;
    }

    // Dynamic icon badge: strictly represents unprinted pending labels count across all devices!
    const pendingTotal = pendingItems.length;
    if (pendingTabCount) pendingTabCount.textContent = String(pendingTotal);
    chrome.runtime.sendMessage({
      action: "UPDATE_VAULT_BADGE",
      count: pendingTotal,
    });
  }

  // --- Render Pending Labels Queue (TAB 1) ---
  function renderPendingList() {
    if (!pendingItemsList) return;

    if (pendingItems.length === 0) {
      if (pendingEmptyState) pendingEmptyState.style.display = "flex";
      pendingItemsList.innerHTML = "";
      updateCtaButton();
      return;
    }

    if (pendingEmptyState) pendingEmptyState.style.display = "none";
    pendingItemsList.innerHTML = "";

    pendingItems.forEach((item, index) => {
      const card = document.createElement("div");
      card.className = `queue-card ${item.selected ? "selected" : ""}`;

      // Left Column: Checkbox + Content
      const cardLeft = document.createElement("div");
      cardLeft.className = "card-left";

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.className = "card-checkbox";
      cb.checked = Boolean(item.selected);
      cb.title = "Select to print & crop";
      cb.addEventListener("change", async (e) => {
        item.selected = e.target.checked;
        card.classList.toggle("selected", item.selected);
        if (item.id && !item.isCloud) {
          await VaultStorage.updateVaultSelection(item.id, item.selected);
        }
        updateCtaButton();
      });
      cardLeft.appendChild(cb);

      const content = document.createElement("div");
      content.className = "card-content";

      const title = document.createElement("span");
      title.className = "card-title";
      title.textContent = item.name;
      title.title = item.name;
      content.appendChild(title);

      const meta = document.createElement("div");
      meta.className = "card-meta";

      const platformClass = (item.platform || "Meesho").replace(/\s+/g, "");
      const pill = document.createElement("span");
      pill.className = `platform-pill ${platformClass}`;
      pill.textContent = item.platform || "Meesho";
      meta.appendChild(pill);

      // Cloud Origin Tag (indicates multi-device synced file)
      if (item.isCloud) {
        const cloudTag = document.createElement("span");
        cloudTag.className = "cloud-tag";
        cloudTag.textContent = "☁️ Cloud";
        cloudTag.title = "Uploaded from your account. Synced across all your browsers.";
        meta.appendChild(cloudTag);
      }

      const sizeSpan = document.createElement("span");
      sizeSpan.textContent = formatBytes(item.size);
      meta.appendChild(sizeSpan);

      const timeText = formatRelativeOrDate(item.dateAdded || item.uploaded_at || Date.now());
      if (timeText) {
        const timeSpan = document.createElement("span");
        timeSpan.textContent = `• ${timeText}`;
        meta.appendChild(timeSpan);
      }

      content.appendChild(meta);
      cardLeft.appendChild(content);

      // Right Column: Ready status + Delete
      const cardRight = document.createElement("div");
      cardRight.className = "card-right";

      const hasValidBytes = (item.size && item.size > 50) || item.isCloud || item.hasBlob || Boolean(item.base64 || item.buffer || item.blob);
      const tag = document.createElement("span");
      if (hasValidBytes) {
        tag.className = "tag-ready";
        tag.textContent = "✓ Ready";
      } else {
        tag.className = "tag-warning";
        tag.textContent = "⚠️ 0 B (Re-upload)";
        tag.title = "No PDF data found (0 B). Click '✕' to remove and re-upload with '+ Upload PDFs'.";
      }
      cardRight.appendChild(tag);

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "btn-delete-row";
      delBtn.innerHTML = "✕";
      delBtn.title = "Remove from list";
      delBtn.addEventListener("click", async (e) => {
        e.stopPropagation();

        // 1. If cloud item, delete from server
        if (item.isCloud && item.fileId && currentAuthState && currentAuthState.token) {
          try {
            fetch(`${activeApiBase}/cloud-vault/${item.fileId}`, {
              method: "DELETE",
              headers: { Authorization: `Bearer ${currentAuthState.token}` },
            }).catch(() => {});
          } catch {}
        }

        // 2. If stored locally, move to trash in IndexedDB
        if (item.id && !item.isCloud) {
          await VaultStorage.moveVaultFilesToTrash([item.id]);
        }

        pendingItems.splice(index, 1);
        renderPendingList();
        updateCtaButton();
        showBanner(`Removed "${item.name}" from pending list.`, "info");
      });
      cardRight.appendChild(delBtn);

      card.appendChild(cardLeft);
      card.appendChild(cardRight);

      // Clicking card toggles selection
      card.addEventListener("click", (e) => {
        if (e.target.closest("button") || e.target.closest("input")) return;
        cb.checked = !cb.checked;
        cb.dispatchEvent(new Event("change"));
      });

      pendingItemsList.appendChild(card);
    });

    updateCtaButton();
  }

  // --- Render Printed History (TAB 2) ---
  function renderHistoryList() {
    if (!historyItemsList) return;

    if (historyItems.length === 0) {
      if (historyEmptyState) historyEmptyState.style.display = "flex";
      historyItemsList.innerHTML = "";
      if (historyTabCount) historyTabCount.textContent = "0";
      return;
    }

    if (historyEmptyState) historyEmptyState.style.display = "none";
    historyItemsList.innerHTML = "";
    if (historyTabCount) historyTabCount.textContent = String(historyItems.length);

    historyItems.forEach((item, index) => {
      const row = document.createElement("div");
      row.className = `history-row ${item.selected ? "selected" : ""}`;

      // Checkbox for bulk re-print
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.className = "card-checkbox";
      cb.checked = Boolean(item.selected);
      cb.title = "Select to re-print";
      cb.addEventListener("change", (e) => {
        item.selected = e.target.checked;
        row.classList.toggle("selected", item.selected);
      });
      row.appendChild(cb);

      // Icon Box
      const iconBox = document.createElement("div");
      iconBox.className = "history-icon-box";
      iconBox.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14 2 14 8 20 8"></polyline>
          <line x1="16" y1="13" x2="8" y2="13"></line>
          <line x1="16" y1="17" x2="8" y2="17"></line>
        </svg>
      `;
      row.appendChild(iconBox);

      // Content Col: Name, metadata (matches website 1:1)
      const content = document.createElement("div");
      content.className = "card-content";

      const title = document.createElement("span");
      title.className = "history-title";
      title.textContent = item.filename || item.name || "cropped_labels.pdf";
      title.title = title.textContent;
      content.appendChild(title);

      const meta = document.createElement("div");
      meta.className = "history-meta";

      const timeText = formatRelativeOrDate(item.printedAt || item.created_at || item.dateAdded);
      const labelsText = item.total_labels ? `${item.total_labels} Labels` : "Cropped Labels";
      const sizeText = item.formatted_size || "Thermal 4×6";
      const badgeText = item.type_badge || "Label Only";

      const timeSpan = document.createElement("span");
      timeSpan.textContent = timeText;

      const dot1 = document.createElement("span");
      dot1.textContent = "•";

      const sizeSpan = document.createElement("span");
      sizeSpan.textContent = sizeText;

      const dot2 = document.createElement("span");
      dot2.textContent = "•";

      const labelsSpan = document.createElement("span");
      labelsSpan.textContent = labelsText;

      const badgeSpan = document.createElement("span");
      badgeSpan.className = "badge-label-only";
      badgeSpan.textContent = badgeText;

      meta.appendChild(timeSpan);
      meta.appendChild(dot1);
      meta.appendChild(sizeSpan);
      meta.appendChild(dot2);
      meta.appendChild(labelsSpan);
      meta.appendChild(badgeSpan);

      content.appendChild(meta);
      row.appendChild(content);

      // Actions Col: View, Download, Delete
      const actions = document.createElement("div");
      actions.className = "row-action-btns";

      if (item.view_url) {
        const viewBtn = document.createElement("a");
        viewBtn.className = "action-icon-btn view";
        viewBtn.title = "View cropped PDF";
        viewBtn.href = item.view_url;
        viewBtn.target = "_blank";
        viewBtn.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>
        `;
        actions.appendChild(viewBtn);
      }

      if (item.download_url) {
        const dlBtn = document.createElement("a");
        dlBtn.className = "action-icon-btn download";
        dlBtn.title = "Download cropped PDF";
        dlBtn.href = item.download_url;
        dlBtn.download = item.filename || "cropped_labels.pdf";
        dlBtn.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
        `;
        actions.appendChild(dlBtn);
      }

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "action-icon-btn delete";
      delBtn.title = "Delete from history";
      delBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
      `;
      delBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        await VaultStorage.moveVaultFilesToTrash([item.id || item.job_id]);
        historyItems.splice(index, 1);
        renderHistoryList();
        showBanner(`Removed "${item.filename || item.name}" from history.`, "info");
      });
      actions.appendChild(delBtn);

      row.appendChild(actions);
      historyItemsList.appendChild(row);
    });
  }

  // --- Cross-Browser Server Cloud Vault Sync Engine ---
  let isSyncing = false;
  async function syncCloudVaultState() {
    if (isSyncing) return;
    if (!currentAuthState || !currentAuthState.isLoggedIn || !currentAuthState.token) return;

    isSyncing = true;
    try {
      const resp = await fetch(`${activeApiBase}/cloud-vault/sync`, {
        headers: {
          Authorization: `Bearer ${currentAuthState.token}`,
        },
      });

      if (!resp || !resp.ok) {
        isSyncing = false;
        return;
      }

      const syncData = await resp.json();
      const pending = Array.isArray(syncData.pending) ? syncData.pending : [];
      const printedFilenames = Array.isArray(syncData.printed_filenames) ? syncData.printed_filenames : [];
      const serverHistory = Array.isArray(syncData.history) ? syncData.history : [];

      // 1. Determine latest print timestamp across history batches
      let latestPrintTime = 0;
      for (const h of serverHistory) {
        const t = Number(h.printedAt || h.created_at || 0);
        if (t > latestPrintTime) latestPrintTime = t;
      }

      // 2. Build exact set of printed filenames (exact lowercase names & basenames)
      const printedSet = new Set();
      for (const fn of printedFilenames) {
        if (!fn) continue;
        const clean = fn.toLowerCase().trim();
        printedSet.add(clean);
        const base = clean.split(/[/\\]/).pop();
        if (base) printedSet.add(base);
      }
      for (const h of serverHistory) {
        if (Array.isArray(h.original_files)) {
          for (const orig of h.original_files) {
            if (!orig) continue;
            const clean = orig.toLowerCase().trim();
            printedSet.add(clean);
            const base = clean.split(/[/\\]/).pop();
            if (base) printedSet.add(base);
          }
        }
      }

      // 3. Cross-device acknowledgment: Check local ready items
      // ONLY mark a local ready file as printed if it was added BEFORE the print job occurred!
      // If user freshly added or re-added it after latestPrintTime, it is a new pending upload.
      const localStored = await VaultStorage.getStoredVaultFiles(false);
      const localToPrint = [];

      for (const it of localStored) {
        const n = (it.name || "").toLowerCase().trim();
        const base = n.split(/[/\\]/).pop();
        const isMatch = printedSet.has(n) || (base && printedSet.has(base));

        if (isMatch) {
          const itemTime = Number(it.dateAdded || 0);
          if (latestPrintTime > 0 && itemTime > 0 && itemTime <= latestPrintTime) {
            localToPrint.push(it.id || it.name);
          }
        }
      }

      if (localToPrint.length > 0) {
        await VaultStorage.moveVaultFilesToPrinted(localToPrint);
      }

      // 4. Build active Pending list: ALWAYS preserve all active ready items in IndexedDB!
      const activePendingMap = new Map();
      const updatedLocal = await VaultStorage.getStoredVaultFiles(false);

      for (const it of updatedLocal) {
        const n = (it.name || "").toLowerCase().trim();
        activePendingMap.set(n, {
          ...it,
          isReady: true,
          isStored: true,
          isCloud: false,
          selected: it.selected !== undefined ? it.selected : true,
        });
      }

      // 5. Merge unprinted pending files from Server Cloud Queue
      for (const cq of pending) {
        const fn = (cq.filename || "").toLowerCase().trim();
        if (activePendingMap.has(fn)) {
          const existing = activePendingMap.get(fn);
          existing.isCloud = true;
          existing.fileId = cq.file_id;
        } else {
          activePendingMap.set(fn, {
            id: cq.file_id,
            fileId: cq.file_id,
            name: cq.filename,
            size: cq.file_size,
            platform: cq.platform,
            status: "ready",
            isReady: true,
            isStored: false,
            isCloud: true,
            selected: true,
            dateAdded: new Date(cq.uploaded_at).getTime(),
          });
        }
      }

      pendingItems = Array.from(activePendingMap.values());

      // 6. Update Printed History tab from Server
      if (serverHistory.length > 0) {
        historyItems = serverHistory;
        await VaultStorage.syncLocalHistoryItems(serverHistory);
      } else {
        const localPrinted = await VaultStorage.getPrintedVaultFiles();
        historyItems = localPrinted || [];
      }

      if (historyTabCount) historyTabCount.textContent = String(historyItems.length);
      if (pendingTabCount) pendingTabCount.textContent = String(pendingItems.length);

      // 7. Refresh active UI tab
      if (currentTab === "pending") {
        renderPendingList();
      } else {
        renderHistoryList();
      }
      updateCtaButton();
    } catch (err) {
      console.debug("syncCloudVaultState error:", err);
    } finally {
      isSyncing = false;
    }
  }

  // --- Core Loader: Merges Local Stored Files + Server Cloud Queue (Multi-Device) ---
  async function loadExtensionData(showLoading = false) {
    try {
      // 1. FAST PATH: Immediately render local files in 5ms!
      const localStored = await VaultStorage.getStoredVaultFiles(false);
      const localMapped = (localStored || []).map((it) => ({
        ...it,
        isReady: true,
        isStored: true,
        isCloud: false,
        selected: it.selected !== undefined ? it.selected : true,
      }));

      pendingItems = [...localMapped];

      if (currentTab === "pending") {
        renderPendingList();
      } else {
        renderHistoryList();
      }
      updateCtaButton();

      // 2. CONCURRENT BACKGROUND SYNC: Check tabs, auth, and cloud queue without blocking the UI!
      (async () => {
        await Promise.all([syncFromOpenTabs(), resolveApiBase()]);
        await syncCloudVaultState();
      })();
    } catch (err) {
      console.error("loadExtensionData error:", err);
    }
  }

  window.addEventListener("focus", () => {
    syncCloudVaultState();
  });

  // --- Upload PDF Handlers ---
  function triggerUploadDialog() {
    if (pdfFileInput) {
      pdfFileInput.value = "";
      pdfFileInput.click();
    }
  }

  if (headerUploadBtn) headerUploadBtn.addEventListener("click", triggerUploadDialog);
  if (emptyUploadBtn) emptyUploadBtn.addEventListener("click", triggerUploadDialog);
  if (addMoreBtn) addMoreBtn.addEventListener("click", triggerUploadDialog);

  // Helper: Prompts sleek modal dialog for already printed files
  function promptAlreadyPrintedConfirmation(printedFileNames) {
    return new Promise((resolve) => {
      if (!duplicateModal || !duplicateModalMessage || !duplicateModalYesBtn || !duplicateModalNoBtn) {
        const msg =
          printedFileNames.length === 1
            ? `Ye file already print ho chuki hai: "${printedFileNames[0]}".\n\nKya aap isko Pending Labels me add karna chahte hain?`
            : `${printedFileNames.length} files already print ho chuki hain:\n• ${printedFileNames.join("\n• ")}\n\nKya aap inko Pending Labels me add karna chahte hain?`;
        resolve(window.confirm(msg));
        return;
      }

      if (printedFileNames.length === 1) {
        duplicateModalMessage.innerHTML = `File <strong>"${printedFileNames[0]}"</strong> already print ho chuki hai.<br><br>Kya aap isko <strong>Pending Labels</strong> me add karke re-print karna chahte hain?`;
        if (duplicateModalFilesList) duplicateModalFilesList.style.display = "none";
      } else {
        duplicateModalMessage.innerHTML = `<strong>${printedFileNames.length} files</strong> already print ho chuki hain.<br><br>Kya aap inko <strong>Pending Labels</strong> me add karke re-print karna chahte hain?`;
        if (duplicateModalFilesList) {
          duplicateModalFilesList.innerHTML = printedFileNames
            .map((fn) => `<div class="modal-file-pill">• ${fn}</div>`)
            .join("");
          duplicateModalFilesList.style.display = "flex";
        }
      }

      duplicateModal.style.display = "flex";

      const handleYes = () => {
        cleanup();
        resolve(true);
      };

      const handleNo = () => {
        cleanup();
        resolve(false);
      };

      const cleanup = () => {
        duplicateModal.style.display = "none";
        duplicateModalYesBtn.removeEventListener("click", handleYes);
        duplicateModalNoBtn.removeEventListener("click", handleNo);
      };

      duplicateModalYesBtn.addEventListener("click", handleYes);
      duplicateModalNoBtn.addEventListener("click", handleNo);
    });
  }

  // Unified File Upload Handler with Duplicate Printed Detection
  async function handleUploadFiles(files) {
    if (!files || files.length === 0) return;
    hideBanner();

    try {
      // 1. Collect all known printed filenames across local vault & server history
      const printedNameSet = new Set();

      const localPrinted = await VaultStorage.getPrintedVaultFiles();
      for (const pf of (localPrinted || [])) {
        if (pf.name) {
          printedNameSet.add(pf.name.toLowerCase().trim());
          const b = pf.name.split(/[/\\]/).pop();
          if (b) printedNameSet.add(b.toLowerCase().trim());
        }
        if (pf.filename) {
          printedNameSet.add(pf.filename.toLowerCase().trim());
          const b = pf.filename.split(/[/\\]/).pop();
          if (b) printedNameSet.add(b.toLowerCase().trim());
        }
        if (Array.isArray(pf.original_files)) {
          for (const orig of pf.original_files) {
            if (orig) {
              printedNameSet.add(orig.toLowerCase().trim());
              const b = orig.split(/[/\\]/).pop();
              if (b) printedNameSet.add(b.toLowerCase().trim());
            }
          }
        }
      }

      for (const h of (historyItems || [])) {
        if (h.name) printedNameSet.add(h.name.toLowerCase().trim());
        if (h.filename) printedNameSet.add(h.filename.toLowerCase().trim());
        if (Array.isArray(h.original_files)) {
          for (const orig of h.original_files) {
            if (orig) {
              printedNameSet.add(orig.toLowerCase().trim());
              const b = orig.split(/[/\\]/).pop();
              if (b) printedNameSet.add(b.toLowerCase().trim());
            }
          }
        }
      }

      // 2. Classify uploaded files into: freshFiles and alreadyPrintedFiles
      const alreadyPrintedFiles = [];
      const freshFiles = [];

      for (const file of files) {
        const rawName = file.name || "";
        const lowerName = rawName.toLowerCase().trim();
        const baseName = lowerName.split(/[/\\]/).pop();

        const isPrinted = printedNameSet.has(lowerName) || (baseName && printedNameSet.has(baseName));

        if (isPrinted) {
          alreadyPrintedFiles.push(file);
        } else {
          freshFiles.push(file);
        }
      }

      let filesToProcess = [];

      // 3. If any file is already printed, show confirmation popup!
      if (alreadyPrintedFiles.length > 0) {
        const names = alreadyPrintedFiles.map((f) => f.name);
        const shouldAddPrinted = await promptAlreadyPrintedConfirmation(names);

        if (shouldAddPrinted) {
          // User clicked YES -> Add both fresh files and already printed files to Pending
          filesToProcess = [...freshFiles, ...alreadyPrintedFiles];
        } else {
          // User clicked NO -> Do NOT upload / add the already printed files
          if (freshFiles.length > 0) {
            filesToProcess = [...freshFiles];
            showBanner(`Printed file(s) skipped. Adding ${freshFiles.length} fresh file(s)...`, "info");
          } else {
            showBanner("Upload cancelled — already printed file(s) not added.", "info");
            return;
          }
        }
      } else {
        filesToProcess = files;
      }

      if (filesToProcess.length === 0) return;

      // 4. Ingest accepted files into local Vault and Cloud Queue
      const cloudFormData = new FormData();
      const readPromises = filesToProcess.map(async (file) => {
        const buffer = await file.arrayBuffer();
        const base64 = bufferToBase64(buffer);
        const blob = new Blob([buffer], { type: file.type || "application/pdf" });
        const classification = VaultStorage.classifyDownloadItem({ filename: file.name });
        const platform = classification.isEligible ? classification.platform : "Shipping Label";

        cloudFormData.append("files", file);

        return {
          name: file.name,
          buffer: buffer,
          base64: base64,
          blob: blob,
          size: file.size,
          type: file.type || "application/pdf",
          platform: platform,
        };
      });

      const itemsToSave = await Promise.all(readPromises);

      // Save locally and immediately render in 10ms!
      const added = await VaultStorage.addFilesToVault(itemsToSave);
      showBanner(`✓ Added ${added.length} shipping label PDF(s) to Pending Labels!`, "success");
      switchTab("pending");
      await loadExtensionData(false);

      // Background cloud upload without freezing UI
      if (currentAuthState && currentAuthState.isLoggedIn && currentAuthState.token) {
        fetch(`${activeApiBase}/cloud-vault/upload`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${currentAuthState.token}`,
          },
          body: cloudFormData,
        })
          .then((r) => r.ok && loadExtensionData(false))
          .catch(() => {});
      }
    } catch (err) {
      showBanner("Error saving PDF files: " + err.message, "error");
    }
  }

  // Ingest Selected PDF Files
  if (pdfFileInput) {
    pdfFileInput.addEventListener("change", (e) => {
      const files = Array.from(e.target.files || []);
      pdfFileInput.value = "";
      handleUploadFiles(files);
    });
  }

  // Support Drag and Drop onto Popup Window
  const popupContainer = document.querySelector(".popup-container");
  if (popupContainer) {
    popupContainer.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    popupContainer.addEventListener("drop", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const files = Array.from(e.dataTransfer?.files || []).filter((f) =>
        f.name.toLowerCase().endsWith(".pdf")
      );
      if (files.length > 0) {
        handleUploadFiles(files);
      }
    });
  }

  // --- Pending Queue Selection Actions ---
  if (selectAllBtn) {
    selectAllBtn.addEventListener("click", async () => {
      pendingItems.forEach((i) => (i.selected = true));
      await VaultStorage.setAllVaultSelection(true);
      renderPendingList();
    });
  }

  if (deselectAllBtn) {
    deselectAllBtn.addEventListener("click", async () => {
      pendingItems.forEach((i) => (i.selected = false));
      await VaultStorage.setAllVaultSelection(false);
      renderPendingList();
    });
  }

  if (trashSelectedBtn) {
    trashSelectedBtn.addEventListener("click", async () => {
      const selected = pendingItems.filter((i) => i.selected);
      if (selected.length === 0) {
        showBanner("Please select at least 1 label to delete.", "info");
        return;
      }

      // Delete cloud items
      if (currentAuthState && currentAuthState.token) {
        for (const it of selected) {
          if (it.isCloud && it.fileId) {
            fetch(`${activeApiBase}/cloud-vault/${it.fileId}`, {
              method: "DELETE",
              headers: { Authorization: `Bearer ${currentAuthState.token}` },
            }).catch(() => {});
          }
        }
      }

      // Delete local items
      const localIds = selected.filter((it) => !it.isCloud && it.id).map((it) => it.id);
      if (localIds.length > 0) {
        await VaultStorage.moveVaultFilesToTrash(localIds);
      }

      pendingItems = pendingItems.filter((i) => !i.selected);
      renderPendingList();
      showBanner(`Removed ${selected.length} label(s) from pending list.`, "info");
    });
  }

  // --- History Selection Actions ---
  if (selectAllHistoryBtn) {
    selectAllHistoryBtn.addEventListener("click", () => {
      historyItems.forEach((i) => (i.selected = true));
      renderHistoryList();
    });
  }

  if (deselectAllHistoryBtn) {
    deselectAllHistoryBtn.addEventListener("click", () => {
      historyItems.forEach((i) => (i.selected = false));
      renderHistoryList();
    });
  }

  if (reprintSelectedBtn) {
    reprintSelectedBtn.addEventListener("click", async () => {
      const selected = historyItems.filter((i) => i.selected);
      if (selected.length === 0) {
        showBanner("Please select at least 1 history batch to re-print.", "info");
        return;
      }
      showBanner(`Preparing ${selected.length} batch(es) for re-print...`, "info");

      // Hydrate binary from server or cache before restoring to pending queue
      const validItems = [];
      const failedItems = [];
      for (const item of selected) {
        let base64 = null;
        try {
          base64 = await ensureItemBinary(item);
        } catch {}
        if (base64) {
          validItems.push(item);
        } else {
          failedItems.push(item.filename || item.name || "batch");
        }
      }

      if (validItems.length === 0) {
        showBanner(
          `Original PDF binary nahi mila (${failedItems.join(", ")}). Kripya '+ Upload PDFs' se asli PDF upload karein.`,
          "error"
        );
        return;
      }

      const ids = validItems.map((i) => i.id || i.job_id);
      await VaultStorage.reprintVaultFiles(ids);
      if (failedItems.length > 0) {
        showBanner(
          `Restored ${validItems.length} batch(es). (${failedItems.join(", ")} me data nahi mila — please re-upload).`,
          "info"
        );
      } else {
        showBanner(`✓ Restored ${validItems.length} batch(es) to Pending Labels!`, "success");
      }
      switchTab("pending");
      await loadExtensionData(false);
    });
  }

  if (clearHistoryBtn) {
    clearHistoryBtn.addEventListener("click", async () => {
      if (historyItems.length === 0) return;
      if (confirm(`Clear all ${historyItems.length} processing history item(s)?`)) {
        const ids = historyItems.map((i) => i.id || i.job_id);
        await VaultStorage.moveVaultFilesToTrash(ids);
        historyItems = [];
        renderHistoryList();
        showBanner("History cleared.", "info");
      }
    });
  }

  // Helper: Retrieve valid Base64 PDF binary for any pending item (Local, Cloud, History, or Chrome Download)
  async function ensureItemBinary(item) {
    if (!item) return null;

    // 1. In-memory base64 check
    if (item.base64 && typeof item.base64 === "string" && item.base64.length > 50) {
      return item.base64;
    }

    // 2. In-memory buffer check
    if (item.buffer && (item.buffer instanceof ArrayBuffer || ArrayBuffer.isView(item.buffer))) {
      item.base64 = bufferToBase64(item.buffer);
      return item.base64;
    }

    // 3. In-memory blob check
    if (item.blob && typeof item.blob.arrayBuffer === "function") {
      try {
        const buf = await item.blob.arrayBuffer();
        if (buf && buf.byteLength > 50) {
          item.buffer = buf;
          item.base64 = bufferToBase64(buf);
          item.size = buf.byteLength;
          return item.base64;
        }
      } catch {}
    }

    // 4. IndexedDB cache check by record ID
    if (item.id) {
      try {
        const rec = await VaultStorage.getVaultRecordById(item.id);
        if (rec) {
          if (rec.base64 && typeof rec.base64 === "string" && rec.base64.length > 50) {
            item.base64 = rec.base64;
            item.size = rec.size || item.size;
            return item.base64;
          }
          if (rec.buffer && (rec.buffer instanceof ArrayBuffer || ArrayBuffer.isView(rec.buffer))) {
            item.buffer = rec.buffer;
            item.base64 = bufferToBase64(rec.buffer);
            item.size = rec.buffer.byteLength;
            return item.base64;
          }
          if (rec.blob && typeof rec.blob.arrayBuffer === "function") {
            const buf = await rec.blob.arrayBuffer();
            if (buf && buf.byteLength > 50) {
              item.buffer = buf;
              item.base64 = bufferToBase64(buf);
              item.size = buf.byteLength;
              return item.base64;
            }
          }
          if (!item.download_url && rec.download_url) item.download_url = rec.download_url;
          if (!item.view_url && rec.view_url) item.view_url = rec.view_url;
          if (!item.fileId && rec.fileId) item.fileId = rec.fileId;
          if (!item.job_id && rec.job_id) item.job_id = rec.job_id;
        }
      } catch {}
    }

    // 5. Cloud Vault Server Download by fileId
    if (item.fileId && currentAuthState && currentAuthState.token) {
      try {
        const resp = await fetch(`${activeApiBase}/cloud-vault/download/${item.fileId}`, {
          headers: { Authorization: `Bearer ${currentAuthState.token}` },
        });
        if (resp && resp.ok) {
          const buf = await resp.arrayBuffer();
          if (buf && buf.byteLength > 50) {
            item.buffer = buf;
            item.base64 = bufferToBase64(buf);
            item.size = buf.byteLength;
            // Cache in IndexedDB for instant future access
            await VaultStorage.addFilesToVault([
              {
                name: item.name,
                buffer: buf,
                base64: item.base64,
                blob: new Blob([buf], { type: "application/pdf" }),
                size: buf.byteLength,
                type: "application/pdf",
                platform: item.platform || "Shipping Label",
              },
            ]);
            return item.base64;
          }
        }
      } catch (err) {
        console.warn("Cloud download failed for", item.name, err);
      }
    }

    // 6. Direct URL download (reprinted history batches, download_url, view_url, job_id)
    const candidateUrls = [];
    if (item.download_url) candidateUrls.push(item.download_url);
    if (item.view_url) candidateUrls.push(item.view_url);
    if (item.job_id) {
      candidateUrls.push(`${activeApiBase}/labels/jobs/${item.job_id}/download/pdf`);
      candidateUrls.push(`${activeApiBase}/jobs/${item.job_id}/download`);
    }

    for (const rawUrl of candidateUrls) {
      try {
        let fullUrl = rawUrl;
        if (fullUrl.startsWith("/")) {
          const origin = activeApiBase.replace(/\/api\/v1\/?$/, "");
          fullUrl = `${origin}${fullUrl}`;
        }
        const headers = {};
        if (currentAuthState && currentAuthState.token) {
          headers["Authorization"] = `Bearer ${currentAuthState.token}`;
        }
        const resp = await fetch(fullUrl, { headers });
        if (resp && resp.ok) {
          const buf = await resp.arrayBuffer();
          if (buf && buf.byteLength > 50) {
            item.buffer = buf;
            item.base64 = bufferToBase64(buf);
            item.size = buf.byteLength;
            // Cache in IndexedDB
            await VaultStorage.addFilesToVault([
              {
                name: item.name,
                buffer: buf,
                base64: item.base64,
                blob: new Blob([buf], { type: "application/pdf" }),
                size: buf.byteLength,
                type: "application/pdf",
                platform: item.platform || "Shipping Label",
              },
            ]);
            return item.base64;
          }
        }
      } catch (err) {
        console.warn("Candidate URL download failed for", item.name, rawUrl, err);
      }
    }

    // 7. Chrome Downloads fallback (search by downloadId or query by name)
    if (typeof chrome !== "undefined" && chrome.downloads) {
      try {
        let queryArgs = null;
        if (item.downloadId) {
          queryArgs = { id: Number(item.downloadId) };
        } else if (item.name) {
          queryArgs = { query: [item.name], limit: 5 };
        }
        if (queryArgs) {
          const results = await chrome.downloads.search(queryArgs);
          for (const resItem of results || []) {
            if (
              resItem &&
              resItem.url &&
              (resItem.url.startsWith("http://") ||
                resItem.url.startsWith("https://") ||
                resItem.url.startsWith("blob:"))
            ) {
              try {
                const resp = await fetch(resItem.url);
                if (resp && resp.ok) {
                  const buf = await resp.arrayBuffer();
                  if (buf && buf.byteLength > 50) {
                    item.buffer = buf;
                    item.base64 = bufferToBase64(buf);
                    item.size = buf.byteLength;
                    await VaultStorage.addFilesToVault([
                      {
                        name: item.name,
                        buffer: buf,
                        base64: item.base64,
                        blob: new Blob([buf], { type: "application/pdf" }),
                        size: buf.byteLength,
                        type: "application/pdf",
                        platform: item.platform || "Shipping Label",
                      },
                    ]);
                    return item.base64;
                  }
                }
              } catch {}
            }
          }
        }
      } catch {}
    }
      } catch {}
    }

    return null;
  }

  // --- Main Action: Print Selected (N) with Cloud Binary Retrieval ---
  if (cropSelectedBtn) {
    cropSelectedBtn.addEventListener("click", async () => {
      const selected = pendingItems.filter((i) => i.selected);
      if (selected.length === 0) {
        showBanner("Please select at least 1 label to print & crop.", "error");
        return;
      }

      // Gatekeeper Check: Ensure user is connected
      if (!currentAuthState || !currentAuthState.isLoggedIn) {
        await syncFromOpenTabs();
      }

      if (!currentAuthState || !currentAuthState.isLoggedIn) {
        showBanner(
          "🔒 Login Required: PDF upload & auto-crop use karne ke liye pehle login karein (Free Account).",
          "error"
        );
        chrome.tabs.create({ url: "https://labelcropper.prayxis.in/login" });
        return;
      }

      hideBanner();
      cropSelectedBtn.disabled = true;
      if (cropBtnText) cropBtnText.textContent = `Preparing ${selected.length} PDF(s)...`;

      // 1. Download & Hydrate all selected binaries in parallel
      const cloudFileIds = [];
      const cloudFilenames = [];
      const failedItems = [];
      const filePayloads = [];

      for (let i = 0; i < selected.length; i++) {
        const item = selected[i];
        if (item.isCloud && item.fileId) {
          cloudFileIds.push(item.fileId);
          cloudFilenames.push(item.name);
        }

        if (cropBtnText) {
          cropBtnText.textContent = `Loading PDF ${i + 1}/${selected.length}...`;
        }

        const base64 = await ensureItemBinary(item);
        if (base64) {
          filePayloads.push({
            id: item.id || item.fileId || `payload_${Date.now()}_${i}`,
            name: item.name || item.filename || "shipping_label.pdf",
            size: item.size || Math.round((base64.length * 3) / 4),
            type: "application/pdf",
            platform: item.platform || "Shipping Label",
            base64: base64,
          });
        } else {
          failedItems.push(item.name || "Untitled PDF");
        }
      }

      if (filePayloads.length === 0) {
        cropSelectedBtn.disabled = false;
        updateCtaButton();
        const namesList = failedItems.length > 0 ? failedItems.join(", ") : "Selected file(s)";
        showBanner(
          `⚠️ "${namesList}" me PDF data nahi mila (0 B). Kripya isko '✕' se delete karke '+ Upload PDFs' se fresh file upload karein.`,
          "error"
        );
        return;
      }

      if (cropBtnText) cropBtnText.textContent = `Transferring ${filePayloads.length} PDF(s) to LabelFlow...`;

      // 2. Dispatch to LabelFlow website for 4x6 thermal cropping with direct payloads
      chrome.runtime.sendMessage(
        {
          action: "SEND_TO_LABELFLOW",
          filePayloads: filePayloads,
          cloudFileIds: cloudFileIds,
          cloudFilenames: cloudFilenames,
        },
        async (response) => {
          if (response && response.success) {
            if (cropBtnText) cropBtnText.textContent = `✓ Transferred! Cropping in LabelFlow...`;

            // 3. Mark cloud queue items as printed on server (Global Acknowledgment!)
            if (cloudFileIds.length > 0 && currentAuthState && currentAuthState.token) {
              try {
                fetch(`${activeApiBase}/cloud-vault/mark-printed`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${currentAuthState.token}`,
                  },
                  body: JSON.stringify({
                    file_ids: cloudFileIds,
                    filenames: cloudFilenames,
                  }),
                }).catch(() => {});
              } catch {}
            }

            setTimeout(() => {
              window.close();
            }, 700);
          } else {
            cropSelectedBtn.disabled = false;
            updateCtaButton();
            showBanner(response?.error || "Error transferring files to website.", "error");
          }
        }
      );
    });
  }

  // Listen for realtime data updates / acknowledgments from background
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && (msg.action === "UPDATE_VAULT_BADGE" || msg.action === "VAULT_DATA_CHANGED")) {
      loadExtensionData(false);
    }
  });

  // Initial load
  loadExtensionData(true);
});
