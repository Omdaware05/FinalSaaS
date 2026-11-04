"""VoBiz carrier webhooks — every endpoint is token-authenticated.

The old project exposed answer/hangup/stream with NO auth: anyone who
learned a call UUID could fake hangups or tap the media stream. Here
every URL carries ?t=<sign_call_token(call_id)>; the answer and hangup
URLs are minted by the dialling code, and verification happens before
any state is touched (WebSocket: before accept, close code 4403).

All handlers are idempotent and terminal-state-safe: a late or repeated
webhook never resurrects or re-finalizes a finished call.
"""
import asyncio
import inspect
import ipaddress
import logging
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, HTTPException, Request, WebSocket
from fastapi.responses import PlainTextResponse

from app.config import settings
from app.db import async_session as AsyncSessionLocal
from app.models import Call, utcnow
from app.security import verify_call_token
from app.telephony.vobiz import VoBizClient

logger = logging.getLogger("webhooks.vobiz")

router = APIRouter(tags=["vobiz-webhooks"])

TERMINAL_STATUSES = ("completed", "failed", "busy", "no_answer", "cancelled")
_CARRIER_HOST_SUFFIXES = (".vobiz.ai", ".plivo.com")
_CARRIER_HOSTS = {"vobiz.ai", "plivo.com", "api.vobiz.ai", "api.plivo.com"}

def _require_token(call_id: str, token: str | None) -> None:
    if not verify_call_token(call_id, token or ""):
        raise HTTPException(status_code=403, detail="Invalid call token")

def _stream_ws_url(call_id: str, token: str) -> str:
    base = (settings.PUBLIC_BASE_URL or "").rstrip("/")
    ws_base = base.replace("https://", "wss://").replace("http://", "ws://")
    return f"{ws_base}/api/v1/webhooks/vobiz/stream/{call_id}?t={token}"

async def _payload(request: Request) -> dict:
    """Carrier posts form data; tolerate JSON / query params too."""
    try:
        form = await request.form()
        if form:
            return dict(form)
    except Exception:
        pass
    try:
        data = await request.json()
        if isinstance(data, dict):
            return data
    except Exception:
        pass
    return dict(request.query_params)

def _map_status(data: dict) -> tuple[str | None, str]:
    """Map carrier fields to (status, failure_text)."""
    cause = str(data.get("HangupCause") or data.get("hangup_cause") or "").upper()
    cause_name = str(data.get("HangupCauseName") or "").strip()
    raw = str(data.get("CallStatus") or data.get("call_status") or "").lower()
    failure_text = " ".join(x for x in (cause_name, cause, raw) if x)
    try:
        duration = float(data.get("Duration") or data.get("duration") or 0)
    except (TypeError, ValueError):
        duration = 0.0
    if "BUSY" in cause or raw == "busy":
        return "busy", failure_text
    if "NO_ANSWER" in cause or "TIMEOUT" in cause or raw in ("no-answer", "no_answer"):
        return "no_answer", failure_text
    if "REJECT" in cause or raw == "failed":
        return "failed", failure_text
    if duration > 0 or raw in ("completed", "hangup"):
        return "completed", failure_text
    return None, failure_text

def _is_balance_failure(text: str) -> bool:
    lowered = text.lower()
    return ("insufficient" in lowered and "balance" in lowered) or "402" in lowered

async def _apply_status(call_id: str, data: dict) -> bool:
    """Apply a carrier status update. True if this call transitioned now."""
    status, failure_text = _map_status(data)
    if status is None:
        return False
    async with AsyncSessionLocal() as session:
        call = await session.get(Call, call_id)
        if call is None or call.status in TERMINAL_STATUSES:
            return False
        call.status = status
        call.ended_at = utcnow()
        if failure_text:
            call.termination_reason = failure_text[:128]
        try:
            duration = float(data.get("Duration") or data.get("duration") or 0)
            if duration > 0:
                call.duration_seconds = duration
        except (TypeError, ValueError):
            pass
        balance_failure = status == "failed" and _is_balance_failure(failure_text)
        if balance_failure:
            call.failure_reason = "Insufficient VoBiz balance"
        await session.commit()

        # Auto-retry follow-ups — except when the carrier wallet is empty,
        # where redialling just fails again (old behaviour, kept).
        reason = {"busy": "busy", "no_answer": "no_answer", "failed": "failed"}.get(status)
        if reason and not balance_failure:
            try:
                from app.services.dispatcher import schedule_followup
                scheduled = schedule_followup(session, call, reason)
                if inspect.isawaitable(scheduled):
                    await scheduled
                await session.commit()
            except Exception as exc:
                logger.warning("followup scheduling failed for call %s: %s", call_id, exc)
        return True

