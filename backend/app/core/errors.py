"""Custom application exceptions and error models."""

from typing import Any, Optional
from fastapi import Request
from fastapi.responses import JSONResponse


class LabelFlowException(Exception):
    """Base exception class for all LabelFlow business errors."""

    def __init__(
        self,
        message: str,
        status_code: int = 400,
        error_code: str = "BAD_REQUEST",
        details: Optional[Any] = None,
    ):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.error_code = error_code
        self.details = details


class InvalidPDFException(LabelFlowException):
    """Raised when an uploaded file is not a valid PDF or is corrupted."""

    def __init__(self, message: str, details: Optional[Any] = None):
        super().__init__(
            message=message,
            status_code=422,
            error_code="INVALID_PDF_FORMAT",
            details=details,
        )


class FileSizeExceededException(LabelFlowException):
    """Raised when an uploaded file exceeds the configured size limit."""

    def __init__(self, filename: str, max_size_mb: int, current_size_mb: float):
        super().__init__(
            message=f"File '{filename}' exceeds maximum allowed size of {max_size_mb} MB (received {current_size_mb:.2f} MB).",
            status_code=413,
            error_code="PAYLOAD_TOO_LARGE",
            details={"filename": filename, "max_mb": max_size_mb, "received_mb": current_size_mb},
        )


class MaxFilesExceededException(LabelFlowException):
    """Raised when the number of uploaded files exceeds the batch limit."""

    def __init__(self, max_files: int, received_count: int):
        super().__init__(
            message=f"Upload batch exceeds the maximum allowed count of {max_files} files (received {received_count}).",
            status_code=400,
            error_code="MAX_FILES_EXCEEDED",
            details={"max_files": max_files, "received_count": received_count},
        )


async def label_flow_exception_handler(request: Request, exc: LabelFlowException) -> JSONResponse:
    """Handle custom application exceptions and format unified response."""
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "success": False,
            "error": {
                "code": exc.error_code,
                "message": exc.message,
                "details": exc.details,
            },
        },
    )
