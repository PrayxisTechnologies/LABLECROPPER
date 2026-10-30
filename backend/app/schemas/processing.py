"""Processing configuration and result schemas for Phase 2 PDF engine."""

from datetime import datetime
from enum import Enum
from typing import Dict, List, Optional
from pydantic import BaseModel, Field

from app.schemas.decision import AmbiguousLabelItem


class LabelOutputFormat(str, Enum):
    """Supported output label formats."""

    THERMAL_4X6 = "4x6_thermal"  # 100mm x 150mm (288 x 432 pt) direct thermal standard
    A4_GRID = "a4_grid"          # Multi-label sheet layout


class SortCriterion(str, Enum):
    """Sorting strategy options for shipping labels."""

    ORIGINAL = "original_order"                # Retain original document order
    SKU = "sku"                                # Group by product/SKU
    COURIER = "courier_partner"                # Group by Delhivery, Shadowfax, Xpressbees, Ekart, Valmo
    SKU_COURIER = "sku_courier"                # Group first by SKU, then by courier partner
    MARKETPLACE = "marketplace"                # Group by marketplace/platform (Meesho -> Flipkart -> Snapdeal)
    MARKETPLACE_SKU_COURIER = "marketplace_sku_courier"  # Group by Platform -> SKU -> Courier
    MARKETPLACE_COURIER = "marketplace_courier"          # Group by Platform -> Courier -> SKU
    SKU_MARKETPLACE_COURIER = "sku_marketplace_courier"  # Group by SKU -> Platform -> Courier
    COURIER_SKU_MARKETPLACE = "courier_sku_marketplace"  # Group by Courier -> SKU -> Platform
    COURIER_MARKETPLACE_SKU = "courier_marketplace_sku"  # Group by Courier -> Platform -> SKU
    SKU_COURIER_MARKETPLACE = "sku_courier_marketplace"  # Group by SKU -> Courier -> Platform

    @classmethod
    def _missing_(cls, value: object):
        if isinstance(value, str):
            val_clean = value.lower().strip().replace(" ", "_").replace("+", "_")
            if val_clean in ("delivery_partner", "courier", "delivery"):
                return cls.COURIER
            if val_clean in ("sku_delivery_partner", "sku_delivery", "sku_and_courier", "sku_and_delivery_partner"):
                return cls.SKU_COURIER
            if val_clean in ("original", "original_order", "none"):
                return cls.ORIGINAL
            if val_clean in ("marketplace", "platform", "marketplace_order", "platform_order"):
                return cls.MARKETPLACE
            if val_clean in ("marketplace_sku_courier", "platform_sku_courier", "marketplace_sku_delivery", "platform_sku_delivery"):
                return cls.MARKETPLACE_SKU_COURIER
            if val_clean in ("marketplace_courier", "platform_courier", "marketplace_delivery", "platform_delivery"):
                return cls.MARKETPLACE_COURIER
            if val_clean in ("sku_marketplace_courier", "sku_platform_courier"):
                return cls.SKU_MARKETPLACE_COURIER
            if val_clean in ("courier_sku_marketplace", "delivery_sku_platform", "courier_sku_platform"):
                return cls.COURIER_SKU_MARKETPLACE
            if val_clean in ("courier_marketplace_sku", "delivery_platform_sku", "courier_platform_sku"):
                return cls.COURIER_MARKETPLACE_SKU
            if val_clean in ("sku_courier_marketplace", "sku_delivery_platform", "sku_courier_platform"):
                return cls.SKU_COURIER_MARKETPLACE
        return None


class ProcessingConfig(BaseModel):
    """Configuration options for label processing execution."""

    output_format: LabelOutputFormat = Field(
        default=LabelOutputFormat.THERMAL_4X6,
        description="Target output dimensions and layout",
    )
    sort_by: SortCriterion = Field(
        default=SortCriterion.SKU_COURIER,
        description="Attribute used to sort and group labels",
    )
    remove_invoice: bool = Field(
        default=True,
        description="Automatically detect and separate customer invoices from thermal labels",
    )
    enable_sku_picklist: bool = Field(
        default=False,
        description="Generate an aggregated warehouse item picklist sheet",
    )
    excluded_main_skus: List[str] = Field(
        default_factory=list,
        description="List of parent Main SKUs to exclude from output PDF (e.g. ['GREEN'])",
    )
    excluded_skus: List[str] = Field(
        default_factory=list,
        description="List of specific individual SKU variants to exclude from output PDF",
    )
    excluded_couriers: List[str] = Field(
        default_factory=list,
        description="List of courier partners to exclude from output PDF (e.g. ['Valmo'])",
    )
    excluded_order_ids: List[str] = Field(
        default_factory=list,
        description="List of specific Order IDs / AWB numbers to exclude from output PDF",
    )
    excluded_marketplaces: List[str] = Field(
        default_factory=list,
        description="List of marketplace platforms to exclude from output PDF (e.g. ['Flipkart'])",
    )
    smart_sku_detection: bool = Field(
        default=False,
        description="When true, intelligently clusters unknown variants by pattern. When false, strict manual catalog mode.",
    )


