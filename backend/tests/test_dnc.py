from conftest import create_agent_row, create_tenant_user, login, run_async


def test_single_initiate_blocked_for_opted_out_contact(client):
    create_tenant_user("dnc@example.com", "passw0rd!", "Dnc Tenant")
    headers = login(client, "dnc@example.com", "passw0rd!")

    contact = client.post(
        "/api/v1/contacts", headers=headers,
        json={"name": "Opt Out", "phone": "9876543210"},
    ).json()
    agent = client.post(
        "/api/v1/agents", headers=headers, json={"name": "Dialer"}
    ).json()
    assert client.post(f"/api/v1/contacts/{contact['id']}/opt-out", headers=headers).status_code == 200

    resp = client.post(
        "/api/v1/calls/initiate", headers=headers,
        json={"agent_id": agent["id"], "phone": "9876543210", "contact_id": contact["id"]},
    )
    assert resp.status_code == 400
    assert resp.json()["error"] == "CONTACT_OPTED_OUT"


def test_batch_blocked_items_reported_not_queued():
    tenant_id, user_id = create_tenant_user("batch@example.com", "passw0rd!", "Batch Tenant")
    agent_id = create_agent_row(tenant_id)

    from app.models import Contact, User
    from app.services.call_service import enqueue_batch

    async def _run(maker):
        async with maker() as db:
            db.add(Contact(tenant_id=tenant_id, name="Blocked", phone="+919876543210",
                           status="do_not_call"))
            db.add(Contact(tenant_id=tenant_id, name="Fine", phone="+919812345678"))
            await db.commit()
        async with maker() as db:
            user = User(id=user_id, tenant_id=tenant_id, email="batch@example.com",
                        password_hash="x", name="T", role="admin", is_active=True)
            created, errors = await enqueue_batch(
                db, user, agent_id,
                [{"phone": "9876543210"}, {"phone": "9812345678"}, {"phone": "123"}],
            )
            return created, errors

    created, errors = run_async(_run)
    assert len(created) == 1
    assert created[0].phone == "+919812345678"
    assert created[0].status == "queued"
    codes = {e["error"] for e in errors}
    assert "CONTACT_OPTED_OUT" in codes
    assert "INVALID_PHONE_NUMBER" in codes
