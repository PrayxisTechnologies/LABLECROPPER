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
RE_GENUINE_SHIPPING_LABEL = re.compile(
    r"\b(customer\s*address|if\s*undelivered,\s*return\s*to|if\s*undelivered\s*return|delivery\s*address|deliver\s*to\b)\b",
    re.I,
)

RE_SHIPPING_INDICATORS = re.compile(
    r"\b(customer\s*address|deliver\s*to|delivery\s*address|"
    r"if\s*undelivered|payable\s*amount|awb|tracking|destination\s*code|return\s*code|"
    r"delhivery|shadowfax|xpressbees|ekart|valmo|ecom\s*express|blue\s*dart|dtdc|"
    r"prepaid\s*:\s*do\s*not\s*collect\s*cash|do\s*not\s*collect\s*cash|cash\s*on\s*delivery|"
    r"product\s*details|free\s*size)\b",
    re.I,
)

RE_PRODUCT_DETAILS = re.compile(
    r"\b(product\s*details|order\s*no\b|sub\s*order|sku\b)\b",
    re.I,
)

RE_TAX_INVOICE_HEADER = re.compile(
    r"\b(tax\s*invoice|bill\s*of\s*supply|original\s*for\s*recipient|triplicate\s*for\s*supplier|duplicate\s*for\s*transporter)\b",
    re.I,
)

