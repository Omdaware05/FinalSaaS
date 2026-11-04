import time

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.deps import get_active_tenant, get_db
from app.models import utcnow
from app.services import tenant_config
from app.services.analyzer import analyze as run_analyzer
from app.telephony.vobiz import VoBizClient

router = APIRouter(tags=["settings-config"])


def _webhook_url() -> str:
    return f"{settings.PUBLIC_BASE_URL.rstrip('/')}/api/v1/webhooks/vobiz/answer" if settings.PUBLIC_BASE_URL else ""


# ------------------------------------------------------------------ VoBiz
class VoBizSaveIn(BaseModel):
    auth_id: str | None = None
    auth_token: str | None = None
    phone_number: str | None = None
    from_number: str | None = None


def _vobiz_response(resolved: dict) -> dict:
    return {
        "provider": "vobiz",
        "configured": resolved["configured"],
        "auth_id": resolved["auth_id"],
        "auth_token_masked": tenant_config.mask_secret(resolved["auth_token"]),
        "auth_token": tenant_config.mask_secret(resolved["auth_token"]),
        "has_token": bool(resolved["auth_token"]),
        "phone_number": resolved["from_number"],
        "from_number": resolved["from_number"],
        "webhook_url": _webhook_url(),
        "environment": resolved["source"],
        "is_ready_for_outbound": resolved["configured"] and bool(settings.PUBLIC_BASE_URL),
        "updated_at": utcnow().isoformat(),
    }


@router.get("/telephony/vobiz")
async def get_vobiz(tenant_id: str = Depends(get_active_tenant),
                    db: AsyncSession = Depends(get_db)):
    return _vobiz_response(await tenant_config.resolve_vobiz(db, tenant_id))


@router.post("/telephony/vobiz")
async def save_vobiz(body: VoBizSaveIn, tenant_id: str = Depends(get_active_tenant),
                     db: AsyncSession = Depends(get_db)):
    values: dict = {}
    if body.auth_id is not None:
        values["auth_id"] = body.auth_id
    if body.auth_token is not None:
        values["auth_token"] = body.auth_token
    number = body.phone_number if body.phone_number is not None else body.from_number
    if number is not None:
        values["from_number"] = number
    if values:
        await tenant_config.set_override(db, tenant_id, "vobiz", values)
    resolved = await tenant_config.resolve_vobiz(db, tenant_id)
    return {
        "success": True,
        "message": "VoBiz configuration saved.",
        "auth_id": resolved["auth_id"],
        "phone_number": resolved["from_number"],
        "configured": resolved["configured"],
        "config": _vobiz_response(resolved),
    }


@router.post("/telephony/vobiz/test")
async def test_vobiz(tenant_id: str = Depends(get_active_tenant),
                     db: AsyncSession = Depends(get_db)):
    resolved = await tenant_config.resolve_vobiz(db, tenant_id)
    if not resolved["auth_id"] or not resolved["auth_token"]:
        return {
            "success": False, "connected": False, "status": "NOT CONFIGURED",
            "message": "VoBiz Auth ID / Auth Token are not configured.", "http_code": None,
        }
    client = VoBizClient(auth_id=resolved["auth_id"], auth_token=resolved["auth_token"])
    balance = await client.get_balance()
    if balance is not None:
        return {
            "success": True, "connected": True, "status": "CONNECTED",
            "message": f"Connected to VoBiz. Current balance: {balance}",
            "balance": balance, "http_code": 200,
        }
    return {
        "success": False, "connected": False, "status": "NETWORK ERROR",
        "message": "Could not read the VoBiz account with these credentials. "
                   "Check the Auth ID / Auth Token and network access.",
        "http_code": None,
    }


# ------------------------------------------------------------------ Twilio
class TwilioSaveIn(BaseModel):
    account_sid: str | None = None
    auth_token: str | None = None
    phone_number: str | None = None
    from_number: str | None = None


def _twilio_response(resolved: dict) -> dict:
    return {
        "provider": "twilio",
        "configured": resolved["configured"],
        "account_sid": resolved["account_sid"],
        "auth_id": resolved["account_sid"],
        "auth_token_masked": tenant_config.mask_secret(resolved["auth_token"]),
        "auth_token": tenant_config.mask_secret(resolved["auth_token"]),
        "has_token": bool(resolved["auth_token"]),
        "phone_number": resolved["phone_number"],
        "from_number": resolved["phone_number"],
        "webhook_url": _webhook_url(),
        "environment": resolved["source"],
        "is_ready_for_outbound": False,
        "updated_at": utcnow().isoformat(),
    }


@router.get("/telephony/twilio")
async def get_twilio(tenant_id: str = Depends(get_active_tenant),
                     db: AsyncSession = Depends(get_db)):
    return _twilio_response(await tenant_config.resolve_twilio(db, tenant_id))


@router.post("/telephony/twilio")
async def save_twilio(body: TwilioSaveIn, tenant_id: str = Depends(get_active_tenant),
                      db: AsyncSession = Depends(get_db)):
    values: dict = {}
    if body.account_sid is not None:
        values["account_sid"] = body.account_sid
    if body.auth_token is not None:
        values["auth_token"] = body.auth_token
    number = body.phone_number if body.phone_number is not None else body.from_number
    if number is not None:
        values["phone_number"] = number
    if values:
        await tenant_config.set_override(db, tenant_id, "twilio", values)
    resolved = await tenant_config.resolve_twilio(db, tenant_id)
    return {
        "success": True,
        "message": "Twilio configuration saved (stored only — Twilio is not an active carrier in this deployment).",
        "account_sid": resolved["account_sid"],
        "phone_number": resolved["phone_number"],
        "configured": resolved["configured"],
        "config": _twilio_response(resolved),
    }


