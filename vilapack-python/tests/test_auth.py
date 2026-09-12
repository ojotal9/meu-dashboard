"""Authentication contracts and opaque server-side sessions, entirely offline."""

from contextlib import closing
import json
from pathlib import Path
import sqlite3
import sys
import time
from unittest.mock import Mock
from uuid import uuid4

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import create_app
from data import DataError, SupabaseAuth


@pytest.fixture(autouse=True)
def forbid_network(monkeypatch):
    def forbidden(*args, **kwargs):
        raise AssertionError("Authentication tests must not contact a real Supabase project")
    monkeypatch.setattr("requests.Session.request", forbidden)


@pytest.mark.parametrize("method", ["login", "refresh"])
def test_publishable_key_auth_does_not_send_non_jwt_authorization(method, monkeypatch):
    request = Mock(return_value={"access_token": "verified-user-jwt", "expires_in": 3600})
    monkeypatch.setattr("data._request", request)
    client = SupabaseAuth("https://test.supabase.co", "sb_publishable_test", "sb_secret_test")
    result = client.login("ana@example.com", "test-password") if method == "login" else client.refresh("refresh-token")
    assert result["access_token"] == "verified-user-jwt"
    call = request.call_args
    assert call.args[0] == "POST"
    assert call.args[2]["apikey"] == "sb_publishable_test"
    assert "Authorization" not in call.args[2]
    assert "sb_secret_test" not in str(call)
    if method == "login":
        assert call.args[1].endswith("/token?grant_type=password")
        assert call.kwargs["json"] == {"email": "ana@example.com", "password": "test-password"}
    else:
        assert call.args[1].endswith("/token?grant_type=refresh_token")
        assert call.kwargs["json"] == {"refresh_token": "refresh-token"}


@pytest.mark.parametrize("method", ["create_user", "delete_user"])
def test_secret_key_admin_auth_uses_apikey_without_invalid_bearer(method, monkeypatch):
    user_id = str(uuid4())
    request = Mock(return_value={"id": user_id})
    monkeypatch.setattr("data._request", request)
    client = SupabaseAuth("https://test.supabase.co", "sb_publishable_test", "sb_secret_test")
    if method == "create_user":
        client.create_user({"email": "ana@example.com", "password": "test-password", "nome": "Ana"})
    else:
        client.delete_user(user_id)
    headers = request.call_args.args[2]
    assert headers["apikey"] == "sb_secret_test"
    assert "Authorization" not in headers


@pytest.mark.parametrize("method", ["user", "logout"])
def test_authenticated_auth_calls_send_real_user_bearer(method, monkeypatch):
    request = Mock(return_value={"id": "test"})
    monkeypatch.setattr("data._request", request)
    client = SupabaseAuth("https://test.supabase.co", "sb_publishable_test", "sb_secret_test")
    getattr(client, method)("real-user-access-token")
    assert request.call_args.args[2] == {"apikey": "sb_publishable_test", "Content-Type": "application/json", "Authorization": "Bearer real-user-access-token"}


def test_legacy_jwt_auth_keys_remain_compatible(monkeypatch):
    request = Mock(return_value={})
    monkeypatch.setattr("data._request", request)
    client = SupabaseAuth("https://test.supabase.co", "legacy-public-jwt", "legacy-service-jwt")
    client.login("ana@example.com", "test-password")
    assert request.call_args.args[2]["Authorization"] == "Bearer legacy-public-jwt"
    client.delete_user(str(uuid4()))
    assert request.call_args.args[2]["Authorization"] == "Bearer legacy-service-jwt"


@pytest.fixture
def remote_session(tmp_path, monkeypatch):
    monkeypatch.setenv("VILAPACK_INSTANCE", str(tmp_path))
    application = create_app({
        "TESTING": True,
        "SECRET_KEY": "auth-tests-only-session-key",
        "DEMO_MODE": False,
        "DEMO_DB": str(tmp_path / "demo.sqlite3"),
        "AUTH_DB": str(tmp_path / "sessions.sqlite3"),
        "SUPABASE_URL": "https://test.supabase.co",
        "SUPABASE_ANON_KEY": "sb_publishable_test",
        "SUPABASE_SERVICE_ROLE_KEY": "sb_secret_test",
    })
    user_id = str(uuid4())
    profile = {"id": user_id, "nome": "Ana QA", "email": "ana@example.com", "role": "admin", "paginas_permitidas": [], "acoes_restritas": {}}
    tokens = {"access_token": "access-token-that-must-stay-on-server", "refresh_token": "refresh-token-that-must-stay-on-server", "expires_in": 3600, "user": {"id": user_id}}
    helper = Mock(spec=SupabaseAuth)
    helper.login.return_value = dict(tokens)
    helper.user.return_value = {"id": user_id}
    helper.logout.return_value = None
    helper.refresh.return_value = dict(tokens, access_token="rotated-access-token-secret", refresh_token="rotated-refresh-token-secret")
    monkeypatch.setattr("auth.SupabaseAuth", Mock(return_value=helper))
    store = Mock()
    store.get.return_value = profile
    store.list.return_value = []
    stores = Mock(return_value=store)
    monkeypatch.setattr("auth.SupabaseStore", stores)
    return application, application.test_client(), helper, stores, tokens


def login(client):
    assert client.get("/login").status_code == 200
    with client.session_transaction() as state:
        csrf = state["csrf"]
    response = client.post("/login", data={"csrf_token": csrf, "email": " ana@example.com ", "password": "test-password"})
    assert response.status_code == 302
    assert response.location.endswith("/painel/inicio")
    return response


