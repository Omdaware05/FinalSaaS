"""Model mode / providers / per-type model configuration.

The old UI talks in model TYPES (stt | llm | tts) — /model-config/{type}
is a category bucket of ModelConfigEntry rows, one of which is active.
Tests are real: sarvam entries ping Sarvam TTS with the resolved key;
local entries probe the local AI server.
"""
import time

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.deps import get_active_tenant, get_db
from app.errors import DomainError
from app.models import ModelConfigEntry, utcnow
from app.services import tenant_config
from app.services.local_probe import probe_local

router = APIRouter(tags=["model-config"])

MODEL_TYPES = ("stt", "llm", "tts", "interest")

PROVIDERS = [
    {
        "provider_id": "sarvam", "id": "sarvam", "name": "Sarvam AI",
        "model_type": "all",
        "description": "Cloud STT (Saaras), LLM and TTS (Bulbul) tuned for Indian languages.",
        "capabilities": ["stt", "llm", "tts"],
        "configured": bool(settings.SARVAM_API_KEY),
    },
    {
        "provider_id": "local", "id": "local", "name": "Local AI Server",
        "model_type": "all",
        "description": "OpenAI-compatible server on your own GPU machine (Whisper / Qwen / Kokoro).",
        "capabilities": ["stt", "llm", "tts"],
        "configured": bool(settings.LOCAL_AI_BASE_URL),
    },
]

DEFAULT_MODELS = {
    "stt": {"sarvam": settings.SARVAM_STT_MODEL, "local": settings.LOCAL_STT_MODEL},
    "llm": {"sarvam": settings.SARVAM_LLM_MODEL, "local": settings.LOCAL_LLM_MODEL},
    "tts": {"sarvam": settings.SARVAM_TTS_MODEL, "local": settings.LOCAL_TTS_MODEL},
    "interest": {"sarvam": "offline-rule-analyzer", "local": "offline-rule-analyzer"},
}


def _entry_out(e: ModelConfigEntry) -> dict:
    provider = e.provider or "sarvam"
    credentials = True
    if provider == "sarvam":
        credentials = bool(settings.SARVAM_API_KEY) or bool((e.config or {}).get("api_key"))
    elif provider == "local":
        credentials = bool(settings.LOCAL_AI_BASE_URL)
    return {
        "config_id": e.id, "id": e.id, "tenant_id": e.tenant_id,
        "model_type": e.model_type, "provider": provider,
        "name": e.name, "model_id": e.model_id,
        "model": e.model_id,
        "parameters": e.config or {}, "config": e.config or {},
        "is_active": e.is_active, "is_draft": e.is_draft,
        "credentials_configured": credentials,
        "source": "database",
        "created_at": e.created_at.isoformat() if e.created_at else None,
        "updated_at": e.updated_at.isoformat() if e.updated_at else None,
    }


def _env_entry(tenant_id: str, model_type: str) -> dict:
    provider = (settings.VOICE_PROVIDER or "sarvam").lower()
    model_id = DEFAULT_MODELS.get(model_type, {}).get(provider, "")
    return {
        "config_id": f"env-{model_type}", "id": f"env-{model_type}",
        "tenant_id": tenant_id, "model_type": model_type, "provider": provider,
        "name": f"{provider} default", "model_id": model_id, "model": model_id,
        "parameters": {}, "config": {}, "is_active": True, "is_draft": False,
        "credentials_configured": provider != "sarvam" or bool(settings.SARVAM_API_KEY),
        "source": "environment", "created_at": None, "updated_at": None,
    }


async def _entries(db: AsyncSession, tenant_id: str, model_type: str) -> list[ModelConfigEntry]:
    return (
        await db.execute(
            select(ModelConfigEntry).where(
                ModelConfigEntry.tenant_id == tenant_id,
                ModelConfigEntry.model_type == model_type,
            ).order_by(ModelConfigEntry.created_at)
        )
    ).scalars().all()


def _check_type(model_type: str) -> None:
    if model_type not in MODEL_TYPES:
        raise DomainError("INVALID_MODEL_TYPE", f"model_type must be one of {MODEL_TYPES}.", 400)


