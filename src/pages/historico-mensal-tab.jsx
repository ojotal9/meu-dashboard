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

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]

function formatarMes(chave) {
  const [ano, mes] = chave.split("-")
  const numeroMes = parseInt(mes, 10)
  if (!ano || !numeroMes || numeroMes < 1 || numeroMes > 12) return chave
  return `${MESES[numeroMes - 1]} de ${ano}`
}

function formatarReais(valor) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

export function HistoricoMensalTab() {
  const { transacoes } = useDashboardData()
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
    mes: formatarMes(m.chave),
    Entradas: m.entrada,
    Saídas: m.saida,
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
                {formatarMes(m.chave)}
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
            <BarChart data={dadosGrafico}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="mes" />
              <YAxis />
              <Tooltip formatter={(value) => formatarReais(value)} />
              <Legend />
              <Bar dataKey="Entradas" fill="#16a34a" />
              <Bar dataKey="Saídas" fill="#dc2626" />
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
                <TableCell className="font-medium">{formatarMes(m.chave)}</TableCell>
                <TableCell>{formatarReais(m.entrada)}</TableCell>
                <TableCell>{formatarReais(m.saida)}</TableCell>
                <TableCell>
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