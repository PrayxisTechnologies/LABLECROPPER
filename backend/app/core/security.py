"""Security utilities for password hashing and JWT token management with safe fallbacks."""

import base64
from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import json
from typing import Any, Dict, Optional

from app.core.config import get_settings

settings = get_settings()

try:
    import bcrypt
    HAS_BCRYPT = True
except ImportError:
    bcrypt = None
    HAS_BCRYPT = False

try:
    import jwt
    HAS_JWT = True
except ImportError:
    jwt = None
    HAS_JWT = False


def hash_password(password: str) -> str:
    """Hash a plaintext password using bcrypt with salt (or SHA-256 fallback if bcrypt not installed)."""
    if HAS_BCRYPT and bcrypt is not None:
        salt = bcrypt.gensalt()
        pw_bytes = password.encode("utf-8")
        hashed = bcrypt.hashpw(pw_bytes, salt)
        return hashed.decode("utf-8")

    # Safe built-in hashlib fallback
    salt = "labelflow_secure_salt_2026"
    h = hashlib.sha256(f"{password}:{salt}".encode("utf-8")).hexdigest()
    return f"sha256${h}"


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plaintext password against a stored hash."""
    if not hashed_password or not plain_password:
        return False

    if hashed_password.startswith("$2b$") or hashed_password.startswith("$2a$"):
        if HAS_BCRYPT and bcrypt is not None:
            try:
                pw_bytes = plain_password.encode("utf-8")
                hash_bytes = hashed_password.encode("utf-8")
                return bcrypt.checkpw(pw_bytes, hash_bytes)
            except Exception:
                return False
        return False

    if hashed_password.startswith("sha256$"):
        salt = "labelflow_secure_salt_2026"
        expected = f"sha256${hashlib.sha256(f'{plain_password}:{salt}'.encode('utf-8')).hexdigest()}"
        return hmac.compare_digest(hashed_password, expected)

    return False


def create_access_token(
    subject: str,
    claims: Optional[Dict[str, Any]] = None,
    expires_delta: Optional[timedelta] = None,
) -> str:
    """Generate a signed JWT access token for user authentication."""
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(
            minutes=settings.AUTH_ACCESS_TOKEN_EXPIRE_MINUTES
        )

    to_encode: Dict[str, Any] = {
        "sub": str(subject),
        "exp": int(expire.timestamp()),
        "iat": int(datetime.now(timezone.utc).timestamp()),
    }
    if claims:
        to_encode.update(claims)

    if HAS_JWT and jwt is not None:
        encoded_jwt = jwt.encode(
            to_encode,
            settings.AUTH_SECRET_KEY,
            algorithm=settings.AUTH_ALGORITHM,
        )
        return encoded_jwt

    # Standard fallback HMAC-SHA256 token if pyjwt not yet installed
    header = {"alg": "HS256", "typ": "JWT"}
    h_b64 = base64.urlsafe_b64encode(json.dumps(header).encode()).decode().rstrip("=")
    p_b64 = base64.urlsafe_b64encode(json.dumps(to_encode).encode()).decode().rstrip("=")
    sig = hmac.new(
        settings.AUTH_SECRET_KEY.encode(),
        f"{h_b64}.{p_b64}".encode(),
        hashlib.sha256,
    ).digest()
    sig_b64 = base64.urlsafe_b64encode(sig).decode().rstrip("=")
    return f"{h_b64}.{p_b64}.{sig_b64}"


def decode_access_token(token: str) -> Optional[Dict[str, Any]]:
    """Decode and validate a JWT access token."""
    if not token or not isinstance(token, str):
        return None

    if HAS_JWT and jwt is not None:
        try:
            payload = jwt.decode(
                token,
                settings.AUTH_SECRET_KEY,
                algorithms=[settings.AUTH_ALGORITHM],
            )
            return payload
        except Exception:
            return None

    # Fallback validator
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        h_b64, p_b64, sig_b64 = parts
        expected_sig = hmac.new(
            settings.AUTH_SECRET_KEY.encode(),
            f"{h_b64}.{p_b64}".encode(),
            hashlib.sha256,
        ).digest()
        # Pad base64
        padded_sig = sig_b64 + "=" * (-len(sig_b64) % 4)
        if not hmac.compare_digest(base64.urlsafe_b64decode(padded_sig), expected_sig):
            return None
        padded_p = p_b64 + "=" * (-len(p_b64) % 4)
        payload = json.loads(base64.urlsafe_b64decode(padded_p).decode())
        exp = payload.get("exp")
        if exp and datetime.now(timezone.utc).timestamp() > exp:
            return None
        return payload
    except Exception:
        return None
