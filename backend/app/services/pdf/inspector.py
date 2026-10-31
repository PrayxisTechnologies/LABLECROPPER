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
        """Dynamically locate the boundary between shipping label and GST Tax Invoice in sub-millisecond time.

        Strictly terminates at the 'TAX INVOICE' / 'Original For Recipient' line at the bottom
        of the Product Details table (Y ~350 pt). Never bleeds into 'BILL TO / SHIP TO' or the tax invoice table.
        """
        min_search_y = max(180.0, height * 0.22)
        # Separator is strictly in the upper half of A4 page (never below 368 pt where BILL TO / SHIP TO starts)
        max_search_y = min(368.0, height * 0.44)

        for phrase in ("TAX INVOICE", "Original For Recipient", "Bill of Supply"):
            try:
                hits = page.search_for(phrase)
                valid_hits = [r for r in hits if min_search_y <= r.y0 <= max_search_y]
                if valid_hits:
                    # Pick the top-most hit (first one on the page)
                    first_hit = min(valid_hits, key=lambda r: r.y0)
                    same_line_rects = [r for r in valid_hits if abs(r.y0 - first_hit.y0) <= 12.0]
                    line_bottom_y = max(r.y1 for r in same_line_rects)
                    # +3.5 pt padding covers the horizontal bottom border line cleanly
                    return round(min(363.0, line_bottom_y + 3.5), 2)
            except Exception:
                pass

        # Check for 'Product Details' / 'Order No' table
        for phrase in ("Product Details", "Order No"):
            try:
                hits = page.search_for(phrase)
                valid_hits = [r for r in hits if min_search_y <= r.y0 <= max_search_y]
                if valid_hits:
                    first_hit = min(valid_hits, key=lambda r: r.y0)
                    return round(min(363.0, first_hit.y1 + 54.0), 2)
            except Exception:
                pass

        return MEESHO_DEFAULT_CROP_Y1

    def is_flipkart_label(self, header_text: str, full_text: str = "") -> bool:
        """Detect if page text corresponds to a genuine Flipkart or Shopsy shipping label."""
        combined = f"{header_text} {full_text}".lower()
        if not combined.strip():
            return False

        # Shipping label specific signals for genuine Flipkart / Shopsy labels
        if "not for resale" in combined:
            return True
        if "ordered through" in combined and ("shopsy" in combined or "flipkart" in combined):
            return True
        if re.search(r"\b(fmpp\s*\d{8,16}|fmpc\s*\d{8,16})\b", combined):
            return True
        if re.search(r"\bod\d{16,22}\b", combined) and (
            "shopsy" in combined or "flipkart" in combined
        ):
            return True

        return False

    def detect_flipkart_label_rect(self, page: fitz.Page, width: float, height: float) -> fitz.Rect:
        """Detect exact bounding rectangle of Flipkart/Shopsy shipping label box.

        Flipkart shipping labels are portrait boxes centered horizontally on the upper
        half of an A4 page (X: ~188-407 pt, Y: ~22-402 pt). Below it is a gap,
        a horizontal dashed line, and the GST Tax Invoice.

        The crop strictly includes the full outer solid black rectangle border on all 4 sides,
        including the bottom border enclosing 'Not for resale', and strictly excludes the dashed line and tax invoice.
        """
        drawings = page.get_drawings()

        # Step 1: Detect horizontal dashed line & Tax Invoice ceiling
        inv_ceiling_candidates = []
        for kw in ["Invoice No", "Tax Invoice", "NUBBPJ", "GSTIN", "PAN:", "Sold By"]:
            for h in page.search_for(kw):
                if height * 0.35 <= h.y0 <= height * 0.65:
                    inv_ceiling_candidates.append(h.y0)

        for d in drawings:
            is_dashed = bool(d.get("dashes"))
            dr = d.get("rect")
            if is_dashed and dr and dr.y0 >= height * 0.35 and dr.width >= 60.0:
                inv_ceiling_candidates.append(dr.y0)
            for item in d.get("items", []):
                if item[0] == "l" and is_dashed:
                    p1, p2 = item[1], item[2]
                    if abs(p1.y - p2.y) <= 2.0 and p1.y >= height * 0.35:
                        inv_ceiling_candidates.append((p1.y + p2.y) / 2.0)

        ceiling_y = min(inv_ceiling_candidates) if inv_ceiling_candidates else (height * 0.52)

        # Step 2: Text anchors for reliable label bounding
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

        # Maximum allowed bottom boundary before the dashed line / invoice
        max_allowed_bot_y = min(ceiling_y - 3.5, (nfr_y1 + 14.0) if nfr_y1 else 408.0)

        # Step 3: Locate exact outer border lines from vector drawings
        h_lines_top = []
        h_lines_bot = []
        v_lines_x = []

        for d in drawings:
            if d.get("dashes"):
                continue
            dr = d.get("rect")
            if dr:
                # Vertical side borders
                if dr.width <= 3.5 and dr.height >= 180.0 and dr.y0 < 60.0 and 160.0 <= dr.x0 <= 430.0:
                    v_lines_x.append(dr.x0)
                    if dr.y1 <= max_allowed_bot_y:
                        h_lines_bot.append(dr.y1)
                # Top horizontal border
                elif dr.height <= 3.5 and dr.width >= 160.0 and dr.y0 < top_text_y + 2.0 and dr.y0 >= top_text_y - 25.0:
                    h_lines_top.append(dr.y0)
                # Bottom horizontal border (enclosing the 'Not for resale' box)
                elif dr.height <= 3.5 and dr.width >= 160.0:
                    if (nfr_y1 and nfr_y1 - 2.0 <= dr.y1 <= max_allowed_bot_y) or (not nfr_y1 and 370.0 <= dr.y1 <= max_allowed_bot_y):
                        h_lines_bot.append(dr.y1)

            for item in d.get("items", []):
                if item[0] == "l":
                    p1, p2 = item[1], item[2]
                    # Long vertical border lines
                    if abs(p1.x - p2.x) <= 2.0 and abs(p1.y - p2.y) >= 180.0:
                        min_y = min(p1.y, p2.y)
                        max_y = max(p1.y, p2.y)
                        if min_y < 60.0 and 160.0 <= p1.x <= 430.0:
                            v_lines_x.append(p1.x)
                            if max_y <= max_allowed_bot_y:
                                h_lines_bot.append(max_y)
                    # Solid horizontal border lines
                    elif abs(p1.y - p2.y) <= 2.0 and abs(p1.x - p2.x) >= 160.0:
                        ly = min(p1.y, p2.y)
                        if ly < top_text_y + 2.0 and ly >= top_text_y - 25.0:
                            h_lines_top.append(ly)
                        elif (nfr_y1 and nfr_y1 - 2.0 <= ly <= max_allowed_bot_y) or (not nfr_y1 and 370.0 <= ly <= max_allowed_bot_y):
                            h_lines_bot.append(ly)
                elif item[0] == "re":
                    r = item[1]
                    if r.width <= 3.5 and r.height >= 180.0 and r.y0 < 60.0 and 160.0 <= r.x0 <= 430.0:
                        v_lines_x.append(r.x0)
                        if r.y1 <= max_allowed_bot_y:
                            h_lines_bot.append(r.y1)
                    elif r.height <= 3.5 and r.width >= 160.0:
                        if r.y0 < top_text_y + 2.0 and r.y0 >= top_text_y - 25.0:
                            h_lines_top.append(r.y0)
                        elif (nfr_y1 and nfr_y1 - 2.0 <= r.y1 <= max_allowed_bot_y) or (not nfr_y1 and 370.0 <= r.y1 <= max_allowed_bot_y):
                            h_lines_bot.append(r.y1)

        # Step 4: Compute outer box coordinates
        box_y0 = min(h_lines_top) if h_lines_top else (top_text_y - 6.0)
        if h_lines_bot:
            box_y1 = max(h_lines_bot)
        elif nfr_y1:
            box_y1 = nfr_y1 + 8.5
        else:
            box_y1 = 400.0

        if len(v_lines_x) >= 2:
            box_x0 = min(v_lines_x)
            box_x1 = max(v_lines_x)
        else:
            box_x0 = 187.0
            box_x1 = 407.5

        # Step 5: Safe Margins
        crop_x0 = max(0.0, round(box_x0 - 1.5, 2))
        crop_y0 = max(0.0, round(box_y0 - 1.5, 2))
        crop_x1 = min(width, round(box_x1 + 1.5, 2))

        # Bottom border: add +1.5 pt stroke allowance to ensure the bottom horizontal line is 100% visible
        crop_y1 = round(min(box_y1 + 1.5, ceiling_y - 3.5), 2)
        if nfr_y1 and crop_y1 < nfr_y1 + 7.5:
            crop_y1 = round(min(nfr_y1 + 8.5, ceiling_y - 3.5), 2)

        return fitz.Rect(crop_x0, crop_y0, crop_x1, crop_y1)

    def is_snapdeal_label(self, header_text: str, full_text: str = "") -> bool:
        """Detect if page text corresponds to a genuine Snapdeal invoice-packslip or shipping label."""
        combined = f"{header_text} {full_text}".lower()
        if not combined.strip():
            return False

        # If it has standard Meesho delivery/return indicators, it is Meesho - NOT Snapdeal
        if "customer address" in combined and ("if undelivered" in combined or "return to" in combined or "meesho" in combined):
            return False

        if "snapdeal" in combined:
            return True
        if re.search(r"\bslp\d{8,16}\b", combined, re.I):
            return True
        return False

    def detect_snapdeal_label_rect(self, page: fitz.Page, width: float, height: float) -> fitz.Rect:
        """Detect exact bounding rectangle of Snapdeal shipping label box.

        The shipping label is situated on the left portion of the page, completely enclosed
        by an outer black rectangular border containing:
        - Top: DELHIVERY barcode, black PREPAID bar, TOTAL ITEMS 1 / BLR/RDD
        - Middle: DELIVERY ADDRESS, PRODUCT NAME, QUANTITY 1, AMOUNT ALREADY PAID
        - Bottom: SELLER ADDRESS, SELLER GSTIN, Snapdeal Reference No barcode, help & lucky draw notice.

        The Tax Invoice table is situated to the right (starting with 'TAX INVOICE (ORIGINAL FOR RECIPIENT)').
        The vertical dashed line and vertical cut text ('--- cut here ---') situated to the right of the solid
        outer black border are strictly excluded from the crop box.
        """
        # Case 1: Pre-cropped or thermal sized page (width <= 360 pt, height <= 600 pt)
        if width <= 360.0 and height <= 600.0:
            drawings = page.get_drawings()
            for d in drawings:
                dr = d.get("rect")
                if dr and dr.width >= width * 0.75 and dr.height >= height * 0.75:
                    return fitz.Rect(
                        round(max(0.0, dr.x0 - 0.75), 2),
                        round(max(0.0, dr.y0 - 0.75), 2),
                        round(min(width, dr.x1 + 0.75), 2),
                        round(min(height, dr.y1 + 0.75), 2),
                    )
            return fitz.Rect(0, 0, width, height)

        # Case 2: Multi-section / A4 page
        # Step 1. Locate primary text anchor of the shipping label
        deliv_hits = page.search_for("DELIVERY ADDRESS") or page.search_for("DELIVERYADDRESS")
        if not deliv_hits:
            deliv_hits = page.search_for("AMOUNT ALREADY PAID") or page.search_for("DELHIVERY") or page.search_for("SELLER ADDRESS")
        deliv_hit = deliv_hits[0] if deliv_hits else fitz.Rect(18.0, 100.0, 150.0, 120.0)
        deliv_y0 = deliv_hit.y0

        # Step 2. Locate where the Tax Invoice table starts on the right
        tax_invoice_kws = [
            "TAX INVOICE",
            "INVOICE NUMBER",
            "BUYER",
            "ORIGINAL FOR RECIPIENT",
            "ITEM DESCRIPTION",
            "TAXABLE VALUE",
        ]
        inv_hits = []
        for kw in tax_invoice_kws:
            for h in page.search_for(kw):
                if h.x0 > deliv_hit.x0 + 80.0:
                    inv_hits.append(h)

        if inv_hits:
            invoice_start_x = min(h.x0 for h in inv_hits)
        else:
            invoice_start_x = width * 0.55

        # Step 3. Locate text bounds strictly INSIDE the shipping label
        # Top text: DELHIVERY, PREPAID, TOTAL ITEMS
        top_text_hits = (
            page.search_for("DELHIVERY")
            or page.search_for("PREPAID")
            or page.search_for("TOTAL ITEMS")
        )
        valid_top = [h for h in top_text_hits if h.x0 < invoice_start_x - 15.0 and h.y0 < deliv_y0]
        top_text_y0 = min(h.y0 for h in valid_top) if valid_top else max(10.0, deliv_y0 - 90.0)

        # Bottom text: assistance, Snapdeal App, lucky draws, SELLER GSTIN
        bot_text_hits = (
            page.search_for("assistance")
            or page.search_for("Snapdeal App")
            or page.search_for("My Orders")
            or page.search_for("lucky draws")
            or page.search_for("Prize Scheme")
            or page.search_for("SELLER GSTIN")
        )
        valid_bot = [h for h in bot_text_hits if h.x0 < invoice_start_x - 15.0 and h.y1 > deliv_y0]
        bot_text_y1 = max(h.y1 for h in valid_bot) if valid_bot else (deliv_y0 + 325.0)

        # Right-side text strictly inside the label cells (TOTAL ITEMS, QUANTITY, assistance, draws, BLR/RDD)
        internal_right_hits = []
        for kw in ["TOTAL ITEMS", "QUANTITY", "BLR/RDD", "assistance", "draws", "AMOUNT ALREADY PAID", "PKD:"]:
            for h in page.search_for(kw):
                if h.x0 < invoice_start_x - 15.0 and h.x1 < invoice_start_x - 5.0:
                    internal_right_hits.append(h)
        known_right_x1 = max(h.x1 for h in internal_right_hits) if internal_right_hits else (deliv_hit.x1 + 90.0)

        # Step 4. Detect dashed fold/cut line so we strictly stay to the left of it
        drawings = page.get_drawings()
        dashed_x_candidates = []
        for d in drawings:
            is_dashed = bool(d.get("dashes"))
            dr = d.get("rect")
            if is_dashed:
                if dr and 210.0 <= dr.x0 < invoice_start_x:
                    dashed_x_candidates.append(dr.x0)
                for item in d.get("items", []):
                    if item[0] == "l":
                        p1, p2 = item[1], item[2]
                        if 210.0 <= p1.x < invoice_start_x:
                            dashed_x_candidates.append((p1.x + p2.x) / 2.0)

        if dashed_x_candidates:
            dashed_line_x = min(dashed_x_candidates)
        else:
            dashed_line_x = invoice_start_x - 18.0

        # Maximum allowed right crop boundary: strictly 4.0 pt before the dashed line
        max_allowed_x1 = min(invoice_start_x - 10.0, dashed_line_x - 4.0)

        # Step 5. Identify the solid outer rectangle border lines from vector drawings
        h_table_lines: List[Tuple[float, float, float]] = []  # (x0, y, x1)
        v_left_lines: List[float] = []
        v_right_lines: List[float] = []
        v_line_y_ranges: List[Tuple[float, float]] = []
        outer_boxes: List[fitz.Rect] = []

        for d in drawings:
            # Strictly ignore any dashed lines (e.g. the vertical dashed fold/cut line)
            if d.get("dashes"):
                continue

            dr = d.get("rect")
            if dr:
                # Full outer bounding box if drawn as a single rectangle
                if (
                    180.0 <= dr.width <= 290.0
                    and 340.0 <= dr.height <= 480.0
                    and dr.x0 < 60.0
                    and dr.x1 <= max_allowed_x1 + 1.0
                ):
                    outer_boxes.append(dr)

                # Thin horizontal line / rectangle
                if dr.height <= 3.5 and dr.width >= 150.0:
                    if (
                        dr.x0 < 60.0
                        and dr.x1 <= max_allowed_x1 + 1.0
                        and (top_text_y0 - 30.0 <= dr.y0 <= bot_text_y1 + 30.0)
                    ):
                        h_table_lines.append((dr.x0, (dr.y0 + dr.y1) / 2.0, dr.x1))

                # Thin vertical line / rectangle
                elif dr.width <= 3.5 and dr.height >= 80.0:
                    if dr.y1 >= top_text_y0 - 15.0 and dr.y0 <= bot_text_y1 + 15.0:
                        if dr.x0 < 60.0:
                            v_left_lines.append(dr.x0)
                            v_line_y_ranges.append((dr.y0, dr.y1))
                        elif 210.0 <= dr.x1 <= max_allowed_x1 + 1.0:
                            v_right_lines.append(dr.x1)
                            v_line_y_ranges.append((dr.y0, dr.y1))

            for item in d.get("items", []):
                if item[0] == "l":
                    p1, p2 = item[1], item[2]
                    # Solid horizontal line
                    if abs(p1.y - p2.y) <= 2.0:
                        lx0 = min(p1.x, p2.x)
                        lx1 = max(p1.x, p2.x)
                        ly = (p1.y + p2.y) / 2.0
                        if (
                            (lx1 - lx0) >= 150.0
                            and lx0 < 60.0
                            and lx1 <= max_allowed_x1 + 1.0
                            and (top_text_y0 - 30.0 <= ly <= bot_text_y1 + 30.0)
                        ):
                            h_table_lines.append((lx0, ly, lx1))
                    # Solid vertical line
                    elif abs(p1.x - p2.x) <= 2.0:
                        lx = (p1.x + p2.x) / 2.0
                        ly0 = min(p1.y, p2.y)
                        ly1 = max(p1.y, p2.y)
                        if (ly1 - ly0) >= 80.0 and (ly1 >= top_text_y0 - 15.0 and ly0 <= bot_text_y1 + 15.0):
                            if lx < 60.0:
                                v_left_lines.append(lx)
                                v_line_y_ranges.append((ly0, ly1))
                            elif 210.0 <= lx <= max_allowed_x1 + 1.0:
                                v_right_lines.append(lx)
                                v_line_y_ranges.append((ly0, ly1))
                elif item[0] == "re":
                    r = item[1]
                    if 180.0 <= r.width <= 290.0 and 340.0 <= r.height <= 480.0 and r.x0 < 60.0 and r.x1 <= max_allowed_x1 + 1.0:
                        outer_boxes.append(r)
                    elif r.height <= 3.5 and r.width >= 150.0:
                        if r.x0 < 60.0 and r.x1 <= max_allowed_x1 + 1.0 and (top_text_y0 - 30.0 <= r.y0 <= bot_text_y1 + 30.0):
                            h_table_lines.append((r.x0, (r.y0 + r.y1) / 2.0, r.x1))
                    elif r.width <= 3.5 and r.height >= 80.0:
                        if r.y1 >= top_text_y0 - 15.0 and r.y0 <= bot_text_y1 + 15.0:
                            if r.x0 < 60.0:
                                v_left_lines.append(r.x0)
                                v_line_y_ranges.append((r.y0, r.y1))
                            elif 210.0 <= r.x1 <= max_allowed_x1 + 1.0:
                                v_right_lines.append(r.x1)
                                v_line_y_ranges.append((r.y0, r.y1))

        # Step 6. Determine exact coordinates of the outer black rectangular border
        all_right_candidates = []
        if outer_boxes:
            all_right_candidates.extend(b.x1 for b in outer_boxes)
        if v_right_lines:
            all_right_candidates.extend(v_right_lines)
        if h_table_lines:
            all_right_candidates.extend(l[2] for l in h_table_lines)
        if known_right_x1:
            all_right_candidates.append(known_right_x1 + 5.0)

        valid_rights = [r for r in all_right_candidates if r <= max_allowed_x1]
        box_x1 = max(valid_rights) if valid_rights else max(all_right_candidates)

        if outer_boxes:
            best_box = max(outer_boxes, key=lambda b: b.width * b.height)
            box_x0 = best_box.x0
            box_y0 = best_box.y0
            box_y1 = best_box.y1
        elif h_table_lines:
            box_x0 = min(l[0] for l in h_table_lines)
            box_y0 = min(l[1] for l in h_table_lines)
            box_y1 = max(l[1] for l in h_table_lines)
            if v_left_lines:
                box_x0 = min(box_x0, min(v_left_lines))
            if v_line_y_ranges:
                box_y0 = min(box_y0, min(r[0] for r in v_line_y_ranges))
                box_y1 = max(box_y1, max(r[1] for r in v_line_y_ranges))
        else:
            box_x0 = max(0.0, deliv_hit.x0 - 2.5)
            box_y0 = max(0.0, top_text_y0 - 4.0)
            box_y1 = min(height, bot_text_y1 + 4.0)

        # Check for top solid fill (black PREPAID banner) which aligns with top border
        for d in drawings:
            dr = d.get("rect")
            if dr and d.get("fill") and dr.x0 < 60.0 and dr.x1 <= box_x1 + 5.0:
                if abs(dr.y0 - box_y0) <= 20.0:
                    box_y0 = min(box_y0, dr.y0)

        # Content protection: ensure no label text or barcode is clipped
        if box_y0 > top_text_y0 - 1.0:
            box_y0 = max(0.0, top_text_y0 - 3.5)
        if box_y1 < bot_text_y1 + 1.0:
            box_y1 = min(height, bot_text_y1 + 3.5)
        if box_x0 > deliv_hit.x0 - 1.0:
            box_x0 = max(0.0, deliv_hit.x0 - 2.5)
        if box_x1 < known_right_x1 + 4.0:
            box_x1 = known_right_x1 + 5.0

        # Step 7. Crop bounds calculation:
        # Give right side +3.5 pt expansion so the black vertical border line is 100% visible and complete!
        crop_x0 = max(0.0, round(box_x0 - 0.75, 2))
        crop_y0 = max(0.0, round(box_y0 - 0.75, 2))
        crop_x1 = round(min(box_x1 + 3.5, max_allowed_x1), 2)
        crop_y1 = min(height, round(box_y1 + 0.75, 2))

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
            # If label sits on the left column (X < width * 0.75), Tax Invoice is on the right column
            if sd_rect.x1 < width * 0.75:
                inv_rect = fitz.Rect(sd_rect.x1, 0, width, height)
            elif sd_rect.y0 > 100.0:
                inv_rect = fitz.Rect(0, 0, width, sd_rect.y0)
            else:
                inv_rect = None

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

        has_top_customer_box = bool(
            re.search(r"\b(customer\s*address|deliver\s*to\s*:)\b", top_header_text, re.I)
        )

        # -------------------------------------------------------------------------
        # Standard Meesho A4 (99% of e-commerce seller batches)
        # -------------------------------------------------------------------------
        if is_meesho_a4:
            # Step 1: Detect Standalone Tax Invoice pages FIRST.
            # In GST invoices, TAX INVOICE header sits at the very top (Y < 180 pt)
            # and there is NO "Customer Address" delivery box at the top.
            is_top_invoice = bool(RE_TAX_INVOICE_HEADER.search(top_header_text))

            if is_top_invoice and not has_top_customer_box:
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
                    full_text=full_page_text,
                    top_half_text="",
                    bottom_half_text=full_page_text,
                    text_blocks=[],
                    marketplace="Meesho",
                )

            # Step 2: Dynamically detect separator line between label and invoice (~0.05ms)
            crop_y1 = self.detect_tax_invoice_separator(page, width, height)

            # Step 3: Extract text up to crop_y1 + 10.0 pt (shipping label area)
            top_clip = fitz.Rect(0, 0, width, crop_y1 + 10.0)
            top_text = page.get_text("text", clip=top_clip).strip()

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
