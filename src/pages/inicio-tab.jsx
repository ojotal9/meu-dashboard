import { useState } from "react"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts"
import { useDashboardData } from "@/context/dashboard-data-context"
import { useAuth } from "@/context/auth-context"
import { formatarMesAnoBR } from "@/lib/utils"

function formatarReais(valor) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

// Formato específico pedido para o Saldo: número com separador de milhar e "R$" depois
function formatarSaldo(valor) {
  const numero = Math.abs(valor).toLocaleString("pt-BR")
  const sinal = valor < 0 ? "-" : ""
  return `${sinal}${numero} R$`
}

const CORES = ["#0E6B58", "#9C3B33"]

export function InicioTab() {
  const { clientes, transacoes } = useDashboardData()
  const { sessao, perfil } = useAuth()
  const [mesSelecionado, setMesSelecionado] = useState("todos")

  const nomeExibido = perfil?.nome || sessao?.user?.email?.split("@")[0] || ""

  // Descobre quais meses existem nas transações, pra popular o seletor
  const mesesDisponiveis = Array.from(
    new Set(
      transacoes
        .map((t) => (t.data.length >= 7 ? t.data.slice(0, 7) : null))
        .filter(Boolean)
    )
  ).sort()

  const transacoesFiltradas =
    mesSelecionado === "todos"
      ? transacoes
      : transacoes.filter((t) => t.data.startsWith(mesSelecionado))

  const totalEntrada = transacoesFiltradas
    .filter((t) => t.tipo === "entrada")
    .reduce((soma, t) => soma + t.valor, 0)

  const totalSaida = transacoesFiltradas
    .filter((t) => t.tipo === "saida")
    .reduce((soma, t) => soma + t.valor, 0)

  const saldo = totalEntrada - totalSaida

  const dadosGrafico = [
    { name: "Entradas", value: totalEntrada },
    { name: "Saídas", value: totalSaida },
  ]

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground">
        {nomeExibido ? `Bem-vindo, ${nomeExibido}!` : "Bem-vindo!"} Aqui está um resumo rápido do seu negócio.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
              Clientes cadastrados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="font-mono text-3xl font-medium tabular-nums">{clientes.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
              Transações registradas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="font-mono text-3xl font-medium tabular-nums">{transacoes.length}</div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Resumo financeiro</h2>
        <Select value={mesSelecionado} onValueChange={setMesSelecionado}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Mês">
              {mesSelecionado === "todos" ? "Todos os meses" : formatarMesAnoBR(mesSelecionado)}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os meses</SelectItem>
            {mesesDisponiveis.map((chave) => (
              <SelectItem key={chave} value={chave}>
                {formatarMesAnoBR(chave)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
              Entrada
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="font-mono text-2xl font-medium tabular-nums">{formatarReais(totalEntrada)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
              Saída
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="font-mono text-2xl font-medium tabular-nums">{formatarReais(totalSaida)}</div>
          </CardContent>
        </Card>

        <Card
          className="border-l-4"
          style={{ borderLeftColor: saldo >= 0 ? "var(--color-chart-1)" : "var(--color-chart-2)" }}
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
              Saldo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`font-mono text-2xl font-medium tabular-nums ${saldo < 0 ? "text-destructive" : ""}`}>
              {formatarSaldo(saldo)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Entradas x Saídas</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={dadosGrafico} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" />
              <YAxis type="category" dataKey="name" width={80} />
              <Tooltip formatter={(value) => formatarReais(value)} />
              <Bar dataKey="value" barSize={40}>
                {dadosGrafico.map((_, index) => (
                  <Cell key={index} fill={CORES[index]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  )
}