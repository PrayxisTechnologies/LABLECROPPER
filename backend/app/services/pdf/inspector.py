"""PDF page inspection, text extraction, and layout detection service."""

import re
from typing import Any, Dict, List, Optional, Tuple
import fitz  # PyMuPDF

# Standard 4x6 inch dimensions in points (72 points/inch)
THERMAL_WIDTH_PT = 288.0
THERMAL_HEIGHT_PT = 432.0
THERMAL_ASPECT_RATIO = THERMAL_WIDTH_PT / THERMAL_HEIGHT_PT  # ~0.6667
DIMENSION_TOLERANCE_PT = 36.0

# Precompiled regex patterns for maximum throughput
RE_SHIPPING_INDICATORS = re.compile(
    r"\b(customer\s*address|ship\s*to|deliver\s*to|delivery\s*address|return\s*to|"
    r"sold\s*by|if\s*undelivered|payable\s*amount|awb|tracking|courier|routing|"
    r"destination|pincode|pin\s*code|delhivery|shadowfax|xpressbees|ekart|valmo|"
    r"ecom\s*express|blue\s*dart|dtdc|amazon\s*shipping|product\s*details|free\s*size|"
    r"sku|qty|quantity|order\s*no|sub\s*order)\b",
    re.I,
)

RE_PRODUCT_DETAILS = re.compile(
    r"\b(product\s*details|order\s*no\b|sub\s*order|sku\b)\b",
    re.I,
)

RE_TAX_INVOICE_HEADER = re.compile(
    r"\b(tax\s*invoice|original\s*for\s*recipient)\b",
    re.I,
)

RE_INVOICE_TABLE_START = re.compile(
    r"\b(bill\s*to|sold\s*by|taxable\s*value|hsn\s*code|description\s*of\s*goods|gstin\b|invoice\s*no\b)\b",
    re.I,
)

# ==============================================================================
# ✂️ MEESHO A4 LABEL CROP BOUNDS (DYNAMIC TAX INVOICE POSITIONING)
# ==============================================================================
# Standard Meesho A4 page (595.3 x 841.9 pt) margin bounds:
# X0 = Left margin (8.0 pt - label ke outer black border se 2 pt pehle)
# Y0 = Top margin (16.0 pt - "Customer Address" ke outer black border se 2 pt upar)
# X1 = Right margin (586.0 pt - right outer black border ke 2 pt baad)
# Y1 = Dynamic bottom cutoff! Ab hardcoded 353.5 nahi hai - har page par 'TAX INVOICE'
#      search karke dynamic cutoff lagaya jata hai taaki long address (5-7 lines)
#      ya multiple products par Product Details table kabhi bhi cut na ho!
MEESHO_CROP_X0 = 8.0
MEESHO_CROP_Y0 = 16.0
MEESHO_CROP_X1 = 586.0
MEESHO_DEFAULT_CROP_Y1 = 353.5
MEESHO_CROP_Y1 = MEESHO_DEFAULT_CROP_Y1  # Backward compatibility
# ==============================================================================


class PageInspectionResult:
    """Detailed structural analysis of a single PDF page."""

    __slots__ = (
        "page_number",
        "width",
        "height",
        "rotation",
        "layout_type",
        "label_rect",
        "invoice_rect",
        "is_safe_to_crop",
        "is_flagged_for_review",
        "review_reason",
        "full_text",
        "top_half_text",
        "bottom_half_text",
        "text_blocks",
    )

    def __init__(
        self,
        page_number: int,
        width: float,
        height: float,
        rotation: int,
        layout_type: str,
        label_rect: Optional[fitz.Rect],
        invoice_rect: Optional[fitz.Rect],
        is_safe_to_crop: bool,
        is_flagged_for_review: bool,
        review_reason: Optional[str] = None,
        full_text: str = "",
        top_half_text: str = "",
        bottom_half_text: str = "",
        text_blocks: Optional[List[Tuple[float, float, float, float, str, int, int]]] = None,
    ):
        self.page_number = page_number
        self.width = width
        self.height = height
        self.rotation = rotation
        self.layout_type = layout_type  # 'full_label', 'split_label_invoice', 'tax_invoice', 'ambiguous'
        self.label_rect = label_rect
        self.invoice_rect = invoice_rect
        self.is_safe_to_crop = is_safe_to_crop
        self.is_flagged_for_review = is_flagged_for_review
        self.review_reason = review_reason
        self.full_text = full_text
        self.top_half_text = top_half_text
        self.bottom_half_text = bottom_half_text
        self.text_blocks = text_blocks or []


