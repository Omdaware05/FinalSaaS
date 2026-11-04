"""VoBiz carrier client (Plivo-style REST API).

Lean replacement for the telephony bits of the old sarvam_telephony_service:
dial / hangup / balance / answer-XML only. No hardcoded caller numbers —
the from-number always comes from the caller (which reads it from settings
or the tenant's telephony config); if it is empty the dial is refused.
"""
import logging
import xml.sax.saxutils

import httpx

from app.config import settings

logger = logging.getLogger("vobiz")

_API_BASE = "https://api.vobiz.ai/api/v1"

class TelephonyError(Exception):
    """Carrier-level failure (rejected dial, malformed response, ...)."""

class VoBizClient:
    def __init__(self, auth_id: str | None = None, auth_token: str | None = None):
        self.auth_id = (auth_id if auth_id is not None else settings.VOBIZ_AUTH_ID or "").strip()
        self.auth_token = (auth_token if auth_token is not None else settings.VOBIZ_AUTH_TOKEN or "").strip()

    @property
    def _headers(self) -> dict:
        return {"X-Auth-ID": self.auth_id, "X-Auth-Token": self.auth_token}

    def _account_url(self, suffix: str = "") -> str:
        return f"{_API_BASE}/Account/{self.auth_id}{suffix}"

    async def dial(
        self,
        to: str,
        from_number: str,
        answer_url: str,
        hangup_url: str,
        recording_url: str,
    ) -> str:
        """Place an outbound call. Returns the carrier call UUID.

        Raises TelephonyError on any carrier rejection or on a 2xx
        response that carries no UUID (never invent one).
        """
        if not self.auth_id or not self.auth_token:
            raise TelephonyError("VoBiz Auth ID / Auth Token are not configured.")
        if not from_number:
            raise TelephonyError("VoBiz from-number is not configured.")
        payload = {
            "from": str(from_number).lstrip("+"),
            "to": str(to).lstrip("+"),
            "answer_url": answer_url,
            "answer_method": "POST",
            "hangup_url": hangup_url,
            "hangup_method": "POST",
            "record": "true",
            "record_url": recording_url,
            "record_method": "POST",
            "recording_file_format": "wav",
        }
        timeout = httpx.Timeout(12.0, connect=3.0)
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.post(
                    self._account_url("/Call/"),
                    json=payload,
                    headers={**self._headers, "Content-Type": "application/json"},
                )
        except httpx.HTTPError as exc:
            raise TelephonyError(f"VoBiz dial request failed: {exc}") from exc
        if resp.status_code not in (200, 201):
            raise TelephonyError(f"VoBiz call failed ({resp.status_code}): {resp.text[:300]}")
        try:
            data = resp.json()
        except ValueError:
            data = {}
        call_uuid = (
            data.get("call_uuid")
            or data.get("CallUUID")
            or data.get("request_uuid")
            or data.get("RequestUUID")
        )
        if not call_uuid:
            raise TelephonyError("VoBiz returned no call UUID")
        logger.info("VoBiz call placed to %s, uuid=%s", to, call_uuid)
        return str(call_uuid)

    async def hangup(self, call_uuid: str | None) -> bool:
        """Terminate a live call. Never raises; False means 'could not confirm'."""
        if not call_uuid or not self.auth_id:
            return False
        timeout = httpx.Timeout(6.0, connect=3.0)
        url = self._account_url(f"/Call/{call_uuid}/")
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.delete(url, headers=self._headers)
                if resp.status_code in (200, 201, 204):
                    return True
                resp = await client.post(url, data={"status": "completed"}, headers=self._headers)
                return resp.status_code in (200, 201, 204)
        except Exception as exc:  # hangup is best-effort by design
            logger.debug("VoBiz hangup for %s failed: %s", call_uuid, exc)
            return False

    async def get_balance(self) -> float | None:
        """Current account balance, or None if it cannot be determined."""
        if not self.auth_id or not self.auth_token:
            return None
        timeout = httpx.Timeout(8.0, connect=3.0)
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.get(self._account_url("/"), headers=self._headers)
            if resp.status_code != 200:
                return None
            data = resp.json()
        except Exception as exc:
            logger.debug("VoBiz balance check failed: %s", exc)
            return None
        for key in ("balance", "Balance", "credits", "Credits", "credit"):
            value = data.get(key) if isinstance(data, dict) else None
            if value is not None:
                try:
                    return float(value)
                except (TypeError, ValueError):
                    continue
        return None

    @staticmethod
    def build_answer_xml(call_id: str, stream_ws_url: str) -> str:
        """Plivo XML that opens the bidirectional 8kHz mu-law media stream."""
        url = xml.sax.saxutils.escape(stream_ws_url)
        return (
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            "<Response>\n"
            f'    <Stream bidirectional="true" keepCallAlive="true" '
            f'contentType="audio/x-mulaw;rate=8000">{url}</Stream>\n'
            '    <Wait length="3600" />\n'
            "</Response>"
        )