async def _test_entry(db: AsyncSession, tenant_id: str, entry: ModelConfigEntry | None,
                      provider: str, model_type: str) -> dict:
    started = time.perf_counter()
    if provider == "local":
        probe = await probe_local()
        latency = round((time.perf_counter() - started) * 1000, 1)
        return {
            "reachable": probe["reachable"], "success": probe["reachable"],
            "latency_ms": latency,
            "message": "Local AI server responded." if probe["reachable"]
                       else "Local AI server is not reachable.",
            "details": {"url": probe["url"], "models_status": probe["models_status"]},
        }
    # sarvam (default): real TTS ping with the resolved key
    resolved = await tenant_config.resolve_sarvam(db, tenant_id)
    api_key = (entry.config or {}).get("api_key") if entry else None
    key = api_key or resolved["api_key"]
    if not key:
        return {
            "reachable": False, "success": False, "latency_ms": 0,
            "message": "Sarvam API key is not configured.", "details": {},
        }
    from app.voice.providers import SarvamTTS

    try:
        audio = await SarvamTTS(key).synthesize("Test", "shubh", "en-IN")
        latency = round((time.perf_counter() - started) * 1000, 1)
        return {
            "reachable": True, "success": True, "latency_ms": latency,
            "message": "Sarvam responded with audio." if audio else "Sarvam responded.",
            "details": {"has_audio": bool(audio)},
        }
    except Exception as exc:
        latency = round((time.perf_counter() - started) * 1000, 1)
        return {
            "reachable": False, "success": False, "latency_ms": latency,
            "message": f"Sarvam test failed: {exc}", "details": {},
        }


# ------------------------------------------------------------------- mode
@router.get("/model-mode")
async def get_model_mode(tenant_id: str = Depends(get_active_tenant),
                         db: AsyncSession = Depends(get_db)):
    mode = await tenant_config.resolve_voice_mode(db, tenant_id)
    sarvam = await tenant_config.resolve_sarvam(db, tenant_id)
    probe = await probe_local()
    is_local = mode == "local"
    return {
        "success": True,
        "mode": mode,
        "active_provider": "local" if is_local else "sarvam",
        "is_local": is_local,
        "is_sarvam": not is_local,
        "local_configured": bool(settings.LOCAL_AI_BASE_URL),
        "local_server_ready": probe["reachable"],
        "local_server_url": probe["url"],
        "sarvam_configured": sarvam["configured"],
        "models": {
            "llm": settings.LOCAL_LLM_MODEL if is_local else settings.SARVAM_LLM_MODEL,
            "stt": settings.LOCAL_STT_MODEL if is_local else settings.SARVAM_STT_MODEL,
            "tts": settings.LOCAL_TTS_MODEL if is_local else settings.SARVAM_TTS_MODEL,
        },
    }


class ModeToggleIn(BaseModel):
    mode: str | None = None


@router.post("/model-mode/toggle")
async def toggle_model_mode(body: ModeToggleIn, tenant_id: str = Depends(get_active_tenant),
                            db: AsyncSession = Depends(get_db)):
    current = await tenant_config.resolve_voice_mode(db, tenant_id)
    if body.mode:
        mode = body.mode.strip().lower()
        if mode not in ("sarvam", "local", "api"):
            raise DomainError("INVALID_MODE", "mode must be 'sarvam' or 'local'.", 400)
    else:
        mode = "sarvam" if current == "local" else "local"
    await tenant_config.set_override(db, tenant_id, "voice_mode", {"mode": mode})
    probe = await probe_local()
    return {
        "success": True, "mode": mode,
        "is_local": mode == "local", "is_sarvam": mode != "local",
        "local_server_ready": probe["reachable"],
        "message": f"Voice mode switched to {mode}.",
    }


# -------------------------------------------------------------- providers
@router.get("/model-providers")
async def list_model_providers():
    return PROVIDERS


