"""Flask integration checks using isolated demo databases; no remote calls."""

import csv
from contextlib import contextmanager
from datetime import date
import io
import json
from pathlib import Path
import sqlite3
import sys
import time
from uuid import uuid4

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import PAGES, create_app
from data import LocalStore


@pytest.fixture
def factory(tmp_path, monkeypatch):
    def make(*, demo=True, suffix="main"):
        folder = tmp_path / suffix
        folder.mkdir(exist_ok=True)
        monkeypatch.setenv("VILAPACK_INSTANCE", str(folder))
        application = create_app({
            "TESTING": True,
            "SECRET_KEY": "integration-tests-only",
            "DEMO_MODE": demo,
            "DEMO_DB": str(folder / "demo.sqlite3"),
            "AUTH_DB": str(folder / "sessions.sqlite3"),
            "SUPABASE_URL": "",
            "SUPABASE_ANON_KEY": "",
            "SUPABASE_SERVICE_ROLE_KEY": "",
        })
        return application

    return make


@pytest.fixture
def demo_app(factory):
    return factory()


@pytest.fixture
def client(demo_app):
    return demo_app.test_client()


@contextmanager
def read_store(application):
    store = LocalStore(application.config["DEMO_DB"])
    try:
        yield store
    finally:
        store.connection.close()


def token(client):
    response = client.get("/painel/clientes")
    assert response.status_code == 200
    with client.session_transaction() as state:
        return state["csrf"]


def post(client, path, payload=None):
    return client.post(path, data={"csrf_token": token(client), **(payload or {})})


@pytest.mark.parametrize("page", list(PAGES))
@pytest.mark.parametrize("month", ["todos", date.today().strftime("%Y-%m")])
def test_all_dashboard_pages_render(client, page, month):
    response = client.get(f"/painel/{page}?mes={month}")
    assert response.status_code == 200
    assert PAGES[page][0] in response.get_data(as_text=True)
    assert response.headers["Cache-Control"] == "no-store"
    assert response.headers["X-Content-Type-Options"] == "nosniff"


def test_csrf_is_required_and_wrong_tokens_do_not_change_data(client, demo_app):
    with read_store(demo_app) as store:
        before = len(store.list("clientes"))
    assert client.post("/salvar/clientes", data={"nome": "CSRF ausente"}).status_code == 400
    token(client)
    assert client.post("/salvar/clientes", data={"nome": "CSRF incorreto", "csrf_token": "wrong"}).status_code == 400
    with read_store(demo_app) as store:
        assert len(store.list("clientes")) == before


def test_client_create_edit_delete_round_trip(client, demo_app):
    name = "Cliente do teste de integração"
    assert post(client, "/salvar/clientes", {"nome": name, "email": "qa@example.com", "representante": "Equipe QA"}).status_code == 302
    with read_store(demo_app) as store:
        row = next(c for c in store.list("clientes") if c["nome"] == name)
    edited = dict(row, nome="Cliente atualizado", telefone="11 90000-0000")
    assert post(client, "/salvar/clientes", edited).status_code == 302
    with read_store(demo_app) as store:
        assert store.get("clientes", row["id"])["telefone"] == "11 90000-0000"
    assert post(client, f"/remover/clientes/{row['id']}").status_code == 302
    with read_store(demo_app) as store:
        assert store.get("clientes", row["id"]) is None