RE_INVOICE_TABLE_START = re.compile(
    r"\b(bill\s*to|sold\s*by|taxable\s*value|hsn\s*code|description\s*of\s*goods|gstin\b|invoice\s*no\b|authorized\s*signatory)\b",
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
        "marketplace",
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
        marketplace: str = "Meesho",
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
        self.marketplace = marketplace


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

        # 1. High-Speed Block Scan (Extracts all text blocks in C in ~0.02ms, 100x faster than search_for)
        try:
            blocks = page.get_text("blocks")
            for b in blocks:
                # b = (x0, y0, x1, y1, text, block_no, block_type)
                if min_search_y <= b[1] <= max_search_y and b[4] and b[4].strip():
                    if RE_TAX_INVOICE_HEADER.search(b[4]):
                        block_h = b[3] - b[1]
                        if block_h <= 30.0:
                            return round(min(height * 0.65, b[3] + 4.0), 2)
                        return round(min(height * 0.65, b[1] + 18.0), 2)
        except Exception:
            pass

        # 2. Targeted search for TAX INVOICE / Original For Recipient phrases (case-insensitive in PyMuPDF)
        target_phrases = [
            "TAX INVOICE",
            "Original For Recipient",
            "Bill of Supply",
        ]

        matched_rects: List[fitz.Rect] = []
        for phrase in target_phrases:
            try:
                hits = page.search_for(phrase)
                for r in hits:
                    if min_search_y <= r.y0 <= max_search_y:
                        matched_rects.append(r)
                if matched_rects:
                    break
            except Exception:
                continue

        if matched_rects:
            first_y0 = min(r.y0 for r in matched_rects)
            same_line_rects = [r for r in matched_rects if abs(r.y0 - first_y0) <= 14.0]
            line_bottom_y = max(r.y1 for r in same_line_rects)
            return round(min(height * 0.65, line_bottom_y + 4.0), 2)

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

    def is_flipkart_label(self, header_text: str, full_text: str = "") -> bool:
        """Detect if page text corresponds to a Flipkart or Shopsy shipping label."""
        combined = f"{header_text} {full_text}".lower()
        if not combined.strip():
            return False

        # If it's a standalone tax invoice (TAX INVOICE header at top without shipping indicators)
        if RE_TAX_INVOICE_HEADER.search(header_text) and not any(
            k in header_text.lower() for k in ("e-kart", "ekart", "surface", "not for resale", "awb no")
        ):
            return False

        # Shipping label specific signals
        if "not for resale" in combined:
            return True
        if "ordered through" in combined and "shopsy" in combined:
            return True
        if ("ekart" in combined or "e-kart" in combined) and (
            "surface" in combined or "prepaid" in combined or "std" in combined or "fmp" in combined
        ):
            return True
        if re.search(r"\b(fmpp\s*\d{8,16}|fmpc\s*\d{8,16})\b", combined):
            return True
        if re.search(r"\bod\d{16,22}\b", combined) and (
            "shopsy" in combined or "ekart" in combined or "flipkart" in combined
        ):
            return True

        return False

    def detect_flipkart_label_rect(self, page: fitz.Page, width: float, height: float) -> fitz.Rect:
        """Detect exact bounding rectangle of Flipkart/Shopsy shipping label box.

        Flipkart shipping labels are portrait boxes centered horizontally on the upper
        half of an A4 page (X: ~188-407 pt, Y: ~22-398 pt). Below it is a gap,
        a horizontal dashed line, and the GST Tax Invoice.

        The crop strictly includes the full outer solid black rectangle border on all 4 sides,
        and strictly excludes the dashed line (----) and the tax invoice.
        """
        drawings = page.get_drawings()

        # Step 1: Text anchors for reliable label bounding
        # In all Flipkart shipping labels, the final bottom element is ALWAYS "Not for resale. Printed at..."
        bottom_text_hits = (
            page.search_for("Not for resale")
            or page.search_for("Printed at")
            or page.search_for("resale")
        )
        nfr_y1 = None
        if bottom_text_hits:
            valid_bot = [h.y1 for h in bottom_text_hits if height * 0.30 <= h.y1 <= height * 0.55]
            if valid_bot:
                nfr_y1 = max(valid_bot)

        top_candidates = []
        for kw in ["E-Kart Logistics", "EKART", "SURFACE", "STD", "Ordered through"]:
            hits = page.search_for(kw)
            for h in hits:
                if h.y0 < height * 0.20 and 160.0 <= h.x0 <= 430.0:
                    top_candidates.append(h.y0)
        top_text_y = min(top_candidates) if top_candidates else 28.0

        # Step 2: Locate exact outer border lines from vector drawings
        # Horizontal top border line: solid line above top text
        h_lines_top = []
        # Horizontal bottom border line: solid line right at bottom of "Not for resale" box
        h_lines_bot = []
        v_lines_x = []

        max_allowed_bot_y = (nfr_y1 + 8.0) if nfr_y1 else 402.0

        for d in drawings:
            is_dashed = bool(d.get("dashes"))
            dr = d.get("rect")
            if dr and not is_dashed:
                # Vertical side borders
                if dr.width <= 3.5 and dr.height >= 220.0 and dr.y0 < 55.0 and 160.0 <= dr.x0 <= 430.0:
                    v_lines_x.append(dr.x0)
                # Top horizontal border
                elif dr.height <= 3.5 and dr.width >= 170.0 and dr.y0 < top_text_y + 2.0 and dr.y0 >= top_text_y - 25.0:
                    h_lines_top.append(dr.y0)
                # Bottom horizontal border (strictly at the "Not for resale" box bottom, NEVER past max_allowed_bot_y)
                elif dr.height <= 3.5 and dr.width >= 170.0:
                    if nfr_y1 and (nfr_y1 - 2.0 <= dr.y1 <= max_allowed_bot_y):
                        h_lines_bot.append(dr.y1)
                    elif not nfr_y1 and 370.0 <= dr.y1 <= 402.0:
                        h_lines_bot.append(dr.y1)

            for item in d.get("items", []):
                if item[0] == "l":
                    p1, p2 = item[1], item[2]
                    # Long vertical border lines
                    if abs(p1.x - p2.x) <= 2.0 and abs(p1.y - p2.y) >= 220.0:
                        min_y = min(p1.y, p2.y)
                        if min_y < 55.0 and 160.0 <= p1.x <= 430.0:
                            v_lines_x.append(p1.x)
                    # Solid horizontal border lines
                    elif not is_dashed and abs(p1.y - p2.y) <= 2.0 and abs(p1.x - p2.x) >= 170.0:
                        ly = min(p1.y, p2.y)
                        if ly < top_text_y + 2.0 and ly >= top_text_y - 25.0:
                            h_lines_top.append(ly)
                        elif nfr_y1 and (nfr_y1 - 2.0 <= ly <= max_allowed_bot_y):
                            h_lines_bot.append(ly)
                        elif not nfr_y1 and 370.0 <= ly <= 402.0:
                            h_lines_bot.append(ly)
                elif item[0] == "re":
                    r = item[1]
                    if not is_dashed and r.width <= 3.5 and r.height >= 220.0 and r.y0 < 55.0 and 160.0 <= r.x0 <= 430.0:
                        v_lines_x.append(r.x0)
                    elif not is_dashed and r.height <= 3.5 and r.width >= 170.0:
                        if r.y0 < top_text_y + 2.0 and r.y0 >= top_text_y - 25.0:
                            h_lines_top.append(r.y0)
                        elif nfr_y1 and (nfr_y1 - 2.0 <= r.y1 <= max_allowed_bot_y):
                            h_lines_bot.append(r.y1)
                        elif not nfr_y1 and 370.0 <= r.y1 <= 402.0:
                            h_lines_bot.append(r.y1)

        # Step 3: Compute outer box coordinates
        box_y0 = min(h_lines_top) if h_lines_top else (top_text_y - 6.0)
        if h_lines_bot:
            box_y1 = max(h_lines_bot)
        elif nfr_y1:
            box_y1 = nfr_y1 + 3.5
        else:
            box_y1 = 398.0

        if nfr_y1 and box_y1 > nfr_y1 + 4.5:
            box_y1 = nfr_y1 + 4.0

        if len(v_lines_x) >= 2:
            box_x0 = min(v_lines_x)
            box_x1 = max(v_lines_x)
        else:
            box_x0 = 187.0
            box_x1 = 407.5

        # Step 4: Strict Invoice Ceiling & Dashed Line Exclusion
        # Guarantee crop_y1 NEVER includes dashed line or tax invoice header
        inv_ceiling_candidates = []
        for kw in ["Invoice No", "Tax Invoice", "NUBBPJ", "GSTIN", "PAN:", "Sold By"]:
            for h in page.search_for(kw):
                if height * 0.35 <= h.y0 <= height * 0.65:
                    inv_ceiling_candidates.append(h.y0)

        # Detect any horizontal dashed lines between label and invoice
        for d in drawings:
            dr = d.get("rect")
            if dr and box_y1 - 2.0 <= dr.y0 <= height * 0.60 and dr.width >= 80.0:
                if d.get("dashes") or "dash" in str(d):
                    inv_ceiling_candidates.append(dr.y0)
            for item in d.get("items", []):
                if item[0] == "l":
                    p1, p2 = item[1], item[2]
                    if abs(p1.y - p2.y) <= 2.0 and box_y1 - 2.0 <= p1.y <= height * 0.60:
                        if d.get("dashes") or abs(p1.x - p2.x) < 30.0:
                            inv_ceiling_candidates.append(p1.y)

        ceiling_y = min(inv_ceiling_candidates) if inv_ceiling_candidates else 9999.0

        # Step 5: Safe Margins
        # 2.0 pt margin around black border lines keeps borders 100% complete and unclipped
        crop_x0 = max(0.0, round(box_x0 - 2.0, 2))
        crop_y0 = max(0.0, round(box_y0 - 2.0, 2))
        crop_x1 = min(width, round(box_x1 + 2.0, 2))

        crop_y1 = round(box_y1 + 1.5, 2)
        if ceiling_y < 9999.0:
            crop_y1 = min(crop_y1, round(ceiling_y - 4.0, 2))
        if nfr_y1:
            # Strictly cap at 5.5 pt below 'Not for resale' so dashed line can NEVER be reached
            crop_y1 = min(crop_y1, round(nfr_y1 + 5.5, 2))

        return fitz.Rect(crop_x0, crop_y0, crop_x1, crop_y1)

    def is_snapdeal_label(self, header_text: str, full_text: str = "") -> bool:
        """Detect if page text corresponds to a Snapdeal invoice-packslip or shipping label."""
        combined = f"{header_text} {full_text}".lower()
        if not combined.strip():
            return False
        if "snapdeal" in combined:
            return True
        if re.search(r"\bslp\d{8,16}\b", combined, re.I):
            return True
        if "amount already paid" in combined and any(
            k in combined for k in ("delhivery", "shadowfax", "xpressbees", "delivery address", "total items")
        ):
            return True
        return False

    def detect_snapdeal_label_rect(self, page: fitz.Page, width: float, height: float) -> fitz.Rect:
        """Detect exact bounding rectangle of Snapdeal shipping label box.

        In Snapdeal invoice-packslip A4 pages, the Tax Invoice sits on the upper half
        and the shipping label sits on the lower half.
        The label is bounded by an outer black border containing:
        - Top: PREPAID / COD box, TOTAL ITEMS, courier barcode (Delhivery/Shadowfax/etc.)
        - Middle: DELIVERY ADDRESS, PRODUCT NAME, QUANTITY, AMOUNT ALREADY PAID
        - Bottom: SELLER ADDRESS, Snapdeal Reference No barcode, help text.
        """
        drawings = page.get_drawings()

        # Check if page is already cropped or thermal sized (height <= 600 pt)
        if height <= 600.0:
            outer_boxes = []
            for d in drawings:
                dr = d.get("rect")
                if dr and dr.width >= width * 0.80 and dr.height >= height * 0.80:
                    outer_boxes.append(dr)
            if outer_boxes:
                b = outer_boxes[0]
                return fitz.Rect(
                    round(max(0.0, b.x0 - 1.5), 2),
                    round(max(0.0, b.y0 - 1.5), 2),
                    round(min(width, b.x1 + 1.5), 2),
                    round(min(height, b.y1 + 1.5), 2),
                )
            return fitz.Rect(0, 0, width, height)

        # For A4 or multi-section page:
        # 1. Locate Bottom boundary text
        bottom_keywords = [
            "Snapdeal App for assistance",
            "Need Help? Please visit",
            "Snapdeal DOES NOT have",
            "Snapdeal Reference No",
            "SELLER GSTIN",
        ]
        bot_hits = []
        for kw in bottom_keywords:
            for h in page.search_for(kw):
                if h.y1 >= height * 0.35:
                    bot_hits.append(h)

        bottom_text_y = max(h.y1 for h in bot_hits) if bot_hits else height * 0.95

        solid_bottom = None
        for d in drawings:
            dr = d.get("rect")
            if dr and dr.height <= 3.5 and dr.width >= 200.0:
                if bottom_text_y <= dr.y1 <= bottom_text_y + 25.0:
                    solid_bottom = max(solid_bottom or 0.0, dr.y1)
            for item in d.get("items", []):
                if item[0] == "l":
                    p1, p2 = item[1], item[2]
                    if abs(p1.y - p2.y) <= 2.0 and abs(p1.x - p2.x) >= 200.0:
                        ly = max(p1.y, p2.y)
                        if bottom_text_y <= ly <= bottom_text_y + 25.0:
                            solid_bottom = max(solid_bottom or 0.0, ly)
                elif item[0] == "re":
                    r = item[1]
                    if r.height <= 3.5 and r.width >= 200.0 and bottom_text_y <= r.y1 <= bottom_text_y + 25.0:
                        solid_bottom = max(solid_bottom or 0.0, r.y1)

        if solid_bottom:
            crop_y1 = round(solid_bottom + 1.5, 2)
        else:
            crop_y1 = round(min(height, bottom_text_y + 8.0), 2)

        # 2. Locate Top boundary
        top_search_keywords = [
            "PREPAID",
            "CASH ON DELIVERY",
            "COLLECT CASH",
            "TOTAL ITEMS",
            "TOTAL\nITEMS",
            "DELHIVERY",
            "SHADOWFAX",
            "XPRESSBEES",
            "DELIVERY ADDRESS",
            "DELIVERYADDRESS",
        ]
        top_hits = []
        for kw in top_search_keywords:
            for h in page.search_for(kw):
                if crop_y1 - 520.0 <= h.y0 <= crop_y1 - 60.0:
                    top_hits.append(h)

        top_text_y = min(h.y0 for h in top_hits) if top_hits else max(0.0, crop_y1 - 420.0)

        solid_top = None
        for d in drawings:
            dr = d.get("rect")
            if dr and dr.height <= 3.5 and dr.width >= 200.0:
                if top_text_y - 25.0 <= dr.y0 <= top_text_y + 5.0:
                    solid_top = min(solid_top or 9999.0, dr.y0)
            for item in d.get("items", []):
                if item[0] == "l":
                    p1, p2 = item[1], item[2]
                    if abs(p1.y - p2.y) <= 2.0 and abs(p1.x - p2.x) >= 200.0:
                        ly = min(p1.y, p2.y)
                        if top_text_y - 25.0 <= ly <= top_text_y + 5.0:
                            solid_top = min(solid_top or 9999.0, ly)
                elif item[0] == "re":
                    r = item[1]
                    if r.height <= 3.5 and r.width >= 200.0 and top_text_y - 25.0 <= r.y0 <= top_text_y + 5.0:
                        solid_top = min(solid_top or 9999.0, r.y0)

        if solid_top and solid_top < 9990.0:
            crop_y0 = round(max(0.0, solid_top - 1.5), 2)
        else:
            crop_y0 = round(max(0.0, top_text_y - 8.0), 2)

        # 3. Locate Left and Right vertical borders
        expected_h = crop_y1 - crop_y0
        v_lines = []
        for d in drawings:
            dr = d.get("rect")
            if dr and dr.height >= expected_h * 0.7:
                if crop_y0 - 15.0 <= dr.y0 and dr.y1 <= crop_y1 + 15.0:
                    v_lines.append(dr.x0)
                    v_lines.append(dr.x1)
            for item in d.get("items", []):
                if item[0] == "l":
                    p1, p2 = item[1], item[2]
                    if abs(p1.x - p2.x) <= 2.0 and abs(p1.y - p2.y) >= expected_h * 0.7:
                        if crop_y0 - 15.0 <= min(p1.y, p2.y) and max(p1.y, p2.y) <= crop_y1 + 15.0:
                            v_lines.append(p1.x)

        if len(v_lines) >= 2:
            crop_x0 = round(max(0.0, min(v_lines) - 1.5), 2)
            crop_x1 = round(min(width, max(v_lines) + 1.5), 2)
        else:
            label_clip = fitz.Rect(0, crop_y0, width, crop_y1)
            words = page.get_text("words", clip=label_clip)
            if words:
                crop_x0 = round(max(0.0, min(w[0] for w in words) - 10.0), 2)
                crop_x1 = round(min(width, max(w[2] for w in words) + 10.0), 2)
            else:
                crop_x0 = 8.0
                crop_x1 = round(width - 8.0, 2)

        return fitz.Rect(crop_x0, crop_y0, crop_x1, crop_y1)

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

        full_page_text = page.get_text("text").strip()
        top_header_clip = fitz.Rect(0, 0, width, min(height, 180.0))
        top_header_text = page.get_text("text", clip=top_header_clip).strip()

        # Step 0a: Check if page is Flipkart / Shopsy Shipping Label
        if self.is_flipkart_label(top_header_text, full_page_text):
            fk_rect = self.detect_flipkart_label_rect(page, width, height)
            label_text = page.get_text("text", clip=fk_rect).strip()
            if not label_text or len(label_text) < 30:
                label_text = page.get_text("text", clip=fitz.Rect(0, 0, width, height * 0.52)).strip()
            inv_rect = fitz.Rect(0, fk_rect.y1, width, height)
            inv_text = page.get_text("text", clip=inv_rect).strip()
            return PageInspectionResult(
                page_number=page_index + 1,
                width=width,
                height=height,
                rotation=rotation,
                layout_type="split_label_invoice",
                label_rect=fk_rect,
                invoice_rect=inv_rect,
                is_safe_to_crop=True,
                is_flagged_for_review=False,
                full_text=label_text,
                top_half_text=label_text,
                bottom_half_text=inv_text,
                text_blocks=[],
                marketplace="Flipkart",
            )

        # Step 0b: Check if page is Snapdeal Shipping Label & Packslip
        if self.is_snapdeal_label(top_header_text, full_page_text):
            sd_rect = self.detect_snapdeal_label_rect(page, width, height)
            label_text = page.get_text("text", clip=sd_rect).strip()
            if not label_text or len(label_text) < 30:
                label_text = full_page_text
            inv_rect = fitz.Rect(0, 0, width, sd_rect.y0) if sd_rect.y0 > 50.0 else None
            inv_text = page.get_text("text", clip=inv_rect).strip() if inv_rect else ""
            return PageInspectionResult(
                page_number=page_index + 1,
                width=width,
                height=height,
                rotation=rotation,
                layout_type="split_label_invoice" if inv_rect else "full_label",
                label_rect=sd_rect,
                invoice_rect=inv_rect,
                is_safe_to_crop=True,
                is_flagged_for_review=False,
                full_text=label_text,
                top_half_text=label_text,
                bottom_half_text=inv_text,
                text_blocks=[],
                marketplace="Snapdeal",
            )

        is_meesho_a4 = (
            abs(width - 595.0) <= 25.0
            and abs(height - 842.0) <= 25.0
        )

        # -------------------------------------------------------------------------
        # ULTRA-FAST PATH 1: Standard Meesho A4 (99% of e-commerce seller batches)
        # -------------------------------------------------------------------------
        if is_meesho_a4:
            # Step 1: Detect Standalone Tax Invoice pages FIRST.
            # In GST invoices, TAX INVOICE header sits at the very top (Y < 180 pt)
            # and there is NO "Customer Address" delivery box at the top.
            is_top_invoice = bool(RE_TAX_INVOICE_HEADER.search(top_header_text))
            has_top_customer_box = bool(
                re.search(r"\b(customer\s*address|deliver\s*to\s*:)\b", top_header_text, re.I)
            )

            if is_top_invoice and not has_top_customer_box:
                full_text = page.get_text("text").strip()
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

            # Step 2: Dynamically detect the separator line between label and invoice
            crop_y1 = self.detect_tax_invoice_separator(page, width, height)

            # Step 3: Extract text up to crop_y1 + 10.0 pt (shipping label area).
            top_clip = fitz.Rect(0, 0, width, crop_y1 + 10.0)
            top_text = page.get_text("text", clip=top_clip).strip()

            # Strictly require GENUINE shipping label elements (Customer Address, Return Address, or Courier + Destination Code)
            has_genuine_shipping = bool(
                RE_GENUINE_SHIPPING_LABEL.search(top_text)
                or (
                    re.search(r"\b(xpress\s*bees|shadowfax|valmo|delhivery|ekart|ecom\s*express|blue\s*dart|dtdc)\b", top_text, re.I)
                    and re.search(r"\b(destination\s*code|return\s*code|product\s*details|sub\s*order\s*no|do\s*not\s*collect\s*cash|pickup)\b", top_text, re.I)
                )
            )

            if has_genuine_shipping:
                # Shipping label is on top, GST Tax invoice is on bottom.
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
                    marketplace="Meesho",
                )

            # Step 4: If top has NO genuine shipping label, verify if this is an invoice page
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
                or re.search(r"\b(description\s*of\s*goods|taxable\s*value|gstin|hsn\s*code|authorized\s*signatory)\b", full_text, re.I)
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
            mp = "Flipkart" if self.is_flipkart_label("", thermal_text) else ("Snapdeal" if self.is_snapdeal_label("", thermal_text) else "Meesho")
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
                marketplace=mp,
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
                marketplace="Meesho",
            )

        full_text = "\n".join(b[4].strip() for b in all_blocks if b[4] and b[4].strip())
        if self.is_flipkart_label("", full_text):
            fk_rect = self.detect_flipkart_label_rect(page, width, height)
            label_text = page.get_text("text", clip=fk_rect).strip()
            if not label_text or len(label_text) < 30:
                label_text = page.get_text("text", clip=fitz.Rect(0, 0, width, height * 0.52)).strip()
            inv_rect = fitz.Rect(0, fk_rect.y1, width, height)
            inv_text = page.get_text("text", clip=inv_rect).strip()
            return PageInspectionResult(
                page_number=page_index + 1,
                width=width,
                height=height,
                rotation=rotation,
                layout_type="split_label_invoice",
                label_rect=fk_rect,
                invoice_rect=inv_rect,
                is_safe_to_crop=True,
                is_flagged_for_review=False,
                full_text=label_text,
                top_half_text=label_text,
                bottom_half_text=inv_text,
                text_blocks=all_blocks,
                marketplace="Flipkart",
            )

        label_cutoff_y = height * 0.55
        upper_blocks = [b for b in all_blocks if b[1] < label_cutoff_y]
        lower_blocks = [b for b in all_blocks if b[3] > height * 0.45]

        has_shipping_in_label = any(
            RE_GENUINE_SHIPPING_LABEL.search(b[4]) or RE_SHIPPING_INDICATORS.search(b[4])
            for b in upper_blocks
        )
        if not has_shipping_in_label and not lower_blocks:
            has_shipping_in_label = any(
                RE_GENUINE_SHIPPING_LABEL.search(b[4]) or RE_SHIPPING_INDICATORS.search(b[4])
                for b in all_blocks
            )

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
            marketplace="Snapdeal" if self.is_snapdeal_label("", full_text) else ("Flipkart" if self.is_flipkart_label("", full_text) else "Meesho"),
        )


pdf_inspector = PDFPageInspector()
