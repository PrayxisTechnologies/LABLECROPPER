"""PDF Label Cropping and Thermal Canvas Generation Service."""

from typing import Optional, Tuple
import fitz  # PyMuPDF


class PDFCropperService:
    """Extracts, crops, and renders shipping labels onto tightly-fitted label pages (matching E-cropper)."""

    def __init__(self) -> None:
        self.is_implemented = True

    def place_label_on_thermal_page(
        self,
        src_doc: fitz.Document,
        src_page_num: int,
        crop_box: fitz.Rect,
        target_doc: fitz.Document,
        margin_pt: float = 0.0,
    ) -> fitz.Page:
        """Render a cropped section of a source PDF page onto a page matching the crop box.

        Removes all outer white wasted margin/canvas so the output PDF contains ONLY the cropped label,
        matching E-cropper behavior (no large blank top/bottom/side areas).
        Maintains razor-sharp 100% vector graphics, crisp barcodes, and scannable QR codes.
        """
        box_w = max(10.0, crop_box.width)
        box_h = max(10.0, crop_box.height)

        # Create page matching the exact cropped label dimensions (zero white margins like E-cropper)
        target_page = target_doc.new_page(
            width=box_w,
            height=box_h,
        )

        printable_rect = fitz.Rect(0, 0, box_w, box_h)

        # Render vector-preserved page content clipped to crop_box with 1:1 scale and zero padding
        target_page.show_pdf_page(
            printable_rect,
            src_doc,
            src_page_num,
            clip=crop_box,
            keep_proportion=True,
        )

        return target_page


pdf_cropper_service = PDFCropperService()
