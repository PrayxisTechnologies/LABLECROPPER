"""Main FastAPI application entrypoint for LabelFlow."""

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
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

    # Universal CORS Guarantee Middleware: Intercepts all requests & OPTIONS preflight
    @app.middleware("http")
    async def cors_guarantee_middleware(request: Request, call_next):
        if request.method == "OPTIONS":
            response = Response(status_code=204)
            response.headers["Access-Control-Allow-Origin"] = "*"
            response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS, HEAD, PATCH"
            response.headers["Access-Control-Allow-Headers"] = "*"
            response.headers["Access-Control-Max-Age"] = "86400"
            return response

        try:
            response = await call_next(request)
        except Exception as exc:
            logger.error("Unhandled API exception: %s", str(exc), exc_info=True)
            response = JSONResponse(
                status_code=500,
                content={"error": {"code": "INTERNAL_SERVER_ERROR", "message": str(exc)}},
            )

        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS, HEAD, PATCH"
        response.headers["Access-Control-Allow-Headers"] = "*"
        return response

    # Standard Starlette CORSMiddleware
    cors_origins = settings.cors_origins_list
    allow_wildcard = "*" in cors_origins

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"] if allow_wildcard else cors_origins,
        allow_credentials=not allow_wildcard,
        allow_methods=["*"],
        allow_headers=["*"],
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
