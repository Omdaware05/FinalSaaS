"""Model Lab adapter: GPU/runtime probes, model registry, test sessions,
intent classification, benchmarks, terminal logs and telephony passthrough.

Local models are external processes (the GPU box) — start/stop therefore
report honestly instead of pretending to manage them.
"""
import base64
import os
import time
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.deps import get_active_tenant, get_current_user, get_db, scoped_user
from app.errors import DomainError
from app.models import ModelConfigEntry, User
from app.services import analyzer as analyzer_service
from app.services import call_service, log_buffer, tenant_config
from app.services.local_probe import probe_local

router = APIRouter(prefix="/model-lab", tags=["model-lab"])

_sessions: dict[str, dict] = {}

STARTER_MESSAGE = (
    "Model servers are managed externally — start the local AI server on the GPU machine."
)


def _lab_audio_dir() -> Path:
    path = Path(settings.STORAGE_DIR) / "lab_audio"
    path.mkdir(parents=True, exist_ok=True)
    return path


async def _resolved_providers(db: AsyncSession, tenant_id: str):
    from app.voice.providers import get_providers

    mode = await tenant_config.resolve_voice_mode(db, tenant_id)
    sarvam = await tenant_config.resolve_sarvam(db, tenant_id)
    return get_providers(
        voice_provider=mode,
        sarvam_api_key=sarvam["api_key"] if sarvam["api_key"] else None,
    )


def _gpu_from_health(health: dict | None) -> dict:
    if health:
        gpu = health.get("gpu") if isinstance(health.get("gpu"), dict) else health
        name = gpu.get("gpu_name") or gpu.get("name")
        if name:
            return {
                "available": True,
                "gpu_name": name,
                "vram_total_mb": gpu.get("vram_total_mb") or gpu.get("total_mb") or 0,
                "vram_used_mb": gpu.get("vram_used_mb") or gpu.get("used_mb") or 0,
                "vram_free_mb": gpu.get("vram_free_mb") or gpu.get("free_mb") or 0,
                "gpu_utilization_pct": gpu.get("gpu_utilization_pct") or gpu.get("utilization_pct") or 0,
                "temperature_c": gpu.get("temperature_c") or gpu.get("temperature") or 0,
            }
    return {
        "available": False,
        "gpu_name": None,
        "vram_total_mb": 0, "vram_used_mb": 0, "vram_free_mb": 0,
        "gpu_utilization_pct": 0, "temperature_c": 0,
    }


@router.get("/gpu")
async def gpu_telemetry():
    probe = await probe_local()
    return _gpu_from_health(probe["health"])


@router.get("/runtime")
async def runtime_health(tenant_id: str = Depends(get_active_tenant),
                         db: AsyncSession = Depends(get_db)):
    probe = await probe_local()
    mode = await tenant_config.resolve_voice_mode(db, tenant_id)
    sarvam = await tenant_config.resolve_sarvam(db, tenant_id)
    cpu_pct = 0.0
    try:
        cpu_pct = round(os.getloadavg()[0] / (os.cpu_count() or 1) * 100, 1)
    except OSError:
        pass
    ram_used_mb = 0
    try:
        meminfo = Path("/proc/meminfo").read_text()
        values = {}
        for line in meminfo.splitlines():
            parts = line.split()
            if len(parts) >= 2 and parts[0] in ("MemTotal:", "MemAvailable:"):
                values[parts[0]] = int(parts[1])
        if values:
            ram_used_mb = (values.get("MemTotal:", 0) - values.get("MemAvailable:", 0)) // 1024
    except OSError:
        pass
    return {
        # RuntimeHealth (old shape)
        "status": "ONLINE",
        "active_model_id": None,
        "active_model_type": None,
        "gpu": _gpu_from_health(probe["health"]),
        "cpu_usage_pct": cpu_pct,
        "ram_used_mb": ram_used_mb,
        # task shape
        "mode": mode,
        "local_server": {"reachable": probe["reachable"], "url": probe["url"]},
        "sarvam": {"configured": sarvam["configured"]},
    }


