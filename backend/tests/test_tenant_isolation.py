from conftest import create_agent_row, create_tenant_user, login, run_async


def _make_call_row(tenant_id: str, agent_id: str) -> str:
    from app.models import Call

    async def _make(maker):
        async with maker() as db:
            call = Call(tenant_id=tenant_id, agent_id=agent_id, phone="+919876543210", status="completed")
            db.add(call)
            await db.commit()
            return call.id

    return run_async(_make)


def test_other_tenant_cannot_read_resources(client):
    tenant_a, _ = create_tenant_user("owner-a@example.com", "passw0rd!", "Iso A")
    create_tenant_user("owner-b@example.com", "passw0rd!", "Iso B")
    agent_id = create_agent_row(tenant_a)
    call_id = _make_call_row(tenant_a, agent_id)

    headers_a = login(client, "owner-a@example.com", "passw0rd!")
    headers_b = login(client, "owner-b@example.com", "passw0rd!")

    # Owner can read them
    assert client.get(f"/api/v1/agents/{agent_id}", headers=headers_a).status_code == 200
    assert client.get(f"/api/v1/calls/{call_id}", headers=headers_a).status_code == 200

    # The other tenant gets 404 (not 403 — existence is not leaked)
    assert client.get(f"/api/v1/agents/{agent_id}", headers=headers_b).status_code == 404
    assert client.get(f"/api/v1/calls/{call_id}", headers=headers_b).status_code == 404

    # And lists are scoped
    assert client.get("/api/v1/agents", headers=headers_b).json() == []
    assert client.get("/api/v1/calls", headers=headers_b).json() == []
