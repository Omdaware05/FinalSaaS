"""Test fixtures. Env is set BEFORE any app import so Settings picks it up."""
import asyncio
import os
import tempfile

_TMP = tempfile.mkdtemp(prefix="finalsaas_test_")
_DB_URL = f"sqlite+aiosqlite:///{_TMP}/test.db"

os.environ["SECRET_KEY"] = "test-secret-key-for-tests-only"
os.environ["DATABASE_URL"] = _DB_URL
os.environ["START_DISPATCHER"] = "false"
os.environ["SEED_DEMO"] = "false"
os.environ["PUBLIC_BASE_URL"] = ""
os.environ["VOBIZ_AUTH_ID"] = ""
os.environ["VOBIZ_AUTH_TOKEN"] = ""
os.environ["VOBIZ_FROM_NUMBER"] = ""

import pytest  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine  # noqa: E402


def run_async(fn):
    """Run fn(session_maker) on a fresh engine/loop; returns fn's result."""

    async def _wrapper():
        from app.models import Base

        engine = create_async_engine(_DB_URL)
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
        try:
            return await fn(maker)
        finally:
            await engine.dispose()

    return asyncio.run(_wrapper())


def create_tenant_user(email: str, password: str, tenant_name: str):
    """Insert a tenant + user directly; returns (tenant_id, user_id)."""
    from app.models import Tenant, User, UserBusiness
    from app.security import hash_password

    async def _make(maker):
        async with maker() as db:
            tenant = Tenant(name=tenant_name, slug=tenant_name.lower().replace(" ", "-"))
            db.add(tenant)
            await db.flush()
            user = User(
                tenant_id=tenant.id, email=email,
                password_hash=hash_password(password), name="Tester", role="admin",
            )
            db.add(user)
            await db.flush()
            db.add(UserBusiness(user_id=user.id, tenant_id=tenant.id, role="admin"))
            await db.commit()
            return tenant.id, user.id

    return run_async(_make)


def create_agent_row(tenant_id: str, name: str = "Test Agent") -> str:
    from app.models import Agent

    async def _make(maker):
        async with maker() as db:
            agent = Agent(tenant_id=tenant_id, name=name, enabled=True, concurrency=5)
            db.add(agent)
            await db.commit()
            return agent.id

    return run_async(_make)


@pytest.fixture()
def client():
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as test_client:
        yield test_client


def login(client, email: str, password: str) -> dict:
    resp = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, resp.text
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
