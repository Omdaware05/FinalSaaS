from conftest import create_tenant_user, login


def test_settings_status_has_no_secrets(client):
    create_tenant_user("settings@example.com", "passw0rd!", "Settings Tenant")
    headers = login(client, "settings@example.com", "passw0rd!")
    resp = client.get("/api/v1/settings/status", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["telephony_configured"] is False
    assert body["from_number_masked"] is None
    assert body["calling_hours"] == "09:00-21:00 Asia/Kolkata"
    text = resp.text.lower()
    for forbidden in ("test-secret", "vobiz_auth_token", "sarvam_api_key", "secret_key"):
        assert forbidden not in text
