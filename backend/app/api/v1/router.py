"""API Version 1 Router aggregation."""

from fastapi import APIRouter
from app.api.v1.endpoints import (
    auth,
    cloud_vault,
    decisions,
    health,
    jobs,
    master_sheet,
    process,
    skus,
    validation,
)

api_v1_router = APIRouter()

# Register endpoint routers
api_v1_router.include_router(health.router, tags=["Health"])
api_v1_router.include_router(auth.router, tags=["Authentication"])
api_v1_router.include_router(cloud_vault.router)
api_v1_router.include_router(skus.router, tags=["SKUs"])
api_v1_router.include_router(decisions.router, tags=["Decisions"])
api_v1_router.include_router(jobs.router, tags=["Jobs"])
api_v1_router.include_router(master_sheet.router, tags=["Master Sheet"])
api_v1_router.include_router(validation.router, tags=["Validation"])
api_v1_router.include_router(process.router, tags=["Processing"])