class DuplicateLabelItem(BaseModel):
    """Details of a shipping label identified as duplicate from past uploads."""

    order_id: str = Field(..., description="Order ID or Sub-order reference")
    wbl_id: Optional[str] = Field(None, description="AWB / Waybill tracking number")
    sku: str = Field(default="UNMATCHED", description="Detected SKU code or product description")
    courier: str = Field(default="Unassigned", description="Courier logistics partner")
    input_filename: str = Field(..., description="Source file name in current upload")
    page_number: int = Field(..., description="1-indexed source page number in current upload")
    previous_job_id: Optional[str] = Field(None, description="Job identifier where this label was previously processed")
    previous_filename: Optional[str] = Field(None, description="Output PDF filename of previous batch (e.g. meesho1prayxis.pdf)")
    previous_processed_at: Optional[datetime] = Field(None, description="Timestamp when previously processed")


class ExtractedSKU(BaseModel):
    """Single item or SKU extracted from shipping label or packing note."""

    sku: str = Field(..., description="Detected SKU code or product identifier")
    quantity: int = Field(default=1, description="Unit quantity for this line item")
    description: Optional[str] = Field(None, description="Product title or size attribute if present")
    order_id: Optional[str] = Field(None, description="Associated Meesho Order / Sub-order reference")
    match_type: Optional[str] = Field(None, description="How the SKU was identified (canonical, keyword, regex, etc.)")
    confidence: Optional[float] = Field(None, description="Confidence score of the match")


class PageProcessingRecord(BaseModel):
    """Detailed result for an individual input page."""

    input_filename: str = Field(..., description="Source file name")
    page_number: int = Field(..., description="1-indexed source page number")
    page_type: str = Field(
        ...,
        description="'full_label' | 'split_label_invoice' | 'tax_invoice' | 'ambiguous'",
    )
    is_label_extracted: bool = Field(..., description="Whether a 4x6 label was generated from this page")
    is_invoice_removed: bool = Field(default=False, description="Whether an invoice section/page was omitted")
    is_flagged_for_review: bool = Field(default=False, description="Flagged due to layout ambiguity")
    review_reason: Optional[str] = Field(None, description="Explanation if flagged for review")
    courier_partner: str = Field(default="Unassigned", description="Detected logistics partner")
    courier_confidence: float = Field(default=0.0, description="Confidence score (0.0 to 1.0)")
    sku_items: List[ExtractedSKU] = Field(default_factory=list, description="Extracted SKU line items")
    marketplace: str = Field(default="Meesho", description="Detected marketplace (Meesho, Flipkart, Snapdeal, Amazon, etc.)")
    output_page_index: Optional[int] = Field(None, description="1-indexed position in output thermal PDF")
    dimensions_pt: List[float] = Field(default_factory=list, description="Original page [width, height]")


class CourierSummary(BaseModel):
    """Aggregated label counts per logistics provider."""

    courier: str = Field(..., description="Courier partner name")
    label_count: int = Field(..., description="Total 4x6 labels for this courier")
    percentage: float = Field(..., description="Percentage of total batch")


class MarketplaceSummary(BaseModel):
    """Aggregated label counts per e-commerce marketplace platform."""

    marketplace: str = Field(..., description="Marketplace platform name (Meesho, Flipkart, Snapdeal, Amazon, Myntra)")
    label_count: int = Field(..., description="Total 4x6 labels for this platform")
    percentage: float = Field(..., description="Percentage of total batch")


class PicklistItem(BaseModel):
    """Consolidated SKU item for warehouse fulfillment."""

    sku: str = Field(..., description="SKU identifier or UNMATCHED marker")
    total_quantity: int = Field(..., description="Total product units needed")
    label_count: int = Field(..., description="Total parcel shipping labels referencing this SKU")
    courier_partners: List[str] = Field(default_factory=list, description="Couriers servicing this SKU")
    status: str = Field(default="MATCHED", description="'MATCHED' or 'UNMATCHED'")
    order_references: List[str] = Field(default_factory=list, description="Associated order references")


class SubSkuSummary(BaseModel):
    """Individual SKU details with order counts and couriers."""
    sku: str = Field(..., description="Individual SKU code (e.g. Po10Green507, GREEN001)")
    main_sku: str = Field(..., description="Parent/Main SKU group (e.g. GREEN, BROWN)")
    quantity: int = Field(default=1, description="Total units of this SKU")
    label_count: int = Field(default=1, description="Number of shipping labels containing this SKU")
    courier_partners: List[str] = Field(default_factory=list, description="Couriers servicing this SKU")