def _builtin_models(probe: dict, sarvam_configured: bool) -> list[dict]:
    local_status = "READY" if probe["reachable"] else "OFFLINE"
    sarvam_status = "READY" if sarvam_configured else "OFFLINE"
    base = [
        {"model_id": "local-llm", "model_name": settings.LOCAL_LLM_MODEL or "Local LLM",
         "model_type": "llm", "framework": "OpenAI-compatible (LM Studio / Ollama)",
         "model_path": settings.LOCAL_AI_BASE_URL, "description": "Local LLM on the GPU machine.",
         "languages_supported": ["hi", "en", "mr"], "gpu_required": True,
         "approx_vram_mb": 6000, "supports_streaming": True, "port": 8002,
         "health_endpoint": "/health", "status": local_status,
         "active_pid": None, "last_error": None if probe["reachable"] else "Local AI server not reachable."},
        {"model_id": "local-stt", "model_name": settings.LOCAL_STT_MODEL,
         "model_type": "stt", "framework": "OpenAI-compatible (Whisper)",
         "model_path": settings.LOCAL_AI_BASE_URL, "description": "Local speech-to-text.",
         "languages_supported": ["hi", "en", "mr"], "gpu_required": True,
         "approx_vram_mb": 3000, "supports_streaming": False, "port": 8002,
         "health_endpoint": "/health", "status": local_status,
         "active_pid": None, "last_error": None if probe["reachable"] else "Local AI server not reachable."},
        {"model_id": "local-tts", "model_name": settings.LOCAL_TTS_MODEL,
         "model_type": "tts", "framework": "OpenAI-compatible (Kokoro)",
         "model_path": settings.LOCAL_AI_BASE_URL, "description": "Local text-to-speech.",
         "languages_supported": ["hi", "en"], "gpu_required": False,
         "approx_vram_mb": 1000, "supports_streaming": False, "port": 8002,
         "health_endpoint": "/health", "status": local_status,
         "active_pid": None, "last_error": None if probe["reachable"] else "Local AI server not reachable."},
        {"model_id": "sarvam-llm", "model_name": settings.SARVAM_LLM_MODEL,
         "model_type": "llm", "framework": "Sarvam AI (cloud)",
         "model_path": "https://api.sarvam.ai", "description": "Sarvam cloud LLM.",
         "languages_supported": ["hi", "en", "mr", "ta", "te", "bn"], "gpu_required": False,
         "approx_vram_mb": 0, "supports_streaming": True, "port": None,
         "health_endpoint": None, "status": sarvam_status,
         "active_pid": None, "last_error": None if sarvam_configured else "Sarvam API key not configured."},
        {"model_id": "sarvam-stt", "model_name": settings.SARVAM_STT_MODEL,
         "model_type": "stt", "framework": "Sarvam AI (cloud)",
         "model_path": "https://api.sarvam.ai", "description": "Sarvam Saaras speech-to-text.",
         "languages_supported": ["hi", "en", "mr", "ta", "te", "bn"], "gpu_required": False,
         "approx_vram_mb": 0, "supports_streaming": False, "port": None,
         "health_endpoint": None, "status": sarvam_status,
         "active_pid": None, "last_error": None if sarvam_configured else "Sarvam API key not configured."},
        {"model_id": "sarvam-tts", "model_name": settings.SARVAM_TTS_MODEL,
         "model_type": "tts", "framework": "Sarvam AI (cloud)",
         "model_path": "https://api.sarvam.ai", "description": "Sarvam Bulbul text-to-speech.",
         "languages_supported": ["hi", "en", "mr", "ta", "te", "bn"], "gpu_required": False,
         "approx_vram_mb": 0, "supports_streaming": False, "port": None,
         "health_endpoint": None, "status": sarvam_status,
         "active_pid": None, "last_error": None if sarvam_configured else "Sarvam API key not configured."},
        {"model_id": "interest-classifier", "model_name": "Offline Lead Analyzer",
         "model_type": "classifier", "framework": "Built-in rule engine (no network)",
         "model_path": "built-in", "description": "Deterministic EN/HI/MR transcript classifier.",
         "languages_supported": ["en", "hi", "mr"], "gpu_required": False,
         "approx_vram_mb": 0, "supports_streaming": False, "port": None,
         "health_endpoint": None, "status": "READY",
         "active_pid": None, "last_error": None},
    ]
    return base


