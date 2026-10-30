# LabelFlow Chrome Extension — PDF Vault & 1-Click Cropper Guide

## 1. What's New: PDF Vault Architecture

The extension has been upgraded to a **Local PDF Vault Architecture**:
- **Zero Downloads Folder Permissions Needed**: No more browser folder permission requests, and no more *"Can't open this folder because it contains system files"* errors.
- **Persistent IndexedDB Vault Storage**: Real PDF binary data (`Blob` / `ArrayBuffer`) and metadata are safely stored in IndexedDB within the extension.
- **Add PDF Files**: Click **➕ Add PDF** in the popup to import any shipping label PDF directly into the Vault.
- **Trash & Recovery**: Successfully cropped PDFs or removed items are moved into the **Trash** tab rather than permanently deleted. You can restore them anytime with 1 click.
- **1-Click Direct Transfer**: Clicking **PRINT / CROP SELECTED** transfers real, native `File` objects directly into LabelFlow's upload pipeline at `http://localhost:3000/#generator`.

---

## 2. How to Load / Reload in Google Chrome

1. Open **Google Chrome**.
2. Navigate to:
   ```text
   chrome://extensions
   ```
3. Enable **Developer mode** toggle in the top-right corner.
4. If already installed:
   - Find **LabelFlow — E-Commerce Shipping Label Auto-Detector**.
   - Click the **🔄 (Reload)** icon on the extension card.
5. If installing for the first time:
   - Click **Load unpacked** (top-left).
   - Select the `extension` folder:
     ```text
     C:\Users\Prashant Singh\Documents\AAAA\LabelFlow\extension
     ```
6. Pin 📌 the **⚡ LabelFlow** icon to your Chrome toolbar.

---

## 3. How to Use the PDF Vault Workflow

1. **Add Your Shipping Label PDFs**:
   - Click the **⚡ LabelFlow** icon in Chrome.
   - Click **`➕ Add PDF`** (or **`Add PDF Files`** if empty).
   - Select your shipping label PDFs downloaded from Meesho, Flipkart, Snapdeal, Amazon, or Myntra.
   - The PDFs are instantly stored in your extension vault with platform tags, file sizes, and timestamps.

2. **Select & Crop**:
   - Check the PDFs you want to process (or use **Select All**).
   - Click **`[⚡ PRINT / CROP SELECTED (N)]`**.

3. **Automatic 1-Click Processing**:
   - The extension automatically focuses `http://localhost:3000/#generator` (or opens it if not open).
   - The website receives the actual binary `File` objects and runs the cropping engine automatically.
   - The 4×6 thermal preview, SKU grouping, courier sorting, and picklist generate immediately!
   - Processed files are automatically moved to the **Trash** tab in your extension.

4. **Trash & Restore**:
   - Open the extension popup and click the **🗑️ Trash** tab.
   - Click **`↩️ Restore`** on any file to move it back to Stored PDFs and crop it again.
   - Click **`Empty Trash`** or **`✕`** to permanently delete when you're done.