@pytest.mark.parametrize("table,party,settled", [("contas_receber", "cliente", "recebido"), ("contas_pagar", "fornecedor", "pago")])
def test_installment_creation_settlement_reopening_and_removal(client, demo_app, table, party, settled):
    title = f"Parcelas QA {table}"
    payload = {"descricao": title, party: "Pessoa de exemplo", "valor": "100.00", "vencimento": "2028-01-31", "forma_pagamento": "cartao_credito", "parcelas": "3"}
    assert post(client, f"/salvar/{table}", payload).status_code == 302
    with read_store(demo_app) as store:
        rows = sorted((r for r in store.list(table) if r["descricao"] == title), key=lambda r: r["parcela_atual"])
        assert [r["valor"] for r in rows] == [33.33, 33.33, 33.34]
        assert [r["vencimento"] for r in rows] == ["2028-01-31", "2028-02-29", "2028-03-31"]
        ids = {r["id"] for r in rows}
        linked = [r for r in store.list("transacoes") if r.get("source_table") == table and r.get("source_id") in ids]
        assert len(linked) == 3
        assert [r["data"] for r in sorted(linked, key=lambda r: r["data"])] == ["2028-01", "2028-02", "2028-03"]
        transaction_ids = {r["id"] for r in store.list("transacoes")}
    target = rows[0]["id"]
    assert post(client, f"/quitar/{table}/{target}").status_code == 302
    with read_store(demo_app) as store:
        assert store.get(table, target)["status"] == settled
        assert {r["id"] for r in store.list("transacoes")} == transaction_ids
    assert post(client, f"/quitar/{table}/{target}", {"reopen": "1"}).status_code == 302
    with read_store(demo_app) as store:
        assert store.get(table, target)["status"] == "pendente"
        assert {r["id"] for r in store.list("transacoes")} == transaction_ids
    assert post(client, f"/remover/{table}/{target}").status_code == 302
    with read_store(demo_app) as store:
        assert store.get(table, target) is None
        assert len([r for r in store.list(table) if r["descricao"] == title]) == 2
        assert not any(r.get("source_id") == target for r in store.list("transacoes"))


def test_backup_and_legacy_import_append_without_deleting_data(client, demo_app):
    backup = client.get("/backup")
    assert backup.status_code == 200
    assert backup.mimetype == "application/json"
    assert "attachment" in backup.headers["Content-Disposition"]
    data = backup.get_json()
    assert data["versao"] == 2
    assert all(key in data for key in ("clientes", "materiaPrimas", "transacoes", "contasReceber", "contasPagar", "metas"))
    assert "perfis" not in data
    assert "access_token" not in backup.get_data(as_text=True)
    original_ids = {c["id"] for c in data["clientes"]}
    legacy = {"versao": 1, "clientes": [{"nome": "Cliente do backup legado"}]}
    response = client.post("/importar", data={"csrf_token": token(client), "arquivo": (io.BytesIO(json.dumps(legacy).encode()), "backup.json")})
    assert response.status_code == 302
    with read_store(demo_app) as store:
        rows = store.list("clientes")
        assert original_ids <= {c["id"] for c in rows}
        assert any(c["nome"] == "Cliente do backup legado" for c in rows)
    invalid = client.post("/importar", data={"csrf_token": token(client), "arquivo": (io.BytesIO(b"{invalid"), "bad.json")})
    assert invalid.status_code == 302
    with read_store(demo_app) as store:
        assert len(store.list("clientes")) == len(rows)


def csv_rows(response):
    assert response.status_code == 200
    assert response.mimetype == "text/csv"
    assert "attachment" in response.headers["Content-Disposition"]
    return list(csv.reader(io.StringIO(response.data.decode("utf-8-sig")), delimiter=";"))


def test_csv_export_contains_values_and_neutralizes_formulas(client):
    assert post(client, "/salvar/clientes", {"nome": "=1+1", "email": "formula@example.com"}).status_code == 302
    rows = csv_rows(client.get("/exportar/clientes"))
    assert rows[0][0] == "Cliente"
    assert any(row[0] == "'=1+1" for row in rows[1:])
    period = date.today().strftime("%Y-%m")
    transactions = csv_rows(client.get(f"/exportar/transacoes?mes={period}"))
    assert len(transactions) > 1
    reference_column = transactions[0].index("Referência")
    assert all(row[reference_column] == period for row in transactions[1:])


def test_account_csv_preserves_installment_number(client):
    rows = csv_rows(client.get("/exportar/contas-receber?mes=todos"))
    column = rows[0].index("Parcela")
    assert all(row[column] for row in rows[1:])
    assert any(row[column] == "3/3" for row in rows[1:])


@pytest.mark.parametrize("path", ["/", "/painel/inicio", "/painel/clientes", "/backup", "/exportar/transacoes"])
def test_production_requires_login_and_query_cannot_enable_demo(factory, path):
    application = factory(demo=False)
    client = application.test_client()
    response = client.get(path + "?demo=1&DEMO_MODE=1")
    assert response.status_code == 302
    assert response.location.endswith("/login")
    assert not application.config["DEMO_MODE"]
    assert not Path(application.config["DEMO_DB"]).exists()
    login = client.get("/login?demo=1")
    assert login.status_code == 200
    assert "Supabase" in login.get_data(as_text=True)