@router.get("/models")
async def list_models(tenant_id: str = Depends(get_active_tenant),
                      db: AsyncSession = Depends(get_db)):
    probe = await probe_local()
    sarvam = await tenant_config.resolve_sarvam(db, tenant_id)
    models = _builtin_models(probe, sarvam["configured"])
    entries = (
        await db.execute(
            select(ModelConfigEntry).where(ModelConfigEntry.tenant_id == tenant_id)
        )
    ).scalars().all()
    for e in entries:
        models.append({
            "model_id": e.id, "model_name": e.name or e.model_id,
            "model_type": e.model_type, "framework": e.provider,
            "model_path": e.model_id, "description": "Saved model configuration.",
            "languages_supported": [], "gpu_required": e.provider == "local",
            "approx_vram_mb": 0, "supports_streaming": False, "port": None,
            "health_endpoint": None,
            "status": "READY" if e.is_active else "OFFLINE",
            "active_pid": None, "last_error": None,
        })
    return models


async def _find_model(db: AsyncSession, tenant_id: str, model_id: str) -> dict | None:
    models = await list_models(tenant_id, db)
    return next((m for m in models if m["model_id"] == model_id), None)


@router.post("/models/{model_id}/start")
async def start_model(model_id: str, tenant_id: str = Depends(get_active_tenant),
                      db: AsyncSession = Depends(get_db)):
    model = await _find_model(db, tenant_id, model_id)
    status = model["status"] if model else "OFFLINE"
    return {"success": True, "status": status, "model_id": model_id, "message": STARTER_MESSAGE}


@router.post("/models/{model_id}/stop")
async def stop_model(model_id: str, tenant_id: str = Depends(get_active_tenant),
                     db: AsyncSession = Depends(get_db)):
    model = await _find_model(db, tenant_id, model_id)
    status = model["status"] if model else "OFFLINE"
    return {"success": True, "status": status, "model_id": model_id, "message": STARTER_MESSAGE}


@router.post("/models/{model_id}/test")
async def test_model(model_id: str, tenant_id: str = Depends(get_active_tenant),
                     db: AsyncSession = Depends(get_db)):
    model = await _find_model(db, tenant_id, model_id)
    started = time.perf_counter()
    if model is None:
        return {"model_id": model_id, "success": False, "status": "OFFLINE",
                "latency_ms": 0, "error_message": "Unknown model."}
    success = model["status"] in ("READY", "BUSY")
    output_text = None
    if model_id == "interest-classifier":
        result = analyzer_service.analyze(
            "Customer: Yes, I am interested, please tell me more."
        )
        success = True
        output_text = f"classification={result['disposition']} score={result['lead_score']}"
    elif model["model_type"] == "llm" and success:
        try:
            providers = await _resolved_providers(db, tenant_id)
            parts = []
            async for sentence in providers.llm.stream_reply(
                [{"role": "user", "content": "Say hello in one short sentence."}]
            ):
                parts.append(sentence)
            output_text = " ".join(parts)[:200]
        except Exception as exc:
            success = False
            return {"model_id": model_id, "success": False, "status": "ERROR",
                    "latency_ms": round((time.perf_counter() - started) * 1000, 1),
                    "error_message": str(exc)}
    latency = round((time.perf_counter() - started) * 1000, 1)
    return {
        "model_id": model_id, "success": success,
        "status": model["status"] if success else "ERROR",
        "output_text": output_text, "audio_base64": None,
        "latency_ms": latency, "ttft_ms": None, "ttfa_ms": None,
        "tokens_per_second": None, "gpu_vram_mb": None,
        "error_message": None if success else (model.get("last_error") or "Model is offline."),
    }


