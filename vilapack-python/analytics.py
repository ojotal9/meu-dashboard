"""Financial summaries and isolated, fictional demonstration data.

Accounts are recognized by due month, as in the original dashboard. Their
linked transactions already participate in totals; account values must never
be added to the transaction totals a second time.
"""

from __future__ import annotations

import calendar
from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any


ZERO = Decimal("0")
CENT = Decimal("0.01")


def _decimal(value: Any) -> Decimal:
    if value is None or value == "":
        return ZERO
    try:
        result = Decimal(str(value))
    except (InvalidOperation, ValueError) as exc:
        raise ValueError("Valor financeiro inválido.") from exc
    if not result.is_finite():
        raise ValueError("Valor financeiro inválido.")
    return result


def _number(value: Decimal) -> float:
    """Convert only at the presentation boundary, after decimal arithmetic."""
    return float(value.quantize(CENT, rounding=ROUND_HALF_UP))


def _month(value: Any) -> str:
    return str(value or "")[:7]


def _shift_month(value: date, offset: int) -> date:
    index = value.year * 12 + value.month - 1 + offset
    year, month0 = divmod(index, 12)
    month = month0 + 1
    return date(year, month, min(value.day, calendar.monthrange(year, month)[1]))


def _table(data: dict, name: str, legacy: str | None = None) -> list[dict]:
    rows = data.get(name)
    if rows is None and legacy:
        rows = data.get(legacy)
    return list(rows or [])


def _totals(rows: list[dict]) -> tuple[Decimal, Decimal, Decimal]:
    income = sum((_decimal(t.get("valor")) for t in rows if t.get("tipo") == "entrada"), ZERO)
    expense = sum((_decimal(t.get("valor")) for t in rows if t.get("tipo") == "saida"), ZERO)
    return income, expense, income - expense


def _variation(current: Decimal, previous: Decimal) -> float | None:
    if previous == 0:
        return 0.0 if current == 0 else None
    return _number((current - previous) / abs(previous) * 100)


def _account_status(row: dict, side: str, today: date) -> str:
    settled = "recebido" if side == "receber" else "pago"
    if row.get("status") == settled:
        return settled
    return "atrasado" if str(row.get("vencimento") or "9999-12-31") < today.isoformat() else "pendente"