def decoded_cookie(application, client):
    cookie = client.get_cookie(application.config["SESSION_COOKIE_NAME"])
    assert cookie is not None
    return application.session_interface.get_signing_serializer(application).loads(cookie.value)


def vault_rows(application):
    with closing(sqlite3.connect(application.config["AUTH_DB"])) as connection:
        return connection.execute("SELECT id,payload,expires FROM sessions").fetchall()


def test_login_stores_tokens_only_on_server_and_rotates_session(remote_session):
    application, client, helper, _, tokens = remote_session
    response = login(client)
    helper.login.assert_called_once_with("ana@example.com", "test-password")
    cookie = decoded_cookie(application, client)
    assert set(cookie) == {"sid", "csrf"}
    assert len(cookie["sid"]) >= 48
    for sensitive in (tokens["access_token"], tokens["refresh_token"], "sb_secret_test"):
        assert sensitive not in json.dumps(cookie)
        assert sensitive not in str(response.headers)
        assert sensitive not in response.get_data(as_text=True)
    row = vault_rows(application)[0]
    assert row[0] == cookie["sid"]
    assert json.loads(row[1])["access_token"] == tokens["access_token"]
    assert json.loads(row[1])["expires_at"] > time.time()
    assert "HttpOnly" in response.headers["Set-Cookie"]
    assert "SameSite=Lax" in response.headers["Set-Cookie"]
    old_sid = cookie["sid"]
    login(client)
    assert decoded_cookie(application, client)["sid"] != old_sid
    assert len(vault_rows(application)) == 1
    assert vault_rows(application)[0][0] != old_sid


def test_expiring_session_refreshes_server_tokens_while_cookie_stays_opaque(remote_session):
    application, client, helper, stores, tokens = remote_session
    login(client)
    before = decoded_cookie(application, client)
    with closing(sqlite3.connect(application.config["AUTH_DB"])) as connection:
        expired = dict(tokens, expires_at=time.time() - 10)
        connection.execute("UPDATE sessions SET payload=? WHERE id=?", (json.dumps(expired), before["sid"]))
        connection.commit()
    response = client.get("/painel/clientes")
    assert response.status_code == 200
    helper.refresh.assert_called_once_with(tokens["refresh_token"])
    stores.assert_called_with("https://test.supabase.co", "sb_publishable_test", "rotated-access-token-secret")
    after = decoded_cookie(application, client)
    assert after == before
    saved = json.loads(vault_rows(application)[0][1])
    assert saved["access_token"] == "rotated-access-token-secret"
    assert saved["refresh_token"] == "rotated-refresh-token-secret"
    assert saved["expires_at"] > time.time()
    assert "rotated-access-token-secret" not in response.get_data(as_text=True)
    assert "rotated-refresh-token-secret" not in json.dumps(after)


@pytest.mark.parametrize("remote_failure", [False, True])
def test_logout_revokes_auth_and_removes_server_session_even_when_remote_logout_fails(remote_session, remote_failure):
    application, client, helper, _, tokens = remote_session
    login(client)
    csrf = decoded_cookie(application, client)["csrf"]
    if remote_failure:
        helper.logout.side_effect = DataError("Falha de rede simulada")
    response = client.post("/logout", data={"csrf_token": csrf})
    assert response.status_code == 302
    assert response.location.endswith("/login")
    helper.logout.assert_called_once_with(tokens["access_token"])
    assert vault_rows(application) == []
    with client.session_transaction() as state:
        assert "sid" not in state
    assert client.get("/painel/clientes").status_code == 302


def test_failed_login_does_not_create_authenticated_session_or_leak_error_details(remote_session):
    application, client, helper, _, _ = remote_session
    helper.login.side_effect = DataError("upstream detail containing sb_secret_test")
    client.get("/login")
    with client.session_transaction() as state:
        csrf = state["csrf"]
    response = client.post("/login", data={"csrf_token": csrf, "email": "ana@example.com", "password": "wrong-password"})
    assert response.status_code == 200
    assert "sb_secret_test" not in response.get_data(as_text=True)
    with client.session_transaction() as state:
        assert "sid" not in state
    assert client.get("/painel/clientes").status_code == 302


def test_logout_clears_expired_session_without_attempting_rejected_refresh(remote_session):
    application, client, helper, _, tokens = remote_session
    login(client)
    cookie = decoded_cookie(application, client)
    with closing(sqlite3.connect(application.config["AUTH_DB"])) as connection:
        expired = dict(tokens, expires_at=time.time() - 3600)
        connection.execute("UPDATE sessions SET payload=? WHERE id=?", (json.dumps(expired), cookie["sid"]))
        connection.commit()
    helper.refresh.side_effect = DataError("Refresh token revogado")
    helper.logout.side_effect = DataError("Access token expirado")
    response = client.post("/logout", data={"csrf_token": cookie["csrf"]})
    assert response.status_code == 302
    assert response.location.endswith("/login")
    helper.refresh.assert_not_called()
    helper.logout.assert_called_once_with(tokens["access_token"])
    assert vault_rows(application) == []
    with client.session_transaction() as state:
        assert "sid" not in state
    assert client.get("/painel/clientes").status_code == 302


def test_missing_server_session_invalidates_an_existing_cookie(remote_session):
    application, client, _, _, _ = remote_session
    login(client)
    with closing(sqlite3.connect(application.config["AUTH_DB"])) as connection:
        connection.execute("DELETE FROM sessions")
        connection.commit()
    response = client.get("/painel/clientes")
    assert response.status_code == 302
    assert response.location.endswith("/login")
    with client.session_transaction() as state:
        assert "sid" not in state
