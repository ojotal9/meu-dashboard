"""Run: python -m unittest discover -s tests -p test_data.py -v"""
from datetime import date
from decimal import Decimal
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch, Mock
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from data import (DataError, DashboardService, LocalStore, SupabaseStore, SupabaseAuth,
                  add_months, installments, money, validate)


class DataTests(unittest.TestCase):
    def setUp(self):
        self.store = LocalStore(":memory:")
        self.service = DashboardService(self.store)

    def tearDown(self):
        self.store.close()

    def account(self, table="contas_receber", **changes):
        payload = dict(descricao="Pedido 42", cliente="Ana", fornecedor="Papel Bom", valor="100,00",
                       vencimento="2028-01-31", forma_pagamento="cartao_credito", parcelas=3)
        payload.update(changes)
        return self.service.save(table, payload)

    def test_money_rounding_and_invalid_values(self):
        self.assertEqual(money("1,005"), 1.01)
        self.assertEqual(money("1.234,56"), 1234.56)
        for value in (float("nan"), float("inf"), "NaN", "Infinity", "1e5", "10abc", "-1", "0", True, None, "1.000.00", "9999999999999"):
            with self.subTest(value=value), self.assertRaises(DataError):
                money(value)
        self.assertEqual(money(0, allow_zero=True), 0)
        with self.assertRaises(DataError):
            money(-1, allow_zero=True)
        with self.assertRaises(DataError):
            money("-0.001", allow_zero=True)

    def test_required_fields_dates_and_integer_counts(self):
        for payload in ({}, {"nome": "  "}, {"nome": ["a"]}, {"nome": "Ana", "email": "invalido"}):
            with self.subTest(payload=payload), self.assertRaises(DataError):
                self.service.save("clientes", payload)
        for value in ("2026-02-30", "2026-2-01", "01/02/2026", "2026-13-01"):
            with self.subTest(value=value), self.assertRaises(DataError):
                self.account(vencimento=value)
        for count in (0, -1, 61, 1.5, "abc", True):
            with self.subTest(count=count), self.assertRaises(DataError):
                self.account(parcelas=count)
        for value in ("2026-00", "2026-13", "2026-01-01", "26-01"):
            with self.subTest(month=value), self.assertRaises(DataError):
                self.service.save("metas", {"titulo": "Meta", "valor": 100, "mes": value})
        self.assertEqual(self.store.list("contas_receber"), [])
        self.assertEqual(len(installments(60, 60)), 60)
        self.assertEqual(self.service.save("metas", {"titulo": "Desativada", "valor": 0})["valor"], 0)

    def test_installments_conserve_cents_and_end_of_month(self):
        rows = self.account()
        self.assertEqual([r["valor"] for r in rows], [33.33, 33.33, 33.34])
        self.assertEqual([r["vencimento"] for r in rows], ["2028-01-31", "2028-02-29", "2028-03-31"])
        self.assertEqual(sum(Decimal(str(r["valor"])) for r in rows), Decimal("100.00"))
        self.assertEqual(len({r["grupo_parcela"] for r in rows}), 1)
        self.assertEqual(len(self.store.list("transacoes")), 3)
        self.assertEqual(add_months("2026-12-31", 2), "2027-02-28")
        with self.assertRaises(DataError):
            installments("0.02", 3)

    def test_financial_save_is_atomic_when_generated_transaction_fails(self):
        original = self.store.insert
        def insert(table, payload):
            if table == "transacoes":
                raise DataError("Erro simulado")
            return original(table, payload)
        with patch.object(self.store, "insert", side_effect=insert), self.assertRaises(DataError):
            self.account()
        self.assertEqual(self.store.list("contas_receber"), [])
        self.assertEqual(self.store.list("transacoes"), [])

    def test_repeated_settlement_and_reopen_do_not_duplicate(self):
        row = self.account(parcelas=1)[0]
        self.assertEqual(self.service.settle("contas_receber", row["id"])["status"], "recebido")
        self.service.settle("contas_receber", row["id"])
        self.assertEqual(self.service.settle("contas_receber", row["id"], reopen=True)["status"], "pendente")
        self.assertEqual(len(self.store.list("transacoes")), 1)

    def test_equal_records_keep_exact_identity_when_edited_or_deleted(self):
        payload = dict(tipo="Produção", valor=125, data="2026-09-01")
        first = self.service.save("materia_primas", payload)
        second = self.service.save("materia_primas", payload)
        self.service.save("materia_primas", dict(valor=180, tipo="Fretes"), id=first["id"])
        transactions = {t["source_id"]: t for t in self.store.list("transacoes")}
        self.assertEqual(transactions[first["id"]]["valor"], 180)
        self.assertEqual(transactions[second["id"]]["valor"], 125)
        self.service.remove("materia_primas", first["id"])
        self.assertEqual([t["source_id"] for t in self.store.list("transacoes")], [second["id"]])

    def test_automatic_transaction_cannot_be_modified_outside_source(self):
        self.account(parcelas=1)
        tx = self.store.list("transacoes")[0]
        with self.assertRaises(DataError):
            self.service.save("transacoes", {"valor": 1}, tx["id"])
        with self.assertRaises(DataError):
            self.service.remove("transacoes", tx["id"])

    def test_backup_v2_appends_and_remaps_all_links(self):
        self.account()
        self.service.save("metas", {"titulo": "Vendas", "valor": 1500, "mes": "2028-01"})
        backup = self.service.export_backup()
        before_ids = {r["id"] for r in self.store.list("contas_receber")}
        counts = self.service.import_backup(backup)
        self.assertEqual(counts["contasReceber"], 3)
        self.assertEqual(len(self.store.list("contas_receber")), 6)
        self.assertEqual(len(self.store.list("transacoes")), 6)
        self.assertEqual(len(self.store.list("metas")), 2)
        new_accounts = [r for r in self.store.list("contas_receber") if r["id"] not in before_ids]
        self.assertTrue(set(r["id"] for r in new_accounts).isdisjoint(before_ids))
        self.assertNotEqual(new_accounts[0]["grupo_parcela"], backup["contasReceber"][0]["grupo_parcela"])
        self.assertEqual({r["source_id"] for r in self.store.list("transacoes")}, {r["id"] for r in self.store.list("contas_receber")})

    def test_backup_v1_reconciles_duplicate_legacy_rows_one_to_one(self):
        payload = dict(tipo="Produção", valor=125, data="2026-09-01")
        self.service.save("materia_primas", payload)
        self.service.save("materia_primas", payload)
        backup = self.service.export_backup()
        backup["versao"] = 1
        backup.pop("metas")
        for row in backup["transacoes"]:
            row.pop("source_id")
            row.pop("source_table")
        target = LocalStore(":memory:")
        try:
            service = DashboardService(target)
            service.import_backup(backup)
            self.assertEqual(len(target.list("transacoes")), 2)
            source = target.list("materia_primas")[0]
            service.remove("materia_primas", source["id"])
            self.assertEqual(len(target.list("transacoes")), 1)
        finally:
            target.close()

    def test_backup_validates_everything_before_inserting(self):
        backup = {"versao": 1, "clientes": [{"nome": "Válido"}], "transacoes": [{"cliente": "A", "valor": "NaN", "tipo": "entrada", "data": "2026-09"}]}
        with self.assertRaises(DataError):
            self.service.import_backup(backup)
        self.assertEqual(self.store.list("clientes"), [])
        with self.assertRaises(DataError):
            self.service.import_backup({"versao": 1, "clientes": "errado"})

    def test_backup_rejects_orphan_and_mismatched_links(self):
        self.account(parcelas=1)
        backup = self.service.export_backup()
        backup["transacoes"][0]["source_id"] = str(uuid4())
        with self.assertRaises(DataError):
            self.service.import_backup(backup)
        backup = self.service.export_backup()
        backup["transacoes"][0]["valor"] = 500
        with self.assertRaises(DataError):
            self.service.import_backup(backup)
        self.assertEqual(len(self.store.list("contas_receber")), 1)

    def test_backup_rolls_back_after_storage_failure(self):
        self.account(parcelas=1)
        backup = self.service.export_backup()
        original = self.store.insert
        def insert(table, payload):
            if table == "transacoes":
                raise DataError("Falha simulada")
            return original(table, payload)
        with patch.object(self.store, "insert", side_effect=insert), self.assertRaises(DataError):
            self.service.import_backup(backup)
        self.assertEqual(len(self.store.list("contas_receber")), 1)

    def test_sqlite_persists_after_reopening(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "demo.sqlite3"
            store = LocalStore(path)
            row = DashboardService(store).save("clientes", {"nome": "Ana"})
            store.close()
            reopened = LocalStore(path)
            try:
                self.assertEqual(reopened.get("clientes", row["id"])["nome"], "Ana")
            finally:
                reopened.close()

    def test_unknown_table_and_invalid_payload(self):
        with self.assertRaises(DataError):
            self.store.list("clientes; DROP TABLE records")
        with self.assertRaises(DataError):
            self.service.save("clientes", [])


class RemoteContractTests(unittest.TestCase):
    def test_paginated_reads_keep_user_bearer_and_advance_actual_server_count(self):
        store = SupabaseStore("https://example.supabase.co", "public-key", "user-jwt", service_key="secret-admin")
        with patch("data._request", side_effect=[[{"id": "a"}], [{"id": "b"}], []]) as request:
            self.assertEqual(len(store.list("clientes")), 2)
        self.assertEqual([c.kwargs["params"]["offset"] for c in request.call_args_list], [0, 1, 2])
        for call in request.call_args_list:
            self.assertEqual(call.args[2]["Authorization"], "Bearer user-jwt")
            self.assertEqual(call.args[2]["apikey"], "public-key")
            self.assertNotIn("secret-admin", str(call))

    def test_compound_write_uses_one_rpc_and_no_rest_inserts(self):
        store = SupabaseStore("https://example.supabase.co", "public-key", "user-jwt")
        with patch("data._request", return_value=[{}, {}, {}, {}]) as request:
            DashboardService(store).save("contas_pagar", {"descricao": "Compra", "valor": 50, "vencimento": "2026-09-01", "forma_pagamento": "cartao_credito", "parcelas": 2})
        request.assert_called_once()
        self.assertTrue(request.call_args.args[1].endswith("/rpc/vila_mutate"))
        ops = request.call_args.kwargs["json"]["operations"]
        self.assertEqual(len(ops), 4)
        self.assertEqual(ops[1]["data"]["source_id"], ops[0]["data"]["id"])

    def test_missing_migration_is_actionable(self):
        response = Mock(content=b'{}', ok=False, status_code=404)
        response.json.return_value = {"code": "PGRST202", "message": "RPC missing"}
        with patch("requests.request", return_value=response), self.assertRaisesRegex(DataError, "supabase_migration.sql"):
            SupabaseStore("https://example.supabase.co", "public", "jwt").mutate([{"op": "insert"}])

    def test_auth_and_admin_keys_are_separate(self):
        auth = SupabaseAuth("https://example.supabase.co", "public-key", "admin-key")
        with patch("data._request", return_value={"access_token": "jwt"}) as request:
            auth.login("a@example.com", "password")
            self.assertEqual(request.call_args.args[2]["apikey"], "public-key")
            auth.user("jwt")
            self.assertEqual(request.call_args.args[2]["Authorization"], "Bearer jwt")
            auth.create_user({"email": "a@example.com", "senha": "password", "nome": "Ana"})
            self.assertEqual(request.call_args.args[2]["Authorization"], "Bearer admin-key")
        with self.assertRaises(DataError):
            SupabaseStore("https://example.supabase.co", "admin", "jwt", service_key="admin")
        with self.assertRaises(DataError):
            SupabaseStore("https://example.supabase.co", "sb_secret_accidentally_configured", "jwt")


if __name__ == "__main__":
    unittest.main()