# ---------------------------------------------------------------- sessions
class SessionStartIn(BaseModel):
    stt_model_id: str | None = None
    llm_model_id: str | None = None
    tts_model_id: str | None = None
    language: str = "hi"
    system_prompt: str | None = None


@router.post("/session/start")
async def session_start(body: SessionStartIn | None = None):
    session_id = uuid.uuid4().hex[:12]
    _sessions[session_id] = {
        "turns": 0,
        "history": [],
        "language": (body.language if body else None) or "hi",
        "system_prompt": (body.system_prompt if body else None) or "",
        "model_ids": {
            "stt": body.stt_model_id if body else None,
            "llm": body.llm_model_id if body else None,
            "tts": body.tts_model_id if body else None,
        },
    }
    return {"success": True, "session_id": session_id, "id": session_id}


class TurnIn(BaseModel):
    text: str | None = None
    user_text: str | None = None
    audio_base64: str | None = None


@router.post("/session/{session_id}/turn")
async def session_turn(session_id: str, body: TurnIn,
                       tenant_id: str = Depends(get_active_tenant),
                       db: AsyncSession = Depends(get_db)):
    session = _sessions.get(session_id)
    if session is None:
        raise DomainError("SESSION_NOT_FOUND", "Model lab session not found (sessions are in-memory).", 404)
    providers = await _resolved_providers(db, tenant_id)
    language = session["language"] or "hi"
    lang_code = {"hi": "hi-IN", "en": "en-IN", "mr": "mr-IN"}.get(language, "hi-IN")
    started = time.perf_counter()
    stt_ms = 0.0
    user_text = body.user_text or body.text or ""
    if body.audio_base64 and not user_text:
        t0 = time.perf_counter()
        audio_bytes = base64.b64decode(body.audio_base64)
        user_text = await providers.stt.transcribe(audio_bytes, lang_code)
        stt_ms = (time.perf_counter() - t0) * 1000
    if not user_text.strip():
        raise DomainError("EMPTY_TURN", "Provide text or audio for the turn.", 400)
    system = session["system_prompt"] or (
        "You are a friendly AI voice assistant in a model test lab. "
        "Reply in 1-2 short sentences in the user's language."
    )
    messages = [{"role": "system", "content": system}]
    messages += session["history"][-10:]
    messages.append({"role": "user", "content": user_text})
    t0 = time.perf_counter()
    parts: list[str] = []
    async for sentence in providers.llm.stream_reply(messages):
        parts.append(sentence)
    llm_ms = (time.perf_counter() - t0) * 1000
    reply_text = " ".join(p for p in parts if p).strip()
    t0 = time.perf_counter()
    audio = await providers.tts.synthesize(reply_text, "shubh", lang_code)
    tts_ms = (time.perf_counter() - t0) * 1000
    session["turns"] += 1
    filename = f"{session_id}_{session['turns']}.wav"
    (_lab_audio_dir() / filename).write_bytes(audio)
    session["history"].append({"role": "user", "content": user_text})
    session["history"].append({"role": "assistant", "content": reply_text})
    total_ms = round((time.perf_counter() - started) * 1000, 1)
    intent = analyzer_service.analyze(f"Customer: {user_text}")
    return {
        "success": True,
        "turn": session["turns"],
        "session_id": session_id,
        "user_text": user_text,
        "ai_text": reply_text,
        "reply_text": reply_text,
        "audio_url": f"/api/v1/model-lab/audio/{filename}",
        "audio_base64": base64.b64encode(audio).decode("ascii"),
        "intent_analysis": {
            "classification": "INTERESTED" if intent["disposition"] == "interested" else "NOT_INTERESTED",
            "confidence": round((intent["lead_score"] or 0) / 100.0, 2),
            "reason": intent["summary"],
        },
        "metrics": {
            "stt_latency_ms": round(stt_ms, 1),
            "llm_ttft_ms": round(llm_ms, 1),
            "llm_tokens_per_sec": None,
            "tts_ttfa_ms": round(tts_ms, 1),
            "total_latency_ms": total_ms,
        },
        "latency_ms": total_ms,
    }