@router.get("/model-providers/{provider_id}/schema")
async def provider_schema(provider_id: str, model_type: str | None = None):
    pid = provider_id.split("-")[0].lower()
    if pid not in ("sarvam", "local"):
        raise DomainError("PROVIDER_NOT_FOUND", f"Unknown provider {provider_id!r}.", 404)
    mtype = model_type or (provider_id.split("-", 1)[1] if "-" in provider_id else "llm")
    if mtype not in MODEL_TYPES:
        mtype = "llm"
    fields: list[dict] = []
    if pid == "sarvam":
        fields.append({
            "name": "api_key", "label": "Sarvam API Key", "type": "password",
            "required": False, "default": None,
            "placeholder": "Leave empty to use the server key",
            "description": "Per-business Sarvam subscription key (stored encrypted-at-rest in tenant config).",
        })
        default_model = DEFAULT_MODELS[mtype]["sarvam"]
    else:
        fields.append({
            "name": "base_url", "label": "Local Server URL", "type": "text",
            "required": False, "default": settings.LOCAL_AI_BASE_URL,
            "placeholder": "http://localhost:8002/v1",
            "description": "OpenAI-compatible base URL of the local AI server.",
        })
        default_model = DEFAULT_MODELS[mtype]["local"]
    fields.append({
        "name": "model_id", "label": "Model", "type": "text",
        "required": True, "default": default_model,
        "description": f"Model identifier for {mtype}.",
    })
    if mtype == "tts":
        fields.append({
            "name": "default_voice", "label": "Default Voice", "type": "text",
            "required": False, "default": "shubh",
            "description": "Default speaker/voice id.",
        })
    fields.append({
        "name": "temperature", "label": "Temperature", "type": "number",
        "required": False, "default": 0.2,
    })
    return {"provider_id": pid, "provider": pid, "model_type": mtype, "fields": fields}


# ---------------------------------------------------------------- entries
@router.get("/model-config")
async def list_all_model_config(tenant_id: str = Depends(get_active_tenant),
                                db: AsyncSession = Depends(get_db)):
    rows = (
        await db.execute(
            select(ModelConfigEntry).where(ModelConfigEntry.tenant_id == tenant_id)
            .order_by(ModelConfigEntry.model_type, ModelConfigEntry.created_at)
        )
    ).scalars().all()
    return [_entry_out(e) for e in rows]


@router.get("/model-config/{model_type}")
async def list_model_config(model_type: str, tenant_id: str = Depends(get_active_tenant),
                            db: AsyncSession = Depends(get_db)):
    _check_type(model_type)
    entries = await _entries(db, tenant_id, model_type)
    out = [_entry_out(e) for e in entries]
    if not any(e["is_active"] for e in out):
        out.append(_env_entry(tenant_id, model_type))
    return out


class ModelConfigSaveIn(BaseModel):
    provider: str = "sarvam"
    name: str = ""
    model_id: str = ""
    model: str = ""
    parameters: dict = Field(default_factory=dict)
    config: dict = Field(default_factory=dict)
    api_key: str | None = None
    is_draft: bool = True


