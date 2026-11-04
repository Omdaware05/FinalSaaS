"""FinalSaaS backend — entry point. Run: uvicorn app.main:app --port 8001"""
import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.api import (
    agents,
    auth,
    businesses,
    calendar,
    calls,
    campaigns,
    contacts,
    followups,
    invoices,
    leads,
    model_config,
    model_lab,
    questionnaires,
    reports,
    settings as settings_api,
    stats,
    telephony_config,
    voice_catalog,
    webhooks,
)
from app.config import settings
from app.db import engine, init_db
from app.errors import DomainError, domain_error_handler
from app.services import log_buffer

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
log_buffer.install()
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


async def _db_ok() -> bool:
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False


def _from_number_masked() -> str | None:
    number = (settings.VOBIZ_FROM_NUMBER or "").strip()
    if not number:
        return None
    if len(number) <= 4:
        return "***"
    return f"***{number[-4:]}"


async def _health_payload() -> dict:
    db_ok = await _db_ok()
    voice_ok = settings.voice_provider_configured
    provider = (settings.VOICE_PROVIDER or "sarvam").lower()
    engine_status = "healthy" if voice_ok else "not_configured"
    telephony_ok = settings.telephony_configured
    return {
        # existing FinalSaaS fields (unchanged contract)
        "status": "ok" if db_ok else "degraded",
        "database": db_ok,
        "telephony_configured": telephony_ok,
        "voice_provider_configured": voice_ok,
        "public_url_configured": settings.PUBLIC_BASE_URL.startswith("https://"),
        # SystemHealthResponse (old UI) — additive nested detail
        "service": "finalsaas-api",
        "controller": "ok",
        "database_detail": {
            "type": "sqlite" if settings.DATABASE_URL.startswith("sqlite") else "postgresql",
            "status": "connected" if db_ok else "disconnected",
        },
        "redis": {"status": "not_used"},
        "storage": {
            "provider": settings.STORAGE_BACKEND,
            "bucket": settings.S3_BUCKET if settings.STORAGE_BACKEND == "s3" else None,
            "status": "configured",
        },
        "dograh": {
            "healthy": {
                "reachable": False,
                "status": "not_used",
                "detail": "Dograh is not part of this deployment; the built-in voice engine is used.",
            }
        },
        "voice_ai": {
            "status": engine_status,
            "engine": "built-in",
            "stt": engine_status, "tts": engine_status, "llm": engine_status,
            "provider": provider,
        },
        "telephony": {
            "provider": "vobiz",
            "configured": telephony_ok,
            "status": "configured" if telephony_ok else "not_configured",
            "from_number": _from_number_masked(),
            "vobiz": {
                "configured": telephony_ok,
                "from_number": _from_number_masked(),
                "status": "configured" if telephony_ok else "not_configured",
            },
            "twilio": {"configured": False, "status": "not_active"},
        },
        # legacy flat fields the old health.ts reads
        "mongodb": "not_used",
        "stt": engine_status,
        "tts": engine_status,
        "llm": engine_status,
        "interest_model": "healthy",
        "providers": engine_status,
    }


@app.get("/health", tags=["system"])
async def health():
    return await _health_payload()


@app.get("/api/v1/health", tags=["system"])
async def health_v1():
    return await _health_payload()


async def _health_service_payload(service: str) -> dict:
    name = service.lower()
    if name == "interest-model":
        return {"service": name, "status": "healthy",
                "detail": "Built-in offline transcript analyzer (no external calls)."}
    if name == "mongodb":
        return {"service": name, "status": "offline",
                "detail": "MongoDB is not used by this deployment; data lives in SQL."}
    if name in ("stt", "tts", "llm", "providers"):
        from app.voice.providers import is_provider_configured

        ok = is_provider_configured()
        provider = (settings.VOICE_PROVIDER or "sarvam").lower()
        return {
            "service": name,
            "status": "healthy" if ok else "not_configured",
            "detail": f"Voice provider '{provider}' is "
                      + ("configured." if ok else "not configured (missing API key / local server URL)."),
        }
    db_ok = await _db_ok()
    return {"service": name, "status": "healthy" if db_ok else "offline",
            "detail": "Unknown service name; database probe reported."}


@app.get("/health/{service}", tags=["system"])
async def health_service(service: str):
    return await _health_service_payload(service)


@app.get("/api/v1/health/{service}", tags=["system"])
async def health_service_v1(service: str):
    return await _health_service_payload(service)


@app.get("/", tags=["system"])
async def root():
    provider = (settings.VOICE_PROVIDER or "sarvam").lower()
    if provider == "local":
        targets = (settings.LOCAL_STT_MODEL, settings.LOCAL_TTS_MODEL, settings.LOCAL_LLM_MODEL)
    else:
        targets = (settings.SARVAM_STT_MODEL, settings.SARVAM_TTS_MODEL, settings.SARVAM_LLM_MODEL)
    return {
        # existing fields
        "service": "FinalSaaS — AI Voice Calling",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/health",
        # SystemInfoResponse fields
        "app": "FinalSaaS — AI Voice Calling",
        "status": "running",
        "api": "/api/v1",
        "stt_target": targets[0],
        "tts_target": targets[1],
        "llm_target": targets[2],
    }


@app.get("/api/v1/", tags=["system"])
@app.get("/api/v1", tags=["system"])
async def root_v1():
    # The ported frontend's health client reads system info from its API base.
    return await root()


for _router in (auth.router, agents.router, contacts.router, calls.router,
                campaigns.router, leads.router, settings_api.router, webhooks.router,
                businesses.router, followups.router, calendar.router, stats.router,
                reports.router, invoices.router, questionnaires.router,
                telephony_config.router, voice_catalog.router, model_config.router,
                model_lab.router):
    app.include_router(_router, prefix="/api/v1")
