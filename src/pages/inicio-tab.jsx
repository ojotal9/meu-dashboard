import { useState } from "react"
import { AlertTriangle, TrendingUp, TrendingDown, Minus, Users, Receipt, ArrowRightLeft, Scale, Target, Pencil, Trash2 } from "lucide-react"
import { Card, CardHeader, CardTitle, CardAction, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
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
  ReferenceLine,
  LabelList,
} from "recharts"
import { useDashboardData } from "@/context/dashboard-data-context"
import { useAuth } from "@/context/auth-context"
import { formatarMesAnoBR, estiloTooltipGrafico } from "@/lib/utils"
import { useContagemAnimada } from "@/hooks/use-contagem-animada"

function formatarReais(valor) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

// Formato específico pedido para o Saldo: número com separador de milhar e "R$" depois
function formatarSaldo(valor) {
  const numero = Math.abs(valor).toLocaleString("pt-BR")
  const sinal = valor < 0 ? "-" : ""
  return `${sinal}${numero} R$`
}

const CORES = ["var(--color-chart-1)", "var(--color-chart-2)"]

// Mostra a variação percentual em relação ao mês passado, com seta e cor.
// "invertido" é usado pra Saída, onde subir é ruim (vermelho) e descer é bom (verde).
function IndicadorVariacao({ percentual, invertido = false }) {
  if (percentual === null) {
    return <span className="text-xs text-muted-foreground">Sem dados do mês passado</span>
  }
  if (percentual === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
        <Minus className="h-3.5 w-3.5" />
        Igual ao mês passado
      </span>
    )
  }

  const subiu = percentual > 0
  const positivo = invertido ? !subiu : subiu
  const Icone = subiu ? TrendingUp : TrendingDown

  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${positivo ? "text-emerald-500" : "text-destructive"}`}>
      <Icone className="h-3.5 w-3.5" />
      {Math.abs(percentual).toFixed(0)}% vs mês passado
    </span>
  )
}

// Bandeirinha desenhada no topo da linha de meta, com um ponto pulsante embaixo
// marcando onde a linha cruza o gráfico — mais chamativo que um rótulo de texto simples.
function BandeiraMeta({ viewBox, texto }) {
  const { x, y, height } = viewBox
  const largura = Math.max(74, texto.length * 6.5)
  const alturaBandeira = 22

  return (
    <g>
      <line
        x1={x}
        y1={y}
        x2={x}
        y2={y + height}
        stroke="var(--color-foreground)"
        strokeDasharray="6 4"
        strokeWidth={1.5}
        opacity={0.6}
      />
      <rect
        x={x - largura / 2}
        y={y - alturaBandeira - 8}
        width={largura}
        height={alturaBandeira}
        rx={alturaBandeira / 2}
        fill="var(--color-foreground)"
      />
      <polygon
        points={`${x - 5},${y - 8} ${x + 5},${y - 8} ${x},${y - 1}`}
        fill="var(--color-foreground)"
      />
      <text
        x={x}
        y={y - alturaBandeira / 2 - 8 + 4}
        textAnchor="middle"
        fontSize={11}
        fontWeight={700}
        fill="var(--color-background)"
      >
        {texto}
      </text>
      <circle cx={x} cy={y + height} r={7} fill="var(--color-foreground)" opacity={0.35} className="ponto-meta-pulso" />
      <circle cx={x} cy={y + height} r={4} fill="var(--color-foreground)" />
    </g>
  )
}

function calcularVariacao(atual, anterior) {
  if (anterior === 0) return atual === 0 ? 0 : null
  return ((atual - anterior) / Math.abs(anterior)) * 100
}

export function InicioTab({ onNavegar }) {
  const { clientes, transacoes, contasPagar, contasReceber, metas, adicionarMeta, atualizarMeta, removerMeta } = useDashboardData()
  const { sessao, perfil, podeAcessar } = useAuth()
  const [mesSelecionado, setMesSelecionado] = useState("todos")
  const [dialogoMetasAberto, setDialogoMetasAberto] = useState(false)
  const [editandoMetaId, setEditandoMetaId] = useState(null)
  const [tituloMeta, setTituloMeta] = useState("")
  const [valorMetaTexto, setValorMetaTexto] = useState("")
  const [mesMetaTexto, setMesMetaTexto] = useState("")

  const nomeExibido = perfil?.nome || sessao?.user?.email?.split("@")[0] || ""

  const hojeIso = new Date().toISOString().slice(0, 10)
  const pagarAtrasadas = contasPagar.filter((c) => c.status === "pendente" && c.vencimento < hojeIso)
  const receberAtrasadas = contasReceber.filter((c) => c.status === "pendente" && c.vencimento < hojeIso)
  const mostrarAlertaPagar = pagarAtrasadas.length > 0 && podeAcessar("contas-pagar")
  const mostrarAlertaReceber = receberAtrasadas.length > 0 && podeAcessar("contas-receber")

  // ---------- Comparativo: mês atual x mês anterior (independe do filtro abaixo) ----------
  const hoje = new Date()
  const mesAtualChave = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`
  const dataMesAnterior = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)
  const mesAnteriorChave = `${dataMesAnterior.getFullYear()}-${String(dataMesAnterior.getMonth() + 1).padStart(2, "0")}`

  function totaisDoMes(chave) {
    const doMes = transacoes.filter((t) => t.data === chave)
    const entrada = doMes.filter((t) => t.tipo === "entrada").reduce((soma, t) => soma + t.valor, 0)
    const saida = doMes.filter((t) => t.tipo === "saida").reduce((soma, t) => soma + t.valor, 0)
    return { entrada, saida, saldo: entrada - saida }
  }

  const totalMesAtual = totaisDoMes(mesAtualChave)
  const totalMesAnterior = totaisDoMes(mesAnteriorChave)

  const variacaoEntrada = calcularVariacao(totalMesAtual.entrada, totalMesAnterior.entrada)
  const variacaoSaida = calcularVariacao(totalMesAtual.saida, totalMesAnterior.saida)
  const variacaoSaldo = calcularVariacao(totalMesAtual.saldo, totalMesAnterior.saldo)

  // ---------- Resumo financeiro filtrável por mês ----------
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

  // Números que "contam" suavemente até o valor novo, em vez de trocar de uma vez
  const clientesAnimado = useContagemAnimada(clientes.length)
  const transacoesAnimado = useContagemAnimada(transacoes.length)
  const entradaMesAnimado = useContagemAnimada(totalMesAtual.entrada)
  const saidaMesAnimado = useContagemAnimada(totalMesAtual.saida)
  const saldoMesAnimado = useContagemAnimada(totalMesAtual.saldo)
  const entradaAnimado = useContagemAnimada(totalEntrada)
  const saidaAnimado = useContagemAnimada(totalSaida)
  const saldoAnimado = useContagemAnimada(saldo)

  // ---------- Metas ----------
  // Prioridade: se existir uma meta específica pro mês selecionado, ela vale.
  // Sem meta específica, cai pra meta "geral" (sem mês definido), se houver uma.
  const metaEspecifica = mesSelecionado !== "todos" ? metas.find((m) => m.mes === mesSelecionado) : null
  const metaGeral = metas.find((m) => !m.mes)
  const metaAplicavel = metaEspecifica || metaGeral || null
  const valorMetaAtual = metaAplicavel?.valor || 0

  const metasOrdenadas = [...metas].sort((a, b) => {
    if (!a.mes && b.mes) return -1
    if (a.mes && !b.mes) return 1
    return (a.mes || "").localeCompare(b.mes || "")
  })

  function limparFormularioMeta() {
    setEditandoMetaId(null)
    setTituloMeta("")
    setValorMetaTexto("")
    setMesMetaTexto("")
  }

  function abrirDialogoMetas() {
    limparFormularioMeta()
    setDialogoMetasAberto(true)
  }

  function abrirEdicaoMeta(item) {
    setEditandoMetaId(item.id)
    setTituloMeta(item.titulo)
    setValorMetaTexto(String(item.valor).replace(".", ","))
    setMesMetaTexto(item.mes || "")
  }

  function handleSalvarMeta() {
    const valorTexto = valorMetaTexto.trim().replace(",", ".")
    const valorNumerico = parseFloat(valorTexto)
    if (!tituloMeta.trim() || !valorTexto || isNaN(valorNumerico) || valorNumerico < 0) {
      alert("Preencha um título e um valor de meta válido, tipo 10000.00")
      return
    }

    const dadosMeta = {
      titulo: tituloMeta.trim(),
      valor: valorNumerico,
      mes: mesMetaTexto || null,
    }

    if (editandoMetaId) {
      atualizarMeta(editandoMetaId, dadosMeta)
    } else {
      adicionarMeta(dadosMeta)
    }

    limparFormularioMeta()
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground">
        {nomeExibido ? `Bem-vindo, ${nomeExibido}!` : "Bem-vindo!"} Aqui está um resumo rápido do seu negócio.
      </p>

      {(mostrarAlertaPagar || mostrarAlertaReceber) && (
        <Card className="border-l-4 border-l-destructive bg-destructive/5">
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
              <div className="flex flex-col gap-0.5 text-sm">
                {mostrarAlertaPagar && (
                  <span>
                    Você tem <strong>{pagarAtrasadas.length}</strong> conta(s) a pagar atrasada(s).
                  </span>
                )}
                {mostrarAlertaReceber && (
                  <span>
                    Você tem <strong>{receberAtrasadas.length}</strong> conta(s) a receber atrasada(s).
                  </span>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              {mostrarAlertaPagar && (
                <Button size="sm" variant="outline" onClick={() => onNavegar?.("contas-pagar")}>
                  Ver contas a pagar
                </Button>
              )}
              {mostrarAlertaReceber && (
                <Button size="sm" variant="outline" onClick={() => onNavegar?.("contas-receber")}>
                  Ver contas a receber
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 grade-anima">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
              <Users className="h-3.5 w-3.5" />
              Clientes cadastrados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="font-mono text-3xl font-medium tabular-nums">{Math.round(clientesAnimado)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
              <ArrowRightLeft className="h-3.5 w-3.5" />
              Transações registradas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="font-mono text-3xl font-medium tabular-nums">{Math.round(transacoesAnimado)}</div>
          </CardContent>
        </Card>
      </div>

      <h2 className="titulo-secao">
        <Receipt className="h-3.5 w-3.5" />
        Comparativo Mensal
      </h2>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 grade-anima">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
              Entrada este mês
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            <div className="font-mono text-2xl font-medium tabular-nums">{formatarReais(entradaMesAnimado)}</div>
            <IndicadorVariacao percentual={variacaoEntrada} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
              Saída este mês
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            <div className="font-mono text-2xl font-medium tabular-nums">{formatarReais(saidaMesAnimado)}</div>
            <IndicadorVariacao percentual={variacaoSaida} invertido />
          </CardContent>
        </Card>

        <Card
          className="border-l-4"
          style={{ borderLeftColor: totalMesAtual.saldo >= 0 ? "var(--color-chart-1)" : "var(--color-chart-2)" }}
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
              Saldo este mês
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            <div className={`font-mono text-2xl font-medium tabular-nums ${totalMesAtual.saldo < 0 ? "text-destructive" : ""}`}>
              {formatarSaldo(saldoMesAnimado)}
            </div>
            <IndicadorVariacao percentual={variacaoSaldo} />
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-between border-b border-border pb-2">
        <h2 className="flex items-center gap-1.5 text-[13px] font-semibold tracking-wide text-muted-foreground uppercase">
          <Scale className="h-3.5 w-3.5" />
          Resumo financeiro
        </h2>
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 grade-anima">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
              Entrada
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="font-mono text-2xl font-medium tabular-nums">{formatarReais(entradaAnimado)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
              Saída
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="font-mono text-2xl font-medium tabular-nums">{formatarReais(saidaAnimado)}</div>
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
              {formatarSaldo(saldoAnimado)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Entradas x Saídas</CardTitle>
          {metaAplicavel && (
            <p className="text-xs text-muted-foreground">Meta ativa: {metaAplicavel.titulo}</p>
          )}
          <CardAction>
            <Button size="sm" variant="outline" onClick={abrirDialogoMetas}>
              <Target />
              Gerenciar metas
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={dadosGrafico} layout="vertical" margin={{ left: 20, top: 28, right: 70 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" />
              <YAxis type="category" dataKey="name" width={80} />
              <Tooltip
                formatter={(value, name) => {
                  if (name === "Entradas" && valorMetaAtual > 0) {
                    const percentual = Math.round((value / valorMetaAtual) * 100)
                    return [`${formatarReais(value)}  ·  ${percentual}% da meta`, name]
                  }
                  return [formatarReais(value), name]
                }}
                {...estiloTooltipGrafico}
              />
              <Bar dataKey="value" barSize={40}>
                {dadosGrafico.map((_, index) => (
                  <Cell key={index} fill={CORES[index]} />
                ))}
                {valorMetaAtual > 0 && totalEntrada >= valorMetaAtual && (
                  <LabelList
                    dataKey="value"
                    content={({ x, y, width, height, index }) =>
                      index === 0 ? (
                        <text
                          x={x + width + 10}
                          y={y + height / 2 + 4}
                          fontSize={12}
                          fontWeight={700}
                          fill="var(--color-chart-1)"
                        >
                          🎯 Meta batida
                        </text>
                      ) : null
                    }
                  />
                )}
              </Bar>
              {valorMetaAtual > 0 && (
                <ReferenceLine
                  x={valorMetaAtual}
                  stroke="transparent"
                  label={(props) => <BandeiraMeta {...props} texto={formatarReais(valorMetaAtual)} />}
                />
              )}
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Dialog open={dialogoMetasAberto} onOpenChange={setDialogoMetasAberto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Metas</DialogTitle>
            <DialogDescription>
              Uma meta "geral" vale sempre. Uma meta com mês específico tem prioridade sobre a geral
              quando esse mês estiver selecionado no Resumo financeiro.
            </DialogDescription>
          </DialogHeader>

          <div className="flex max-h-56 flex-col gap-2 overflow-y-auto">
            {metasOrdenadas.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhuma meta cadastrada ainda.</p>
            )}
            {metasOrdenadas.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-2 rounded-md border border-border p-2"
              >
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{item.titulo}</span>
                  <span className="text-xs text-muted-foreground">
                    {item.mes ? formatarMesAnoBR(item.mes) : "Meta geral"} · {formatarReais(item.valor)}
                  </span>
                </div>
                <div className="flex gap-1">
                  <Button size="icon-sm" variant="ghost" onClick={() => abrirEdicaoMeta(item)}>
                    <Pencil />
                  </Button>
                  <Button size="icon-sm" variant="ghost" onClick={() => removerMeta(item.id)}>
                    <Trash2 />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-3 border-t border-border pt-3">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {editandoMetaId ? "Editar meta" : "Nova meta"}
            </p>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="titulo-meta">Título</Label>
              <Input
                id="titulo-meta"
                placeholder="ex: Meta de vendas"
                value={tituloMeta}
                onChange={(e) => setTituloMeta(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="valor-meta">Valor</Label>
              <Input
                id="valor-meta"
                placeholder="ex: 10000.00"
                value={valorMetaTexto}
                onChange={(e) => setValorMetaTexto(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="mes-meta">Mês (opcional — deixe vazio pra meta geral)</Label>
              <Input
                id="mes-meta"
                type="month"
                value={mesMetaTexto}
                onChange={(e) => setMesMetaTexto(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            {editandoMetaId && (
              <Button variant="outline" onClick={limparFormularioMeta}>
                Cancelar edição
              </Button>
            )}
            <Button onClick={handleSalvarMeta}>{editandoMetaId ? "Salvar alterações" : "Adicionar meta"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}