@router.put("/model-config/{model_type}")
async def save_model_config(model_type: str, body: ModelConfigSaveIn,
                            tenant_id: str = Depends(get_active_tenant),
                            db: AsyncSession = Depends(get_db)):
    _check_type(model_type)
    params = {**body.parameters, **body.config}
    if body.api_key:
        params["api_key"] = body.api_key
    entry = ModelConfigEntry(
        tenant_id=tenant_id, model_type=model_type,
        name=body.name or f"{body.provider} {model_type}",
        provider=body.provider,
        model_id=body.model_id or body.model or DEFAULT_MODELS[model_type].get(body.provider, ""),
        config=params, is_active=False, is_draft=True,
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return _entry_out(entry)


@router.get("/model-config/{model_type}/active")
async def get_active_model_config(model_type: str, tenant_id: str = Depends(get_active_tenant),
                                  db: AsyncSession = Depends(get_db)):
    _check_type(model_type)
    entries = await _entries(db, tenant_id, model_type)
    for e in entries:
        if e.is_active:
            return _entry_out(e)
    return _env_entry(tenant_id, model_type)


@router.get("/model-config/{model_type}/credentials-status")
async def credentials_status(model_type: str, tenant_id: str = Depends(get_active_tenant),
                             db: AsyncSession = Depends(get_db)):
    _check_type(model_type)
    entries = await _entries(db, tenant_id, model_type)
    active = next((e for e in entries if e.is_active), None)
    provider = active.provider if active else (settings.VOICE_PROVIDER or "sarvam").lower()
    if provider == "sarvam":
        resolved = await tenant_config.resolve_sarvam(db, tenant_id)
        configured = resolved["configured"] or bool(active and (active.config or {}).get("api_key"))
    else:
        configured = bool(settings.LOCAL_AI_BASE_URL)
    return {"configured": configured, "model_type": model_type, "provider": provider}


class StatusIn(BaseModel):
    is_active: bool = True


@router.patch("/model-config/{model_type}/status")
async def set_model_config_status(model_type: str, body: StatusIn,
                                  tenant_id: str = Depends(get_active_tenant),
                                  db: AsyncSession = Depends(get_db)):
    _check_type(model_type)
    entries = await _entries(db, tenant_id, model_type)
    target = next((e for e in entries if not e.is_draft), entries[-1] if entries else None)
    if target is None:
        raise DomainError("CONFIG_NOT_FOUND", "No saved configuration for this model type.", 404)
    if body.is_active:
        for e in entries:
            e.is_active = e.id == target.id
        target.is_draft = False
    else:
        target.is_active = False
    target.updated_at = utcnow()
    await db.commit()
    await db.refresh(target)
    return _entry_out(target)


class ActivateIn(BaseModel):
    config_id: str | None = None
    provider: str | None = None
    model_id: str | None = None
    parameters: dict = Field(default_factory=dict)


@router.post("/model-config/{model_type}/activate")
async def activate_model_config(model_type: str, body: ActivateIn | None = None,
                                tenant_id: str = Depends(get_active_tenant),
                                db: AsyncSession = Depends(get_db)):
    _check_type(model_type)
    entries = await _entries(db, tenant_id, model_type)
    target = None
    if body and body.config_id:
        target = next((e for e in entries if e.id == body.config_id), None)
    if target is None and entries:
        target = entries[-1]
    if target is None:
        target = ModelConfigEntry(
            tenant_id=tenant_id, model_type=model_type,
            name=f"{(body.provider if body else None) or 'sarvam'} {model_type}",
            provider=(body.provider if body else None) or "sarvam",
            model_id=(body.model_id if body else None)
                     or DEFAULT_MODELS[model_type]["sarvam"],
            config=(body.parameters if body else {}), is_active=True, is_draft=False,
        )
        db.add(target)
        await db.flush()
        entries = await _entries(db, tenant_id, model_type)
    for e in entries:
        e.is_active = e.id == target.id
        if e.id == target.id:
            e.is_draft = False
    await db.commit()
    await db.refresh(target)
    return {"success": True, "message": f"{model_type} configuration activated.",
            "config": _entry_out(target)}


@router.post("/model-config/{model_type}/deactivate")
async def deactivate_model_config(model_type: str, body: ActivateIn | None = None,
                                  tenant_id: str = Depends(get_active_tenant),
                                  db: AsyncSession = Depends(get_db)):
    _check_type(model_type)
    entries = await _entries(db, tenant_id, model_type)
    for e in entries:
        e.is_active = False
    await db.commit()
    return {"success": True, "message": f"{model_type} configuration deactivated; environment defaults apply."}


class ValidateIn(BaseModel):
    provider: str = "sarvam"
    model_id: str = ""
    parameters: dict = Field(default_factory=dict)
    config: dict = Field(default_factory=dict)


@router.post("/model-config/{model_type}/validate")
async def validate_model_config(model_type: str, body: ValidateIn | None = None):
    _check_type(model_type)
    errors: list[str] = []
    if body is not None:
        if body.provider not in ("sarvam", "local"):
            errors.append(f"Unknown provider {body.provider!r}; expected 'sarvam' or 'local'.")
    return {"valid": not errors, "errors": errors}


@router.post("/model-config/{model_type}/test-draft")
async def test_draft_model_config(model_type: str, body: ValidateIn | None = None,
                                  tenant_id: str = Depends(get_active_tenant),
                                  db: AsyncSession = Depends(get_db)):
    _check_type(model_type)
    provider = (body.provider if body else None) or "sarvam"
    entry = None
    if body and body.parameters.get("api_key"):
        entry = ModelConfigEntry(model_type=model_type, provider=provider,
                                 config=dict(body.parameters))
    return await _test_entry(db, tenant_id, entry, provider, model_type)


@router.post("/model-config/{model_type}/test")
async def test_model_config(model_type: str, body: ActivateIn | None = None,
                            tenant_id: str = Depends(get_active_tenant),
                            db: AsyncSession = Depends(get_db)):
    _check_type(model_type)
    entries = await _entries(db, tenant_id, model_type)
    active = next((e for e in entries if e.is_active), entries[-1] if entries else None)
    provider = active.provider if active else (settings.VOICE_PROVIDER or "sarvam").lower()
    return await _test_entry(db, tenant_id, active, provider, model_type)
