"""Compatibility-layer tests: the old frontend's API contract."""
import uuid
from datetime import timedelta

from conftest import create_agent_row, create_tenant_user, login, run_async


def _setup(client, email=None, password="test-password-1", tenant=None):
    suffix = uuid.uuid4().hex[:8]
    email = email or f"compat-{suffix}@test.dev"
    tenant = tenant or f"CompatCo {suffix}"
    tenant_id, _user_id = create_tenant_user(email, password, tenant)
    headers = login(client, email, password)
    return tenant_id, headers


def test_businesses_crud_and_membership_scoping(client):
    tenant_id, headers = _setup(client)
    # home tenant is listed (membership exists)
    resp = client.get("/api/v1/businesses", headers=headers)
    assert resp.status_code == 200
    ids = [b["business_id"] for b in resp.json()]
    assert tenant_id in ids

    created = client.post(
        "/api/v1/businesses",
        json={"name": "Second Biz", "industry": "Retail", "email": "hi@second.biz"},
        headers=headers,
    )
    assert created.status_code == 201, created.text
    biz = created.json()
    assert biz["business_id"] and biz["name"] == "Second Biz"
    assert biz["industry"] == "Retail"

    patched = client.patch(
        f"/api/v1/businesses/{biz['business_id']}",
        json={"phone": "+91 98200 00000"},
        headers=headers,
    )
    assert patched.status_code == 200
    assert patched.json()["phone"] == "+91 98200 00000"

    dash = client.get(f"/api/v1/businesses/{biz['business_id']}/dashboard", headers=headers)
    assert dash.status_code == 200
    assert dash.json()["total_calls"] == 0

    # a second user must NOT see the first user's business
    _t2, headers2 = _setup(client, "other@test.dev", "test-password-2", "OtherCo")
    resp = client.get(f"/api/v1/businesses/{biz['business_id']}", headers=headers2)
    assert resp.status_code == 404
    listing = client.get("/api/v1/businesses", headers=headers2)
    assert biz["business_id"] not in [b["business_id"] for b in listing.json()]


def test_active_tenant_header_switch(client):
    tenant_a, headers = _setup(client, "a@test.dev", "test-password-1", "TenantA")
    created = client.post("/api/v1/businesses", json={"name": "TenantB"}, headers=headers)
    tenant_b = created.json()["business_id"]

    agent = client.post(
        "/api/v1/agents", json={"name": "Agent B"}, headers={**headers, "X-Business-ID": tenant_b}
    )
    assert agent.status_code == 201, agent.text
    assert agent.json()["tenant_id"] == tenant_b

    # without the header the agent is invisible (home tenant scoping)
    listing = client.get("/api/v1/agents", headers=headers)
    assert agent.json()["id"] not in [a["id"] for a in listing.json()]
    # with the header it appears
    listing_b = client.get("/api/v1/agents", headers={**headers, "X-Business-ID": tenant_b})
    assert agent.json()["id"] in [a["id"] for a in listing_b.json()]

    # non-member tenant id in the header is ignored (falls back home)
    _t, headers2 = _setup(client, "c@test.dev", "test-password-3", "TenantC")
    resp = client.get("/api/v1/agents", headers={**headers2, "X-Business-ID": tenant_b})
    assert resp.status_code == 200
    assert agent.json()["id"] not in [a["id"] for a in resp.json()]