# ------------------------------------------------------------------ answer
@router.api_route("/webhooks/vobiz/answer/{call_id}", methods=["GET", "POST"])
async def vobiz_answer(call_id: str, t: str = ""):
    _require_token(call_id, t)
    xml = VoBizClient.build_answer_xml(call_id, _stream_ws_url(call_id, t))
    return PlainTextResponse(xml, media_type="text/xml")

@router.websocket("/webhooks/vobiz/stream/{call_id}")
async def vobiz_stream(websocket: WebSocket, call_id: str, t: str = ""):
    if not verify_call_token(call_id, t or ""):
        await websocket.close(code=4403)
        return
    from app.voice.engine import VoiceEngine
    await VoiceEngine().handle_stream(websocket, call_id)

# ------------------------------------------------------------------ hangup
@router.post("/webhooks/vobiz/hangup/{call_id}")
async def vobiz_hangup(call_id: str, request: Request, t: str = ""):
    _require_token(call_id, t)
    data = await _payload(request)
    await _maybe_save_recording(call_id, data)
    await _apply_status(call_id, data)
    return {"processed": True}

@router.post("/webhooks/vobiz/status/{call_id}")
async def vobiz_status(call_id: str, request: Request, t: str = ""):
    _require_token(call_id, t)
    await _apply_status(call_id, await _payload(request))
    return {"processed": True}

# --------------------------------------------------------------- recording
def _recording_url(data: dict) -> str | None:
    for key in ("RecordUrl", "RecordingUrl", "record_url", "recording_url"):
        value = data.get(key)
        if value and str(value).startswith("http"):
            return str(value)
    return None

async def _fetch_headers(url: str) -> dict | None:
    """SSRF guard for carrier-supplied recording URLs.

    Returns headers to fetch with, or None to refuse: non-http(s),
    loopback/private/link-local hosts (literal IPs AND resolved names)
    are refused; carrier credentials go only to carrier domains.
    """
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        return None
    host = (parsed.hostname or "").lower()
    if not host or host == "localhost":
        return None
    ips: list[ipaddress.IPv4Address | ipaddress.IPv6Address] = []
    try:
        ips = [ipaddress.ip_address(host)]
    except ValueError:
        try:
            infos = await asyncio.get_event_loop().getaddrinfo(host, None)
            ips = [ipaddress.ip_address(info[4][0]) for info in infos]
        except Exception:
            return None
    if any(ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved
           for ip in ips):
        return None
    if host in _CARRIER_HOSTS or host.endswith(_CARRIER_HOST_SUFFIXES):
        return {"X-Auth-ID": settings.VOBIZ_AUTH_ID or "",
                "X-Auth-Token": settings.VOBIZ_AUTH_TOKEN or ""}
    return {} if parsed.scheme == "https" else None

async def _download_recording(call_id: str, url: str, headers: dict) -> None:
    from app.services.storage import save_recording
    for attempt in range(4):
        try:
            async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
                resp = await client.get(url, headers=headers)
            if resp.status_code == 200 and len(resp.content) > 100:
                saved = save_recording(call_id, resp.content)
                if inspect.isawaitable(saved):
                    saved = await saved
                async with AsyncSessionLocal() as session:
                    call = await session.get(Call, call_id)
                    if call is not None:
                        call.recording_path = saved
                        call.recording_status = "ready"
                        await session.commit()
                logger.info("carrier recording saved for call %s", call_id)
                return
            logger.warning("recording download attempt %d for call %s: HTTP %s",
                           attempt + 1, call_id, resp.status_code)
        except Exception as exc:
            logger.warning("recording download attempt %d for call %s: %s",
                           attempt + 1, call_id, exc)
        await asyncio.sleep(2.0)
    logger.error("recording download gave up for call %s", call_id)

async def _maybe_save_recording(call_id: str, data: dict) -> None:
    url = _recording_url(data)
    if not url:
        return
    headers = await _fetch_headers(url)
    if headers is None:
        logger.warning("refused recording URL for call %s", call_id)
        return
    asyncio.create_task(_download_recording(call_id, url, headers))

@router.post("/webhooks/vobiz/recording/{call_id}")
async def vobiz_recording(call_id: str, request: Request, t: str = ""):
    _require_token(call_id, t)
    data = await _payload(request)
    url = _recording_url(data)
    if not url:
        return {"processed": False}
    headers = await _fetch_headers(url)
    if headers is None:
        logger.warning("refused recording URL for call %s", call_id)
        return {"processed": False}
    asyncio.create_task(_download_recording(call_id, url, headers))
    return {"processed": True}