def test_unconfigured_production_login_has_no_network_or_session(factory, monkeypatch):
    application = factory(demo=False)
    client = application.test_client()
    def forbidden_network(*args, **kwargs):
        raise AssertionError("An unconfigured login must not contact Supabase")
    monkeypatch.setattr("auth.SupabaseAuth", forbidden_network)
    assert client.get("/login").status_code == 200
    with client.session_transaction() as state:
        csrf = state["csrf"]
    response = client.post("/login", data={"csrf_token": csrf, "email": "demo@example.com", "password": "anything"})
    assert response.status_code == 200
    assert "Configure SUPABASE_URL" in response.get_data(as_text=True)
    with client.session_transaction() as state:
        assert not state.get("sid")
    assert client.get("/health").get_json() == {"status": "ok"}


def test_multiple_app_factories_keep_databases_and_auth_mode_separate(factory):
    first = factory(suffix="first")
    second = factory(suffix="second")
    production = factory(demo=False, suffix="production")
    c1, c2, cp = first.test_client(), second.test_client(), production.test_client()
    assert post(c1, "/salvar/clientes", {"nome": "Exclusivo da primeira instância"}).status_code == 302
    assert "Exclusivo da primeira instância" in c1.get("/painel/clientes").get_data(as_text=True)
    assert "Exclusivo da primeira instância" not in c2.get("/painel/clientes").get_data(as_text=True)
    assert cp.get("/painel/clientes").status_code == 302
    assert c1.get("/painel/inicio").status_code == 200


def test_employee_page_and_delete_permissions_are_checked_on_server(factory, monkeypatch):
    """Use an offline stand-in for Supabase, retaining the real auth/route logic."""
    application = factory(demo=False)
    user_id = str(uuid4())
    with read_store(application) as store:
        store.insert("perfis", {"id": user_id, "nome": "Colaborador QA", "email": "qa@example.com", "role": "funcionario", "paginas_permitidas": ["clientes", "configuracoes"], "acoes_restritas": {"clientes": ["remover"]}})
        customer = store.insert("clientes", {"nome": "Cliente protegido"})
    monkeypatch.setattr("auth.SupabaseStore", lambda *args: LocalStore(application.config["DEMO_DB"]))
    tokens = {"expires_at": time.time() + 3600, "access_token": "offline-test-only", "user": {"id": user_id}}
    with sqlite3.connect(application.config["AUTH_DB"]) as connection:
        connection.execute("CREATE TABLE sessions (id TEXT PRIMARY KEY, payload TEXT, expires REAL)")
        connection.execute("INSERT INTO sessions VALUES (?,?,?)", ("qa-session", json.dumps(tokens), time.time() + 3600))
    client = application.test_client()
    with client.session_transaction() as state:
        state.update(sid="qa-session", csrf="offline-csrf-token")
    assert client.get("/painel/clientes").status_code == 200
    assert client.get("/painel/transacoes").status_code == 403
    assert client.get("/painel/usuarios").status_code == 403
    assert client.get("/backup").status_code == 403
    assert client.post(f"/remover/clientes/{customer['id']}", data={"csrf_token": "offline-csrf-token"}).status_code == 403
    assert client.post("/usuarios/salvar", data={"csrf_token": "offline-csrf-token", "nome": "Não permitido", "role": "admin"}).status_code == 403
    with read_store(application) as store:
        assert store.get("clientes", customer["id"]) is not None


@pytest.mark.parametrize("endpoint", ["/painel/inicio", "/exportar/transacoes"])
def test_invalid_month_query_does_not_crash(endpoint, client):
    response = client.get(endpoint + "?mes=invalid")
    assert response.status_code in (200, 400)


def test_due_soon_links_preserve_payable_and_receivable_sides(client):
    html = client.get("/painel/inicio?mes=todos").get_data(as_text=True)
    assert '/painel/contas-pagar?mes=todos' in html
    assert '/painel/contas-receber?mes=todos' in html
