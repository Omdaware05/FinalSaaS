"""Password hashing (bcrypt), JWT access tokens, and per-call HMAC tokens."""
import hashlib
import hmac
from datetime import timedelta

import bcrypt
import jwt

from app.config import settings
from app.models import User, utcnow

ALGORITHM = "HS256"
TOKEN_TTL = timedelta(hours=24)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8")[:72], bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8")[:72], password_hash.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def create_access_token(user: User) -> str:
    now = utcnow()
    payload = {
        "sub": user.id,
        "tenant_id": user.tenant_id,
        "role": user.role,
        "iat": now,
        "exp": now + TOKEN_TTL,
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict:
    return jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])


def sign_call_token(call_id: str) -> str:
    """HMAC token placed in carrier webhook URLs so only we can post call events."""
    return hmac.new(settings.webhook_secret.encode("utf-8"), call_id.encode("utf-8"), hashlib.sha256).hexdigest()


def verify_call_token(call_id: str, token: str) -> bool:
    if not token:
        return False
    return hmac.compare_digest(sign_call_token(call_id), token)
