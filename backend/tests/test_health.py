"""Unit tests for GET /api/v1/health."""

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_health_check_success():
    """Verify health endpoint returns 200, valid structure, and phase flags."""
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()

    assert data["status"] == "healthy"
    assert data["service"] == "LabelFlow API"
    assert "version" in data
    assert "timestamp" in data
    assert data["capabilities"]["pdf_validation"] is True
    assert data["capabilities"]["cropping_engine"] == "active"
    assert data["capabilities"]["courier_sorting"] == "active"
    assert data["capabilities"]["invoice_filter"] == "active"
    assert data["capabilities"]["sku_picklist"] == "active"
    assert data["capabilities"]["sku_intelligence"] == "active"


def test_root_status():
    """Verify root / returns 200 and points to health/docs."""
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "online"
    assert "health_url" in data
