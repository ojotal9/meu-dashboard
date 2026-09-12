"""Persistence and business rules for VilaPack.

Financial writes always use the signed-in user's token and RLS. Compound remote
writes call public.vila_mutate(operations jsonb); install supabase_migration.sql
once using the Supabase SQL editor. No production request is made at import time.
"""
from __future__ import annotations

import base64
import calendar
from contextlib import contextmanager, nullcontext
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
import json
from pathlib import Path
import re
import sqlite3
import threading
from uuid import uuid4, UUID


class DataError(Exception):
    """An actionable validation, storage, or authentication error."""


TABLES = ("clientes", "materia_primas", "transacoes", "contas_receber", "contas_pagar", "metas", "perfis")
FINANCIAL_TABLES = TABLES[:-1]
SOURCES = ("materia_primas", "contas_receber", "contas_pagar")
BACKUP_KEYS = {"clientes": "clientes", "materia_primas": "materiaPrimas", "transacoes": "transacoes",
               "contas_receber": "contasReceber", "contas_pagar": "contasPagar", "metas": "metas"}
PAYMENTS = ("dinheiro", "pix", "cartao_credito", "cartao_debito", "boleto", "transferencia")
FIELDS = {
    "clientes": ("nome", "telefone", "email", "cpf", "representante"),
    "materia_primas": ("tipo", "valor", "data", "observacao"),
    "transacoes": ("cliente", "valor", "tipo", "categoria", "data", "produto", "custo_materia_prima", "source_table", "source_id"),
    "contas_receber": ("descricao", "cliente", "vencimento", "valor", "status", "forma_pagamento", "parcelas", "parcela_atual", "grupo_parcela"),
    "contas_pagar": ("descricao", "fornecedor", "vencimento", "valor", "status", "forma_pagamento", "parcelas", "parcela_atual", "grupo_parcela"),
    "metas": ("titulo", "valor", "mes"),
    "perfis": ("nome", "email", "role", "paginas_permitidas", "acoes_restritas"),
}


def _table(table):
    if table not in TABLES:
        raise DataError("Tabela inválida.")
    return table


def _id(value):
    try:
        return str(UUID(str(value)))
    except (ValueError, TypeError, AttributeError):
        raise DataError("Identificador inválido.") from None


def _now():
    return datetime.now(timezone.utc).isoformat()


def money(value, field="valor", allow_zero=False):
    """Round once, half up, then serialize as a JSON number; calculate with Decimal."""
    if isinstance(value, bool) or value is None:
        raise DataError(f"Informe um {field} numérico válido.")
    raw = str(value).strip()
    if "," in raw:
        if not re.fullmatch(r"-?(?:\d{1,3}(?:\.\d{3})+|\d+),\d+", raw):
            raise DataError(f"Informe um {field} numérico válido.")
        raw = raw.replace(".", "").replace(",", ".")
    if not re.fullmatch(r"-?\d+(?:\.\d+)?", raw):
        raise DataError(f"Informe um {field} numérico válido.")
    try:
        amount = Decimal(raw)
        if not amount.is_finite() or abs(amount) > Decimal("999999999999.99"):
            raise InvalidOperation
        if amount < 0:
            raise DataError(f"{field.capitalize()} não pode ser negativo.")
        amount = amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    except InvalidOperation:
        raise DataError(f"{field.capitalize()} fora do limite permitido.") from None
    if amount < 0 or (not allow_zero and amount == 0):
        raise DataError(f"{field.capitalize()} deve ser {'maior ou igual a zero' if allow_zero else 'maior que zero'}.")
    return float(amount)


def _text(value, field, required=False, limit=500):
    if value is None:
        value = ""
    if not isinstance(value, str):
        raise DataError(f"O campo {field} deve ser texto.")
    value = value.strip()
    if required and not value:
        raise DataError(f"Preencha o campo {field}.")
    if len(value) > limit:
        raise DataError(f"O campo {field} aceita até {limit} caracteres.")
    return value