@router.post("/telephony/twilio/test")
async def test_twilio():
    return {
        "success": False,
        "connected": False,
        "status": "NOT CONFIGURED",
        "message": "Twilio is not an active carrier in this deployment — VoBiz is.",
        "http_code": None,
    }


# ------------------------------------------------------------------ Sarvam config
class SarvamSaveIn(BaseModel):
    api_key: str | None = None
    default_voice: str | None = None
    set_active: bool | None = None


def _sarvam_config_response(resolved: dict) -> dict:
    masked = tenant_config.mask_secret(resolved["api_key"])
    return {
        "success": True,
        "api_key": masked,
        "masked_api_key": masked,
        "default_voice": resolved["default_voice"],
        "tts_model": settings.SARVAM_TTS_MODEL,
        "stt_model": settings.SARVAM_STT_MODEL,
        "llm_model": settings.SARVAM_LLM_MODEL,
        "is_configured": resolved["configured"],
        "active": resolved["configured"],
        "source": resolved["source"],
    }


@router.get("/voice/sarvam/config")
async def get_sarvam_config(tenant_id: str = Depends(get_active_tenant),
                            db: AsyncSession = Depends(get_db)):
    return _sarvam_config_response(await tenant_config.resolve_sarvam(db, tenant_id))


@router.post("/voice/sarvam/config")
async def save_sarvam_config(body: SarvamSaveIn, tenant_id: str = Depends(get_active_tenant),
                             db: AsyncSession = Depends(get_db)):
    values: dict = {}
    if body.api_key is not None:
        values["api_key"] = body.api_key
    if body.default_voice is not None:
        values["default_voice"] = body.default_voice
    if values:
        await tenant_config.set_override(db, tenant_id, "sarvam", values)
    if body.set_active:
        await tenant_config.set_override(db, tenant_id, "voice_mode", {"mode": "sarvam"})
    return _sarvam_config_response(await tenant_config.resolve_sarvam(db, tenant_id))


@router.post("/voice/sarvam/test")
async def test_sarvam(tenant_id: str = Depends(get_active_tenant),
                      db: AsyncSession = Depends(get_db)):
    resolved = await tenant_config.resolve_sarvam(db, tenant_id)
    if not resolved["configured"]:
        return {
            "success": False, "connected": False, "status": "error",
            "message": "Sarvam API key is not configured.",
            "has_audio": False,
        }
    from app.voice.providers import SarvamTTS

    try:
        audio = await SarvamTTS(resolved["api_key"]).synthesize(
            "Hello, this is a connection test.", resolved["default_voice"], "en-IN"
        )
        return {
            "success": True, "connected": True, "status": "ok",
            "message": "Sarvam TTS responded with audio.",
            "model": settings.SARVAM_TTS_MODEL, "speaker": resolved["default_voice"],
            "request_id": None, "has_audio": bool(audio),
        }
    except Exception as exc:
        return {
            "success": False, "connected": False, "status": "error",
            "message": f"Sarvam TTS test failed: {exc}", "has_audio": False,
        }


# ------------------------------------------------------- transcript API config
AVAILABLE_MODELS = [
    {"id": "offline-rule-analyzer", "name": "Built-in Offline Analyzer", "latency": "~3 ms"},
    {"id": "gemini-2.5-flash", "name": "Gemini 2.5 Flash (key stored; analyzer remains built-in)"},
]
SAMPLE_TRANSCRIPT = (
    "Agent: Hello, are you interested in our admission program?\n"
    "Customer: Yes, I am interested. Please share more details."
)


class TranscriptSaveIn(BaseModel):
    provider: str | None = None
    api_key: str | None = None
    model: str | None = None


def _transcript_response(resolved: dict) -> dict:
    masked = tenant_config.mask_secret(resolved["api_key"])
    provider_id = resolved["provider"]
    return {
        "success": True,
        "provider": provider_id,
        "provider_name": "Built-in Offline Analyzer" if provider_id == "built-in" else provider_id,
        "api_key": masked,
        "masked_api_key": masked,
        "model": resolved["model"],
        "is_configured": True,
        "external_configured": resolved["external_configured"],
        "available_models": AVAILABLE_MODELS,
        "stt_engine": "sarvam-saaras",
    }


@router.get("/voice/transcript-api/config")
async def get_transcript_config(tenant_id: str = Depends(get_active_tenant),
                                db: AsyncSession = Depends(get_db)):
    return _transcript_response(await tenant_config.resolve_transcript_api(db, tenant_id))


@router.post("/voice/transcript-api/config")
async def save_transcript_config(body: TranscriptSaveIn,
                                 tenant_id: str = Depends(get_active_tenant),
                                 db: AsyncSession = Depends(get_db)):
    values: dict = {}
    if body.provider is not None:
        values["provider"] = body.provider
    if body.api_key is not None:
        values["api_key"] = body.api_key
    if body.model is not None:
        values["model"] = body.model
    if values:
        await tenant_config.set_override(db, tenant_id, "transcript_api", values)
    return _transcript_response(await tenant_config.resolve_transcript_api(db, tenant_id))


@router.post("/voice/transcript-api/test")
async def test_transcript_api(tenant_id: str = Depends(get_active_tenant),
                              db: AsyncSession = Depends(get_db)):
    resolved = await tenant_config.resolve_transcript_api(db, tenant_id)
    started = time.perf_counter()
    result = run_analyzer(SAMPLE_TRANSCRIPT)
    latency_ms = round((time.perf_counter() - started) * 1000, 2)
    return {
        "success": True, "connected": True, "status": "ok",
        "message": "Built-in transcript analyzer is working "
                   f"(sample classified as {result['disposition']}).",
        "latency_ms": latency_ms,
        "model": resolved["model"],
        "available_models_count": len(AVAILABLE_MODELS),
    }