class PDFPageInspector:
    """High-speed inspector analyzing PDF pages for shipping label and invoice boundaries."""

    def detect_tax_invoice_separator(self, page: fitz.Page, width: float, height: float) -> float:
        """Dynamically locate the boundary between shipping label and GST Tax Invoice.

        Searches for 'TAX INVOICE' / 'Original For Recipient' on this specific page
        in the separator zone (Y: 200 pt to 550 pt). Ensures labels with long addresses
        (5-7 lines) or multiple items never have their Product Details table truncated.

        Returns the exact Y coordinate (pt) where the shipping label crop should end,
        including the Product Details table, its bottom border line, and the TAX INVOICE header.
        """
        min_search_y = max(180.0, height * 0.22)
        max_search_y = min(560.0, height * 0.65)

        # 1. Exact text search for TAX INVOICE / Original For Recipient phrases
        target_phrases = [
            "TAX INVOICE",
            "Tax Invoice",
            "tax invoice",
            "Original For Recipient",
            "ORIGINAL FOR RECIPIENT",
            "Original for Recipient",
            "TAX INVOICE / BILL OF SUPPLY",
            "Bill of Supply",
        ]

        matched_rects: List[fitz.Rect] = []
        for phrase in target_phrases:
            try:
                hits = page.search_for(phrase)
                for r in hits:
                    if min_search_y <= r.y0 <= max_search_y:
                        matched_rects.append(r)
            except Exception:
                continue

        if matched_rects:
            # Find uppermost occurrence in separator zone (header line right below shipping label)
            first_y0 = min(r.y0 for r in matched_rects)
            # Group all text rects on this exact same horizontal header line (within 14 pt tolerance)
            same_line_rects = [r for r in matched_rects if abs(r.y0 - first_y0) <= 14.0]
            line_bottom_y = max(r.y1 for r in same_line_rects)
            # Safe 4.0 pt margin below TAX INVOICE header, cleanly above 'Sold By' / 'Bill To' table
            return round(min(height * 0.65, line_bottom_y + 4.0), 2)

        # 2. Block-level regex search across text blocks
        try:
            blocks = page.get_text("blocks")
            candidate_blocks = [
                b for b in blocks
                if min_search_y <= b[1] <= max_search_y and b[4] and b[4].strip()
            ]
            for b in candidate_blocks:
                if RE_TAX_INVOICE_HEADER.search(b[4]):
                    block_h = b[3] - b[1]
                    if block_h <= 30.0:
                        return round(min(height * 0.65, b[3] + 4.0), 2)
                    return round(min(height * 0.65, b[1] + 18.0), 2)
        except Exception:
            pass

        # 3. Fallback: Search for 'Product Details' / 'Order No' table headers
        try:
            product_hits = (
                page.search_for("Product Details")
                or page.search_for("Product Name")
                or page.search_for("Order No")
                or page.search_for("Sub Order No")
            )
            valid_p_hits = [r for r in product_hits if min_search_y <= r.y0 <= max_search_y]
            if valid_p_hits:
                last_p_y = max(r.y1 for r in valid_p_hits)
                # Add 52 pt to cover the table row (SKU name, Size, Qty, Color, Order ID) + bottom border
                return round(min(height * 0.65, last_p_y + 52.0), 2)
        except Exception:
            pass

        # 4. Fallback: Search for horizontal vector divider line drawings
        try:
            drawings = page.get_drawings()
            horiz_lines = []
            for d in drawings:
                dr = d.get("rect")
                if dr and dr.width >= 300.0 and dr.height <= 3.0:
                    if min_search_y <= dr.y0 <= max_search_y:
                        horiz_lines.append(dr.y1)
            if horiz_lines:
                return round(min(height * 0.65, max(horiz_lines) + 4.0), 2)
        except Exception:
            pass

        # 5. Default safe cutoff
        return MEESHO_DEFAULT_CROP_Y1

    def inspect_page(self, page: fitz.Page, page_index: int) -> PageInspectionResult:
        """Inspect geometry and text distribution on a PDF page in sub-millisecond time."""
        rect = page.rect
        width = rect.width
        height = rect.height
        rotation = page.rotation

        is_thermal_size = (
            abs(width - THERMAL_WIDTH_PT) <= DIMENSION_TOLERANCE_PT
            and abs(height - THERMAL_HEIGHT_PT) <= DIMENSION_TOLERANCE_PT
        )

        is_meesho_a4 = (
            abs(width - 595.0) <= 25.0
            and abs(height - 842.0) <= 25.0
        )

        # -------------------------------------------------------------------------
        # ULTRA-FAST PATH 1: Standard Meesho A4 (99% of e-commerce seller batches)
        # -------------------------------------------------------------------------
        if is_meesho_a4:
            # 1. Dynamically detect the exact boundary of the shipping label and TAX INVOICE.
            # This searches for 'TAX INVOICE' / 'Original For Recipient' on this specific page,
            # ensuring long addresses (5-7 lines) or multiple items are NEVER cut off!
            crop_y1 = self.detect_tax_invoice_separator(page, width, height)

            # 2. Extract text up to crop_y1 + 10.0 pt (shipping label area).
            # This completely captures the full address, barcodes, and complete SKU/Order table,
            # while skipping the dense lower GST tax table to maintain 40x scan speed.
            top_clip = fitz.Rect(0, 0, width, crop_y1 + 10.0)
            top_text = page.get_text("text", clip=top_clip).strip()

            has_shipping = bool(RE_SHIPPING_INDICATORS.search(top_text))

            if has_shipping:
                # Shipping label is on top, GST Tax invoice is on bottom.
                # Dynamic Meesho crop bounds with safe border margins:
                # Includes TAX INVOICE header, excludes BILL TO / SHIP TO & Sold By table.
                crop_box = fitz.Rect(
                    MEESHO_CROP_X0,
                    MEESHO_CROP_Y0,
                    MEESHO_CROP_X1,
                    crop_y1,
                )
                return PageInspectionResult(
                    page_number=page_index + 1,
                    width=width,
                    height=height,
                    rotation=rotation,
                    layout_type="split_label_invoice",
                    label_rect=crop_box,
                    invoice_rect=fitz.Rect(0, crop_y1, width, height),
                    is_safe_to_crop=True,
                    is_flagged_for_review=False,
                    full_text=top_text,
                    top_half_text=top_text,
                    bottom_half_text="",
                    text_blocks=[],
                )

            # If top has no shipping indicators, check if this is a standalone tax invoice page
            full_text = page.get_text("text").strip()
            if not full_text:
                return PageInspectionResult(
                    page_number=page_index + 1,
                    width=width,
                    height=height,
                    rotation=rotation,
                    layout_type="ambiguous",
                    label_rect=fitz.Rect(0, 0, width, height),
                    invoice_rect=None,
                    is_safe_to_crop=False,
                    is_flagged_for_review=True,
                    review_reason="Empty page content.",
                )

            is_invoice = bool(
                RE_TAX_INVOICE_HEADER.search(full_text)
                or RE_INVOICE_TABLE_START.search(full_text)
            )
            if is_invoice:
                return PageInspectionResult(
                    page_number=page_index + 1,
                    width=width,
                    height=height,
                    rotation=rotation,
                    layout_type="tax_invoice",
                    label_rect=None,
                    invoice_rect=fitz.Rect(0, 0, width, height),
                    is_safe_to_crop=False,
                    is_flagged_for_review=False,
                    full_text=full_text,
                    top_half_text="",
                    bottom_half_text=full_text,
                    text_blocks=[],
                )

        # -------------------------------------------------------------------------
        # ULTRA-FAST PATH 2: Native 4x6 Thermal Roll Page
        # -------------------------------------------------------------------------
        if is_thermal_size:
            thermal_text = page.get_text("text").strip()
            return PageInspectionResult(
                page_number=page_index + 1,
                width=width,
                height=height,
                rotation=rotation,
                layout_type="full_label",
                label_rect=fitz.Rect(0, 0, width, height),
                invoice_rect=None,
                is_safe_to_crop=True,
                is_flagged_for_review=False,
                full_text=thermal_text,
                top_half_text=thermal_text,
                bottom_half_text="",
                text_blocks=[],
            )

        # -------------------------------------------------------------------------
        # ADAPTIVE FALLBACK: Non-standard / custom dimension PDF documents
        # -------------------------------------------------------------------------
        all_blocks = [
            b for b in page.get_text("blocks")
            if b[4] and b[4].strip()
        ]

        if not all_blocks:
            return PageInspectionResult(
                page_number=page_index + 1,
                width=width,
                height=height,
                rotation=rotation,
                layout_type="ambiguous",
                label_rect=fitz.Rect(0, 0, width, height),
                invoice_rect=None,
                is_safe_to_crop=False,
                is_flagged_for_review=True,
                review_reason="Empty page content.",
            )

        full_text = "\n".join(b[4].strip() for b in all_blocks if b[4] and b[4].strip())
        label_cutoff_y = height * 0.55
        upper_blocks = [b for b in all_blocks if b[1] < label_cutoff_y]
        lower_blocks = [b for b in all_blocks if b[3] > height * 0.45]

        has_shipping_in_label = any(RE_SHIPPING_INDICATORS.search(b[4]) for b in upper_blocks)
        if not has_shipping_in_label and not lower_blocks:
            has_shipping_in_label = any(RE_SHIPPING_INDICATORS.search(b[4]) for b in all_blocks)

        lower_text = " ".join(b[4] for b in lower_blocks)
        has_invoice_table = bool(
            RE_INVOICE_TABLE_START.search(lower_text)
            or ("tax invoice" in lower_text.lower() and "original" in lower_text.lower())
        )

        if not has_shipping_in_label and has_invoice_table:
            return PageInspectionResult(
                page_number=page_index + 1,
                width=width,
                height=height,
                rotation=rotation,
                layout_type="tax_invoice",
                label_rect=None,
                invoice_rect=fitz.Rect(0, 0, width, height),
                is_safe_to_crop=False,
                is_flagged_for_review=False,
                full_text=full_text,
                top_half_text="",
                bottom_half_text=full_text,
                text_blocks=all_blocks,
            )

        t_blocks = upper_blocks or all_blocks
        t_x0 = min(b[0] for b in t_blocks)
        t_x1 = max(b[2] for b in t_blocks)
        t_y0 = min(b[1] for b in t_blocks)

        crop_x0 = max(0.0, t_x0 - 4.0)
        crop_x1 = min(width, t_x1 + 4.0)
        crop_y0 = max(0.0, t_y0 - 4.0)

        if has_invoice_table:
            # Dynamically detect TAX INVOICE separator if available
            dyn_y = self.detect_tax_invoice_separator(page, width, height)
            if dyn_y and dyn_y > crop_y0 + 50.0:
                crop_y1 = dyn_y
            else:
                inv_y0 = min(
                    (b[1] for b in lower_blocks if RE_INVOICE_TABLE_START.search(b[4]) or RE_TAX_INVOICE_HEADER.search(b[4])),
                    default=height * 0.55,
                )
                crop_y1 = min(height, inv_y0 - 2.0)
        else:
            crop_y1 = min(height, max(b[3] for b in t_blocks) + 16.0)

        crop_box = fitz.Rect(crop_x0, crop_y0, crop_x1, crop_y1)
        layout_type = "split_label_invoice" if has_invoice_table else "full_label"

        return PageInspectionResult(
            page_number=page_index + 1,
            width=width,
            height=height,
            rotation=rotation,
            layout_type=layout_type,
            label_rect=crop_box,
            invoice_rect=fitz.Rect(0, crop_box.y1, width, height) if has_invoice_table else None,
            is_safe_to_crop=True,
            is_flagged_for_review=False,
            full_text=full_text,
            top_half_text=" ".join(b[4] for b in upper_blocks).strip() if upper_blocks else full_text,
            bottom_half_text=lower_text,
            text_blocks=all_blocks,
        )


pdf_inspector = PDFPageInspector()
