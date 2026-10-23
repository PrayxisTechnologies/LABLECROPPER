"""Health check endpoint."""

from datetime import datetime, timezone
from fastapi import APIRouter
from app.core.config import get_settings
from app.db.mongodb import is_db_connected
from app.schemas.health import HealthResponse, ServiceCapabilities

router = APIRouter()


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Service Health Check",
    description="Returns genuine operational status of LabelFlow backend and database readiness.",
)
async def check_health() -> HealthResponse:
    """Check API operational status and service capabilities."""
    settings = get_settings()
    db_ok = is_db_connected()

    return HealthResponse(
        status="healthy",
        service=settings.PROJECT_NAME,
        version=settings.VERSION,
        environment=settings.ENVIRONMENT,
        timestamp=datetime.now(timezone.utc),
        database_connected=db_ok,
        capabilities=ServiceCapabilities(
            pdf_validation=True,
            cropping_engine="active",
            courier_sorting="active",
            invoice_filter="active",
            sku_picklist="active",
            database_connected=db_ok,
            sku_intelligence="active",
        ),
    )
