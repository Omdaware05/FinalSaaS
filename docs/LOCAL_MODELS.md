# FinalSaaS — Local Models Guide

FinalSaaS does not hardcode its voice AI. Every call goes through a **voice provider** selected by one environment variable:

```ini
VOICE_PROVIDER=sarvam   # default: Sarvam cloud
VOICE_PROVIDER=local    # your own models, on your own hardware
```

Both providers expose the same three capabilities to the calling engine — **speech-to-text, LLM reply, text-to-speech** — so switching is configuration, not code. This document covers the `local` provider.

## What the local provider expects

The local provider talks to **any OpenAI-compatible HTTP server** at `LOCAL_AI_BASE_URL`:

```ini
LOCAL_AI_BASE_URL=http://localhost:8002/v1
LOCAL_AI_API_KEY=            # only if your server requires one
LOCAL_STT_MODEL=whisper-large-v3-turbo
LOCAL_LLM_MODEL=             # model name/id your server serves
LOCAL_TTS_MODEL=kokoro
LOCAL_TTS_VOICE=af_heart
```

Required endpoints (OpenAI API shapes):

| Capability | Endpoint | Notes |
|---|---|---|
| STT | `POST /audio/transcriptions` | multipart audio upload (WAV, 8 kHz μ-law decoded to PCM by the backend), returns `{"text": "..."}` |
| LLM | `POST /chat/completions` | OpenAI chat format; streaming supported and preferred for low latency |
| TTS | `POST /audio/speech` | JSON `{model, voice, input}`, returns audio bytes (WAV/PCM) |

If your server cannot be reached or a model is not loaded, calls fail with a clear provider error in the call's disposition — the engine never falls back to silent audio.

## Option 1 — LM Studio (easiest, desktop)

1. Install LM Studio, download an instruct LLM (e.g. a Qwen/Gemma instruct build sized for your GPU).
2. In LM Studio's **Local Server** tab: load the model, enable *Serve on local network* if needed, start the server (default port **1234**).
3. LM Studio serves `/chat/completions` natively. It does **not** serve Whisper/Kokoro — pair it with a small STT/TTS server on the same box (Option 3) and point both at the same base URL only if that server fronts all three endpoints; otherwise run the unified local AI server (Option 3) and let it proxy the LLM to LM Studio.
4. Set:

```ini
VOICE_PROVIDER=local
LOCAL_AI_BASE_URL=http://localhost:1234/v1
LOCAL_LLM_MODEL=<the exact model id shown in LM Studio>
```

## Option 2 — Ollama (LLM only, same caveat)

```bash
ollama pull qwen3:8b        # or your preferred instruct model
ollama serve                # http://localhost:11434, OpenAI-compatible at /v1
```

```ini
VOICE_PROVIDER=local
LOCAL_AI_BASE_URL=http://localhost:11434/v1
LOCAL_LLM_MODEL=qwen3:8b
```

Like LM Studio, Ollama covers the LLM endpoint only — use Option 3 for telephony-grade STT + TTS on the same base URL.

## Option 3 — Unified local AI server on port 8002 (recommended for calls)

For real calls you want STT, LLM and TTS behind **one** base URL with telephony-friendly latency. Run a single FastAPI-style server on port **8002** that:

- loads **Whisper** (STT) — e.g. `whisper-large-v3-turbo`,
- loads **Kokoro** (TTS) — fast, small, good Hindi/English voices,
- serves the LLM itself (llama.cpp / vLLM) **or proxies** `/chat/completions` to LM Studio/Ollama/a cloud fallback,

and implements the three endpoints in the table above. The legacy `local_ai_server` from the earlier project follows exactly this shape and can be reused as the starting point — update its model paths for the machine it runs on (they are machine-specific) and make sure its `/health` reports each model as loaded before dialling.

Then:

```ini
VOICE_PROVIDER=local
LOCAL_AI_BASE_URL=http://localhost:8002/v1
LOCAL_STT_MODEL=whisper-large-v3-turbo
LOCAL_LLM_MODEL=<model id served by your server>
LOCAL_TTS_MODEL=kokoro
```

**Docker note:** if the backend runs in Docker and the model server runs on the host, `localhost` inside the container is the container itself. Use `LOCAL_AI_BASE_URL=http://host.docker.internal:8002/v1` (the compose setup already supports `host.docker.internal` on Linux via the backend service's host gateway).

## Latency expectations

Telephony feels natural under roughly 800 ms end-to-end per turn. Locally that means: a GPU (or Apple Silicon) for Whisper + LLM, streaming LLM responses sentence-by-sentence (the provider does this), and Kokoro for TTS. On CPU-only hardware expect multi-second turns — fine for testing the pipeline, not for customers.

## Adding a brand-new provider

Providers live in **`backend/app/voice/providers.py`**. To add one (e.g. a different cloud):

1. Create a class implementing the provider interface used by the existing classes — the three async operations: `transcribe(audio, language)`, `reply(messages)` (streaming chunks), and `synthesize(text, voice)`.
2. Read your credentials/settings from `backend/app/config.py` settings (add new env vars there and document them in `backend/.env.example`) — never hardcode keys.
3. Register the class in the provider factory under a new `VOICE_PROVIDER` value.
4. Fail loudly: raise/return a typed provider error on timeouts and bad responses. The calling engine converts it into a clear call disposition; returning empty audio/text silently is an anti-pattern this codebase removed on purpose.
5. Add a test with a mocked HTTP layer — CI runs the backend suite on every push.

Then `VOICE_PROVIDER=<your value>` just works everywhere: single calls, batches, callbacks and the dashboard test-call.