def _date(value, field="data", month=False, optional=False):
    if optional and value in (None, ""):
        return None
    pattern = r"\d{4}-\d{2}" if month else r"\d{4}-\d{2}-\d{2}"
    if not isinstance(value, str) or not re.fullmatch(pattern, value):
        raise DataError(f"{field.capitalize()} deve ter o formato {'AAAA-MM' if month else 'AAAA-MM-DD'}.")
    try:
        date.fromisoformat(value + "-01" if month else value)
    except ValueError:
        raise DataError(f"{field.capitalize()} inválida.") from None
    return value


def _integer(value, field, minimum=1, maximum=60):
    if isinstance(value, bool) or not re.fullmatch(r"\d+", str(value)):
        raise DataError(f"{field.capitalize()} deve ser um número inteiro.")
    value = int(value)
    if not minimum <= value <= maximum:
        raise DataError(f"{field.capitalize()} deve ficar entre {minimum} e {maximum}.")
    return value


def add_months(value, months):
    original = date.fromisoformat(_date(value))
    year, month = divmod(original.year * 12 + original.month - 1 + months, 12)
    if not 1 <= year <= 9999:
        raise DataError("O vencimento das parcelas ultrapassa o intervalo de datas permitido.")
    month += 1
    return date(year, month, min(original.day, calendar.monthrange(year, month)[1])).isoformat()


def installments(value, count):
    count = _integer(count, "parcelas")
    cents = int(Decimal(str(money(value))) * 100)
    base = cents // count
    if base == 0:
        raise DataError("O valor total deve permitir pelo menos R$ 0,01 por parcela.")
    return [float(Decimal(base if i < count - 1 else cents - base * (count - 1)) / 100) for i in range(count)]


def validate(table, payload, *, internal=False):
    _table(table)
    if not isinstance(payload, dict):
        raise DataError("O registro deve ser um objeto.")
    result = {k: v for k, v in payload.items() if k in FIELDS[table]}
    if table == "clientes":
        for field in FIELDS[table]:
            result[field] = _text(result.get(field), field, required=field == "nome")
    elif table == "materia_primas":
        result.update(tipo=_text(result.get("tipo"), "tipo", True), valor=money(result.get("valor")),
                      data=_date(result.get("data")), observacao=_text(result.get("observacao"), "observação", limit=3000))
    elif table == "transacoes":
        result.update(cliente=_text(result.get("cliente"), "cliente", True), valor=money(result.get("valor")),
                      data=_date(result.get("data"), month=True), categoria=_text(result.get("categoria") or "Outros", "categoria", True),
                      produto=_text(result.get("produto"), "produto"),
                      custo_materia_prima=money(0 if result.get("custo_materia_prima") in (None, "") else result["custo_materia_prima"], "custo", allow_zero=True))
        if result.get("tipo") not in ("entrada", "saida"):
            raise DataError("Tipo de transação inválido.")
        if not internal:
            result.pop("source_table", None)
            result.pop("source_id", None)
        elif result.get("source_table") or result.get("source_id"):
            if result.get("source_table") not in SOURCES:
                raise DataError("Vínculo de transação inválido.")
            result["source_id"] = _id(result.get("source_id"))
        else:
            result.pop("source_table", None)
            result.pop("source_id", None)
    elif table in ("contas_receber", "contas_pagar"):
        party = "cliente" if table == "contas_receber" else "fornecedor"
        result.update(descricao=_text(result.get("descricao"), "descrição", True),
                      **{party: _text(result.get(party), party)}, valor=money(result.get("valor")),
                      vencimento=_date(result.get("vencimento"), "vencimento"))
        result["status"] = result.get("status") or "pendente"
        if result["status"] not in ("pendente", "recebido" if table == "contas_receber" else "pago"):
            raise DataError("Status de conta inválido.")
        result["forma_pagamento"] = result.get("forma_pagamento") or "dinheiro"
        if result["forma_pagamento"] not in PAYMENTS:
            raise DataError("Forma de pagamento inválida.")
        count = _integer(result.get("parcelas") if result.get("parcelas") is not None else 1, "parcelas")
        if result["forma_pagamento"] != "cartao_credito" and count != 1:
            raise DataError("Parcelamento está disponível apenas para cartão de crédito.")
        result["parcelas"] = count
        result["parcela_atual"] = _integer(1 if result.get("parcela_atual") is None else result["parcela_atual"], "parcela atual", maximum=count)
        result["grupo_parcela"] = _id(result["grupo_parcela"]) if result.get("grupo_parcela") else None
    elif table == "metas":
        result.update(titulo=_text(result.get("titulo"), "título", True), valor=money(result.get("valor"), allow_zero=True),
                      mes=_date(result.get("mes"), "mês", month=True, optional=True))
    elif table == "perfis":
        result.update(nome=_text(result.get("nome"), "nome", True), email=_text(result.get("email"), "email", True))
        result["role"] = result.get("role") or "funcionario"
        if result["role"] not in ("admin", "funcionario"):
            raise DataError("Papel de usuário inválido.")
        pages = result.get("paginas_permitidas", [])
        actions = result.get("acoes_restritas", {})
        if not isinstance(pages, list) or not all(isinstance(x, str) and len(x) < 100 for x in pages):
            raise DataError("Páginas permitidas inválidas.")
        if not isinstance(actions, dict) or not all(isinstance(k, str) and isinstance(v, list) and all(isinstance(a, str) for a in v) for k, v in actions.items()):
            raise DataError("Restrições de ações inválidas.")
        result.update(paginas_permitidas=pages, acoes_restritas=actions)
    if result.get("email") and not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", result["email"]):
        raise DataError("Informe um e-mail válido.")
    return result