@router.get("/audio/{filename}")
async def session_audio(filename: str):
    safe = Path(filename).name
    if safe != filename or not safe.endswith(".wav"):
        raise DomainError("INVALID_FILE", "Invalid audio file name.", 400)
    audio_dir = _lab_audio_dir()
    if safe == "latest.wav":
        # The ported Model Lab UI polls a stable "latest audio" URL; serve the
        # most recently generated turn audio under that name.
        wavs = sorted(audio_dir.glob("*.wav"), key=lambda p: p.stat().st_mtime)
        if not wavs:
            raise DomainError("FILE_NOT_FOUND", "Audio file not found.", 404)
        path = wavs[-1]
        return FileResponse(path, media_type="audio/wav", filename=safe)
    path = audio_dir / safe
    if not path.exists():
        raise DomainError("FILE_NOT_FOUND", "Audio file not found.", 404)
    return FileResponse(path, media_type="audio/wav", filename=safe)


@router.post("/session/{session_id}/interrupt")
async def session_interrupt(session_id: str):
    if session_id not in _sessions:
        raise DomainError("SESSION_NOT_FOUND", "Model lab session not found.", 404)
    return {"success": True}


class SessionEndIn(BaseModel):
    interested: bool | None = None
    outcome: str | None = None
    notes: str | None = None
    phone_number: str | None = None
    lead_name: str | None = None


@router.post("/session/{session_id}/end")
async def session_end(session_id: str, body: SessionEndIn | None = None):
    session = _sessions.pop(session_id, None)
    if session is None:
        raise DomainError("SESSION_NOT_FOUND", "Model lab session not found.", 404)
    transcript = "\n".join(
        f"{'Customer' if m['role'] == 'user' else 'Agent'}: {m['content']}"
        for m in session["history"]
    )
    result = analyzer_service.analyze(transcript)
    return {
        "success": True,
        "session_id": session_id,
        "turns": session["turns"],
        "summary": result["summary"],
        "disposition": result["disposition"],
        "lead_score": result["lead_score"],
        "outcome": (body.outcome if body else None) or result["disposition"],
    }


# ------------------------------------------------------------- classify etc
class ClassifyIn(BaseModel):
    transcript: str | None = None
    text: str | None = None
    explain: bool | None = None


@router.post("/classify-intent")
async def classify_intent(body: ClassifyIn):
    text = body.transcript or body.text or ""
    if not text.strip():
        raise DomainError("EMPTY_TRANSCRIPT", "Provide a transcript to classify.", 400)
    result = analyzer_service.analyze(text)
    disposition = result["disposition"]
    classification = "INTERESTED" if disposition in ("interested", "callback_requested") else "NOT_INTERESTED"
    score = result["lead_score"] or 0
    confidence = round(score / 100.0, 2) if classification == "INTERESTED" else round(1 - score / 100.0, 2)
    lines = [ln for ln in text.splitlines() if ln.strip()]
    customer_turns = sum(1 for ln in lines if ln.strip().lower().startswith("customer"))
    languages = ["hi"] if any("\u0900" <= ch <= "\u097f" for ch in text) else ["en"]
    return {
        "success": True,
        "classification": classification,
        "disposition": disposition,
        "confidence": confidence,
        "lead_score": score,
        "reason": result["summary"],
        "rule_applied": "offline-rule-analyzer",
        "languages_detected": languages,
        "signals_detected": {},
        "customer_turns_count": customer_turns,
        "total_turns_count": len(lines),
        "is_ambiguous_rescued": False,
    }


