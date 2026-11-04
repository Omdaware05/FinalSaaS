"""FastAPI dependencies.

Tenant identity comes from the JWT. The active working tenant (business)
defaults to the user's home tenant and can be switched ONLY to a tenant
the user holds a UserBusiness membership in, via the X-Business-ID /
X-Tenant-ID header the old frontend sends. Arbitrary header values never
grant access — no membership, no switch.
"""
from typing import AsyncGenerator, Optional

import jwt as pyjwt
from fastapi import Depends, HTTPException, Query, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import async_session
from app.models import User, UserBusiness
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
    access_token: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
) -> User:
    # Bearer header first; ?access_token= fallback exists for <audio> tags
    # and direct file downloads (recording / voice preview) that cannot
    # set headers.
    token = credentials.credentials if credentials and credentials.credentials else access_token
    if not token:
        raise _unauthorized()
    try:
        payload = decode_access_token(token)
    except pyjwt.PyJWTError:
        raise _unauthorized("Invalid or expired token")
    user_id = payload.get("sub")
    if not user_id:
        raise _unauthorized("Invalid token")
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if user is None or not user.is_active:
        raise _unauthorized("User not found or inactive")
    return user


async def user_tenant_ids(db: AsyncSession, user: User) -> set[str]:
    """Home tenant + every tenant the user is a member of."""
    rows = (
        await db.execute(select(UserBusiness.tenant_id).where(UserBusiness.user_id == user.id))
    ).scalars().all()
    return {user.tenant_id, *rows}


async def resolve_active_tenant(db: AsyncSession, user: User, requested: str | None) -> str:
    """The tenant a request operates on.

    `requested` (header) wins only when a membership exists (or it IS the
    home tenant); anything else silently falls back to the home tenant.
    """
    if requested:
        cleaned = requested.strip()
        if cleaned and cleaned.lower() not in ("all", "all_clients", "null", "undefined"):
            if cleaned == user.tenant_id:
                return cleaned
            membership = (
                await db.execute(
                    select(UserBusiness).where(
                        UserBusiness.user_id == user.id,
                        UserBusiness.tenant_id == cleaned,
                    )
                )
            ).scalar_one_or_none()
            if membership is not None:
                return cleaned
    return user.tenant_id


async def get_active_tenant(
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> str:
    requested = request.headers.get("x-business-id") or request.headers.get("x-tenant-id")
    return await resolve_active_tenant(db, user, requested)


def scoped_user(user: User, tenant_id: str) -> User:
    """A detached User copy whose tenant_id is the active tenant.

    Service functions (call_service, ...) key everything off
    user.tenant_id; handing them this copy scopes their work to the
    active business without changing their signatures.
    """
    if tenant_id == user.tenant_id:
        return user
    return User(
        id=user.id,
        tenant_id=tenant_id,
        email=user.email,
        password_hash="",
        name=user.name,
        role=user.role,
        is_active=True,
        created_at=user.created_at,
    )
