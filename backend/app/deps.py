"""FastAPI dependencies. Tenant identity ALWAYS comes from the JWT, never headers/query."""
from typing import AsyncGenerator, Optional

import jwt as pyjwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import async_session
from app.models import User
from app.security import decode_access_token

_bearer = HTTPBearer(auto_error=False)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session() as session:
        yield session


def _unauthorized(message: str = "Authentication required") -> HTTPException:
    return HTTPException(
        status_code=401,
        detail={"success": False, "error": "UNAUTHORIZED", "message": message},
    )


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
) -> User:
    if credentials is None or not credentials.credentials:
        raise _unauthorized()
    try:
        payload = decode_access_token(credentials.credentials)
    except pyjwt.PyJWTError:
        raise _unauthorized("Invalid or expired token")
    user_id = payload.get("sub")
    if not user_id:
        raise _unauthorized("Invalid token")
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if user is None or not user.is_active:
        raise _unauthorized("User not found or inactive")
    return user
