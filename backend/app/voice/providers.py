"""Voice AI providers: STT / LLM / TTS behind small protocols.

Two implementations of the same interface:

- Sarvam (cloud): saaras STT, sarvam LLM (OpenAI-shaped streaming),
  bulbul TTS — same request shapes as the old engine.
- Local (future / self-hosted): any OpenAI-compatible server at
  LOCAL_AI_BASE_URL (LM Studio, Ollama-style gateways, the project's
  own local_ai_server) exposing /audio/transcriptions,
  /chat/completions and /audio/speech.

Providers RAISE ProviderError on failure — the old engine's habit of
returning b"" / "" on error (silent dead air, dropped turns) is exactly
what callers must be able to retry and react to instead.
"""
import asyncio
import base64
import json
import logging
from typing import AsyncIterator, NamedTuple, Protocol, runtime_checkable

import httpx

from app.config import settings
from app.errors import DomainError

logger = logging.getLogger("voice.providers")

SARVAM_BASE = "https://api.sarvam.ai"
_TIMEOUT = httpx.Timeout(12.0, connect=3.0)

_client: httpx.AsyncClient | None = None

def _http() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(
            timeout=_TIMEOUT,
            limits=httpx.Limits(max_keepalive_connections=40, max_connections=60, keepalive_expiry=120.0),
        )
    return _client

class ProviderError(Exception):
    """A voice provider call failed (HTTP error, bad payload, timeout)."""

async def retry(coro_factory, attempts: int = 3, base_delay: float = 0.4):
    """Await coro_factory() with exponential backoff (0.4s, 0.8s, ...).

    coro_factory is a zero-arg callable returning a fresh coroutine on
    each attempt (a coroutine object itself cannot be re-awaited).
    Re-raises the last exception after `attempts` failures.
    """
    last: Exception | None = None
    for attempt in range(max(1, attempts)):
        try:
            return await coro_factory()
        except Exception as exc:  # provider errors are deliberately broad here
            last = exc
            if attempt < attempts - 1:
                await asyncio.sleep(base_delay * (2 ** attempt))
    assert last is not None
    raise last

class SentenceChunker:
    """Accumulates streamed tokens and cuts them into speakable sentences."""

    _DELIMS = "।?!.\n"

    def __init__(self) -> None:
        self._buf = ""

    def feed(self, text: str) -> list[str]:
        self._buf += text
        out: list[str] = []
        while True:
            cut = next((i for i, ch in enumerate(self._buf) if ch in self._DELIMS), -1)
            if cut < 0:
                return out
            sentence, self._buf = self._buf[: cut + 1].strip(), self._buf[cut + 1 :]
            if sentence:
                out.append(sentence)

    def flush(self) -> str | None:
        tail, self._buf = self._buf.strip(), ""
        return tail or None

@runtime_checkable
class STTProvider(Protocol):
    async def transcribe(self, wav_bytes: bytes, language: str) -> str: ...

@runtime_checkable
class LLMProvider(Protocol):
    def stream_reply(self, messages: list[dict]) -> AsyncIterator[str]: ...

@runtime_checkable
class TTSProvider(Protocol):
    async def synthesize(self, text: str, voice_id: str | None, language: str) -> bytes: ...

def _sse_delta(line: str) -> str:
    """Extract delta text from one OpenAI-style SSE line ('' if none)."""
    line = line.strip()
    if not line.startswith("data:") or line == "data: [DONE]":
        return ""
    try:
        payload = json.loads(line[5:])
        return payload["choices"][0].get("delta", {}).get("content", "") or ""
    except Exception:
        return ""

# ---------------------------------------------------------------- Sarvam

def _sarvam_headers() -> dict:
    return {"api-subscription-key": settings.SARVAM_API_KEY or ""}

class SarvamSTT:
    async def transcribe(self, wav_bytes: bytes, language: str) -> str:
        files = {"file": ("caller_audio.wav", wav_bytes, "audio/wav")}
        data = {"model": settings.SARVAM_STT_MODEL, "language_code": language}
        resp = await _http().post(
            f"{SARVAM_BASE}/speech-to-text", headers=_sarvam_headers(), files=files, data=data
        )
        if resp.status_code != 200:
            raise ProviderError(f"Sarvam STT failed ({resp.status_code}): {resp.text[:200]}")
        return (resp.json().get("transcript") or "").strip()

class SarvamLLM:
    async def stream_reply(self, messages: list[dict]) -> AsyncIterator[str]:
        payload = {
            "model": settings.SARVAM_LLM_MODEL,
            "messages": messages,
            "temperature": 0.2,
            "max_tokens": 60,
            "stream": True,
        }
        headers = {**_sarvam_headers(), "Content-Type": "application/json"}
        chunker = SentenceChunker()
        yielded = False
        try:
            async with _http().stream(
                "POST", f"{SARVAM_BASE}/v1/chat/completions", json=payload, headers=headers
            ) as resp:
                if resp.status_code != 200:
                    body = (await resp.aread()).decode("utf-8", "replace")
                    raise ProviderError(f"Sarvam LLM failed ({resp.status_code}): {body[:200]}")
                async for line in resp.aiter_lines():
                    delta = _sse_delta(line)
                    if delta:
                        for sentence in chunker.feed(delta):
                            yielded = True
                            yield sentence
        except httpx.HTTPError as exc:
            raise ProviderError(f"Sarvam LLM request error: {exc}") from exc
        tail = chunker.flush()
        if tail:
            yield tail
        elif not yielded:
            raise ProviderError("Sarvam LLM returned an empty reply")

