"""Invoice detection and safety verification service."""

from typing import Optional, Tuple
from app.services.pdf.inspector import PageInspectionResult


class InvoiceDetectorService:
    """Verifies that invoice removal does not compromise shipping information."""

    def can_safely_remove_invoice(
        self,
        inspection: PageInspectionResult,
    ) -> Tuple[bool, Optional[str]]:
        """Evaluate if invoice can be safely separated from shipping label.

        Returns (can_safely_remove, reason_if_not).
        """
        # Case 1: Full-page standalone tax invoice
        if inspection.layout_type == "tax_invoice":
            return True, None

        # Case 2: Split layout (Label on top, Invoice on bottom)
        if inspection.layout_type == "split_label_invoice":
            if not inspection.label_rect:
                return False, "Missing label crop boundary coordinates."

            # Verify that the cropped label area contains essential shipping elements
            if not inspection.is_safe_to_crop:
                return False, inspection.review_reason or "Label boundary could not be safely isolated."

            return True, None

        # Case 3: Pure shipping label
        if inspection.layout_type == "full_label":
            return False, "Page is already a standalone shipping label without an invoice."

        # Case 4: Ambiguous layout
        return (
            False,
            inspection.review_reason
            or "Page layout is ambiguous. Preserving entire page content.",
        )


invoice_detector_service = InvoiceDetectorService()
