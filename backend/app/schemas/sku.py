"""Pydantic schemas for Personal SKU Management."""

from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field


class UserSKUCreate(BaseModel):
    """Schema to create a new SKU in user's personal database."""

    sku_code: str = Field(..., min_length=1, max_length=100, description="Unique SKU code")
    product_name: Optional[str] = Field(default=None, description="Optional product title (defaults to SKU code)")
    keywords: List[str] = Field(default_factory=list, description="Keywords for label matching")
    aliases: List[str] = Field(default_factory=list, description="Alternative SKU names or codes")
    priority: int = Field(default=0, description="Disambiguation priority rank (higher wins)")
    is_active: bool = Field(default=True, description="Whether this SKU is actively matched")


class UserSKUUpdate(BaseModel):
    """Schema for updating an existing personal SKU."""

    sku_code: Optional[str] = Field(default=None, min_length=1, max_length=100)
    product_name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    keywords: Optional[List[str]] = None
    aliases: Optional[List[str]] = None
    priority: Optional[int] = None
    is_active: Optional[bool] = None


class UserSKUResponse(BaseModel):
    """Public SKU response schema."""

    id: str = Field(..., description="Unique database SKU identifier")
    user_id: str = Field(..., description="Owner user ID")
    sku_code: str = Field(..., description="Canonical SKU Code")
    product_name: str = Field(..., description="Descriptive product title")
    keywords: List[str] = Field(default_factory=list, description="Keywords used for matching")
    aliases: List[str] = Field(default_factory=list, description="Alternative names / codes")
    priority: int = Field(default=0, description="Priority rank")
    is_active: bool = Field(default=True, description="Active status")
    created_at: datetime = Field(..., description="Creation timestamp")
    updated_at: datetime = Field(..., description="Last updated timestamp")


class SKUListResponse(BaseModel):
    """Paginated list of personal SKUs."""

    items: List[UserSKUResponse]
    total: int
    page: int
    size: int


class SKUImportResult(BaseModel):
    """Result summary of a bulk SKU CSV upload."""

    imported_count: int = Field(..., description="Number of newly created SKUs")
    updated_count: int = Field(..., description="Number of existing SKUs updated")
    total_processed: int = Field(..., description="Total rows processed from CSV")
    errors: List[str] = Field(default_factory=list, description="Validation warnings or skipped lines")


class SKUConflictCheckRequest(BaseModel):
    """Request to check if candidate SKU codes already exist for this user."""

    sku_codes: List[str]


class SKUConflictCheckResponse(BaseModel):
    """Conflicting SKU codes that already exist."""

    existing_sku_codes: List[str]
