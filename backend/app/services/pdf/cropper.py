"""PDF Label Cropping and Thermal Canvas Generation Service."""

from typing import Optional, Tuple
import fitz  # PyMuPDF

# ==============================================================================
# 🖨️ THERMAL PRINTER SAFE PADDING SETTINGS (MANUAL CONTROLS)
# ==============================================================================
# Charo sides me safe padding taaki thermal printer (TSC, Zebra, TVS, etc.)
# print karte waqt border lines, barcode, ya TAX INVOICE text ko cut na kare.
#
# Unit: Points (72 points = 1 inch, 1 mm ≈ 2.83 pt)
# Default: 10.0 pt (~3.5 mm) safe margin around the label.
DEFAULT_PADDING_LEFT = 10.0    # Left margin in points (~3.5 mm)
DEFAULT_PADDING_TOP = 10.0     # Top margin in points (~3.5 mm)
DEFAULT_PADDING_RIGHT = 10.0   # Right margin in points (~3.5 mm)
DEFAULT_PADDING_BOTTOM = 10.0  # Bottom margin in points (~3.5 mm)
# ==============================================================================


class PDFCropperService:
    """Extracts, crops, and renders shipping labels onto safe thermal label pages."""

    def __init__(self) -> None:
        self.is_implemented = True

    def place_label_on_thermal_page(
        self,
        src_doc: fitz.Document,
        src_page_num: int,
        crop_box: fitz.Rect,
        target_doc: fitz.Document,
        pad_left: float = DEFAULT_PADDING_LEFT,
        pad_top: float = DEFAULT_PADDING_TOP,
        pad_right: float = DEFAULT_PADDING_RIGHT,
        pad_bottom: float = DEFAULT_PADDING_BOTTOM,
    ) -> fitz.Page:
        """Render a cropped section of a source PDF page with safe margins on all 4 sides.

        Maintains razor-sharp 100% vector graphics, crisp barcodes, and scannable QR codes.
        Prevents hardware printer rollers from clipping outer black border lines or text.
        """
        box_w = max(10.0, crop_box.width)
        box_h = max(10.0, crop_box.height)

        # Total canvas size including the 4-sided safe padding
        page_width = box_w + pad_left + pad_right
        page_height = box_h + pad_top + pad_bottom

        # Create target page matching the label + padding dimensions
        target_page = target_doc.new_page(
            width=page_width,
            height=page_height,
        )

        # Destination rectangle centered inside the safe padding
        printable_rect = fitz.Rect(
            pad_left,
            pad_top,
            pad_left + box_w,
            pad_top + box_h,
        )

        # Render vector-preserved page content clipped to crop_box with 1:1 scale
        target_page.show_pdf_page(
            printable_rect,
            src_doc,
            src_page_num,
            clip=crop_box,
            keep_proportion=True,
        )

        return target_page


pdf_cropper_service = PDFCropperService()
