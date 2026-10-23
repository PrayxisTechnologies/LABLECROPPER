"""Main FastAPI application entrypoint for LabelFlow."""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.v1.router import api_v1_router
from app.core.config import get_settings
from app.core.errors import LabelFlowException, label_flow_exception_handler
from app.core.logging import logger
from app.db.mongodb import close_db, init_db, is_db_connected

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan context manager for startup and shutdown events."""
    logger.info("Starting LabelFlow application...")
    await init_db()
    yield
    logger.info("Shutting down LabelFlow application...")
    await close_db()


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
        lifespan=lifespan,
    )

    # CORS configuration: Allow localhost, production domains, and credentials
    origins = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://lablecropper.in",
        "https://www.lablecropper.in",
        "https://lablecropper.prayxis.in",
    ]
    # Also include any custom origins from settings
    for o in settings.cors_origins_list:
        if o != "*" and o not in origins:
            origins.append(o)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins if origins else ["*"],
        allow_credentials=True,
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
            "database_connected": is_db_connected(),
            "status": "online",
            "docs_url": "/docs",
            "health_url": f"{settings.API_V1_PREFIX}/health",
        }

    logger.info("LabelFlow API initialized successfully. Environment: %s", settings.ENVIRONMENT)
    return app


app = create_application()
