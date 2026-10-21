"""Unit tests for POST /api/v1/labels/validate."""

import io
from fastapi.testclient import TestClient
from pypdf import PdfWriter
from app.main import app

client = TestClient(app)


def create_minimal_pdf_bytes() -> bytes:
    """Create a minimal valid in-memory PDF document for test uploads."""
    writer = PdfWriter()
    writer.add_blank_page(width=288, height=432)  # 4x6 inch dimensions
    buffer = io.BytesIO()
    writer.write(buffer)
    return buffer.getvalue()


def test_validate_valid_pdf():
    """Verify validation succeeds with a real valid PDF."""
    pdf_bytes = create_minimal_pdf_bytes()
    files = [
        ("files", ("test_label.pdf", pdf_bytes, "application/pdf")),
    ]

    response = client.post("/api/v1/labels/validate", files=files)
    assert response.status_code == 200
    data = response.json()

    assert data["success"] is True
    assert data["total_files"] == 1
    assert data["valid_files_count"] == 1
    assert data["invalid_files_count"] == 0
    assert data["all_valid"] is True
    assert len(data["files"]) == 1
    assert data["files"][0]["filename"] == "test_label.pdf"
    assert data["files"][0]["is_valid"] is True
    assert data["files"][0]["page_count"] == 1


def test_validate_invalid_extension():
    """Verify non-pdf file is marked as invalid with clear error."""
    files = [
        ("files", ("test.txt", b"plain text content", "text/plain")),
    ]

    response = client.post("/api/v1/labels/validate", files=files)
    assert response.status_code == 200
    data = response.json()

    assert data["total_files"] == 1
    assert data["valid_files_count"] == 0
    assert data["invalid_files_count"] == 1
    assert data["all_valid"] is False
    assert len(data["files"][0]["errors"]) > 0


def test_validate_empty_file():
    """Verify zero-byte PDF is rejected."""
    files = [
        ("files", ("empty.pdf", b"", "application/pdf")),
    ]

    response = client.post("/api/v1/labels/validate", files=files)
    assert response.status_code == 200
    data = response.json()

    assert data["files"][0]["is_valid"] is False
    assert any("empty" in err.lower() for err in data["files"][0]["errors"])


def test_validate_mixed_batch():
    """Verify batch containing both valid and invalid files reports correct counts."""
    valid_pdf = create_minimal_pdf_bytes()
    files = [
        ("files", ("good.pdf", valid_pdf, "application/pdf")),
        ("files", ("bad.pdf", b"NOT_A_REAL_PDF_CONTENT", "application/pdf")),
    ]

    response = client.post("/api/v1/labels/validate", files=files)
    assert response.status_code == 200
    data = response.json()

    assert data["total_files"] == 2
    assert data["valid_files_count"] == 1
    assert data["invalid_files_count"] == 1
    assert data["all_valid"] is False