class LocalStore:
    """SQLite demo storage. One transaction includes all generated financial rows."""

    def __init__(self, path):
        if str(path) != ":memory:":
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.connection = sqlite3.connect(str(path), check_same_thread=False, isolation_level=None)
        self.connection.execute("PRAGMA busy_timeout=10000")
        self.connection.execute("CREATE TABLE IF NOT EXISTS records (table_name TEXT NOT NULL, id TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(table_name,id))")
        self._lock = threading.RLock()
        self._depth = 0

    @contextmanager
    def transaction(self):
        with self._lock:
            outer = self._depth == 0
            if outer:
                self.connection.execute("BEGIN IMMEDIATE")
            self._depth += 1
            try:
                yield self
                if outer:
                    self.connection.execute("COMMIT")
            except Exception:
                if outer:
                    self.connection.execute("ROLLBACK")
                raise
            finally:
                self._depth -= 1

    def list(self, table):
        with self._lock:
            rows = self.connection.execute("SELECT payload FROM records WHERE table_name=? ORDER BY rowid", (_table(table),)).fetchall()
        return [json.loads(r[0]) for r in rows]

    def get(self, table, id):
        with self._lock:
            row = self.connection.execute("SELECT payload FROM records WHERE table_name=? AND id=?", (_table(table), str(id))).fetchone()
        return json.loads(row[0]) if row else None

    def insert(self, table, payload):
        table = _table(table)
        record = dict(payload, id=_id(payload["id"]) if payload.get("id") else str(uuid4()))
        record.setdefault("created_at", _now())
        with self.transaction():
            self._unique_source(table, record)
            try:
                self.connection.execute("INSERT INTO records(table_name,id,payload) VALUES(?,?,?)", (table, record["id"], json.dumps(record, allow_nan=False)))
            except (sqlite3.Error, ValueError) as exc:
                raise DataError("Não foi possível salvar o registro local.") from exc
        return record

    def update(self, table, id, payload):
        with self.transaction():
            record = self.get(table, id)
            if record is None:
                raise DataError("Registro não encontrado ou sem permissão.")
            record.update({k: v for k, v in payload.items() if k not in ("id", "created_at")})
            self._unique_source(table, record)
            self.connection.execute("UPDATE records SET payload=? WHERE table_name=? AND id=?", (json.dumps(record, allow_nan=False), table, str(id)))
        return record

    def _unique_source(self, table, record):
        if table == "transacoes" and record.get("source_id"):
            if any(r["id"] != record["id"] and r.get("source_table") == record.get("source_table") and r.get("source_id") == record["source_id"] for r in self.list(table)):
                raise DataError("Já existe uma transação para este registro.")

    def delete(self, table, id):
        with self.transaction():
            cursor = self.connection.execute("DELETE FROM records WHERE table_name=? AND id=?", (_table(table), str(id)))
            if not cursor.rowcount:
                raise DataError("Registro não encontrado ou sem permissão.")

    def mutate(self, operations):
        results = []
        with self.transaction():
            for op in operations:
                if op["op"] == "insert":
                    results.append(self.insert(op["table"], op["data"]))
                elif op["op"] == "update":
                    results.append(self.update(op["table"], op["id"], op["data"]))
                elif op["op"] == "delete":
                    self.delete(op["table"], op["id"])
                    results.append(None)
                else:
                    raise DataError("Operação inválida.")
        return results

    def close(self):
        self.connection.close()


