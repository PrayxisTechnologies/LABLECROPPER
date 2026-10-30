"""Pydantic schemas for authentication and user management."""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field

try:
    import email_validator  # noqa: F401
    from pydantic import EmailStr
except ImportError:
    from typing import Annotated
    from pydantic import StringConstraints
    # Resilient fallback if email-validator package is not installed in the python environment
    EmailStr = Annotated[
        str,
        StringConstraints(
            pattern=r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$",
            strip_whitespace=True,
            to_lower=True,
        ),
    ]


class UserSettings(BaseModel):
    """User account configurable preferences."""

    default_sort_mode: str = Field(
        default="sku_courier",
        description="Default sorting criterion ('sku_courier', 'original_order', 'sku', 'courier_partner')",
    )
    default_invoice_removal: bool = Field(
        default=True,
        description="Default invoice page separation preference",
    )
    default_picklist: bool = Field(
        default=True,
        description="Default SKU picklist generation preference",
    )
    sku_matching_sensitivity: str = Field(
        default="medium",
        description="SKU intelligence matching sensitivity: 'high', 'medium', or 'lenient'",
    )
    auto_save_to_drive: bool = Field(
        default=True,
        description="Automatically backup newly processed batches to linked Google Drive",
    )


class UserSettingsUpdateRequest(BaseModel):
    """Partial update for user preferences."""

    default_sort_mode: Optional[str] = None
    default_invoice_removal: Optional[bool] = None
    default_picklist: Optional[bool] = None
    sku_matching_sensitivity: Optional[str] = None
    auto_save_to_drive: Optional[bool] = None


class UserRegisterRequest(BaseModel):
    """Payload for user account registration."""

    email: EmailStr = Field(..., description="User email address")
    password: str = Field(..., min_length=6, description="Password (at least 6 characters)")
    name: Optional[str] = Field(default=None, max_length=100, description="Seller or organization name")


class UserLoginRequest(BaseModel):
    """Payload for user login."""

    email: EmailStr = Field(..., description="User email address")
    password: str = Field(..., description="Account password")


class UserResetPasswordRequest(BaseModel):
    """Payload for updating forgotten password."""

    email: EmailStr = Field(..., description="User email address")
    new_password: str = Field(..., min_length=6, description="New password (min 6 characters)")


class VerifiedEmailLoginRequest(BaseModel):
    """Payload for logging in with a verified email (via OTP or OAuth)."""

    email: EmailStr = Field(..., description="Verified email address")
    name: Optional[str] = Field(default=None, description="Optional user name")


class UserResponse(BaseModel):
    """Public user profile data (never contains password hash)."""

    id: str = Field(..., description="Unique User ID")
    email: str = Field(..., description="Normalized user email")
    name: Optional[str] = Field(default=None, description="Seller name")
    is_active: bool = Field(default=True, description="Account active status")
    settings: UserSettings = Field(default_factory=UserSettings)
    created_at: datetime = Field(..., description="Account creation timestamp")
    last_login_at: Optional[datetime] = Field(default=None, description="Last login timestamp")
    google_id: Optional[str] = Field(default=None, description="Linked Google account ID")
    google_picture: Optional[str] = Field(default=None, description="Google profile picture URL")
    google_drive_connected: bool = Field(default=False, description="Whether Google Drive is connected for history")
    google_drive_folder_url: Optional[str] = Field(default=None, description="Direct URL to Google Drive label folder")


class TokenResponse(BaseModel):
    """Token response returned upon successful authentication."""

    access_token: str = Field(..., description="Signed JWT Bearer access token")
    token_type: str = Field(default="bearer", description="Token type")
    expires_in_minutes: int = Field(..., description="Token lifespan in minutes")
    user: UserResponse = Field(..., description="Current authenticated user details")


class GoogleAuthRequest(BaseModel):
    """Payload for Google OAuth2 / GIS Sign-in and Drive linking."""

    credential: Optional[str] = Field(default=None, description="Google Identity Services JWT ID token")
    code: Optional[str] = Field(default=None, description="Google OAuth authorization code (for Drive offline access)")
    redirect_uri: Optional[str] = Field(default=None, description="Frontend callback URL")
    link_drive: bool = Field(default=True, description="Whether to request or activate Drive permissions")


class GoogleDriveStatusResponse(BaseModel):
    """Google Drive integration status for the current user."""

    connected: bool = Field(..., description="Whether user's Google Drive is currently linked")
    email: Optional[str] = Field(default=None, description="Google account email")
    folder_name: Optional[str] = Field(default=None, description="Folder name on user's Google Drive")
    folder_url: Optional[str] = Field(default=None, description="Direct web link to open folder in Drive")
    auto_save: bool = Field(default=True, description="Auto save preference")


class SaveToDriveResponse(BaseModel):
    """Result of saving a processing job to Google Drive."""

    success: bool
    job_id: str
    folder_url: Optional[str] = None
    pdf_drive_url: Optional[str] = None
    picklist_drive_url: Optional[str] = None
    message: str
