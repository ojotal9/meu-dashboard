import { useState } from "react"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table"
import { CampoBusca } from "@/components/campo-busca"
import { CabecalhoOrdenavel } from "@/components/cabecalho-ordenavel"
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
import { formatarMesAnoBR, estiloTooltipGrafico, ordenarLista } from "@/lib/utils"

function formatarReais(valor) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

export function MargemProdutoTab() {
  const { transacoes } = useDashboardData()
  const [busca, setBusca] = useState("")
  const [ordenacao, setOrdenacao] = useState({ coluna: "data", direcao: "desc" })

  function aoClicarColuna(coluna) {
    setOrdenacao((o) =>
      o.coluna === coluna ? { coluna, direcao: o.direcao === "asc" ? "desc" : "asc" } : { coluna, direcao: "desc" }
    )
  }

  // Só entram aqui as vendas que já tiveram o custo de matéria-prima informado —
  // é isso que permite calcular o lucro daquela venda específica.
  const vendas = transacoes
    .filter((t) => t.tipo === "entrada" && t.custo_materia_prima > 0)
    .map((t) => ({
      ...t,
      lucro: t.valor - t.custo_materia_prima,
      lucroPercentual: t.valor > 0 ? ((t.valor - t.custo_materia_prima) / t.valor) * 100 : null,
    }))

  const termo = busca.trim().toLowerCase()
  const vendasFiltradas = termo
    ? vendas.filter((v) => [v.cliente, v.produto].some((campo) => campo?.toLowerCase().includes(termo)))
    : vendas

  const vendasOrdenadas = ordenarLista(vendasFiltradas, ordenacao.coluna, ordenacao.direcao)

  const totalReceita = vendas.reduce((soma, v) => soma + v.valor, 0)
  const totalCusto = vendas.reduce((soma, v) => soma + v.custo_materia_prima, 0)
  const totalLucro = totalReceita - totalCusto

  // Agrupa por produto (quando informado) só pro gráfico — o lucro em si já vem pronto por venda
  const mapaPorProduto = new Map()
  for (const v of vendas) {
    const chave = v.produto || "Sem produto"
    if (!mapaPorProduto.has(chave)) mapaPorProduto.set(chave, { produto: chave, receita: 0, custo: 0 })
    const linha = mapaPorProduto.get(chave)
    linha.receita += v.valor
    linha.custo += v.custo_materia_prima
  }
  const dadosGrafico = Array.from(mapaPorProduto.values())
    .sort((a, b) => b.receita - a.receita)
    .slice(0, 8)
    .map((l) => ({ produto: l.produto, Receita: l.receita, Custo: l.custo }))

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground">
        Mostra o lucro de cada venda, descontando o custo de matéria-prima que você informar nela.
        Pra uma venda aparecer aqui, preencha o campo "Custo da matéria-prima" na aba de Transações.
      </p>

      {vendas.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Nenhuma venda com custo informado ainda. Vá em Transações, adicione (ou edite) uma venda e
            preencha o campo "Custo da matéria-prima" pra ver o lucro dela aqui.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 grade-anima">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                  Receita das vendas
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="font-mono text-2xl font-medium tabular-nums">{formatarReais(totalReceita)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                  Custo de matéria-prima
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="font-mono text-2xl font-medium tabular-nums">{formatarReais(totalCusto)}</div>
              </CardContent>
            </Card>
            <Card
              className="border-l-4"
              style={{ borderLeftColor: totalLucro >= 0 ? "var(--color-chart-1)" : "var(--color-chart-2)" }}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                  Lucro total
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`font-mono text-2xl font-medium tabular-nums ${totalLucro < 0 ? "text-destructive" : ""}`}>
                  {formatarReais(totalLucro)}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Receita x Custo por produto</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={dadosGrafico} barGap={4} barCategoryGap="25%">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="produto"
                    tick={{ fontSize: 12, fontWeight: 600, fill: "var(--color-foreground)" }}
                    tickMargin={10}
                  />
                  <YAxis />
                  <Tooltip formatter={(value) => formatarReais(value)} {...estiloTooltipGrafico} />
                  <Legend />
                  <Bar dataKey="Receita" fill="var(--color-chart-1)" barSize={18} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Custo" fill="var(--color-chart-2)" barSize={18} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <CampoBusca value={busca} onChange={setBusca} placeholder="Buscar por cliente ou produto..." />

          <Table>
            <TableHeader>
              <TableRow>
                <CabecalhoOrdenavel coluna="cliente" ordenacao={ordenacao} aoClicar={aoClicarColuna}>Cliente</CabecalhoOrdenavel>
                <TableHead>Produto</TableHead>
                <CabecalhoOrdenavel coluna="data" ordenacao={ordenacao} aoClicar={aoClicarColuna}>Data</CabecalhoOrdenavel>
                <CabecalhoOrdenavel coluna="valor" ordenacao={ordenacao} aoClicar={aoClicarColuna}>Venda</CabecalhoOrdenavel>
                <CabecalhoOrdenavel coluna="custo_materia_prima" ordenacao={ordenacao} aoClicar={aoClicarColuna}>Custo</CabecalhoOrdenavel>
                <CabecalhoOrdenavel coluna="lucro" ordenacao={ordenacao} aoClicar={aoClicarColuna}>Lucro</CabecalhoOrdenavel>
                <TableHead>Lucro %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vendasOrdenadas.map((v) => (
                <TableRow key={v.id}>
                  <TableCell className="font-medium" data-label="Cliente">{v.cliente}</TableCell>
                  <TableCell data-label="Produto">{v.produto || "—"}</TableCell>
                  <TableCell data-label="Data">{formatarMesAnoBR(v.data)}</TableCell>
                  <TableCell data-label="Venda">{formatarReais(v.valor)}</TableCell>
                  <TableCell data-label="Custo">{formatarReais(v.custo_materia_prima)}</TableCell>
                  <TableCell
                    data-label="Lucro"
                    className={v.lucro < 0 ? "font-medium text-destructive" : "font-medium text-emerald-600"}
                  >
                    {formatarReais(v.lucro)}
                  </TableCell>
                  <TableCell data-label="Lucro %">
                    {v.lucroPercentual === null ? "—" : `${v.lucroPercentual.toFixed(1)}%`}
                  </TableCell>
                </TableRow>
              ))}
              {vendasOrdenadas.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="celula-vazia text-center text-muted-foreground">
                    Nenhuma venda encontrada
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </>
      )}
    </div>
  )
}
