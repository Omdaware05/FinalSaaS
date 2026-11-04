"""Async engine / session factory."""
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings
from app.models import Base

if settings.DATABASE_URL.startswith("sqlite"):
    _path = settings.DATABASE_URL.split("///", 1)[-1]
    if _path and _path != ":memory:":
        Path(_path).parent.mkdir(parents=True, exist_ok=True)

engine = create_async_engine(settings.DATABASE_URL, pool_pre_ping=True)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def init_db() -> None:
    """Dev convenience: create tables directly (SQLite). Production Postgres uses Alembic."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