def test_agent_extras_toggle_duplicate_preview_startcalls(client):
    tenant_id, headers = _setup(client)
    agent_id = create_agent_row(tenant_id)

    patched = client.patch(
        f"/api/v1/agents/{agent_id}",
        json={"voice_name": "Shubh", "speaking_speed": 1.2, "questionnaire_id": None},
        headers=headers,
    )
    assert patched.status_code == 200
    body = patched.json()
    # old AgentDocument shape keys
    for key in ("agent_id", "is_enabled", "default_language", "supported_languages",
                "system_prompt", "tts_provider", "language_mode", "primary_language",
                "speaking_speed", "telephony_provider", "questionnaire_id"):
        assert key in body, key
    assert body["speaking_speed"] == 1.2

    toggled = client.post(f"/api/v1/agents/{agent_id}/toggle", headers=headers)
    assert toggled.json()["enabled"] is False
    toggled = client.post(f"/api/v1/agents/{agent_id}/toggle", headers=headers)
    assert toggled.json()["enabled"] is True

    dup = client.post(f"/api/v1/agents/{agent_id}/duplicate", headers=headers)
    assert dup.status_code == 200
    assert dup.json()["id"] != agent_id
    assert "Copy" in dup.json()["name"]

    preview = client.post(
        f"/api/v1/agents/{agent_id}/preview-batch",
        json={"phone_numbers": ["+91 98200 11111", "123", "+91 98200 22222"]},
        headers=headers,
    )
    assert preview.status_code == 200
    pbody = preview.json()
    assert pbody["total"] == 3
    assert len(pbody["valid"]) == 2
    assert len(pbody["invalid"]) == 1

    started = client.post(
        f"/api/v1/agents/{agent_id}/start-calls",
        json={"phone_numbers": ["+91 98200 11111", "+91 98200 22222"]},
        headers=headers,
    )
    assert started.status_code == 200, started.text
    sbody = started.json()
    assert sbody["status"] == "QUEUED"
    assert sbody["queued"] == 2
    assert len(sbody["call_ids"]) == 2

    summary = client.get(f"/api/v1/agents/{agent_id}/summary", headers=headers)
    assert summary.json()["total_calls"] == 2
    dash = client.get(f"/api/v1/agents/{agent_id}/dashboard", headers=headers)
    assert dash.json()["queued_calls"] == 2
    analytics = client.get(f"/api/v1/agents/{agent_id}/analytics/interest", headers=headers)
    assert analytics.json()["total_calls"] == 2


def test_start_calls_dnc_blocked(client):
    tenant_id, headers = _setup(client)
    agent_id = create_agent_row(tenant_id)
    contact = client.post(
        "/api/v1/contacts",
        json={"name": "Opt Out", "phone": "+91 98200 33333"},
        headers=headers,
    )
    contact_id = contact.json()["id"]
    assert client.post(f"/api/v1/contacts/{contact_id}/opt-out", headers=headers).status_code == 200

    preview = client.post(
        f"/api/v1/agents/{agent_id}/preview-batch",
        json={"phone_numbers": ["+91 98200 33333"]},
        headers=headers,
    )
    assert preview.json()["results"][0]["blocked"] is True

    started = client.post(
        f"/api/v1/agents/{agent_id}/start-calls",
        json={"phone_numbers": ["+91 98200 33333"]},
        headers=headers,
    )
    # nothing queueable -> old backend returned 400 with the reason
    assert started.status_code == 400
    assert "do-not-call" in started.json()["message"].lower()


def test_calls_transcript_interest_active_queue(client):
    tenant_id, headers = _setup(client)
    agent_id = create_agent_row(tenant_id)

    from app.models import Call, TranscriptSegment

    async def _seed(maker):
        async with maker() as db:
            call = Call(tenant_id=tenant_id, agent_id=agent_id, phone="+919820044444",
                        status="completed", disposition="unknown", duration_seconds=42)
            db.add(call)
            await db.flush()
            db.add(TranscriptSegment(call_id=call.id, speaker="agent",
                                     text="Hello, are you interested in our course?"))
            db.add(TranscriptSegment(call_id=call.id, speaker="customer",
                                     text="Yes, I am interested. Please tell me more."))
            live = Call(tenant_id=tenant_id, agent_id=agent_id, phone="+919820055555",
                        status="in_progress")
            db.add(live)
            await db.commit()
            return call.id

    call_id = run_async(_seed)

    transcript = client.get(f"/api/v1/calls/{call_id}/transcript", headers=headers)
    assert transcript.status_code == 200
    tbody = transcript.json()
    assert tbody["call_id"] == call_id
    assert len(tbody["segments"]) == 2
    assert "interested" in tbody["full_text"]

    analyzed = client.post(f"/api/v1/calls/{call_id}/analyze-interest", headers=headers)
    assert analyzed.status_code == 200
    assert analyzed.json()["status"] == "interested"

    manual = client.post(f"/api/v1/calls/{call_id}/interest",
                         json={"status": "not_interested"}, headers=headers)
    assert manual.json()["status"] == "not_interested"

    detail = client.get(f"/api/v1/calls/{call_id}", headers=headers)
    assert detail.json()["state"] == "COMPLETED"
    assert detail.json()["phone_number"] == "+919820044444"
    assert detail.json()["transcript"]["segments"]

    active = client.get("/api/v1/active-calls", headers=headers)
    assert active.json()["active_count"] == 1
    queue = client.get("/api/v1/queue", headers=headers)
    assert "queued_count" in queue.json() and "is_running" in queue.json()