@router.get("/benchmarks")
async def benchmarks(tenant_id: str = Depends(get_active_tenant),
                     db: AsyncSession = Depends(get_db)):
    samples = [
        ("interested", "Customer: Yes, I am interested. Please share the course fees and details."),
        ("not_interested", "Customer: No, I am not interested. Do not call me again."),
        ("callback", "Customer: I am busy right now, please call me back tomorrow."),
    ]
    results = []
    for name, text in samples:
        t0 = time.perf_counter()
        outcome = analyzer_service.analyze(text)
        results.append({
            "name": f"analyzer-{name}",
            "kind": "classifier",
            "success": outcome["disposition"] in ("interested", "not_interested", "callback_requested"),
            "disposition": outcome["disposition"],
            "lead_score": outcome["lead_score"],
            "latency_ms": round((time.perf_counter() - t0) * 1000, 2),
        })
    probe = await probe_local()
    results.append({
        "name": "local-server-probe", "kind": "provider",
        "success": probe["reachable"], "latency_ms": None,
        "url": probe["url"],
    })
    sarvam = await tenant_config.resolve_sarvam(db, tenant_id)
    results.append({
        "name": "sarvam-configured", "kind": "provider",
        "success": sarvam["configured"], "latency_ms": None,
    })
    return {"success": True, "benchmarks": results, "results": results}


@router.get("/terminal-logs")
async def terminal_logs(since_id: int = Query(0)):
    entries, total = log_buffer.entries_since(since_id)
    return {"success": True, "logs": entries, "total": total, "active_model_id": None}


@router.post("/terminal-logs/clear")
async def terminal_logs_clear():
    log_buffer.clear()
    return {"success": True}


# --------------------------------------------------------------- telephony
@router.get("/telephony/config")
async def lab_telephony_config(tenant_id: str = Depends(get_active_tenant),
                               db: AsyncSession = Depends(get_db)):
    from app.api.telephony_config import _vobiz_response

    return _vobiz_response(await tenant_config.resolve_vobiz(db, tenant_id))


class LabTelephonySaveIn(BaseModel):
    auth_id: str | None = None
    auth_token: str | None = None
    phone_number: str | None = None
    from_number: str | None = None


@router.post("/telephony/config")
async def lab_telephony_save(body: LabTelephonySaveIn,
                             tenant_id: str = Depends(get_active_tenant),
                             db: AsyncSession = Depends(get_db)):
    from app.api.telephony_config import VoBizSaveIn, save_vobiz

    return await save_vobiz(
        VoBizSaveIn(auth_id=body.auth_id, auth_token=body.auth_token,
                    phone_number=body.phone_number, from_number=body.from_number),
        tenant_id, db,
    )


@router.post("/telephony/test-connection")
async def lab_telephony_test(tenant_id: str = Depends(get_active_tenant),
                             db: AsyncSession = Depends(get_db)):
    from app.api.telephony_config import test_vobiz

    return await test_vobiz(tenant_id, db)


class LabCallIn(BaseModel):
    agent_id: str
    phone_number: str = ""
    phone: str = ""


@router.post("/telephony/call")
async def lab_telephony_call(body: LabCallIn, user: User = Depends(get_current_user),
                             tenant_id: str = Depends(get_active_tenant),
                             db: AsyncSession = Depends(get_db)):
    call = await call_service.initiate_call(
        db, scoped_user(user, tenant_id), body.agent_id,
        body.phone_number or body.phone,
    )
    return {
        "success": True,
        "call_id": call.id,
        "provider_call_id": call.provider_call_uuid,
        "status": call.status,
        "phone_number": call.phone,
    }
