import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table"
import { useDashboardData } from "@/context/dashboard-data-context"

function formatarReais(valor) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

export function ResumoClienteTab() {
  const { transacoes } = useDashboardData()

  // Agrupa as transações por cliente, somando entradas e saídas de cada um
  const mapa = new Map()
  for (const t of transacoes) {
    if (!mapa.has(t.cliente)) {
      mapa.set(t.cliente, { nome: t.cliente, totalEntrada: 0, totalSaida: 0 })
    }
    const resumo = mapa.get(t.cliente)
    if (t.tipo === "entrada") {
      resumo.totalEntrada += t.valor
    } else {
      resumo.totalSaida += t.valor
    }
  }

  const resumos = Array.from(mapa.values())

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Cliente</TableHead>
          <TableHead>Total recebido</TableHead>
          <TableHead>Total pago a ele</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {resumos.map((r) => (
          <TableRow key={r.nome}>
            <TableCell className="font-medium">{r.nome}</TableCell>
            <TableCell>{formatarReais(r.totalEntrada)}</TableCell>
            <TableCell>{formatarReais(r.totalSaida)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}