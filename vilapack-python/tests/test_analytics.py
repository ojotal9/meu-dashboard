"""Regression checks for the financial behavior preserved from the original."""

import unittest
from datetime import date, timedelta

from analytics import build_summary, seed_demo


def transaction(value, kind="entrada", month="2026-06", **fields):
    return {"valor": value, "tipo": kind, "data": month, "cliente": "Café de exemplo", **fields}


class SummaryTests(unittest.TestCase):
    def test_decimal_totals_and_no_account_double_count(self):
        data = {
            "transacoes": [transaction("0.10"), transaction("0.20"), transaction("0.10", "saida")],
            "contas_receber": [{"descricao": "Já vinculada", "valor": "0.30", "vencimento": "2026-06-10", "status": "pendente"}],
            "clientes": [{"nome": "Café de exemplo"}],
        }
        summary = build_summary(data, "2026-06")
        self.assertEqual(summary["totals"], {"entrada": 0.3, "saida": 0.1, "saldo": 0.2, "margem": 66.67, "clientes": 1, "transacoes": 3})
        self.assertEqual(summary["accounts_history"], [{"mes": "2026-06", "pagar": 0.0, "receber": 0.3}])

    def test_month_filter_full_dates_and_previous_year(self):
        summary = build_summary({"transacoes": [
            transaction(100, month="2025-12-30"),
            transaction(50, "saida", "2025-12"),
            transaction(125, month="2026-01-03"),
            transaction(25, "saida", "2026-01"),
        ]}, "2026-01")
        self.assertEqual(summary["totals"]["saldo"], 100)
        self.assertEqual(summary["changes"], {"entrada": 25.0, "saida": -50.0, "saldo": 100.0})
        self.assertEqual([row["mes"] for row in summary["history"]], ["2025-12", "2026-01"])

    def test_goal_priority_and_sales_with_informed_cost_only(self):
        original = transaction(100, custo_materia_prima=40, produto="Caixas")
        data = {
            "transacoes": [original, transaction(20, custo_materia_prima=0), transaction(10, "saida", custo_materia_prima=3)],
            "metas": [
                {"titulo": "Geral", "valor": 100, "mes": None},
                {"titulo": "Junho", "valor": 200, "mes": "2026-06"},
                {"titulo": "Duplicada posterior", "valor": 300, "mes": "2026-06"},
            ],
        }
        summary = build_summary(data, "2026-06")
        self.assertEqual(summary["active_goal"]["titulo"], "Junho")
        self.assertEqual(summary["goal_percent"], 60)
        self.assertEqual(len(summary["sales"]), 1)
        self.assertEqual((summary["sales"][0]["lucro"], summary["sales"][0]["margem"]), (60, 60))
        self.assertNotIn("lucro", original)
        self.assertEqual(build_summary(data)["active_goal"]["titulo"], "Geral")
        self.assertEqual(build_summary(data)["goal_percent"], 120)

    def test_account_status_and_due_month_are_independent_of_filter(self):
        today = date.today()
        yesterday = (today - timedelta(days=1)).isoformat()
        tomorrow = (today + timedelta(days=1)).isoformat()
        data = {
            "contasReceber": [
                {"descricao": "Vencida", "vencimento": yesterday, "valor": 30, "status": "pendente"},
                {"descricao": "Liquidada", "vencimento": yesterday, "valor": 20, "status": "recebido"},
                {"descricao": "Hoje", "vencimento": today.isoformat(), "valor": 10, "status": "pendente"},
            ],
            "contasPagar": [{"descricao": "Amanhã", "vencimento": tomorrow, "valor": 5, "status": "pendente"}],
        }
        summary = build_summary(data)
        self.assertEqual(summary["overdue_count"], 1)
        self.assertEqual({r["descricao"]: r["status_real"] for r in summary["receivables"]}, {"Vencida": "atrasado", "Liquidada": "recebido", "Hoje": "pendente"})
        self.assertEqual(len(summary["due_soon"]), 3)
        self.assertEqual(sum(r["receber"] for r in summary["accounts_history"]), 60)
        self.assertEqual(build_summary(data, "2000-01")["overdue_count"], 1)
        self.assertEqual(build_summary(data, "2000-01")["receivables"], [])

    def test_zero_base_and_loss_variation(self):
        self.assertIsNone(build_summary({"transacoes": [transaction(10)]}, "2026-06")["changes"]["entrada"])
        self.assertEqual(build_summary({}, "2026-06")["changes"]["entrada"], 0)
        summary = build_summary({"transacoes": [transaction(100, "saida", "2026-05"), transaction(50, "saida")]}, "2026-06")
        self.assertEqual(summary["changes"]["saldo"], 50)
        self.assertEqual(build_summary({})["changes"], {"entrada": None, "saida": None, "saldo": None})
        self.assertIsNone(build_summary({})["goal_percent"])

    def test_invalid_month_and_nonfinite_values_fail(self):
        for month in ("2026-13", "2026-6", "junho"):
            with self.assertRaises(ValueError):
                build_summary({}, month)
        with self.assertRaises(ValueError):
            build_summary({"transacoes": [transaction("NaN")]})

    def test_demo_is_isolated_idempotent_and_preserves_source_links(self):
        from data import FINANCIAL_TABLES, LocalStore

        with self.assertRaises(ValueError):
            seed_demo(object())
        store = LocalStore(":memory:")
        self.addCleanup(store.connection.close)
        self.assertTrue(seed_demo(store))
        data = {table: store.list(table) for table in FINANCIAL_TABLES}
        counts = {table: len(rows) for table, rows in data.items()}
        self.assertFalse(seed_demo(store))
        self.assertEqual(counts, {table: len(store.list(table)) for table in FINANCIAL_TABLES})
        linked = [t for t in data["transacoes"] if t.get("source_id")]
        sources = [(table, row) for table in ("materia_primas", "contas_receber", "contas_pagar") for row in data[table]]
        self.assertEqual(len(linked), len(sources))
        for table, row in sources:
            match = [t for t in linked if t.get("source_table") == table and t["source_id"] == row["id"]]
            self.assertEqual(len(match), 1)
            self.assertEqual(match[0]["valor"], row["valor"])
            self.assertEqual(match[0]["data"], (row.get("vencimento") or row["data"])[:7])
        summary = build_summary(data)
        self.assertEqual(len(summary["history"]), 6)
        self.assertEqual(summary["history"][-1]["mes"], date.today().strftime("%Y-%m"))


if __name__ == "__main__":
    unittest.main()
