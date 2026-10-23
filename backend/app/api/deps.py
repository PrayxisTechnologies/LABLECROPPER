"""Authentication and database dependencies for API endpoints."""

from typing import Any, Dict, Optional
from fastapi import Cookie, Depends, Header, HTTPException, Request, status

from app.core.config import get_settings
from app.core.security import decode_access_token
from app.db.mongodb import ObjectId, get_db

settings = get_settings()


async def _extract_token_from_request(
    request: Request,
    authorization: Optional[str] = Header(default=None),
    cookie_token: Optional[str] = Cookie(default=None, alias=settings.AUTH_COOKIE_NAME),
) -> Optional[str]:
    """Extract JWT token from Authorization header or HttpOnly session cookie."""
    if authorization and authorization.lower().startswith("bearer "):
        return authorization[7:].strip()
    if cookie_token:
        return cookie_token.strip()
    # Also check raw request cookies in case alias mapping differs
    raw_cookie = request.cookies.get(settings.AUTH_COOKIE_NAME)
    if raw_cookie:
        return raw_cookie.strip()
    return None


async def get_optional_current_user(
    request: Request,
    authorization: Optional[str] = Header(default=None),
    cookie_token: Optional[str] = Cookie(default=None, alias=settings.AUTH_COOKIE_NAME),
) -> Optional[Dict[str, Any]]:
    """Retrieve current authenticated user if token is valid, otherwise return None.

    Does not raise 401, allowing guest workflows to proceed uninterrupted.
    """
    token = await _extract_token_from_request(request, authorization, cookie_token)
    if not token:
        return None

    payload = decode_access_token(token)
    if not payload or "sub" not in payload:
        return None

    db = get_db()
    if db is None:
        return None

    user_id = payload["sub"]
    try:
        user = await db.users.find_one({"_id": ObjectId(user_id)})
        if not user or not user.get("is_active", True):
            return None
        return user
    except Exception:
        return None


async def get_current_user(
    optional_user: Optional[Dict[str, Any]] = Depends(get_optional_current_user),
) -> Dict[str, Any]:
    """Enforce authentication requirement on protected endpoints.

    Raises HTTP 401 if token is missing, expired, or invalid.
    """
    if optional_user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please sign in to access this resource.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return optional_user
