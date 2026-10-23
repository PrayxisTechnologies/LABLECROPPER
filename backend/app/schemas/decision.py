"""Pydantic schemas for SKU intelligence user decisions and ambiguity resolution."""

from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field


class SaveDecisionRequest(BaseModel):
    """User decision for disambiguating or assigning a SKU to product text."""

    raw_product_text: str = Field(..., description="Raw label or table text (Original full SKU)")
    chosen_sku: str = Field(..., description="The user-selected canonical SKU Name (Key)")
    matching_keyword: Optional[str] = Field(
        default=None,
        description="The matching keyword (Value) to search and match in shipping labels",
    )
    remember_rule: bool = Field(
        default=True,
        description="If True, persists rule in sku_decisions and adds to user's SKU database",
    )
    job_id: Optional[str] = Field(default=None, description="Optional associated processing job ID")


class DecisionResponse(BaseModel):
    """Saved decision record."""

    id: str
    user_id: str
    raw_product_text: str
    normalized_product_text: str
    chosen_sku: str
    created_at: datetime


class AmbiguousLabelItem(BaseModel):
    """A label from a processing job where SKU extraction is ambiguous."""

    label_index: int = Field(..., description="Index of label in the processing job (0-based)")
    filename: str
    page_number: int
    raw_text_snippet: str = Field(..., description="Original full SKU detected from shipping label")
    original_sku: Optional[str] = Field(default=None, description="Original full SKU string")
    detected_candidates: List[str] = Field(
        default_factory=list,
        description="Smart candidate keywords extracted from the SKU",
    )
    chosen_sku: Optional[str] = Field(default=None, description="Default suggested SKU Name (Key)")
    matching_keyword: Optional[str] = Field(default=None, description="Default suggested matching keyword (Value)")


class ResolveAmbiguityRequest(BaseModel):
    """Payload to resolve one or more ambiguous labels in a job."""

    resolutions: List[SaveDecisionRequest] = Field(
        ...,
        description="List of resolutions mapping text snippets to chosen SKUs",
    )
    recompile_output: bool = Field(
        default=True,
        description="Whether to immediately re-sort and re-generate the 4x6 thermal PDF and picklist",
    )