def test_contacts_import_csv_and_patch(client):
    _tenant_id, headers = _setup(client)
    csv_body = "name,phone,email\nAsha,+91 98200 66666,asha@example.com\nBad,12,\nDup,+91 98200 66666,\n"
    resp = client.post(
        "/api/v1/contacts/import-csv",
        files={"file": ("contacts.csv", csv_body, "text/csv")},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total_rows"] == 3
    assert body["imported_rows"] == 1
    assert body["duplicate_rows"] == 1
    assert body["errors"] and body["errors"][0]["row_number"] == 3

    listing = client.get("/api/v1/contacts", headers=headers)
    contact = listing.json()[0]
    assert contact["phone_number"] == "+919820066666"
    assert contact["business_id"] == contact["tenant_id"]

    patched = client.patch(
        f"/api/v1/contacts/{contact['id']}",
        json={"name": "Asha R", "custom_fields": {"city": "Amravati"}},
        headers=headers,
    )
    assert patched.json()["name"] == "Asha R"
    assert patched.json()["custom_fields"]["city"] == "Amravati"


def test_campaign_old_payload_and_stop(client):
    tenant_id, headers = _setup(client)
    agent_id = create_agent_row(tenant_id)
    created = client.post(
        "/api/v1/campaigns",
        json={"name": "Diwali Drive", "agent_id": agent_id,
              "phone_numbers": ["+91 98200 77777"], "concurrency": 3},
        headers=headers,
    )
    assert created.status_code == 201, created.text
    campaign = created.json()
    assert campaign["campaign_id"] == campaign["id"]
    assert campaign["status"] == "CREATED"
    assert campaign["phone_numbers"] == ["+91 98200 77777"]

    stopped = client.post(f"/api/v1/campaigns/{campaign['id']}/stop", headers=headers)
    assert stopped.status_code == 200
    assert stopped.json()["status"] == "STOPPED"
    assert stopped.json()["success"] is True


def _seed_followup(tenant_id, agent_id, phone="+919820088888", when=None, call_phone=None):
    from app.models import Call, FollowUp, utcnow

    async def _seed(maker):
        async with maker() as db:
            call = Call(tenant_id=tenant_id, agent_id=agent_id,
                        phone=call_phone or phone, status="completed",
                        disposition="callback_requested")
            db.add(call)
            await db.flush()
            followup = FollowUp(
                tenant_id=tenant_id, call_id=call.id, phone=phone, agent_id=agent_id,
                scheduled_at=when or utcnow(), notes="Call back",
            )
            db.add(followup)
            await db.commit()
            return followup.id

    return run_async(_seed)


def test_followups_list_calendar_and_call_now_dnc(client):
    from app.models import utcnow

    tenant_id, headers = _setup(client)
    agent_id = create_agent_row(tenant_id)
    followup_id = _seed_followup(tenant_id, agent_id)

    listing = client.get("/api/v1/followups", headers=headers)
    assert listing.status_code == 200
    rows = listing.json()
    assert len(rows) == 1
    assert rows[0]["followup_id"] == followup_id
    assert rows[0]["phone_number"] == "+919820088888"
    assert rows[0]["status"] == "pending"

    today = utcnow().date().isoformat()
    summary = client.get(
        f"/api/v1/calendar/summary?year={today[:4]}&month={int(today[5:7])}", headers=headers
    )
    assert summary.status_code == 200
    assert summary.json()["days"][today]["followups"] == 1
    day = client.get(f"/api/v1/calendar/day?date={today}", headers=headers)
    assert day.json()["date"] == today
    assert len(day.json()["followups"]) == 1
    assert len(day.json()["calls"]) == 1  # the parent call was created today

    # opt the number out, then call-now must be blocked by the DNC gate
    contact = client.post(
        "/api/v1/contacts", json={"name": "Block", "phone": "+91 98200 88888"}, headers=headers
    )
    client.post(f"/api/v1/contacts/{contact.json()['id']}/opt-out", headers=headers)
    resp = client.post(f"/api/v1/followups/{followup_id}/call", headers=headers)
    assert resp.status_code == 400
    assert resp.json()["error"] == "CONTACT_OPTED_OUT"
    # follow-up stays pending after the blocked attempt
    again = client.get(f"/api/v1/followups/{followup_id}", headers=headers)
    assert again.json()["status"] == "pending"

    dispatch = client.post("/api/v1/followups/dispatch", headers=headers)
    assert dispatch.status_code == 200
    assert "dispatched" in dispatch.json() and "placed_count" in dispatch.json()

    cancelled = client.delete(f"/api/v1/followups/{followup_id}", headers=headers)
    assert cancelled.json()["status"] == "cancelled"


def test_stats_and_reports_shapes(client):
    tenant_id, headers = _setup(client)
    agent_id = create_agent_row(tenant_id)

    from app.models import Call

    async def _seed(maker):
        async with maker() as db:
            db.add(Call(tenant_id=tenant_id, agent_id=agent_id, phone="+919820099999",
                        status="completed", disposition="interested",
                        duration_seconds=90, lead_score=85))
            await db.commit()

    run_async(_seed)

    stats = client.get("/api/v1/stats", headers=headers)
    assert stats.status_code == 200
    sbody = stats.json()
    assert sbody["total_calls"] == 1
    assert sbody["completed"] == 1
    assert sbody["interested"] == 1
    assert sbody["vobiz"]["total"] == 1

    providers = client.get("/api/v1/stats/providers", headers=headers)
    assert providers.status_code == 200
    assert providers.json()["telephony_providers"]["vobiz"]["total_calls"] == 1
    assert providers.json()["voice_providers"]["sarvam"]["total_calls"] == 1

    overview = client.get("/api/v1/reports/agency/overview", headers=headers)
    assert overview.status_code == 200
    assert overview.json()["totals"]["total_calls"] == 1

    report = client.get(f"/api/v1/reports/business/{tenant_id}", headers=headers)
    assert report.status_code == 200
    assert report.json()["summary"]["qualified_leads"] == 1

    export = client.get(f"/api/v1/reports/business/{tenant_id}/export", headers=headers)
    assert export.status_code == 200
    assert export.content[:2] == b"PK"  # xlsx zip magic


def test_invoice_lifecycle_and_pdf(client):
    _tenant_id, headers = _setup(client)
    created = client.post(
        "/api/v1/invoices",
        json={
            "customer_name": "Demo Academy",
            "line_items": [{"description": "Calling minutes", "quantity": 2, "unit_price": 500}],
            "tax_rate": 18,
        },
        headers=headers,
    )
    assert created.status_code == 201, created.text
    inv = created.json()
    assert inv["invoice_number"] == "INV-0001"
    assert inv["subtotal"] == 1000.0
    assert inv["tax"] == 180.0
    assert inv["total"] == 1180.0
    assert inv["status"] == "ISSUED"  # old page vocabulary
    assert inv["status_internal"] == "draft"
    assert inv["currency"] == "INR"
    assert inv["line_items"][0]["unit_price"] == 500

    second = client.post("/api/v1/invoices", json={"items": []}, headers=headers)
    assert second.json()["invoice_number"] == "INV-0002"

    paid = client.post(f"/api/v1/invoices/{inv['invoice_id']}/mark-paid", headers=headers)
    assert paid.json()["status"] == "PAID"
    assert paid.json()["status_internal"] == "paid"

    pdf = client.get(f"/api/v1/invoices/{inv['invoice_id']}/pdf", headers=headers)
    assert pdf.status_code == 200
    assert pdf.content[:4] == b"%PDF"


def test_questionnaire_lifecycle_assign_and_engine_fields(client):
    tenant_id, headers = _setup(client)
    agent_id = create_agent_row(tenant_id)
    created = client.post(
        "/api/v1/questionnaires",
        json={
            "title": "Admission Intake",
            "questions": [
                {"text": "Which course are you interested in?", "type": "multiple_choice",
                 "options": ["B.Tech", "MBA"], "required": True},
                {"text": "Anything else?", "type": "open"},
            ],
        },
        headers=headers,
    )
    assert created.status_code == 201, created.text
    q = created.json()
    assert q["questionnaire_id"] == q["id"]
    assert q["is_published"] is False
    assert q["questions"][0]["question_id"]

    published = client.post(f"/api/v1/questionnaires/{q['id']}/publish",
                            json={"notes": "go live"}, headers=headers)
    assert published.json()["status"] == "published"
    assert published.json()["is_published"] is True

    assigned = client.post(
        "/api/v1/questionnaires/assign",
        json={"questionnaire_id": q["id"], "agent_id": agent_id},
        headers=headers,
    )
    assert assigned.status_code == 200
    agent = client.get(f"/api/v1/agents/{agent_id}", headers=headers)
    assert agent.json()["questionnaire_id"] == q["id"]

    template = client.get("/api/v1/questionnaires/excel-template", headers=headers)
    assert template.status_code == 200
    assert template.content[:2] == b"PK"

    deleted = client.post("/api/v1/questionnaires/batch-delete",
                          json={"ids": [q["id"]]}, headers=headers)
    assert deleted.json()["deleted_count"] == 1


def test_questionnaire_excel_import(client):
    _tenant_id, headers = _setup(client)
    import io as _io

    from openpyxl import Workbook

    wb = Workbook()
    ws = wb.active
    ws.append(["Question", "Type", "Options", "Required"])
    ws.append(["Are you interested?", "yes_no", "", "yes"])
    ws.append(["Pick a plan", "multiple_choice", "Basic, Pro", "no"])
    buf = _io.BytesIO()
    wb.save(buf)
    resp = client.post(
        "/api/v1/questionnaires/import-excel",
        files={"file": ("qs.xlsx", buf.getvalue(),
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        data={"title": "Imported Qs"},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["valid_count"] == 2
    assert body["questionnaire"]["title"] == "Imported Qs"
    assert body["questionnaire"]["questions"][1]["options"] == ["Basic", "Pro"]


def test_settings_masked_reads_never_leak_secrets(client):
    _tenant_id, headers = _setup(client)
    secret = "sk-live-abcdef1234567890wxyz"
    saved = client.post(
        "/api/v1/voice/sarvam/config",
        json={"api_key": secret, "default_voice": "ritu"},
        headers=headers,
    )
    assert saved.status_code == 200
    assert secret not in saved.text
    assert saved.json()["is_configured"] is True
    assert saved.json()["masked_api_key"].endswith("wxyz")

    read = client.get("/api/v1/voice/sarvam/config", headers=headers)
    assert secret not in read.text
    assert read.json()["api_key"].endswith("wxyz")

    vobiz_secret = "vobiz-token-9876543210abcd"
    vsaved = client.post(
        "/api/v1/telephony/vobiz",
        json={"auth_id": "MA123", "auth_token": vobiz_secret, "phone_number": "+919820000000"},
        headers=headers,
    )
    assert vobiz_secret not in vsaved.text
    vread = client.get("/api/v1/telephony/vobiz", headers=headers)
    assert vobiz_secret not in vread.text
    assert vread.json()["configured"] is True
    assert vread.json()["has_token"] is True
    assert vread.json()["auth_token_masked"].endswith("abcd")

    twilio_test = client.post("/api/v1/telephony/twilio/test", headers=headers)
    assert twilio_test.json()["success"] is False
    assert "not an active carrier" in twilio_test.json()["message"]

    transcript = client.get("/api/v1/voice/transcript-api/config", headers=headers)
    assert transcript.json()["provider"] == "built-in"
    ttest = client.post("/api/v1/voice/transcript-api/test", headers=headers)
    assert ttest.json()["success"] is True
    assert ttest.json()["latency_ms"] is not None


def test_model_mode_toggle_and_config_flow(client):
    _tenant_id, headers = _setup(client)
    mode = client.get("/api/v1/model-mode", headers=headers)
    assert mode.status_code == 200
    assert mode.json()["mode"] in ("sarvam", "local")

    toggled = client.post("/api/v1/model-mode/toggle", json={"mode": "local"}, headers=headers)
    assert toggled.json()["mode"] == "local"
    assert toggled.json()["is_local"] is True
    mode2 = client.get("/api/v1/model-mode", headers=headers)
    assert mode2.json()["mode"] == "local"

    providers = client.get("/api/v1/model-providers", headers=headers)
    ids = [p["provider_id"] for p in providers.json()]
    assert "sarvam" in ids and "local" in ids

    schema = client.get("/api/v1/model-providers/sarvam/schema", headers=headers)
    assert schema.status_code == 200
    assert schema.json()["fields"]

    saved = client.put(
        "/api/v1/model-config/tts",
        json={"provider": "local", "model_id": "kokoro", "name": "Local Kokoro"},
        headers=headers,
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["is_draft"] is True

    activated = client.post("/api/v1/model-config/tts/activate", json={}, headers=headers)
    assert activated.json()["success"] is True
    active = client.get("/api/v1/model-config/tts/active", headers=headers)
    assert active.json()["model_id"] == "kokoro"
    creds = client.get("/api/v1/model-config/tts/credentials-status", headers=headers)
    assert creds.json()["model_type"] == "tts"

    listing = client.get("/api/v1/model-config/llm", headers=headers)
    assert listing.status_code == 200
    assert listing.json()  # env fallback entry present


def test_model_lab_classify_logs_runtime(client):
    _tenant_id, headers = _setup(client)
    classified = client.post(
        "/api/v1/model-lab/classify-intent",
        json={"transcript": "Agent: Hello\nCustomer: Yes I am interested, tell me more"},
        headers=headers,
    )
    assert classified.status_code == 200, classified.text
    cbody = classified.json()
    assert cbody["classification"] == "INTERESTED"
    assert cbody["customer_turns_count"] == 1

    runtime = client.get("/api/v1/model-lab/runtime", headers=headers)
    assert runtime.json()["status"] == "ONLINE"
    assert "local_server" in runtime.json()

    gpu = client.get("/api/v1/model-lab/gpu", headers=headers)
    assert "vram_total_mb" in gpu.json()

    models = client.get("/api/v1/model-lab/models", headers=headers)
    model_ids = [m["model_id"] for m in models.json()]
    assert "interest-classifier" in model_ids

    tested = client.post("/api/v1/model-lab/models/interest-classifier/test", headers=headers)
    assert tested.json()["success"] is True

    started = client.post("/api/v1/model-lab/models/local-llm/start", headers=headers)
    assert started.json()["success"] is True
    assert "managed externally" in started.json()["message"]

    logs = client.get("/api/v1/model-lab/terminal-logs", headers=headers)
    assert logs.json()["success"] is True
    assert "logs" in logs.json()

    telephony = client.get("/api/v1/model-lab/telephony/config", headers=headers)
    assert telephony.json()["provider"] == "vobiz"


def test_voice_catalog_and_health(client):
    _tenant_id, headers = _setup(client)
    providers = client.get("/api/v1/voice/providers", headers=headers)
    pids = [p["provider"] for p in providers.json()]
    assert "sarvam" in pids

    voices = client.get("/api/v1/voice/providers/sarvam/voices", headers=headers)
    assert voices.json()["provider"] == "sarvam"
    assert voices.json()["total"] >= 1
    assert voices.json()["voices"][0]["voice_id"]

    filtered = client.get("/api/v1/voice/providers/sarvam/voices?gender=female", headers=headers)
    assert all(v["gender"] == "female" for v in filtered.json()["voices"])

    # no Sarvam key configured in the test env -> honest 422
    preview = client.get("/api/v1/voice/preview-sarvam/shubh", headers=headers)
    assert preview.status_code == 422
    assert preview.json()["error"] == "PROVIDER_NOT_CONFIGURED"

    health = client.get("/health")
    assert health.status_code == 200
    hbody = health.json()
    assert hbody["database"] is True  # existing field kept
    assert hbody["voice_ai"]["engine"] == "built-in"
    assert hbody["telephony"]["provider"] == "vobiz"

    root = client.get("/")
    assert root.json()["app"] and root.json()["stt_target"]

    svc = client.get("/health/interest-model")
    assert svc.json()["status"] == "healthy"
    svc2 = client.get("/api/v1/health/stt")
    assert svc2.json()["service"] == "stt"


def test_access_token_query_fallback(client):
    tenant_id, headers = _setup(client)
    token = headers["Authorization"].split(" ", 1)[1]
    # <audio>-tag style access: no Authorization header, ?access_token=
    resp = client.get(f"/api/v1/agents?access_token={token}")
    assert resp.status_code == 200
    resp = client.get("/api/v1/agents")
    assert resp.status_code == 401
