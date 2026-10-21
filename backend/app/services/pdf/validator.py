"""PDF validation service foundation."""

from typing import List, Optional, Tuple
from fastapi import UploadFile
import fitz  # PyMuPDF for lightning-fast C-level PDF validation

from app.core.config import get_settings
from app.core.logging import logger
from app.schemas.validation import FileValidationItem

PDF_MAGIC_BYTES = b"%PDF-"


class PDFValidatorService:
    """Service responsible for validating PDF uploads against structural and security requirements."""

    def __init__(self) -> None:
        self.settings = get_settings()

    async def validate_uploaded_file(self, file: UploadFile) -> Tuple[FileValidationItem, bytes]:
        """Validate an uploaded PDF file stream.

        Returns a tuple of (FileValidationItem, raw_file_bytes).
        """
        filename = file.filename or "unnamed.pdf"
        errors: List[str] = []
        warnings: List[str] = []
        page_count: Optional[int] = None
        is_valid = False

        # Read file content safely into memory for validation
        content = await file.read()
        size_bytes = len(content)

        # 1. Filename extension check
        if not filename.lower().endswith(".pdf"):
            errors.append(f"Invalid file extension. Expected '.pdf', received '{filename}'.")

        # 2. Non-empty check
        if size_bytes == 0:
            errors.append("File is empty (0 bytes).")
            return (
                FileValidationItem(
                    filename=filename,
                    size_bytes=size_bytes,
                    is_valid=False,
                    mime_type=file.content_type,
                    page_count=None,
                    errors=errors,
                    warnings=warnings,
                ),
                content,
            )

        # 3. File size limit check
        if size_bytes > self.settings.max_upload_bytes:
            errors.append(
                f"File size exceeds limit of {self.settings.MAX_UPLOAD_SIZE_MB} MB "
                f"({size_bytes / (1024 * 1024):.2f} MB)."
            )

        # 4. PDF Magic Header check (%PDF- within initial 1024 bytes)
        header_sample = content[:1024]
        if PDF_MAGIC_BYTES not in header_sample:
            errors.append("Missing valid PDF header signature (%PDF-). File may be corrupted or disguised.")

        # 5. Lightning-fast C-level structural check with PyMuPDF
        if not errors:
            try:
                doc = fitz.open(stream=content, filetype="pdf")
                page_count = len(doc)
                if page_count == 0:
                    errors.append("PDF document contains zero pages.")
                elif doc.is_encrypted:
                    errors.append("Password-protected PDF documents are not supported.")
                else:
                    is_valid = True
                    logger.info("PDF %s validated successfully: %d pages, %d bytes", filename, page_count, size_bytes)
                doc.close()
            except Exception as e:
                errors.append(f"Corrupted or invalid PDF document: {str(e)}")
                logger.warning("PDF reading error for %s: %s", filename, e)

        return (
            FileValidationItem(
                filename=filename,
                size_bytes=size_bytes,
                is_valid=is_valid,
                mime_type=file.content_type,
                page_count=page_count,
                errors=errors,
                warnings=warnings,
            ),
            content,
        )


pdf_validator_service = PDFValidatorService()
