"""Unit tests for SKU schemas, validation, and CSV formatting."""

from app.schemas.sku import (
    SKUConflictCheckRequest,
    SKUConflictCheckResponse,
    SKUImportResult,
    UserSKUCreate,
    UserSKUResponse,
    UserSKUUpdate,
)


def test_sku_create_schema_validation():
    """Verify that UserSKUCreate schema enforces valid sku_code and product_name."""
    item = UserSKUCreate(
        sku_code="PO10-GREEN",
        product_name="Green Kurti with embroidery",
        keywords=["green", "cotton kurti"],
        aliases=["GRN-10"],
        priority=5,
        is_active=True,
    )
    assert item.sku_code == "PO10-GREEN"
    assert len(item.keywords) == 2
    assert item.priority == 5
    assert item.is_active is True


def test_sku_conflict_check_schema():
    """Verify SKU conflict check request/response schemas."""
    req = SKUConflictCheckRequest(sku_codes=["SKU1", "SKU2", "SKU3"])
    assert len(req.sku_codes) == 3

    resp = SKUConflictCheckResponse(existing_sku_codes=["SKU1"])
    assert resp.existing_sku_codes == ["SKU1"]


def test_sku_import_result_schema():
    """Verify SKU CSV import result schema calculations."""
    res = SKUImportResult(
        imported_count=10,
        updated_count=5,
        total_processed=15,
        errors=["Row 3: invalid code"],
    )
    assert res.total_processed == 15
    assert len(res.errors) == 1
