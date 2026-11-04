"""VoiceEngine — runs ONE live call over the carrier media WebSocket.

Post-mortem fixes vs the old 1,866-line engine: provider failures are
raised and retried (never silent empty results), empty STT gets one
spoken reprompt before a polite close, the watchdog is 60s of *no
frames* (not a 15s kill), barge-in works after 0.4s of playback (not
1.5s of immunity), no hardcoded carrier identity, and recordings are
honest — no customer audio means no recording and failed/no_caller_audio.
"""
import asyncio
import audioop
import base64
import inspect
import io
import json
import logging
import struct
import time
import wave

from fastapi import WebSocket, WebSocketDisconnect
from sqlalchemy import select

from app.config import settings
from app.db import async_session as AsyncSessionLocal
from app.models import Agent, Call, Contact, TranscriptSegment, utcnow
from app.voice.providers import get_providers, retry

logger = logging.getLogger("voice.engine")

# --- tunables -------------------------------------------------------------
VAD_RMS_THRESHOLD = 300          # caller speech activity (16-bit PCM RMS)
END_OF_TURN_SILENCE = 0.9        # seconds of silence that end a caller turn
MIN_TURN_BYTES = 1600            # ~200ms of mu-law; shorter turns are noise
NO_FRAME_TIMEOUT = 60.0          # watchdog: no carrier frames at all -> end
BARGE_IN_MIN_PLAYBACK = 0.4      # seconds of playback before it can be cut
BARGE_IN_RMS = 1600              # loud, sustained voice = real interruption
BARGE_IN_CHUNKS = 6              # ~120ms of loud frames to trigger barge-in
CHUNK_BYTES = 640                # 80ms of 8kHz mu-law per playAudio frame
REPROMPT_TEXT = "Sorry, I could not hear you. Could you please repeat?"
FAREWELL_TEXT = "Alright, thank you for your time. Goodbye!"
LLM_FALLBACK_TEXT = "I see. Please tell me more about what you need."

OPT_OUT_PHRASES = (
    "do not call", "don't call", "stop calling", "remove my number",
    "फोन मत करो", "कॉल मत करो", "बंद करो", "परत फोन करू नका",
)
REFUSAL_PHRASES = (
    "not interested", "no thanks", "no need", "not needed",
    "नहीं चाहिए", "नही चाहिए", "नको", "नाही पाहिजे", "रुचि नहीं",
    "गलत नंबर", "wrong number", "hang up", "फोन रखो", "काट दो",
)
CALLBACK_PHRASES = (
    "call later", "call me later", "call back", "callback", "busy",
    "बाद में कॉल", "बाद में बात", "अभी बिजी", "व्यस्त हूँ", "व्यस्त हूं",
)
_LANGUAGE_CODES = {
    "hindi": "hi-IN", "marathi": "mr-IN", "english": "en-IN",
    "gujarati": "gu-IN", "bengali": "bn-IN", "tamil": "ta-IN",
    "telugu": "te-IN", "kannada": "kn-IN", "punjabi": "pa-IN",
}

def _language_code(agent: Agent) -> str:
    raw = (getattr(agent, "language", None) or "").strip()
    if not raw:
        return "hi-IN"
    if "-" in raw:
        return raw
    if raw.lower() in _LANGUAGE_CODES:
        return _LANGUAGE_CODES[raw.lower()]
    if len(raw) == 2:  # stored short codes: "hi", "mr", "en", ...
        return f"{raw.lower()}-IN"
    return "hi-IN"

def _mulaw_to_wav(mulaw: bytes) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(8000)
        w.writeframes(audioop.ulaw2lin(mulaw, 2))
    return buf.getvalue()

def _wav_to_mulaw(wav_bytes: bytes) -> bytes:
    with wave.open(io.BytesIO(wav_bytes), "rb") as w:
        frames = w.readframes(w.getnframes())
        rate, width = w.getframerate(), w.getsampwidth()
        channels = w.getnchannels()
    if channels > 1:
        frames = audioop.tomono(frames, width, 0.5, 0.5)
    if width != 2:
        frames = audioop.lin2lin(frames, width, 2)
    if rate != 8000:
        frames, _ = audioop.ratecv(frames, 2, 1, rate, 8000, None)
    return audioop.lin2ulaw(frames, 2)

