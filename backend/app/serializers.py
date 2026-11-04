"""Serializers emitting the OLD frontend's document shapes (types/api.ts).

Each function returns a superset: the old document fields (agent_id,
phone_number, state, ...) AND the clean FinalSaaS fields (id, phone,
status, ...) so both generations of UI keep working.
"""
from datetime import datetime

from app.models import Agent, Call, Campaign, Contact, FollowUp, Invoice, Questionnaire, Tenant, TranscriptSegment

STATE_MAP = {
    "queued": "QUEUED",
    "initiating": "DIALING",
    "ringing": "RINGING",
    "in_progress": "CONNECTED",
    "completed": "COMPLETED",
    "failed": "FAILED",
    "busy": "BUSY",
    "no_answer": "NO_ANSWER",
    "cancelled": "HANGUP",
}
STATUS_FROM_STATE = {v.lower(): k for k, v in STATE_MAP.items()}
# FollowUp storage vocabulary -> old frontend vocabulary
FOLLOWUP_STATUS_OUT = {"pending": "pending", "processing": "scheduled", "done": "completed", "cancelled": "cancelled"}
FOLLOWUP_STATUS_IN = {"pending": "pending", "scheduled": "pending", "completed": "done",
                      "done": "done", "processing": "processing", "cancelled": "cancelled"}


def _iso(dt: datetime | None) -> str | None:
    return dt.isoformat() if dt else None


def agent_out(a: Agent) -> dict:
    languages = a.supported_languages or ([a.default_language] if a.default_language else [])
    return {
        # clean fields
        "id": a.id, "tenant_id": a.tenant_id, "name": a.name, "purpose": a.purpose,
        "company_name": a.company_name, "company_description": a.company_description,
        "greeting_message": a.greeting_message, "instructions": a.instructions,
        "voice_id": a.voice_id, "voice_name": a.voice_name or a.voice_id,
        "voice_gender": a.voice_gender, "tts_provider": a.tts_provider or "sarvam",
        "language": a.language, "language_mode": a.language_mode or "auto_match",
        "primary_language": a.primary_language or a.language or "hi",
        "default_language": a.default_language or "Hindi",
        "supported_languages": languages,
        "speaking_speed": a.speaking_speed if a.speaking_speed is not None else 1.0,
        "telephony_provider": a.telephony_provider or "vobiz",
        "telephony_from_number": a.telephony_from_number,
        "questionnaire_id": a.questionnaire_id,
        "enabled": a.enabled, "concurrency": a.concurrency,
        "created_at": _iso(a.created_at), "updated_at": _iso(a.updated_at),
        # old AgentDocument fields
        "agent_id": a.id,
        "description": a.purpose,
        "predefined_faqs": [],
        "avatar": None,
        "is_enabled": a.enabled,
        "system_prompt": a.instructions,
        "provider": a.telephony_provider or "vobiz",
        "stt_config": {}, "tts_config": {}, "llm_config": {},
        "voice_style": None,
        "telephony_auth_id": None,
        "telephony_auth_token": None,
        "has_custom_telephony_token": False,
    }


def transcript_doc(call: Call, segments: list[TranscriptSegment]) -> dict:
    segs = [
        {
            "speaker": s.speaker, "text": s.text,
            "timestamp": _iso(s.created_at),
            "offset_seconds": s.offset_seconds,
        }
        for s in segments
    ]
    return {
        "call_id": call.id,
        "agent_id": call.agent_id,
        "phone_number": call.phone,
        "duration": call.duration_seconds or 0,
        "language": "hi",
        "provider": "vobiz",
        "stt_model": "saaras:v3", "llm_model": "sarvam-105b-conversations", "tts_model": "bulbul:v3",
        "segments": segs,
        "full_text": "\n".join(
            f"{'Customer' if s['speaker'] == 'customer' else 'Agent'}: {s['text']}" for s in segs
        ),
        "created_at": _iso(call.created_at),
    }


def call_out(c: Call, agent_name: str | None = None, contact_name: str | None = None,
             transcript: dict | None = None) -> dict:
    return {
        # clean fields
        "id": c.id, "tenant_id": c.tenant_id, "agent_id": c.agent_id,
        "contact_id": c.contact_id, "campaign_id": c.campaign_id,
        "phone": c.phone, "direction": c.direction, "status": c.status,
        "disposition": c.disposition, "provider_call_uuid": c.provider_call_uuid,
        "started_at": _iso(c.started_at), "answered_at": _iso(c.answered_at),
        "ended_at": _iso(c.ended_at), "duration_seconds": c.duration_seconds,
        "termination_reason": c.termination_reason, "failure_reason": c.failure_reason,
        "recording_status": c.recording_status, "recording_path": c.recording_path,
        "lead_score": c.lead_score, "lead_summary": c.lead_summary,
        "is_followup": c.is_followup, "parent_call_id": c.parent_call_id,
        "created_at": _iso(c.created_at), "updated_at": _iso(c.ended_at or c.created_at),
        "agent_name": agent_name, "contact_name": contact_name,
        # old CallDocument fields
        "call_id": c.id,
        "phone_number": c.phone,
        "provider": "vobiz",
        "state": STATE_MAP.get(c.status, "COMPLETED"),
        "duration": c.duration_seconds or 0,
        "transcript": transcript,
        "recording": (
            {"local_path": c.recording_path, "provider_url": None}
            if c.recording_status in ("ready", "synthesized") else None
        ),
        "models": {"stt": "saaras:v3", "tts": "bulbul:v3", "llm": "sarvam-105b-conversations"},
        "answers": [],
        "last_interest_status": (
            {"interested": "interested", "not_interested": "not_interested"}.get(c.disposition or "")
        ),
    }


