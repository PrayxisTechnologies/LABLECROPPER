"""File upload validation endpoint."""

from typing import List
from fastapi import APIRouter, File, HTTPException, UploadFile, status
from app.core.config import get_settings
from app.core.errors import MaxFilesExceededException
from app.core.logging import logger
from app.schemas.validation import FileValidationItem, ValidationSummaryResponse
from app.services.pdf.validator import pdf_validator_service

router = APIRouter()


@router.post(
    "/labels/validate",
    response_model=ValidationSummaryResponse,
    status_code=status.HTTP_200_OK,
    summary="Validate PDF Upload Batch",
    description="Validates uploaded PDF files for MIME headers, byte limits, and structural PDF compliance.",
)
async def validate_label_batch(
    files: List[UploadFile] = File(
        ...,
        description="One or more PDF shipping label files to validate",
    ),
) -> ValidationSummaryResponse:
    """Validate a batch of candidate PDF files for Meesho shipping label processing."""
    settings = get_settings()

    if not files:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No files were provided in the upload request.",
        )

    if settings.MAX_UPLOAD_FILES > 0 and len(files) > settings.MAX_UPLOAD_FILES:
        raise MaxFilesExceededException(
            max_files=settings.MAX_UPLOAD_FILES,
            received_count=len(files),
        )

    validated_items: List[FileValidationItem] = []
    valid_count = 0
    invalid_count = 0

    for file in files:
        item, _ = await pdf_validator_service.validate_uploaded_file(file)
        validated_items.append(item)
        if item.is_valid:
            valid_count += 1
        else:
            invalid_count += 1

    logger.info(
        "Validation batch completed: total=%d, valid=%d, invalid=%d",
        len(files),
        valid_count,
        invalid_count,
    )

    return ValidationSummaryResponse(
        success=True,
        total_files=len(files),
        valid_files_count=valid_count,
        invalid_files_count=invalid_count,
        all_valid=(invalid_count == 0),
        files=validated_items,
        phase_notice="Phase 1 validation passed. Cropping and sorting engines will activate in Phase 2.",
    )
