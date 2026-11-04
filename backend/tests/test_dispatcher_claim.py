from conftest import create_agent_row, create_tenant_user, run_async


def test_queued_call_claimed_exactly_once():
    tenant_id, _ = create_tenant_user("claim@example.com", "passw0rd!", "Claim Tenant")
    agent_id = create_agent_row(tenant_id)

    from app.models import Call
    from app.services.dispatcher import claim_queued_call

    async def _run(maker):
        async with maker() as db:
            call = Call(tenant_id=tenant_id, agent_id=agent_id,
                        phone="+919876543210", status="queued")
            db.add(call)
            await db.commit()
            call_id = call.id
        async with maker() as db:
            first = await claim_queued_call(db, call_id)
        async with maker() as db:
            second = await claim_queued_call(db, call_id)
            row = await db.get(Call, call_id)
            return first, second, row.status

    first, second, status = run_async(_run)
    assert first is True
    assert second is False
    assert status == "initiating"
