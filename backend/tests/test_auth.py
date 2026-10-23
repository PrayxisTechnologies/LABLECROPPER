"""Unit tests for authentication security, password hashing, and JWT tokens."""

from datetime import timedelta
from app.core.security import create_access_token, decode_access_token, hash_password, verify_password


def test_password_hashing():
    """Verify that bcrypt hashes passwords securely and verifies correctly."""
    plain = "SuperSecretPassword123!"
    hashed = hash_password(plain)

    # Must be hashed and not equal to plain text
    assert hashed != plain
    assert hashed.startswith("$2b$") or hashed.startswith("$2a$")

    # Correct password verifies
    assert verify_password(plain, hashed) is True

    # Incorrect password fails
    assert verify_password("WrongPassword!", hashed) is False


def test_jwt_token_lifecycle():
    """Verify JWT access token creation, claims, and decoding."""
    subject = "user_test_6717a0b3f81e3a"
    claims = {"email": "seller@example.com"}

    token = create_access_token(
        subject=subject,
        claims=claims,
        expires_delta=timedelta(minutes=30),
    )

    assert isinstance(token, str)
    assert len(token) > 20

    decoded = decode_access_token(token)
    assert decoded is not None
    assert decoded["sub"] == subject
    assert decoded["email"] == "seller@example.com"
    assert "exp" in decoded
    assert "iat" in decoded


def test_invalid_jwt_token():
    """Verify corrupted or invalid JWT tokens return None."""
    assert decode_access_token("not.a.valid.jwt.token") is None
    assert decode_access_token("") is None


def test_reset_password_schema():
    """Verify UserResetPasswordRequest schema validation."""
    from app.schemas.auth import UserResetPasswordRequest

    req = UserResetPasswordRequest(
        email="seller@example.com",
        new_password="NewSecurePassword123!",
    )
    assert req.email == "seller@example.com"
    assert req.new_password == "NewSecurePassword123!"