class SarvamTTS:
    async def synthesize(self, text: str, voice_id: str | None, language: str) -> bytes:
        clean = (text or "").strip()
        if not clean:
            raise ProviderError("Sarvam TTS called with empty text")
        payload = {
            "inputs": [clean],
            "target_language_code": language,
            "speaker": (voice_id or "shubh").strip().lower(),
            "model": settings.SARVAM_TTS_MODEL,
            "speech_sample_rate": 8000,
            "enable_preprocessing": False,
        }
        resp = await _http().post(
            f"{SARVAM_BASE}/text-to-speech", json=payload, headers=_sarvam_headers()
        )
        if resp.status_code != 200:
            raise ProviderError(f"Sarvam TTS failed ({resp.status_code}): {resp.text[:200]}")
        audios = resp.json().get("audios") or []
        if not audios:
            raise ProviderError("Sarvam TTS returned no audio")
        return base64.b64decode(audios[0])  # WAV bytes

# ----------------------------------------------------------------- Local
# OpenAI-compatible servers (LM Studio / Ollama gateways / local_ai_server).

def _local_base() -> str:
    return (settings.LOCAL_AI_BASE_URL or "").rstrip("/")

def _local_headers() -> dict:
    if settings.LOCAL_AI_API_KEY:
        return {"Authorization": f"Bearer {settings.LOCAL_AI_API_KEY}"}
    return {}

class LocalSTT:
    async def transcribe(self, wav_bytes: bytes, language: str) -> str:
        files = {"file": ("caller_audio.wav", wav_bytes, "audio/wav")}
        data = {"language": language.split("-")[0]}
        if settings.LOCAL_STT_MODEL:
            data["model"] = settings.LOCAL_STT_MODEL
        resp = await _http().post(
            f"{_local_base()}/audio/transcriptions",
            headers=_local_headers(), files=files, data=data,
        )
        if resp.status_code != 200:
            raise ProviderError(f"Local STT failed ({resp.status_code}): {resp.text[:200]}")
        return (resp.json().get("text") or "").strip()

class LocalLLM:
    async def stream_reply(self, messages: list[dict]) -> AsyncIterator[str]:
        base_payload = {
            "model": settings.LOCAL_LLM_MODEL,
            "messages": messages,
            "temperature": 0.2,
            "max_tokens": 60,
        }
        chunker = SentenceChunker()
        yielded = False
        try:
            async with _http().stream(
                "POST", f"{_local_base()}/chat/completions",
                json={**base_payload, "stream": True}, headers=_local_headers(),
            ) as resp:
                if resp.status_code != 200:
                    raise ProviderError(f"Local LLM stream failed ({resp.status_code})")
                async for line in resp.aiter_lines():
                    delta = _sse_delta(line)
                    if delta:
                        for sentence in chunker.feed(delta):
                            yielded = True
                            yield sentence
            tail = chunker.flush()
            if tail:
                yield tail
            if yielded:
                return
            raise ProviderError("Local LLM stream was empty")
        except ProviderError:
            if yielded:
                raise
            # Server may not support SSE streaming — retry as a plain
            # completion and chunk the full text into sentences locally.
            resp = await _http().post(
                f"{_local_base()}/chat/completions", json=base_payload, headers=_local_headers()
            )
            if resp.status_code != 200:
                raise ProviderError(f"Local LLM failed ({resp.status_code}): {resp.text[:200]}")
            try:
                content = resp.json()["choices"][0]["message"]["content"] or ""
            except Exception as exc:
                raise ProviderError("Local LLM returned an unexpected payload") from exc
            chunker = SentenceChunker()
            for sentence in chunker.feed(content):
                yield sentence
            tail = chunker.flush()
            if tail:
                yield tail
            if not content.strip():
                raise ProviderError("Local LLM returned an empty reply")

class LocalTTS:
    async def synthesize(self, text: str, voice_id: str | None, language: str) -> bytes:
        clean = (text or "").strip()
        if not clean:
            raise ProviderError("Local TTS called with empty text")
        payload = {
            "model": settings.LOCAL_TTS_MODEL,
            "input": clean,
            "voice": voice_id or "default",
            "response_format": "wav",
        }
        resp = await _http().post(
            f"{_local_base()}/audio/speech", json=payload, headers=_local_headers()
        )
        if resp.status_code != 200:
            raise ProviderError(f"Local TTS failed ({resp.status_code}): {resp.text[:200]}")
        if not resp.content:
            raise ProviderError("Local TTS returned no audio")
        return resp.content  # WAV bytes

# --------------------------------------------------------------- Factory

class VoiceProviders(NamedTuple):
    stt: STTProvider
    llm: LLMProvider
    tts: TTSProvider

def get_providers() -> VoiceProviders:
    provider = (settings.VOICE_PROVIDER or "").strip().lower()
    if provider == "sarvam":
        return VoiceProviders(SarvamSTT(), SarvamLLM(), SarvamTTS())
    if provider == "local":
        return VoiceProviders(LocalSTT(), LocalLLM(), LocalTTS())
    raise DomainError(
        "PROVIDER_NOT_CONFIGURED",
        f"Unknown VOICE_PROVIDER {settings.VOICE_PROVIDER!r}; expected 'sarvam' or 'local'.",
        500,
    )

def is_provider_configured() -> bool:
    provider = (settings.VOICE_PROVIDER or "").strip().lower()
    if provider == "sarvam":
        return bool(settings.SARVAM_API_KEY)
    if provider == "local":
        return bool(_local_base())
    return False
