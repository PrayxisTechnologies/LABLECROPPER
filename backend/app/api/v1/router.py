"""API Version 1 Router aggregation."""

from fastapi import APIRouter
from app.api.v1.endpoints import health, process, validation

api_v1_router = APIRouter()

# Register endpoint routers
api_v1_router.include_router(health.router, tags=["Health"])
api_v1_router.include_router(validation.router, tags=["Validation"])
api_v1_router.include_router(process.router, tags=["Processing"])

