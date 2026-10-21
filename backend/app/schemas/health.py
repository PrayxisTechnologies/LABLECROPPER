"""Health check response models."""

from datetime import datetime
from typing import Dict
from pydantic import BaseModel, Field


class ServiceCapabilities(BaseModel):
    """Capabilities status for current and planned phases."""

    pdf_validation: bool = Field(True, description="True if initial PDF validation service is online")
    cropping_engine: str = Field("active", description="Status of 4x6 label cropping pipeline")
    courier_sorting: str = Field("active", description="Status of courier barcode/text sorter")
    invoice_filter: str = Field("active", description="Status of invoice detection engine")
    sku_picklist: str = Field("active", description="Status of SKU aggregation and picklist generator")


class HealthResponse(BaseModel):
    """API health response payload."""

    status: str = Field("healthy", description="Operational health status")
    service: str = Field("LabelFlow Core API", description="Service identifier")
    version: str = Field(..., description="API version")
    environment: str = Field(..., description="Active runtime environment")
    timestamp: datetime = Field(..., description="Current server UTC timestamp")
    capabilities: ServiceCapabilities = Field(default_factory=ServiceCapabilities)