class MainSkuSummary(BaseModel):
    """Parent/Main SKU group (e.g. GREEN, BROWN) aggregating variants."""
    main_sku: str = Field(..., description="Main SKU category name (e.g. GREEN, BROWN)")
    total_quantity: int = Field(default=0, description="Total unit quantity for this main SKU group")
    label_count: int = Field(default=0, description="Number of labels for this main SKU group")
    courier_counts: Dict[str, int] = Field(default_factory=dict, description="Courier breakdown for this Main SKU, e.g. {'Valmo': 98, 'Shadowfax': 37}")
    sub_skus: List[SubSkuSummary] = Field(default_factory=list, description="Sub-SKU variants under this main SKU")


class UploadInspectionResponse(BaseModel):
    """Immediate pre-crop summary returned upon PDF upload before generating labels."""
    total_files: int = Field(..., description="Number of files uploaded")
    total_pages: int = Field(..., description="Total pages across all uploaded files")
    total_labels: int = Field(..., description="Total shipping labels detected")
    courier_breakdown: List[CourierSummary] = Field(default_factory=list, description="Couriers detected")
    marketplace_breakdown: List[MarketplaceSummary] = Field(default_factory=list, description="Marketplace platforms detected")
    main_skus: List[MainSkuSummary] = Field(default_factory=list, description="Main parent SKU groups")
    all_skus: List[SubSkuSummary] = Field(default_factory=list, description="Detailed list of all SKUs")


class DownloadLinks(BaseModel):
    """Direct endpoints to retrieve generated job artifacts."""

    thermal_pdf: str = Field(..., description="URL to download combined 4x6 thermal PDF")
    picklist_csv: Optional[str] = Field(None, description="URL to download SKU picklist CSV")
    report_json: str = Field(..., description="URL to download full JSON processing audit")
    google_drive_folder: Optional[str] = Field(None, description="Direct Google Drive folder link")
    google_drive_pdf: Optional[str] = Field(None, description="Direct Google Drive PDF link")
    google_drive_picklist: Optional[str] = Field(None, description="Direct Google Drive picklist CSV link")


class ProcessingJobResponse(BaseModel):
    """Comprehensive response for completed PDF processing job."""

    job_id: str = Field(..., description="Unique job identifier")
    status: str = Field(default="completed", description="'completed' | 'partial' | 'failed'")
    created_at: datetime = Field(..., description="Timestamp when job finished processing")
    config: ProcessingConfig = Field(..., description="Configuration parameters applied to job")

    # Counts and metrics
    total_files: int = Field(..., description="Number of PDF files uploaded")
    total_input_pages: int = Field(..., description="Total pages inspected across all input PDFs")
    total_labels_generated: int = Field(..., description="Number of 4x6 thermal labels generated")
    total_invoices_removed: int = Field(..., description="Number of invoice pages/sections safely removed")
    total_pages_flagged: int = Field(..., description="Pages flagged for manual inspection")

    # Groupings
    courier_breakdown: List[CourierSummary] = Field(default_factory=list)
    marketplace_breakdown: List[MarketplaceSummary] = Field(default_factory=list, description="Marketplace platforms detected")
    main_skus: List[MainSkuSummary] = Field(default_factory=list, description="Main product SKU groups (e.g. BROWN, GREEN)")
    all_skus: List[SubSkuSummary] = Field(default_factory=list, description="All separate individual SKUs")
    picklist_items: List[PicklistItem] = Field(default_factory=list)
    pages: List[PageProcessingRecord] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)

    # Disambiguation & Smart Intelligence
    has_ambiguity: bool = Field(default=False, description="True if one or more labels have ambiguous SKU candidates")
    ambiguous_labels: List[AmbiguousLabelItem] = Field(default_factory=list, description="List of ambiguous labels awaiting confirmation")

    # Duplicate Label Tracking
    has_duplicates: bool = Field(default=False, description="True if one or more labels were already processed in earlier batches")
    all_labels_duplicate: bool = Field(default=False, description="True if 100% of labels in this upload were already processed before")
    duplicate_labels: List[DuplicateLabelItem] = Field(default_factory=list, description="List of detected duplicate labels")
    excluded_duplicates_count: int = Field(default=0, description="Count of duplicate labels currently excluded from output PDF")

    # Formatted Filename (e.g. meesho1prayxis.pdf)
    formatted_filename: Optional[str] = Field(default=None, description="Custom platform-sequenced output PDF filename")
    marketplace: Optional[str] = Field(default="Meesho", description="Detected marketplace (Meesho, Flipkart, Amazon, Myntra)")

    # Downloads
    downloads: DownloadLinks = Field(..., description="Artifact download endpoints")


class ClaimHistoryRequest(BaseModel):
    """Payload to claim guest processing batches upon user authentication."""

    job_ids: List[str] = Field(..., description="List of local guest job IDs to claim")

