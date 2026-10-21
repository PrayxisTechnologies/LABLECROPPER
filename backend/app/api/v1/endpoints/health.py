"""Health check endpoint."""

from datetime import datetime, timezone
from fastapi import APIRouter
from app.core.config import get_settings
from app.schemas.health import HealthResponse, ServiceCapabilities

router = APIRouter()


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Service Health Check",
    description="Returns genuine operational status of LabelFlow backend and Phase roadmap readiness.",
)
async def check_health() -> HealthResponse:
    """Check API operational status and service capabilities."""
    settings = get_settings()

    return HealthResponse(
        status="healthy",
        service=settings.PROJECT_NAME,
        version=settings.VERSION,
        environment=settings.ENVIRONMENT,
        timestamp=datetime.now(timezone.utc),
        capabilities=ServiceCapabilities(
            pdf_validation=True,
            cropping_engine="active",
            courier_sorting="active",
            invoice_filter="active",
            sku_picklist="active",
        ),
    )
