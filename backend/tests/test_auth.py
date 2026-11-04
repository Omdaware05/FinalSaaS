from conftest import create_tenant_user, login


def test_login_ok_and_me(client):
    create_tenant_user("a@example.com", "passw0rd!", "Tenant A")
    headers = login(client, "a@example.com", "passw0rd!")
    resp = client.get("/api/v1/auth/me", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["email"] == "a@example.com"


def test_login_bad_password(client):
    create_tenant_user("b@example.com", "passw0rd!", "Tenant B")
    resp = client.post("/api/v1/auth/login", json={"email": "b@example.com", "password": "wrong"})
    assert resp.status_code == 401
    assert resp.json()["error"] == "INVALID_CREDENTIALS"


def test_me_requires_auth(client):
    resp = client.get("/api/v1/auth/me")
    assert resp.status_code == 401
    resp = client.get("/api/v1/auth/me", headers={"Authorization": "Bearer not-a-token"})
    assert resp.status_code == 401
