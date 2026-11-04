"""Probing the optional local AI server (LM Studio / Ollama / GPU box).

LOCAL_AI_BASE_URL is OpenAI-style and usually ends in /v1; the health
endpoint lives at the server root. Probes are short-timeout and never
raise — callers get a plain dict.
"""
import httpx

from app.config import settings


def local_root() -> str:
    base = (settings.LOCAL_AI_BASE_URL or "").rstrip("/")
    if base.endswith("/v1"):
        base = base[:-3]
    return base


async def probe_local(timeout: float = 2.0) -> dict:
    root = local_root()
    result = {"reachable": False, "url": root, "health": None, "models_status": None}
    if not root:
        return result
    headers = {}
    if settings.LOCAL_AI_API_KEY:
        headers["Authorization"] = f"Bearer {settings.LOCAL_AI_API_KEY}"
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(timeout, connect=1.0)) as client:
            try:
                resp = await client.get(f"{root}/health")
                if resp.status_code == 200:
                    result["reachable"] = True
                    try:
                        result["health"] = resp.json()
                    except ValueError:
                        result["health"] = {}
            except httpx.HTTPError:
                pass
            if not result["reachable"]:
                try:
                    resp = await client.get(f"{settings.LOCAL_AI_BASE_URL.rstrip('/')}/models", headers=headers)
                    result["models_status"] = resp.status_code
                    if resp.status_code == 200:
                        result["reachable"] = True
                except httpx.HTTPError:
                    pass
    except Exception:
        pass
    return result
