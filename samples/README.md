# LabelFlow - Test Samples & Format Guide

This directory contains specifications and generator tools for Meesho shipping labels and test batches.

## 📄 Generating Test Samples

You can generate a realistic 3-page synthetic Meesho shipping label batch using PyMuPDF:

```powershell
python samples/generate_sample_labels.py
```

This generates `samples/sample_meesho_batch.pdf` containing:
- **Page 1**: Delhivery Surface shipping label (top) + Tax Invoice (bottom)
- **Page 2**: Shadowfax Express shipping label (top) + Tax Invoice (bottom)
- **Page 3**: Ekart Logistics shipping label (top) + Tax Invoice (bottom)

---

## 📐 Supported Meesho Layouts

1. **A4 Split Layout (Standard)**:
   - Upper region (approx. top 52% of page): Shipping label containing courier badge, AWB tracking, barcode, recipient address, seller return address, SKU, and order reference.
   - Lower region: Itemized customer tax invoice with GSTIN, HSN codes, and amount breakdown.
   - *Behavior*: LabelFlow crops the upper label into a standard 288 × 432 pt (4 × 6 inch) thermal page and filters out the tax invoice when `remove_invoice` is enabled.

2. **Alternating Multi-Page Layout**:
   - Odd pages: Standalone shipping labels.
   - Even pages: Standalone customer tax invoices.
   - *Behavior*: Invoices are separated from the thermal label stream; shipping labels are converted to 4 × 6 inch thermal pages.

3. **Pre-cropped 4 × 6 Inch Thermal Labels**:
   - Documents already formatted for direct thermal roll printing (~288 × 432 pt).
   - *Behavior*: Verified and passed directly into the courier sorter and picklist generator.

4. **Ambiguous or Non-Standard Layouts**:
   - Pages where label and invoice regions cannot be separated with 100% confidence.
   - *Behavior*: **Preserved in full** (scaled proportionally to 4 × 6 inches without stretching) and flagged in the audit report with `is_flagged_for_review: true`. **No page is ever silently dropped.**

---

## 🚚 Supported Logistics Partners

LabelFlow detects and sorts shipments into deterministic carrier groups:
- **Delhivery** (Surface, Express, Air)
- **Shadowfax** (Express, Surface)
- **Xpressbees**
- **Ekart Logistics**
- **Valmo Logistics**
- **Ecom Express**
- **Blue Dart**
- **DTDC**
- **Amazon Shipping**

Unassigned carriers are grouped under **Unassigned** and positioned at the end of the batch.

---

## 📊 SKU Picklist Generation

When `enable_sku_picklist` is enabled:
- SKU codes (`SKU`, `Item`, `Product`), sizes, and quantities (`Qty`, `Quantity`) are parsed from label tables.
- Quantities are aggregated across parcels.
- Outputs `sku_picklist.csv` with:
  `SKU, Quantity, Label Count, Courier Partners, Status, Order References`
- Unmatched parcels without SKU codes are listed as `UNMATCHED` to ensure 100% parcel reconciliation.
