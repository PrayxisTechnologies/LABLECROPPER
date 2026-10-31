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
    # Auto-heal any past missing tracking/waybill numbers & wrong order IDs in the background
    try:
        import asyncio
        from app.services.master_sheet.service import master_sheet_service
        from app.api.v1.endpoints.cloud_vault import cleanup_expired_cloud_files
        asyncio.create_task(master_sheet_service.heal_all_missing_waybills())
        asyncio.create_task(master_sheet_service.heal_all_wrong_order_ids())
        # Enforce 30-day active retention & 60-day trash auto-purge
        asyncio.create_task(master_sheet_service.enforce_retention_policy())

        async def periodic_retention_worker():
            while True:
                try:
                    await asyncio.sleep(6 * 3600)  # runs every 6 hours
                    await master_sheet_service.enforce_retention_policy()
                except asyncio.CancelledError:
                    break
                except Exception as ex:
                    logger.warning("Periodic retention error: %s", str(ex))

        asyncio.create_task(periodic_retention_worker())
        # Periodic 48-hour cloud vault disk cleanup
        cleanup_expired_cloud_files()
    except Exception as e:
        logger.warning("Could not schedule background healers: %s", str(e))

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
        "https://labelcropper.prayxis.in",
        "http://labelcropper.prayxis.in",
        "https://labelflow.prayxis.in",
        "http://labelflow.prayxis.in",
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

    @app.get("/api/logo", tags=["Brand"])
    async def get_official_logo():
        """Serves the official Prayxis LabelFlow brand logo directly."""
        from pathlib import Path
        from fastapi.responses import FileResponse

        candidates = [
            Path(__file__).resolve().parents[2] / "frontend" / "public" / "logo.png",
            Path.cwd() / "frontend" / "public" / "logo.png",
            Path("/home/ubuntu/labelflow/frontend/public/logo.png"),
        ]
        for p in candidates:
            if p.exists():
                return FileResponse(p, media_type="image/png")
        from fastapi import Response
        return Response(status_code=404)

    logger.info("LabelFlow API initialized successfully. Environment: %s", settings.ENVIRONMENT)
    return app


app = create_application()
