"""Application configuration settings."""

from functools import lru_cache
from typing import List, Optional
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration for LabelFlow backend."""

    PROJECT_NAME: str = "LabelFlow API"
    VERSION: str = "1.0.0"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True

    # Server binding
    BACKEND_HOST: str = "127.0.0.1"
    BACKEND_PORT: int = 8000
    API_V1_PREFIX: str = "/api/v1"

    # CORS configuration - default allows localhost & production frontends
    ALLOWED_CORS_ORIGINS: str = "*"

    # Upload validation limits (Supports 500+ files and 2GB+ per batch)
    MAX_UPLOAD_SIZE_MB: int = 2048
    MAX_UPLOAD_FILES: int = 500
    ALLOWED_MIME_TYPES: str = "application/pdf"

    # Storage paths
    STORAGE_DIR: str = "storage"
    JOB_RETENTION_HOURS: int = 24

    # MongoDB Persistent Storage
    MONGODB_URI: str = "mongodb+srv://prayxistechnologies_db_user:3ELAR327CBt6w8Jy@cluster0.lc8hqsq.mongodb.net/labelflow?retryWrites=true&w=majority"
    MONGODB_DATABASE: str = "labelflow"
    MONGODB_CONNECT_TIMEOUT_MS: int = 15000

    # User Authentication & Security
    AUTH_SECRET_KEY: str = "labelflow-jwt-secret-key-prod-2026-super-secure-token-meesho-cropper"
    AUTH_ALGORITHM: str = "HS256"
    AUTH_ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 30  # 30 days
    AUTH_COOKIE_NAME: str = "labelflow_token"
    AUTH_COOKIE_SECURE: bool = False  # Set to True in HTTPS production environments
    AUTH_COOKIE_SAMESITE: str = "lax"

    # Google OAuth2 & Google Drive Integration
    GOOGLE_CLIENT_ID: Optional[str] = None
    GOOGLE_CLIENT_SECRET: Optional[str] = None
    GOOGLE_REDIRECT_URI: Optional[str] = None
    GOOGLE_DRIVE_FOLDER_NAME: str = "LabelFlow - Meesho Labels"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    @property
    def cors_origins_list(self) -> List[str]:
        """Parse comma-separated allowed origins into a cleaned list."""
        return [origin.strip() for origin in self.ALLOWED_CORS_ORIGINS.split(",") if origin.strip()]

    @property
    def max_upload_bytes(self) -> int:
        """Calculate max upload size in bytes."""
        return self.MAX_UPLOAD_SIZE_MB * 1024 * 1024

    @property
    def allowed_mimes_list(self) -> List[str]:
        """Parse comma-separated mime types."""
        return [mime.strip().lower() for mime in self.ALLOWED_MIME_TYPES.split(",") if mime.strip()]


@lru_cache()
def get_settings() -> Settings:
    """Retrieve cached application settings instance."""
    return Settings()