def _request(method, url, headers, **kwargs):
    import requests
    try:
        response = requests.request(method, url, headers=headers, timeout=(10, 45), **kwargs)
    except requests.RequestException as exc:
        raise DataError("Não foi possível conectar ao Supabase. Confira sua conexão e tente novamente.") from exc
    try:
        body = response.json() if response.content else None
    except ValueError:
        body = None
    if not response.ok:
        if response.status_code == 401:
            raise DataError("Sua sessão expirou. Entre novamente.")
        if response.status_code == 403:
            raise DataError("Seu usuário não tem permissão para esta operação no Supabase.")
        code = body.get("code", "") if isinstance(body, dict) else ""
        if code in ("PGRST202", "PGRST204", "42883", "42703"):
            raise DataError("Atualização do banco necessária: execute supabase_migration.sql no SQL Editor do seu projeto Supabase e tente novamente.")
        message = (body.get("msg") or body.get("message") or body.get("error_description")) if isinstance(body, dict) else None
        raise DataError(f"Supabase: {str(message)[:400] if message else 'não foi possível concluir a operação.'}")
    return body


def _privileged_key(value):
    """Reject recognized admin key formats even if service_key was not configured.

    Reading the JWT payload here only rejects unsafe credentials; it does NOT
    authenticate anything. GoTrue and PostgreSQL verify the user's actual JWT.
    """
    if value.startswith("sb_secret_"):
        return True
    try:
        encoded = value.split(".")[1]
        claims = json.loads(base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4)))
        return claims.get("role") in ("service_role", "supabase_admin")
    except (IndexError, ValueError, TypeError, AttributeError):
        return False