def build_summary(data: dict, month: str = "todos") -> dict:
    """Build JSON-ready indicators without changing source rows.

    The selected month filters transaction indicators and account lists.
    History retains the full series; overdue alerts and the next obligations
    consider every month so a filter cannot hide an outstanding obligation.
    ``margem`` is a percentage, not a ratio. ``goal_percent`` is not capped.
    Legacy export collection names are accepted for migration previews.
    """
    month = month or "todos"
    if month != "todos":
        try:
            selected_date = date.fromisoformat(month + "-01")
        except (TypeError, ValueError) as exc:
            raise ValueError("Selecione um mês no formato AAAA-MM.") from exc
        if selected_date.strftime("%Y-%m") != month:
            raise ValueError("Selecione um mês no formato AAAA-MM.")
    else:
        selected_date = None

    transactions = _table(data, "transacoes")
    selected = [t for t in transactions if month == "todos" or _month(t.get("data")) == month]
    income, expense, balance = _totals(selected)
    totals = {
        "entrada": _number(income),
        "saida": _number(expense),
        "saldo": _number(balance),
        "margem": _number(balance / income * 100) if income > 0 else None,
        "clientes": len(_table(data, "clientes")),
        "transacoes": len(selected),
    }
    changes = {"entrada": None, "saida": None, "saldo": None}
    if selected_date:
        previous_month = _shift_month(selected_date, -1).strftime("%Y-%m")
        previous = _totals([t for t in transactions if _month(t.get("data")) == previous_month])
        changes = {
            key: _variation(current, old)
            for key, current, old in zip(("entrada", "saida", "saldo"), (income, expense, balance), previous)
        }

    monthly: dict[str, list[dict]] = defaultdict(list)
    for transaction in transactions:
        key = _month(transaction.get("data"))
        if key:
            monthly[key].append(transaction)
    history = []
    for key in sorted(monthly):
        incoming, outgoing, net = _totals(monthly[key])
        history.append({"mes": key, "entrada": _number(incoming), "saida": _number(outgoing), "saldo": _number(net)})

    categories: dict[str, Decimal] = defaultdict(lambda: ZERO)
    customers: dict[str, dict[str, Decimal]] = {}
    sales = []
    for transaction in selected:
        amount = _decimal(transaction.get("valor"))
        kind = transaction.get("tipo")
        if kind == "saida":
            categories[transaction.get("categoria") or "Outros"] += amount
        customer = transaction.get("cliente") or "Sem identificação"
        entry = customers.setdefault(customer, {"entrada": ZERO, "saida": ZERO})
        if kind in entry:
            entry[kind] += amount
        cost = _decimal(transaction.get("custo_materia_prima"))
        if kind == "entrada" and cost > 0:
            profit = amount - cost
            sales.append({
                **transaction,
                "lucro": _number(profit),
                "margem": _number(profit / amount * 100) if amount > 0 else None,
            })

    today = date.today()
    receivables = [{**c, "status_real": _account_status(c, "receber", today)} for c in _table(data, "contas_receber", "contasReceber")]
    payables = [{**c, "status_real": _account_status(c, "pagar", today)} for c in _table(data, "contas_pagar", "contasPagar")]
    account_months: dict[str, dict[str, Decimal]] = {}
    upcoming = []
    overdue_count = 0
    until = (today + timedelta(days=30)).isoformat()
    for side, rows in (("receber", receivables), ("pagar", payables)):
        for account in rows:
            key = _month(account.get("vencimento"))
            if key:
                group = account_months.setdefault(key, {"pagar": ZERO, "receber": ZERO})
                group[side] += _decimal(account.get("valor"))
            if account["status_real"] == "atrasado":
                overdue_count += 1
            if account["status_real"] in ("pendente", "atrasado") and account.get("vencimento", "9999-12-31") <= until:
                upcoming.append({
                    "id": account.get("id"),
                    "descricao": account.get("descricao") or "Sem descrição",
                    "valor": _number(_decimal(account.get("valor"))),
                    "vencimento": account.get("vencimento"),
                    "lado": side,
                    "status_real": account["status_real"],
                })

    goals = sorted(_table(data, "metas"), key=lambda goal: (bool(goal.get("mes")), goal.get("mes") or "", goal.get("titulo") or ""))
    # Preserve original insertion priority when more than one goal matches.
    raw_goals = _table(data, "metas")
    specific = next((g for g in raw_goals if month != "todos" and g.get("mes") == month), None)
    general = next((g for g in raw_goals if not g.get("mes")), None)
    active_goal = specific or general
    target = _decimal(active_goal.get("valor")) if active_goal else ZERO

    return {
        "totals": totals,
        "changes": changes,
        "history": history,
        "accounts_history": [
            {"mes": key, "pagar": _number(account_months[key]["pagar"]), "receber": _number(account_months[key]["receber"])}
            for key in sorted(account_months)
        ],
        "categories": [{"nome": name, "valor": _number(amount)} for name, amount in sorted(categories.items(), key=lambda item: (-item[1], item[0]))],
        "customers": [
            {"nome": name, "entrada": _number(values["entrada"]), "saida": _number(values["saida"]), "saldo": _number(values["entrada"] - values["saida"])}
            for name, values in sorted(customers.items(), key=lambda item: (-item[1]["entrada"], item[0]))
        ],
        "sales": sorted(sales, key=lambda row: str(row.get("data") or ""), reverse=True),
        "receivables": sorted((c for c in receivables if month == "todos" or _month(c.get("vencimento")) == month), key=lambda c: c.get("vencimento") or ""),
        "payables": sorted((c for c in payables if month == "todos" or _month(c.get("vencimento")) == month), key=lambda c: c.get("vencimento") or ""),
        "overdue_count": overdue_count,
        "due_soon": sorted(upcoming, key=lambda row: (row["vencimento"], row["descricao"]))[:8],
        "goals": goals,
        "active_goal": dict(active_goal) if active_goal else None,
        "goal_percent": _number(income / target * 100) if target > 0 else None,
    }


