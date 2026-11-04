"""FinalSaaS backend — entry point. Run: uvicorn app.main:app --port 8001"""
import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.api import agents, auth, calls, campaigns, contacts, leads, settings as settings_api, webhooks
from app.config import settings
from app.db import engine, init_db
from app.errors import DomainError, domain_error_handler

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("finalsaas")


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.DATABASE_URL.startswith("sqlite"):
        await init_db()
    if settings.SEED_DEMO:
        from app.seed import seed_if_empty

        await seed_if_empty()
    dispatcher_task = None
    if settings.START_DISPATCHER:
        from app.services.dispatcher import run_dispatcher_forever

        dispatcher_task = asyncio.create_task(run_dispatcher_forever())
    logger.info("FinalSaaS backend ready")
    yield
    if dispatcher_task is not None:
        dispatcher_task.cancel()


app = FastAPI(title="FinalSaaS — AI Voice Calling", version="1.0.0", lifespan=lifespan)
app.add_exception_handler(DomainError, domain_error_handler)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", tags=["system"])
async def health():
    db_ok = False
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        db_ok = False
    return {
        "status": "ok" if db_ok else "degraded",
        "database": db_ok,
        "telephony_configured": settings.telephony_configured,
        "voice_provider_configured": settings.voice_provider_configured,
        "public_url_configured": settings.PUBLIC_BASE_URL.startswith("https://"),
    }


@app.get("/", tags=["system"])
async def root():
    return {"service": "FinalSaaS — AI Voice Calling", "version": "1.0.0", "docs": "/docs", "health": "/health"}


for _router in (auth.router, agents.router, contacts.router, calls.router,
                campaigns.router, leads.router, settings_api.router, webhooks.router):
    app.include_router(_router, prefix="/api/v1")