class SupabaseStore:
    def __init__(self, url, key, access_token, service_key=None):
        if not url or not key or not access_token:
            raise DataError("Configure SUPABASE_URL e SUPABASE_ANON_KEY e entre com sua conta.")
        if _privileged_key(key) or _privileged_key(access_token) or (service_key and (key == service_key or access_token == service_key)):
            raise DataError("Operações financeiras exigem a chave pública e a sessão do usuário.")
        self.url = url.rstrip("/")
        self.headers = {"apikey": key, "Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}
        # service_key deliberately never retained or sent by this store.

    def list(self, table):
        result, offset = [], 0
        while True:
            rows = _request("GET", f"{self.url}/rest/v1/{_table(table)}", self.headers,
                            params={"select": "*", "order": "id.asc", "offset": offset, "limit": 1000})
            if not isinstance(rows, list):
                raise DataError("Resposta inesperada do Supabase.")
            result.extend(rows)
            if not rows:
                break
            # Do not assume a 1,000-row server cap: projects can configure lower caps.
            offset += len(rows)
        return result

    def get(self, table, id):
        rows = _request("GET", f"{self.url}/rest/v1/{_table(table)}", self.headers,
                        params={"select": "*", "id": f"eq.{_id(id)}", "limit": 1})
        return rows[0] if rows else None

    def insert(self, table, payload):
        rows = _request("POST", f"{self.url}/rest/v1/{_table(table)}", dict(self.headers, Prefer="return=representation"), json=payload)
        if not rows:
            raise DataError("O Supabase não confirmou o registro. Confira as políticas RLS.")
        return rows[0]

    def update(self, table, id, payload):
        rows = _request("PATCH", f"{self.url}/rest/v1/{_table(table)}", dict(self.headers, Prefer="return=representation"),
                        params={"id": f"eq.{_id(id)}"}, json={k: v for k, v in payload.items() if k not in ("id", "created_at")})
        if not rows:
            raise DataError("Registro não encontrado ou sem permissão.")
        return rows[0]

    def delete(self, table, id):
        rows = _request("DELETE", f"{self.url}/rest/v1/{_table(table)}", dict(self.headers, Prefer="return=representation"), params={"id": f"eq.{_id(id)}"})
        if not rows:
            raise DataError("Registro não encontrado ou sem permissão.")

    def mutate(self, operations):
        if not operations:
            return []
        return _request("POST", f"{self.url}/rest/v1/rpc/vila_mutate", self.headers, json={"operations": operations})


class SupabaseAuth:
    """GoTrue auth helpers. Caller must verify admin role before admin operations."""
    def __init__(self, url, key, service_key=None):
        self.url, self.key, self.service_key = url.rstrip("/"), key, service_key

    def _call(self, method, path, token=None, *, admin=False, **kwargs):
        key = self.service_key if admin else self.key
        if not key:
            raise DataError("Para gerenciar logins configure SUPABASE_SERVICE_ROLE_KEY somente no servidor.")
        headers = {"apikey": key, "Content-Type": "application/json"}
        # Publishable/secret keys are not JWTs. Only legacy JWT keys belong in
        # Authorization; authenticated calls always send the user's access token.
        if token or not key.startswith(("sb_publishable_", "sb_secret_")):
            headers["Authorization"] = f"Bearer {token or key}"
        return _request(method, self.url + "/auth/v1/" + path, headers, **kwargs)

    def login(self, email, password):
        return self._call("POST", "token?grant_type=password", json={"email": email, "password": password})

    def refresh(self, refresh_token):
        return self._call("POST", "token?grant_type=refresh_token", json={"refresh_token": refresh_token})

    def user(self, token):
        return self._call("GET", "user", token)

    def logout(self, token):
        return self._call("POST", "logout", token)

    def create_user(self, payload):
        email = _text(payload.get("email"), "email", True)
        password = payload.get("password") or payload.get("senha")
        if not isinstance(password, str) or len(password) < 8:
            raise DataError("A senha deve ter pelo menos 8 caracteres.")
        return self._call("POST", "admin/users", admin=True, json={"email": email, "password": password,
                          "email_confirm": True, "user_metadata": {"nome": _text(payload.get("nome"), "nome", True)}})

    def delete_user(self, id):
        return self._call("DELETE", "admin/users/" + _id(id), admin=True)


def _automatic(table, record):
    if table == "materia_primas":
        client, kind, category, month = "Matéria-prima: " + record["tipo"], "saida", "Matéria-prima", record["data"][:7]
    elif table == "contas_receber":
        client, kind, category, month = "Conta a receber: " + record["descricao"], "entrada", "Contas a Receber", record["vencimento"][:7]
    else:
        client, kind, category, month = "Conta a pagar: " + record["descricao"], "saida", "Contas a Pagar", record["vencimento"][:7]
    return dict(cliente=client, tipo=kind, categoria=category, data=month, valor=record["valor"],
                produto="", custo_materia_prima=0, source_table=table, source_id=record["id"])


def _signature(record):
    return (record.get("cliente"), record.get("tipo"), record.get("categoria"), record.get("data"), Decimal(str(record.get("valor", 0))).quantize(Decimal(".01")))


class DashboardService:
    def __init__(self, store):
        self.store = store

    def _transaction(self):
        return self.store.transaction() if isinstance(self.store, LocalStore) else nullcontext()

    def _existing(self, table, id):
        record = self.store.get(table, id)
        if not record:
            raise DataError("Registro não encontrado ou sem permissão.")
        return record

    def _linked(self, table, record):
        rows = self.store.list("transacoes")
        linked = [row for row in rows if row.get("source_table") == table and row.get("source_id") == record["id"]]
        if len(linked) > 1:
            raise DataError("Há vínculos duplicados. Revise os dados antes de continuar.")
        if linked:
            return linked[0]
        # Compatibility for old local backups / stores. Never pick a financial row
        # by amount/name when more than one source could claim it.
        signature = _signature(_automatic(table, record))
        candidates = [row for row in rows if not row.get("source_id") and _signature(row) == signature]
        other_sources = [row for row in self.store.list(table) if _signature(_automatic(table, row)) == signature]
        if candidates and (len(candidates) != 1 or len(other_sources) != 1):
            raise DataError("Vínculo legado ambíguo. Execute supabase_migration.sql antes de editar ou remover este registro.")
        return candidates[0] if candidates else None

    def save(self, table, payload, id=None):
        _table(table)
        if not isinstance(payload, dict):
            raise DataError("O registro deve ser um objeto.")
        with self._transaction():
            old = self._existing(table, id) if id else None
            if table == "transacoes" and old and old.get("source_id"):
                raise DataError("Edite a conta ou saída de origem para atualizar esta transação automática.")
            record = validate(table, {**(old or {}), **payload})
            if table in SOURCES:
                if old:
                    if table.startswith("contas_"):
                        for field in ("parcelas", "parcela_atual", "grupo_parcela"):
                            record[field] = old.get(field, record[field])
                    record["id"] = str(id)
                    ops = [{"op": "update", "table": table, "id": str(id), "data": record}]
                    linked = self._linked(table, old)
                    auto = _automatic(table, record)
                    ops.append({"op": "update", "table": "transacoes", "id": linked["id"], "data": auto} if linked else {"op": "insert", "table": "transacoes", "data": auto})
                    return self.store.mutate(ops)[0]
                rows = []
                if table.startswith("contas_"):
                    count = record["parcelas"]
                    group = str(uuid4()) if count > 1 else None
                    for index, value in enumerate(installments(record["valor"], count)):
                        rows.append(dict(record, id=str(uuid4()), valor=value, vencimento=add_months(record["vencimento"], index),
                                         parcelas=count, parcela_atual=index + 1, grupo_parcela=group))
                else:
                    rows = [dict(record, id=str(uuid4()))]
                ops = []
                for row in rows:
                    ops.extend([{"op": "insert", "table": table, "data": row}, {"op": "insert", "table": "transacoes", "data": _automatic(table, row)}])
                created = self.store.mutate(ops)[::2]
                return created if table.startswith("contas_") else created[0]
            if old:
                return self.store.update(table, id, record)
            return self.store.insert(table, record)

    def remove(self, table, id):
        _table(table)
        with self._transaction():
            record = self._existing(table, id)
            if table == "transacoes" and record.get("source_id"):
                raise DataError("Remova a conta ou saída de origem para excluir esta transação automática.")
            ops = []
            if table in SOURCES:
                linked = self._linked(table, record)
                if linked:
                    ops.append({"op": "delete", "table": "transacoes", "id": linked["id"]})
                ops.append({"op": "delete", "table": table, "id": str(id)})
                self.store.mutate(ops)
            else:
                self.store.delete(table, id)

    def settle(self, table, id, reopen=False):
        if table not in ("contas_receber", "contas_pagar"):
            raise DataError("Somente contas podem ser quitadas ou reabertas.")
        # The original dashboard recognizes the amount at the due month. Settling
        # changes status only; it must never create a second financial transaction.
        return self.store.update(table, id, {"status": "pendente" if reopen else "recebido" if table == "contas_receber" else "pago"})

    def export_backup(self):
        with self._transaction():
            return {"versao": 2, "exportadoEm": _now(), **{BACKUP_KEYS[t]: self.store.list(t) for t in FINANCIAL_TABLES}}

    def import_backup(self, backup):
        if not isinstance(backup, dict) or isinstance(backup.get("versao"), bool) or backup.get("versao") not in (1, 2):
            raise DataError("Backup inválido. Use um arquivo do dashboard na versão 1 ou 2.")
        if not any(key in backup for key in BACKUP_KEYS.values()):
            raise DataError("O backup não contém tabelas reconhecidas.")
        total = 0
        incoming, mapping, groups = {}, {}, {}
        for table in FINANCIAL_TABLES:
            rows = backup.get(BACKUP_KEYS[table], [])
            if not isinstance(rows, list):
                raise DataError(f"A seção {BACKUP_KEYS[table]} deve ser uma lista.")
            total += len(rows)
            if total > 10000:
                raise DataError("Importe no máximo 10.000 registros por arquivo.")
            incoming[table] = []
            for row in rows:
                record = validate(table, row, internal=True)
                new_id = str(uuid4())
                if row.get("id"):
                    old_id = _id(row["id"])
                    if (table, old_id) in mapping:
                        raise DataError("O backup contém identificadores repetidos na mesma tabela.")
                    mapping[(table, old_id)] = new_id
                record["id"] = new_id
                if record.get("grupo_parcela"):
                    record["grupo_parcela"] = groups.setdefault((table, record["grupo_parcela"]), str(uuid4()))
                incoming[table].append(record)
        # Validate and remap explicit v2 links before *any* persistence operation.
        claimed = set()
        for tx in incoming["transacoes"]:
            if tx.get("source_id"):
                source = (tx["source_table"], tx["source_id"])
                if source not in mapping:
                    raise DataError("O backup contém uma transação vinculada a uma origem ausente.")
                source = (tx["source_table"], mapping[source])
                if source in claimed:
                    raise DataError("O backup contém transações automáticas duplicadas para uma origem.")
                claimed.add(source)
                tx["source_id"] = source[1]
        # v1 had no link columns. Reconcile each original auto-row at most once,
        # including identical purchases, so reimports cannot double count totals.
        legacy = {}
        for tx in incoming["transacoes"]:
            if not tx.get("source_id"):
                legacy.setdefault(_signature(tx), []).append(tx)
        for table in SOURCES:
            for record in incoming[table]:
                source = (table, record["id"])
                auto = _automatic(table, record)
                if source in claimed:
                    linked = next(tx for tx in incoming["transacoes"] if (tx.get("source_table"), tx.get("source_id")) == source)
                    if _signature(linked) != _signature(auto):
                        raise DataError("Uma transação automática diverge do valor, mês ou descrição de sua origem no backup.")
                    continue
                candidates = legacy.get(_signature(auto), [])
                if candidates:
                    tx = candidates.pop(0)
                    tx.update(source_table=table, source_id=record["id"])
                else:
                    incoming["transacoes"].append(dict(auto, id=str(uuid4())))
                claimed.add(source)
        order = ("clientes", "materia_primas", "contas_receber", "contas_pagar", "metas", "transacoes")
        operations = [{"op": "insert", "table": table, "data": row} for table in order for row in incoming[table]]
        if len(operations) > 20000:
            raise DataError("Backup grande demais para uma importação transacional.")
        with self._transaction():
            self.store.mutate(operations)
        return {BACKUP_KEYS[t]: len(incoming[t]) for t in FINANCIAL_TABLES}