def seed_demo(store) -> bool:
    """Populate an empty SQLite demo with fictional packaging-business data.

    This deliberately refuses remote stores. All generated expenses and
    installment accounts go through DashboardService, preserving their links.
    Repeated calls are harmless and existing records are never overwritten.
    Returns True only when demonstration data was created.
    """
    from data import DashboardService, FINANCIAL_TABLES, LocalStore

    if not isinstance(store, LocalStore):
        raise ValueError("Dados de demonstração só podem ser criados no banco local isolado.")
    service = DashboardService(store)
    today = date.today()
    first = today.replace(day=1)
    clients = [
        ("Café Aurora", "Marina Costa"),
        ("Mercado Boa Praça", "Pedro Almeida"),
        ("Flor & Folha", "Luiza Nunes"),
        ("Ateliê do Pão", "Rafael Gomes"),
        ("Casa Amora", "Beatriz Lima"),
        ("Empório da Vila", "Lucas Ferreira"),
    ]
    products = ["Caixa kraft personalizada", "Sacola de papel", "Embalagem para delivery", "Caixa para confeitaria", "Papel de seda", "Caixa para presente"]

    def day(month_date: date, number: int) -> str:
        return month_date.replace(day=min(number, calendar.monthrange(month_date.year, month_date.month)[1])).isoformat()

    with store.transaction():
        if any(store.list(table) for table in FINANCIAL_TABLES):
            return False
        for index, (name, contact) in enumerate(clients, 1):
            service.save("clientes", {
                "nome": name,
                "telefone": "",
                "email": f"cliente{index}@example.com",
                "cpf": "",
                "representante": contact,
            })

        for index in range(6):
            period = _shift_month(first, index - 5)
            key = period.strftime("%Y-%m")
            for customer_index, (name, _) in enumerate(clients):
                for batch in range(2):
                    amount = Decimal(1900 + index * 195 + customer_index * 235 + batch * 310)
                    ratio = Decimal("0.36") + Decimal(customer_index % 3) * Decimal("0.035")
                    service.save("transacoes", {
                        "cliente": name,
                        "valor": _number(amount),
                        "tipo": "entrada",
                        "categoria": "Venda",
                        "data": key,
                        "produto": products[(customer_index + batch) % len(products)],
                        "custo_materia_prima": _number(amount * ratio),
                    })
            for expense_index, (kind, base, note) in enumerate([
                ("Matéria-prima", 4250, "Papel kraft e papelão — lote de demonstração"),
                ("Produção", 1950, "Tintas, adesivos e acabamento — demonstração"),
                ("Fretes", 620, "Entregas locais — demonstração"),
                ("Manutenção", 350, "Revisão dos equipamentos — demonstração"),
            ]):
                service.save("materia_primas", {
                    "tipo": kind,
                    "valor": base + index * (95 + expense_index * 15),
                    "data": day(period, 4 + expense_index * 5),
                    "observacao": note,
                })
            for supplier, category, amount in [
                ("Equipe de produção", "Salário", 6900 + index * 120),
                ("Espaço Vila", "Aluguel", 2400),
                ("Tributos da operação", "Imposto", 1250 + index * 95),
            ]:
                service.save("transacoes", {"cliente": supplier, "valor": amount, "tipo": "saida", "categoria": category, "data": key})

            if index < 5:
                service.save("contas_receber", {
                    "descricao": "Projeto de embalagens sob medida",
                    "cliente": clients[index % len(clients)][0],
                    "valor": 1450 + index * 140,
                    "vencimento": day(period, 16),
                    "status": "recebido",
                    "forma_pagamento": "pix",
                    "parcelas": 1,
                })
                service.save("contas_pagar", {
                    "descricao": "Serviços de impressão",
                    "fornecedor": "Gráfica Horizonte (exemplo)",
                    "valor": 780 + index * 60,
                    "vencimento": day(period, 19),
                    "status": "pago",
                    "forma_pagamento": "pix",
                    "parcelas": 1,
                })

        installments = service.save("contas_receber", {
            "descricao": "Coleção de caixas premium",
            "cliente": "Casa Amora",
            "valor": 9600,
            "vencimento": day(_shift_month(first, -2), 24),
            "status": "pendente",
            "forma_pagamento": "cartao_credito",
            "parcelas": 3,
        })
        for account in installments[:-1]:
            service.settle("contas_receber", account["id"])

        for title, client, amount, due in [
            ("Reposição de sacolas kraft", "Mercado Boa Praça", 2480, 6),
            ("Embalagens para a nova coleção", "Flor & Folha", 3850, 18),
            ("Caixas personalizadas — pedido mensal", "Café Aurora", 1920, 27),
        ]:
            service.save("contas_receber", {"descricao": title, "cliente": client, "valor": amount, "vencimento": day(first, due), "status": "pendente", "forma_pagamento": "pix", "parcelas": 1})
        for title, supplier, amount, due in [
            ("Energia e utilidades", "Energia Vila (exemplo)", 890, 8),
            ("Compra de papel certificado", "Papelaria Horizonte (exemplo)", 2140, 17),
            ("Logística de entregas", "Rota Local (exemplo)", 650, 28),
        ]:
            service.save("contas_pagar", {"descricao": title, "fornecedor": supplier, "valor": amount, "vencimento": day(first, due), "status": "pendente", "forma_pagamento": "pix", "parcelas": 1})

        service.save("metas", {"titulo": "Crescimento sustentável", "valor": 60000, "mes": None})
        service.save("metas", {"titulo": "Meta de faturamento do mês", "valor": 60000, "mes": first.strftime("%Y-%m")})
    return True
