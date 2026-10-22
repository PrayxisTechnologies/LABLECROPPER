"""Main FastAPI application entrypoint for LabelFlow."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.v1.router import api_v1_router
from app.core.config import get_settings
from app.core.errors import LabelFlowException, label_flow_exception_handler
from app.core.logging import logger

settings = get_settings()


def create_application() -> FastAPI:
    """Create and configure the FastAPI application instance."""
    app = FastAPI(
        title=settings.PROJECT_NAME,
        version=settings.VERSION,
        description=(
            "LabelFlow Backend API - High-performance Meesho shipping label "
            "cropping, sorting, and warehouse dispatch preparation service."
        ),
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
    )

    # Pure ASGI CORSMiddleware (Never buffers or deadlocks with multipart/form-data file uploads)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["*"],
        max_age=86400,
    )

    # Register custom exception handlers
    app.add_exception_handler(LabelFlowException, label_flow_exception_handler)

    # Mount API routers
    app.include_router(api_v1_router, prefix=settings.API_V1_PREFIX)

    @app.get("/", tags=["Root"])
    async def root():
        """Root status route."""
        return {
            "name": settings.PROJECT_NAME,
            "version": settings.VERSION,
            "environment": settings.ENVIRONMENT,
            "status": "online",
            "docs_url": "/docs",
            "health_url": f"{settings.API_V1_PREFIX}/health",
        }

    logger.info("LabelFlow API initialized successfully. Environment: %s", settings.ENVIRONMENT)
    return app


app = create_application()