def contact_out(c: Contact, interaction_count: int = 0, last_call_id: str | None = None,
                last_call_at=None, last_interest_status: str | None = None) -> dict:
    return {
        # clean fields
        "id": c.id, "tenant_id": c.tenant_id, "business_id": c.tenant_id,
        "agent_id": c.agent_id, "name": c.name, "phone": c.phone, "email": c.email,
        "status": c.status, "consent_status": c.consent_status,
        "consent_source": c.consent_source, "consent_at": _iso(c.consent_at),
        "notes": c.notes, "custom_fields": c.custom_fields or {},
        "created_at": _iso(c.created_at), "updated_at": _iso(c.created_at),
        # old ContactDocument fields
        "contact_id": c.id,
        "phone_number": c.phone,
        "interaction_count": interaction_count,
        "last_call_id": last_call_id,
        "last_call_at": _iso(last_call_at) if last_call_at else None,
        "last_interest_status": last_interest_status,
    }


def campaign_out(c: Campaign, counts: dict | None = None) -> dict:
    counts = counts or {}
    total = sum(counts.values())
    status_out = {
        "draft": "CREATED", "running": "RUNNING",
        "completed": "COMPLETED", "cancelled": "STOPPED",
    }.get(c.status, c.status.upper())
    return {
        # clean fields
        "id": c.id, "tenant_id": c.tenant_id, "name": c.name,
        "description": c.description, "agent_id": c.agent_id,
        "questionnaire_id": c.questionnaire_id,
        "contact_ids": c.contact_ids or [], "phone_numbers": c.phone_numbers or [],
        "concurrency": c.concurrency, "provider": c.provider or "vobiz",
        # old CampaignDocument.status is the UPPERCASE enum; clean value kept alongside
        "status": status_out, "status_internal": c.status,
        "started_at": _iso(c.started_at),
        "created_at": _iso(c.created_at), "updated_at": _iso(c.updated_at),
        "call_counts": counts,
        # old CampaignDocument fields
        "campaign_id": c.id,
        "total_calls": total,
        "completed_calls": counts.get("completed", 0),
        "failed_calls": counts.get("failed", 0) + counts.get("busy", 0) + counts.get("no_answer", 0),
    }


def followup_out(f: FollowUp) -> dict:
    return {
        # clean fields
        "id": f.id, "tenant_id": f.tenant_id, "call_id": f.call_id,
        "contact_id": f.contact_id, "agent_id": f.agent_id, "phone": f.phone,
        "scheduled_at": _iso(f.scheduled_at), "attempts": f.attempts,
        "notes": f.notes, "created_at": _iso(f.created_at), "updated_at": _iso(f.created_at),
        # old FollowupDocument fields
        "followup_id": f.id,
        "lead_id": None,
        "phone_number": f.phone,
        "status": FOLLOWUP_STATUS_OUT.get(f.status, f.status),
    }


def business_out(t: Tenant, assigned_agent_ids: list[str] | None = None,
                 total_calls: int = 0, total_leads: int = 0, qualified_leads: int = 0) -> dict:
    conversion = round(qualified_leads / total_leads * 100, 1) if total_leads else 0.0
    return {
        "business_id": t.id,
        "id": t.id,
        "org_id": t.id,
        "tenant_id": t.id,
        "name": t.name,
        "slug": t.slug,
        "industry": t.industry or "",
        "primary_contact": "",
        "email": t.email or "",
        "phone": t.phone or "",
        "website": t.website or "",
        "description": t.description or "",
        "timezone": "Asia/Kolkata",
        "country": "India",
        "preferred_languages": ["Hindi", "English"],
        "assigned_agent_ids": assigned_agent_ids or [],
        "total_calls": total_calls,
        "total_leads": total_leads,
        "qualified_leads": qualified_leads,
        "conversion_rate": conversion,
        "is_active": t.is_active,
        "created_at": _iso(t.created_at),
        "updated_at": _iso(t.updated_at),
        "settings": {},
    }


