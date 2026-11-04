import ipaddress
import json
import socket
from pathlib import Path
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response, StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_active_tenant, get_db
from app.errors import DomainError
from app.services import tenant_config

router = APIRouter(prefix="/voice", tags=["voice"])

DATA_DIR = Path(__file__).resolve().parent.parent / "data" / "voices"

PROVIDER_META = {
    "sarvam": {
        "display_name": "Sarvam AI",
        "description": "Indian-language TTS/STT. The active synthesis engine in this deployment.",
        "supports_speed": True, "supports_style": False,
        "supported_languages": ["hi-IN", "en-IN", "mr-IN", "ta-IN", "te-IN", "bn-IN", "gu-IN", "kn-IN", "ml-IN", "pa-IN", "od-IN"],
    },
    "elevenlabs": {
        "display_name": "ElevenLabs",
        "description": "Catalog only — not an active synthesis engine in this deployment.",
        "supports_speed": True, "supports_style": True,
        "supported_languages": ["en-US", "hi-IN"],
    },
    "deepgram": {
        "display_name": "Deepgram",
        "description": "Catalog only — not an active synthesis engine in this deployment.",
        "supports_speed": True, "supports_style": False,
        "supported_languages": ["en-US", "hi-IN"],
    },
    "cartesia": {
        "display_name": "Cartesia",
        "description": "Catalog only — not an active synthesis engine in this deployment.",
        "supports_speed": True, "supports_style": False,
        "supported_languages": ["en-US", "hi-IN"],
    },
    "dograh": {
        "display_name": "Dograh",
        "description": "Catalog only — legacy voice list.",
        "supports_speed": False, "supports_style": False,
        "supported_languages": ["en-US", "hi-IN"],
    },
}

_catalog_cache: dict[str, list[dict]] = {}


def _catalog(provider: str) -> list[dict]:
    if provider not in _catalog_cache:
        path = DATA_DIR / f"{provider}.json"
        if not path.exists():
            raise DomainError("PROVIDER_NOT_FOUND", f"Unknown voice provider {provider!r}.", 404)
        _catalog_cache[provider] = json.loads(path.read_text(encoding="utf-8"))
    return _catalog_cache[provider]


def _voice_item(provider: str, v: dict) -> dict:
    return {
        "voice_id": v.get("voice_id", ""),
        "name": v.get("name", ""),
        "gender": v.get("gender") or "unknown",
        "language": v.get("language") or "",
        "accent": v.get("accent") or "",
        "description": v.get("description") or "",
        "preview_url": v.get("preview_url"),
        "provider": provider,
        "styles": v.get("styles"),
    }


@router.get("/providers")
async def list_providers():
    out = []
    for provider, meta in PROVIDER_META.items():
        try:
            _catalog(provider)
            available = True
        except DomainError:
            available = False
        if not available:
            continue
        out.append({"provider": provider, **meta})
    return out


@router.get("/providers/{provider}/voices")
async def list_voices(provider: str, gender: str | None = None,
                      language: str | None = None, search: str | None = None):
    voices = [_voice_item(provider, v) for v in _catalog(provider)]
    if gender:
        voices = [v for v in voices if (v["gender"] or "").lower() == gender.lower()]
    if language:
        needle = language.lower()
        voices = [v for v in voices if needle in (v["language"] or "").lower()]
    if search:
        needle = search.lower()
        voices = [
            v for v in voices
            if needle in (v["name"] or "").lower() or needle in (v["description"] or "").lower()
        ]
    return {"provider": provider, "total": len(voices), "voices": voices}


def _guard_public_url(url: str) -> None:
    """SSRF guard: http(s) only, and the host must not resolve to a
    private/loopback/link-local address (same pattern as the recording fetch)."""
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise DomainError("INVALID_URL", "preview_url must be an http(s) URL.", 400)
    host = parsed.hostname
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        raise DomainError("INVALID_URL", f"Could not resolve host {host!r}.", 400)
    for info in infos:
        ip = info[4][0]
        try:
            addr = ipaddress.ip_address(ip)
        except ValueError:
            continue
        if addr.is_private or addr.is_loopback or addr.is_link_local or addr.is_reserved:
            raise DomainError("BLOCKED_URL", "Refusing to fetch a non-public address.", 400)


@router.get("/preview")
async def preview(preview_url: str = Query(...)):
    _guard_public_url(preview_url)
    client = httpx.AsyncClient(timeout=httpx.Timeout(15.0, connect=3.0), follow_redirects=True)
    try:
        resp = await client.get(preview_url)
    except httpx.HTTPError as exc:
        await client.aclose()
        raise DomainError("PREVIEW_FETCH_FAILED", f"Could not fetch preview audio: {exc}", 502)
    if resp.status_code != 200:
        await client.aclose()
        raise DomainError("PREVIEW_FETCH_FAILED", f"Preview host returned {resp.status_code}.", 502)
    content_type = resp.headers.get("content-type", "audio/mpeg")
    if not content_type.startswith("audio/"):
        content_type = "audio/mpeg"
    data = resp.content
    await client.aclose()
    return Response(content=data, media_type=content_type)


async def _sarvam_preview(voice_id: str, tenant_id: str, db: AsyncSession) -> Response:
    resolved = await tenant_config.resolve_sarvam(db, tenant_id)
    if not resolved["configured"]:
        raise DomainError(
            "PROVIDER_NOT_CONFIGURED",
            "Sarvam API key is not configured (Settings → Voice, or SARVAM_API_KEY in .env).",
            422,
        )
    from app.voice.providers import SarvamTTS

    try:
        audio = await SarvamTTS(resolved["api_key"]).synthesize(
            "Namaste, this is a sample of my voice.", voice_id, "hi-IN"
        )
    except Exception as exc:
        raise DomainError("PREVIEW_FAILED", f"Sarvam preview failed: {exc}", 502)
    return Response(content=audio, media_type="audio/wav")


@router.get("/preview-sarvam/{voice_id}")
async def preview_sarvam_get(voice_id: str, tenant_id: str = Depends(get_active_tenant),
                             db: AsyncSession = Depends(get_db)):
    return await _sarvam_preview(voice_id, tenant_id, db)


@router.post("/preview-sarvam/{voice_id}")
async def preview_sarvam_post(voice_id: str, tenant_id: str = Depends(get_active_tenant),
                              db: AsyncSession = Depends(get_db)):
    return await _sarvam_preview(voice_id, tenant_id, db)