def _build_call_wav(timeline: list[tuple[float, str, bytes]], duration: float) -> bytes:
    """Mix (offset, speaker, mu-law chunk) events into one 8kHz PCM WAV."""
    total = int((duration + 0.5) * 8000)
    track = bytearray(total * 2)
    for offset, _speaker, chunk in timeline:
        if not chunk:
            continue
        pcm = audioop.ulaw2lin(chunk, 2)
        start = max(0, int(offset * 8000)) * 2
        end = min(start + len(pcm), len(track))
        if start >= len(track):
            continue
        segment = bytes(track[start:end])
        piece = pcm[: end - start]
        if len(piece) < len(segment):
            piece = piece + b"\x00" * (len(segment) - len(piece))
        track[start:end] = audioop.add(segment, piece, 2)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(8000)
        w.writeframes(bytes(track))
    return buf.getvalue()

class VoiceEngine:
    def __init__(self) -> None:
        self.stt, self.llm, self.tts = get_providers()
        self._finalized = False

    # ------------------------------------------------------------------ DB
    async def _save_segment(self, call_id: str, speaker: str, text: str, offset: float) -> None:
        try:
            async with AsyncSessionLocal() as session:
                session.add(TranscriptSegment(
                    call_id=call_id, speaker=speaker, text=text,
                    offset_seconds=round(offset, 2),
                ))
                await session.commit()
        except Exception as exc:  # a failed segment must not kill the call
            logger.warning("segment save failed for call %s: %s", call_id, exc)

    async def _carrier_hangup(self, call) -> None:
        if not call.provider_call_uuid:
            return
        try:
            from app.telephony.vobiz import VoBizClient
            await VoBizClient().hangup(call.provider_call_uuid)
        except Exception as exc:
            logger.debug("carrier hangup attempt failed: %s", exc)

    # -------------------------------------------------------------- speech
    async def _play_mulaw(self, ws: WebSocket, state: dict, mulaw: bytes) -> None:
        """Stream playAudio frames with monotonic pacing; records the leg."""
        stream_id = state["stream_id"] or state["call_id"]
        state["speaking"] = True
        state["speech_started"] = time.monotonic()
        start = time.monotonic()
        idx = 0
        try:
            for offset in range(0, len(mulaw), CHUNK_BYTES):
                chunk = mulaw[offset:offset + CHUNK_BYTES]
                payload = base64.b64encode(chunk).decode("ascii")
                await ws.send_text(json.dumps({
                    "event": "playAudio", "streamId": stream_id,
                    "media": {"contentType": "audio/x-mulaw", "sampleRate": 8000,
                              "payload": payload},
                }))
                state["timeline"].append(
                    (time.time() - state["t0_wall"], "agent", chunk))
                idx += 1
                if idx <= 5:  # prime the carrier jitter buffer
                    continue
                target = (idx - 5) * (CHUNK_BYTES / 8000.0)
                delay = target - (time.monotonic() - start)
                if delay > 0.005:
                    await asyncio.sleep(delay)
        finally:
            state["speaking"] = False

    async def _speak(self, ws: WebSocket, state: dict, text: str) -> bool:
        """TTS (retried) + playback under the playback mutex. False on TTS failure."""
        async with state["playback_lock"]:
            try:
                wav = await retry(lambda: self.tts.synthesize(
                    text, state["agent"].voice_id, state["lang"]))
            except Exception as exc:
                logger.warning("TTS failed for call %s: %s", state["call_id"], exc)
                return False
            state["segments"].append(("agent", text))
            await self._save_segment(state["call_id"], "agent", text,
                                     time.time() - state["t0_wall"])
            state["history"].append({"role": "assistant", "content": text})
            await self._play_mulaw(ws, state, _wav_to_mulaw(wav))
            return True

    # ---------------------------------------------------------------- turn
    async def _process_turn(self, ws: WebSocket, state: dict, mulaw: bytes) -> None:
        agent: Agent = state["agent"]
        try:
            text = await retry(lambda: self.stt.transcribe(_mulaw_to_wav(mulaw), state["lang"]))
        except Exception as exc:
            logger.warning("STT failed for call %s: %s", state["call_id"], exc)
            text = ""
        text = (text or "").strip()

        if not text:
            state["empty_turns"] += 1
            if state["empty_turns"] == 1:
                await self._speak(ws, state, REPROMPT_TEXT)
            else:
                state["end_reason"] = "no_input"
                await self._speak(ws, state, FAREWELL_TEXT)
                await self._close(ws, state)
            return
        state["empty_turns"] = 0
        state["heard_customer"] = True
        state["segments"].append(("customer", text))
        await self._save_segment(state["call_id"], "customer", text,
                                 time.time() - state["t0_wall"])
        state["history"].append({"role": "user", "content": text})

        lowered = text.lower()
        if any(p in lowered for p in OPT_OUT_PHRASES):
            state["opt_out"] = True
            state["end_reason"] = "opt_out"
            await self._speak(ws, state, FAREWELL_TEXT)
            await self._close(ws, state)
            return
        if any(p in lowered for p in CALLBACK_PHRASES) and not any(
            p in lowered for p in REFUSAL_PHRASES
        ):
            state["callback"] = True
            state["end_reason"] = "callback"
            await self._speak(ws, state, FAREWELL_TEXT)
            await self._close(ws, state)
            return
        if any(p in lowered for p in REFUSAL_PHRASES):
            state["end_reason"] = "refusal"
            await self._speak(ws, state, FAREWELL_TEXT)
            await self._close(ws, state)
            return

        await self._reply(ws, state)

    async def _reply(self, ws: WebSocket, state: dict) -> None:
        agent: Agent = state["agent"]
        system = (
            f"You are an AI voice assistant calling on behalf of {agent.company_name}. "
            f"{agent.instructions or ''} "
            "Reply in the customer's language, in 1-2 short sentences. "
            "No markdown, no lists — this is spoken aloud."
        )
        messages = [{"role": "system", "content": system}] + state["history"][-12:]
        spoken = 0
        tts_failed = 0
        llm_failed = False
        try:
            async for sentence in self.llm.stream_reply(messages):
                sentence = sentence.strip()
                if not sentence:
                    continue
                if await self._speak(ws, state, sentence):
                    spoken += 1
                else:
                    tts_failed += 1
        except Exception as exc:  # stream/provider errors vary by backend
            logger.warning("LLM failed for call %s: %s", state["call_id"], exc)
            llm_failed = True

        if llm_failed or (spoken == 0 and tts_failed == 0):
            state["llm_failures"] += 1
            if state["llm_failures"] == 1:
                await self._speak(ws, state, LLM_FALLBACK_TEXT)
            else:
                state["end_reason"] = "llm_error"
                await self._speak(ws, state, FAREWELL_TEXT)
                await self._close(ws, state)
            return
        if spoken == 0 and tts_failed > 0:
            # Every sentence failed TTS: one fallback attempt, else end.
            if not await self._speak(ws, state, LLM_FALLBACK_TEXT):
                state["end_reason"] = "tts_error"
                state["fatal_reason"] = "tts_error"
                await self._close(ws, state)

    async def _close(self, ws: WebSocket, state: dict) -> None:
        state["ended"] = True
        try:
            await ws.close()
        except Exception:
            pass

    # ---------------------------------------------------------------- main
    async def handle_stream(self, websocket: WebSocket, call_id: str) -> None:
        try:
            await websocket.accept()
        except Exception:
            pass  # already accepted by the route
        state: dict = {
            "call_id": call_id, "stream_id": None, "history": [], "segments": [],
            "timeline": [], "playback_lock": asyncio.Lock(), "speaking": False,
            "speech_started": 0.0, "empty_turns": 0, "llm_failures": 0,
            "heard_customer": False, "customer_audio_bytes": 0, "stream_opened": False,
            "opt_out": False, "callback": False, "end_reason": None,
            "fatal_reason": None, "ended": False, "t0_wall": time.time(),
        }
        call = agent = None
        async with AsyncSessionLocal() as session:
            call = await session.get(Call, call_id)
            if call is not None:
                agent = await session.get(Agent, call.agent_id)
                if agent is not None:
                    call.status = "in_progress"
                    call.answered_at = utcnow()
                    await session.commit()
                    session.expunge_all()
        if call is None or agent is None:
            logger.error("stream for unknown call/agent: %s", call_id)
            await self._close(websocket, state)
            return
        state["agent"] = agent
        state["lang"] = _language_code(agent)

        try:
            greeting = (agent.greeting_message or "").strip()
            disclosure = (
                f"This is an AI assistant calling from {agent.company_name}. "
                "This call may be recorded."
            )
            spoken_greeting = (
                greeting if "ai assistant" in greeting.lower()
                else f"{disclosure} {greeting}".strip()
            )
            # Synthesize BEFORE the media loop so a TTS outage fails the
            # call cleanly instead of connecting into dead air.
            try:
                greeting_wav = await retry(lambda: self.tts.synthesize(
                    spoken_greeting, agent.voice_id, state["lang"]))
            except Exception as exc:
                logger.error("greeting TTS failed for call %s: %s", call_id, exc)
                state["fatal_reason"] = "tts_error"
                await self._carrier_hangup(call)
                return
            greeting_mulaw = _wav_to_mulaw(greeting_wav)

            await self._media_loop(websocket, state, greeting_mulaw, spoken_greeting)
        except WebSocketDisconnect:
            logger.info("media stream disconnected for call %s", call_id)
        except Exception as exc:
            logger.exception("media stream error for call %s: %s", call_id, exc)
        finally:
            await self._finalize(state, call, agent)

    async def _media_loop(self, ws: WebSocket, state: dict,
                          greeting_mulaw: bytes, greeting_text: str) -> None:
        buffer = bytearray()
        user_speaking = False
        last_speech = 0.0
        last_frame = time.monotonic()
        barge_streak = 0
        greeting_sent = False
        turn_task: asyncio.Task | None = None
        pending_turn: bytes | None = None

        async def deliver_greeting() -> None:
            async with state["playback_lock"]:
                state["segments"].append(("agent", greeting_text))
                await self._save_segment(state["call_id"], "agent", greeting_text,
                                         time.time() - state["t0_wall"])
                state["history"].append({"role": "assistant", "content": greeting_text})
                await self._play_mulaw(ws, state, greeting_mulaw)

        while not state["ended"]:
            if pending_turn is not None and (turn_task is None or turn_task.done()):
                turn_task = asyncio.create_task(
                    self._process_turn(ws, state, pending_turn))
                pending_turn = None
            try:
                raw = await asyncio.wait_for(ws.receive_text(), timeout=1.0)
            except asyncio.TimeoutError:
                idle = time.monotonic() - last_frame
                if idle >= NO_FRAME_TIMEOUT and not state["speaking"]:
                    logger.info("no frames for %.0fs on call %s; ending",
                                idle, state["call_id"])
                    break
                if (user_speaking and buffer
                        and time.monotonic() - last_speech >= END_OF_TURN_SILENCE):
                    pending_turn = bytes(buffer)
                    buffer.clear()
                    user_speaking = False
                continue
            except WebSocketDisconnect:
                break
            last_frame = time.monotonic()

            try:
                frame = json.loads(raw)
            except (ValueError, TypeError):
                logger.debug("ignoring malformed media frame on call %s", state["call_id"])
                continue
            event = frame.get("event")
            if event in ("stop", "hangup", "disconnect"):
                break
            if event == "start":
                state["stream_opened"] = True
                start = frame.get("start") or {}
                state["stream_id"] = (
                    frame.get("streamId") or frame.get("streamSid")
                    or start.get("streamSid") or start.get("streamId")
                )
                if not greeting_sent:
                    greeting_sent = True
                    turn_task = asyncio.create_task(deliver_greeting())
                continue
            if event != "media":
                continue
            state["stream_opened"] = True
            if not greeting_sent:
                greeting_sent = True
                turn_task = asyncio.create_task(deliver_greeting())
            payload = (frame.get("media") or {}).get("payload")
            if not payload:
                continue
            try:
                chunk = base64.b64decode(payload)
            except Exception:
                continue
            state["customer_audio_bytes"] += len(chunk)
            state["timeline"].append((time.time() - state["t0_wall"], "customer", chunk))
            try:
                rms = audioop.rms(audioop.ulaw2lin(chunk, 2), 2)
            except Exception:
                rms = 0

            if state["speaking"]:
                played_for = time.monotonic() - state["speech_started"]
                if played_for >= BARGE_IN_MIN_PLAYBACK and rms > BARGE_IN_RMS:
                    barge_streak += 1
                    if barge_streak >= BARGE_IN_CHUNKS:
                        barge_streak = 0
                        try:
                            await ws.send_text(json.dumps({
                                "event": "clearAudio",
                                "streamId": state["stream_id"] or state["call_id"],
                            }))
                        except Exception:
                            pass
                        if turn_task is not None and not turn_task.done():
                            turn_task.cancel()
                        state["speaking"] = False
                else:
                    barge_streak = 0
                continue

            if rms > VAD_RMS_THRESHOLD:
                user_speaking = True
                last_speech = time.monotonic()
                buffer.extend(chunk)
            elif user_speaking:
                buffer.extend(chunk)
                if time.monotonic() - last_speech >= END_OF_TURN_SILENCE:
                    if len(buffer) >= MIN_TURN_BYTES:
                        pending_turn = bytes(buffer)
                    buffer.clear()
                    user_speaking = False

        if turn_task is not None and not turn_task.done():
            turn_task.cancel()

    # ------------------------------------------------------------ finalize
    async def _finalize(self, state: dict, call: Call | None, agent: Agent | None) -> None:
        if self._finalized or call is None:
            return
        self._finalized = True
        try:
            from app.services.analyzer import analyze
            from app.services.storage import save_recording
        except Exception as exc:
            logger.warning("finalize helpers unavailable for call %s: %s",
                           state["call_id"], exc)
            analyze = save_recording = None

        ended_at = utcnow()
        duration = 0.0
        if call.answered_at is not None:
            duration = max(0.0, (ended_at - call.answered_at).total_seconds())

        recording_path = None
        recording_status = call.recording_status or "none"
        if state["customer_audio_bytes"] > 0 and state["timeline"] and save_recording:
            try:
                wav = _build_call_wav(state["timeline"], duration)
                saved = save_recording(state["call_id"], wav)
                if inspect.isawaitable(saved):
                    saved = await saved
                recording_path, recording_status = saved, "ready"
            except Exception as exc:
                logger.warning("recording save failed for call %s: %s",
                               state["call_id"], exc)
                recording_status = "none"

        transcript_text = "\n".join(
            f"{'Customer' if spk == 'customer' else 'Agent'}: {txt}"
            for spk, txt in state["segments"]
        )
        analysis: dict = {}
        if transcript_text and analyze is not None:
            try:
                result = analyze(transcript_text)
                if inspect.isawaitable(result):
                    result = await result
                analysis = result or {}
            except Exception as exc:
                logger.warning("analyzer failed for call %s: %s", state["call_id"], exc)

        opt_out = bool(state["opt_out"] or analysis.get("opt_out"))
        callback = bool(state["callback"] or analysis.get("callback_requested"))

        async with AsyncSessionLocal() as session:
            fresh = await session.get(Call, call.id)
            if fresh is None:
                return
            fresh.ended_at = ended_at
            fresh.duration_seconds = round(duration, 1)
            if recording_path:
                fresh.recording_path = recording_path
            fresh.recording_status = recording_status
            if analysis.get("disposition"):
                fresh.disposition = analysis["disposition"]
            if analysis.get("lead_score") is not None:
                fresh.lead_score = analysis["lead_score"]
            if analysis.get("summary"):
                fresh.lead_summary = analysis["summary"]

            if state["fatal_reason"]:
                fresh.status = "failed"
                fresh.termination_reason = state["fatal_reason"]
            elif fresh.status in ("busy", "no_answer", "cancelled"):
                pass  # carrier webhook already decided; never resurrect
            elif state["heard_customer"]:
                fresh.status = "completed"
                if state["end_reason"]:
                    fresh.termination_reason = state["end_reason"]
            elif state["stream_opened"]:
                fresh.status = "failed"
                fresh.termination_reason = "no_caller_audio"
            if opt_out:
                fresh.disposition = fresh.disposition or "not_interested"
                if fresh.contact_id:
                    contact = await session.get(Contact, fresh.contact_id)
                    if contact is not None:
                        contact.status = "do_not_call"
            await session.commit()

            try:
                from app.services.dispatcher import schedule_followup
                reason = None
                if callback:
                    reason = "callback_requested"
                elif fresh.status == "no_answer":
                    reason = "no_answer"
                elif fresh.status == "busy":
                    reason = "busy"
                if reason:
                    scheduled = schedule_followup(session, fresh, reason)
                    if inspect.isawaitable(scheduled):
                        await scheduled
                    await session.commit()
            except Exception as exc:
                logger.warning("followup scheduling failed for call %s: %s",
                               state["call_id"], exc)
        logger.info("call %s finalized (reason=%s)",
                    state["call_id"], state["fatal_reason"] or state["end_reason"])