def questionnaire_out(q: Questionnaire) -> dict:
    questions = []
    for item in q.questions or []:
        questions.append({
            "question_id": item.get("question_id") or item.get("id") or "",
            "id": item.get("id") or item.get("question_id") or "",
            "text": item.get("text", ""),
            "type": item.get("type", "open"),
            "expected_answer": item.get("expected_answer"),
            "description": item.get("description"),
            "required": bool(item.get("required", False)),
            "options": item.get("options") or [],
            "conditional_rules": item.get("conditional_rules") or [],
        })
    return {
        # clean fields
        "id": q.id, "tenant_id": q.tenant_id, "title": q.title,
        "description": q.description, "questions": questions, "status": q.status,
        "created_at": _iso(q.created_at), "updated_at": _iso(q.updated_at),
        # old QuestionnaireDocument fields
        "questionnaire_id": q.id,
        "version_id": (q.version_history or [{}])[-1].get("version_id", "v1") if q.version_history else "v1",
        "agent_id": None,
        "is_published": q.status == "published",
        "version_history": q.version_history or [],
    }


def invoice_out(inv: Invoice) -> dict:
    items = []
    for item in inv.items or []:
        rate = item.get("rate", item.get("unit_price", 0))
        qty = item.get("quantity", 1)
        items.append({
            "description": item.get("description", ""),
            "quantity": qty,
            "rate": rate,
            "unit_price": rate,
            "amount": item.get("amount", round(float(qty) * float(rate), 2)),
        })
    status_upper = (inv.status or "draft").upper()
    if status_upper == "DRAFT":
        status_upper = "ISSUED"  # old UI vocabulary: ISSUED/PAID
    return {
        # task-model fields
        "id": inv.id, "tenant_id": inv.tenant_id, "business_id": inv.tenant_id,
        "number": inv.number, "customer_name": inv.customer_name,
        "customer_email": inv.customer_email, "customer_phone": inv.customer_phone,
        "business_name": inv.business_name, "items": items,
        "tax_rate": inv.tax_rate, "currency": inv.currency or "INR",
        "subtotal": round(inv.subtotal or 0.0, 2),
        "tax_amount": round(inv.tax_amount or 0.0, 2),
        "total": round(inv.total or 0.0, 2),
        # old invoice page used UPPERCASE status (ISSUED/PAID); clean value alongside
        "status": status_upper, "status_internal": inv.status,
        "due_date": inv.due_date.strftime("%Y-%m-%d") if inv.due_date else None,
        "notes": inv.notes or "",
        "created_at": _iso(inv.created_at), "updated_at": _iso(inv.updated_at),
        # old invoice page fields
        "invoice_id": inv.id,
        "invoice_number": inv.number,
        "issue_date": inv.issue_date.strftime("%Y-%m-%d") if inv.issue_date else None,
        "tax": round(inv.tax_amount or 0.0, 2),
        "line_items": items,
        "status_label": status_upper,
    }


def lead_out(call: Call, agent_name: str | None = None, contact_name: str | None = None,
             contact_email: str | None = None) -> dict:
    status_map = {
        "interested": "interested",
        "not_interested": "not_interested",
        "callback_requested": "new",
        "unknown": "new",
    }
    score = call.lead_score or 0
    return {
        # clean fields (current leads API)
        "id": call.id, "phone": call.phone, "agent_name": agent_name,
        "disposition": call.disposition, "lead_score": call.lead_score,
        "lead_summary": call.lead_summary,
        "ended_at": _iso(call.ended_at),
        # old LeadDocument fields
        "lead_id": call.id,
        "tenant_id": call.tenant_id,
        "call_id": call.id,
        "agent_id": call.agent_id,
        "contact_id": call.contact_id,
        "name": contact_name,
        "phone_number": call.phone,
        "email": contact_email,
        "confidence_score": round(score / 100.0, 2),
        "score": score,
        "reasoning": call.lead_summary,
        "status": status_map.get(call.disposition or "", "new"),
        "notes": None,
        "metadata": {
            "classification": (call.disposition or "").upper(),
            "interest_strength": "high" if score >= 70 else "medium" if score >= 40 else "low",
            "signals": [],
        },
        "created_at": _iso(call.created_at),
        "updated_at": _iso(call.ended_at or call.created_at),
    }


def interest_out(call: Call, analysis: dict | None = None) -> dict:
    """InterestAnalysisDocument from a call (+ optional fresh analyzer result)."""
    if analysis is not None:
        disposition = analysis.get("disposition")
        score = analysis.get("lead_score") or 0
        reasoning = analysis.get("summary")
    else:
        disposition = call.disposition
        score = call.lead_score or 0
        reasoning = call.lead_summary
    status = {
        "interested": "interested",
        "not_interested": "not_interested",
        "callback_requested": "uncertain",
        "unknown": "uncertain",
    }.get(disposition or "", "pending")
    return {
        "analysis_id": f"analysis-{call.id}",
        "call_id": call.id,
        "agent_id": call.agent_id,
        "contact_id": call.contact_id,
        "status": status,
        "disposition": disposition,
        "confidence_score": round(score / 100.0, 2),
        "lead_score": score,
        "reasoning": reasoning,
        "rule_applied": "offline-rule-analyzer" if analysis is not None else None,
        "signals": [],
        "languages": [],
        "keywords": [],
        "followup": None,
        "raw_model_output": None,
        "created_at": _iso(call.ended_at or call.created_at),
    }
