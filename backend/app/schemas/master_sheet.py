"""Pydantic schemas for Master Label Sheet and Order Search."""

from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field


class LabelAppearance(BaseModel):
    """Occurrence of a label in a cropped thermal PDF file."""

    job_id: str = Field(..., description="Processing job identifier")
    pdf_filename: str = Field(..., description="Target cropped PDF filename")
    input_filename: Optional[str] = Field(default=None, description="Original uploaded PDF filename")
    page_number: int = Field(..., description="1-indexed page number in the cropped PDF")
    created_at: datetime = Field(..., description="Processing timestamp")


class MasterLabelItem(BaseModel):
    """Consolidated master record for a unique Order ID across all uploads."""

    id: str = Field(..., description="Unique database identifier")
    user_id: str = Field(..., description="Seller user ID")
    order_id: str = Field(..., description="Unique Order Number / Sub-Order ID")
    sku: str = Field(..., description="Product SKU identifier")
    wbl_id: Optional[str] = Field(default=None, description="Tracking / Waybill ID (AWB)")
    courier_partner: str = Field(default="Unassigned", description="Delivery Logistics Partner")
    marketplace: str = Field(default="Meesho", description="Platform (Meesho, Flipkart, etc.)")
    appearances: List[LabelAppearance] = Field(
        default_factory=list,
        description="List of all PDF files and page positions where this label exists",
    )
    first_processed_at: datetime = Field(..., description="Initial processing timestamp")
    last_processed_at: datetime = Field(..., description="Most recent processing timestamp")


class MasterSheetResponse(BaseModel):
    """Paginated Master Sheet response with summary metrics."""

    items: List[MasterLabelItem]
    total: int
    page: int
    size: int
    unique_orders_count: int
    unique_skus_count: int
    all_time_total: int = 0
    filtered_total: int = 0
    marketplace_counts: dict[str, int] = Field(default_factory=dict)
    couriers_list: List[str] = Field(default_factory=list)
