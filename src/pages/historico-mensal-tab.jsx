import { useState } from "react"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts"
import { useDashboardData } from "@/context/dashboard-data-context"
import { formatarMesAnoBR } from "@/lib/utils"

function formatarReais(valor) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

export function HistoricoMensalTab() {
  const { transacoes, contasPagar, contasReceber } = useDashboardData()
  const [mesSelecionado, setMesSelecionado] = useState("todos")

  // Agrupa todas as transações por mês (chave "yyyy-MM")
  const mapaMeses = new Map()
  for (const t of transacoes) {
    const chave = t.data.length >= 7 ? t.data.slice(0, 7) : "sem-data"
    if (!mapaMeses.has(chave)) {
      mapaMeses.set(chave, { chave, entrada: 0, saida: 0 })
    }
    const resumo = mapaMeses.get(chave)
    if (t.tipo === "entrada") {
      resumo.entrada += t.valor
    } else {
      resumo.saida += t.valor
    }
  }

  const mesesOrdenados = Array.from(mapaMeses.values()).sort((a, b) =>
    a.chave.localeCompare(b.chave)
  )

  const mesesFiltrados =
    mesSelecionado === "todos"
      ? mesesOrdenados
      : mesesOrdenados.filter((m) => m.chave === mesSelecionado)

  const dadosGrafico = mesesFiltrados.map((m) => ({
    mes: formatarMesAnoBR(m.chave),
    Entradas: m.entrada,
    Saídas: m.saida,
  }))

  // Agrupa contas a pagar e a receber pelo mês de vencimento (chave "yyyy-MM")
  const mapaContas = new Map()
  for (const c of contasPagar) {
    const chave = c.vencimento?.slice(0, 7)
    if (!chave) continue
    if (!mapaContas.has(chave)) mapaContas.set(chave, { chave, pagar: 0, receber: 0 })
    mapaContas.get(chave).pagar += c.valor
  }
  for (const c of contasReceber) {
    const chave = c.vencimento?.slice(0, 7)
    if (!chave) continue
    if (!mapaContas.has(chave)) mapaContas.set(chave, { chave, pagar: 0, receber: 0 })
    mapaContas.get(chave).receber += c.valor
  }

  const contasOrdenadas = Array.from(mapaContas.values()).sort((a, b) =>
    a.chave.localeCompare(b.chave)
  )

  const contasFiltradas =
    mesSelecionado === "todos"
      ? contasOrdenadas
      : contasOrdenadas.filter((m) => m.chave === mesSelecionado)

  const dadosGraficoContas = contasFiltradas.map((m) => ({
    mes: formatarMesAnoBR(m.chave),
    "Contas a Pagar": m.pagar,
    "Contas a Receber": m.receber,
  }))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Select value={mesSelecionado} onValueChange={setMesSelecionado}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Mês" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os meses</SelectItem>
            {mesesOrdenados.map((m) => (
              <SelectItem key={m.chave} value={m.chave}>
                {formatarMesAnoBR(m.chave)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Entradas e saídas por mês</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={dadosGrafico} barGap={4} barCategoryGap="25%">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="mes"
                tick={{ fontSize: 13, fontWeight: 700, fill: "var(--color-foreground)" }}
                tickMargin={10}
              />
              <YAxis />
              <Tooltip formatter={(value) => formatarReais(value)} />
              <Legend />
              <Bar dataKey="Entradas" fill="#16a34a" barSize={18} radius={[3, 3, 0, 0]} />
              <Bar dataKey="Saídas" fill="#dc2626" barSize={18} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contas a Pagar x Contas a Receber por mês</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={dadosGraficoContas} barGap={4} barCategoryGap="25%">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="mes"
                tick={{ fontSize: 13, fontWeight: 700, fill: "var(--color-foreground)" }}
                tickMargin={10}
              />
              <YAxis />
              <Tooltip formatter={(value) => formatarReais(value)} />
              <Legend />
              <Bar dataKey="Contas a Pagar" fill="#dc2626" barSize={18} radius={[3, 3, 0, 0]} />
              <Bar dataKey="Contas a Receber" fill="#16a34a" barSize={18} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Mês</TableHead>
            <TableHead>Entradas</TableHead>
            <TableHead>Saídas</TableHead>
            <TableHead>Lucro/Prejuízo</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {mesesFiltrados.map((m) => {
            const resultado = m.entrada - m.saida
            return (
              <TableRow key={m.chave}>
                <TableCell className="font-medium" data-label="Mês">{formatarMesAnoBR(m.chave)}</TableCell>
                <TableCell data-label="Entradas">{formatarReais(m.entrada)}</TableCell>
                <TableCell data-label="Saídas">{formatarReais(m.saida)}</TableCell>
                <TableCell data-label="Lucro/Prejuízo">
                  {resultado < 0 ? "- " : ""}
                  {formatarReais(Math.abs(resultado))}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}