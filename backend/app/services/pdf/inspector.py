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

    def inspect_page(self, page: fitz.Page, page_index: int) -> PageInspectionResult:
        """Inspect geometry and text distribution on a PDF page in sub-millisecond time."""
        rect = page.rect
        width = rect.width
        height = rect.height
        rotation = page.rotation

        # Extract text blocks: (x0, y0, x1, y1, text, block_no, block_type)
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

        # Check if page is already 4x6 thermal dimensions
        is_thermal_size = (
            abs(width - THERMAL_WIDTH_PT) <= DIMENSION_TOLERANCE_PT
            and abs(height - THERMAL_HEIGHT_PT) <= DIMENSION_TOLERANCE_PT
        )

        is_meesho_a4 = (
            abs(width - 595.0) <= 20.0
            and abs(height - 842.0) <= 20.0
        )

        # Region threshold: on standard Meesho A4, shipping label ends around y=373 pt
        label_cutoff_y = 375.0 if is_meesho_a4 else height * 0.55

        upper_blocks = [b for b in all_blocks if b[1] < label_cutoff_y]
        lower_blocks = [b for b in all_blocks if b[3] > (370.0 if is_meesho_a4 else height * 0.45)]

        # Check Shipping Label indicators in upper region
        has_shipping_in_label = any(RE_SHIPPING_INDICATORS.search(b[4]) for b in upper_blocks)
        if not has_shipping_in_label and not lower_blocks:
            has_shipping_in_label = any(RE_SHIPPING_INDICATORS.search(b[4]) for b in all_blocks)

        # Check for Tax Invoice table indicators in lower region
        lower_text = " ".join(b[4] for b in lower_blocks)
        has_invoice_table = bool(
            RE_INVOICE_TABLE_START.search(lower_text)
            or ("tax invoice" in lower_text.lower() and "original" in lower_text.lower())
        )

        # Case A: Standalone Tax Invoice Page (no shipping label at top)
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

        # Case B: Already standard 4x6 thermal roll size with no invoice
        if is_thermal_size and not has_invoice_table:
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
                full_text=full_text,
                top_half_text=full_text,
                bottom_half_text="",
                text_blocks=all_blocks,
            )

        # Case C: Compute Precise Uniform Crop Boundary
        if is_meesho_a4:
            # Standard Meesho A4 template:
            # Include 'TAX INVOICE' & 'Original For Recipient' (y ~ 342 to 351 pt),
            # but strictly exclude 'BILL TO / SHIP TO' & 'Sold by' table (y >= 356 pt).
            crop_y1 = 352.0
            try:
                bill_words = [
                    w for w in page.get_text("words", clip=fitz.Rect(0, 335.0, width, 405.0))
                    if w[4].lower() in ("bill", "sold")
                ]
                if bill_words:
                    crop_y1 = min(w[1] for w in bill_words) - 1.5
            except Exception:
                pass

            crop_box = fitz.Rect(10.0, 18.0, 584.0, crop_y1)
        else:
            # Fallback for non-standard / synthetic mock layouts
            t_blocks = upper_blocks or all_blocks
            t_x0 = min(b[0] for b in t_blocks)
            t_x1 = max(b[2] for b in t_blocks)
            t_y0 = min(b[1] for b in t_blocks)

            crop_x0 = max(0.0, t_x0 - 4.0)
            crop_x1 = min(width, t_x1 + 4.0)
            crop_y0 = max(0.0, t_y0 - 4.0)
            crop_y1 = max(b[3] for b in t_blocks) + 4.0
            crop_box = fitz.Rect(crop_x0, crop_y0, crop_x1, crop_y1)

            if has_invoice_table:
                # Cut before lower invoice blocks
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
