"""File validation request and response models."""

from typing import List, Optional
from pydantic import BaseModel, Field


class FileValidationItem(BaseModel):
    """Validation report for an individual uploaded file."""

    filename: str = Field(..., description="Original name of the uploaded file")
    size_bytes: int = Field(..., description="File size in bytes")
    is_valid: bool = Field(..., description="Whether the file conforms to PDF structure requirements")
    mime_type: Optional[str] = Field(None, description="Reported or detected MIME type")
    page_count: Optional[int] = Field(None, description="Number of pages detected if valid PDF")
    errors: List[str] = Field(default_factory=list, description="Validation failure messages if any")
    warnings: List[str] = Field(default_factory=list, description="Non-fatal warnings if any")


class ValidationSummaryResponse(BaseModel):
    """Aggregated validation response for uploaded batch."""

    success: bool = Field(True, description="Whether the request was processed successfully")
    total_files: int = Field(..., description="Total count of files processed in upload batch")
    valid_files_count: int = Field(..., description="Count of structurally valid PDFs")
    invalid_files_count: int = Field(..., description="Count of invalid or rejected files")
    all_valid: bool = Field(..., description="True if every file in the batch passed validation")
    files: List[FileValidationItem] = Field(default_factory=list, description="Per-file validation details")
    phase_notice: str = Field(
        "Phase 1 validation passed. Cropping and sorting engines will activate in Phase 2.",
        description="Phase roadmap guidance notice",
    )
