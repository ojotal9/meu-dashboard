import { useState } from "react"
import { AlertTriangle, TrendingUp, TrendingDown, Minus, Users, Receipt, ArrowRightLeft, Scale, Target } from "lucide-react"
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
} from "recharts"
import { useDashboardData } from "@/context/dashboard-data-context"
import { useAuth } from "@/context/auth-context"
import { formatarMesAnoBR, estiloTooltipGrafico } from "@/lib/utils"

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

function calcularVariacao(atual, anterior) {
  if (anterior === 0) return atual === 0 ? 0 : null
  return ((atual - anterior) / Math.abs(anterior)) * 100
}

export function InicioTab({ onNavegar }) {
  const { clientes, transacoes, contasPagar, contasReceber, meta, definirMeta } = useDashboardData()
  const { sessao, perfil, podeAcessar } = useAuth()
  const [mesSelecionado, setMesSelecionado] = useState("todos")
  const [dialogoMetaAberto, setDialogoMetaAberto] = useState(false)
  const [metaTexto, setMetaTexto] = useState("")

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

  function abrirDialogoMeta() {
    setMetaTexto(meta > 0 ? String(meta).replace(".", ",") : "")
    setDialogoMetaAberto(true)
  }

  function handleSalvarMeta() {
    const valorTexto = metaTexto.trim().replace(",", ".")
    const valorNumerico = parseFloat(valorTexto)
    if (!valorTexto || isNaN(valorNumerico) || valorNumerico < 0) {
      alert("Digite um valor de meta válido, tipo 10000.00")
      return
    }
    definirMeta(valorNumerico)
    setDialogoMetaAberto(false)
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
              <Users className="h-3.5 w-3.5" />
              Clientes cadastrados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="font-mono text-3xl font-medium tabular-nums">{clientes.length}</div>
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
            <div className="font-mono text-3xl font-medium tabular-nums">{transacoes.length}</div>
          </CardContent>
        </Card>
      </div>

      <h2 className="titulo-secao">
        <Receipt className="h-3.5 w-3.5" />
        Comparativo Mensal
      </h2>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
              Entrada este mês
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            <div className="font-mono text-2xl font-medium tabular-nums">{formatarReais(totalMesAtual.entrada)}</div>
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
            <div className="font-mono text-2xl font-medium tabular-nums">{formatarReais(totalMesAtual.saida)}</div>
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
              {formatarSaldo(totalMesAtual.saldo)}
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
          <CardAction>
            <Button size="sm" variant="outline" onClick={abrirDialogoMeta}>
              <Target />
              {meta > 0 ? "Editar meta" : "Definir meta"}
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={dadosGrafico} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" />
              <YAxis type="category" dataKey="name" width={80} />
              <Tooltip
                formatter={(value) => formatarReais(value)}
                {...estiloTooltipGrafico}
              />
              <Bar dataKey="value" barSize={40}>
                {dadosGrafico.map((_, index) => (
                  <Cell key={index} fill={CORES[index]} />
                ))}
              </Bar>
              {meta > 0 && (
                <ReferenceLine
                  x={meta}
                  stroke="var(--color-foreground)"
                  strokeDasharray="6 4"
                  strokeWidth={1.5}
                  label={{
                    value: `Meta: ${formatarReais(meta)}`,
                    position: "insideTopRight",
                    fill: "var(--color-foreground)",
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                />
              )}
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Dialog open={dialogoMetaAberto} onOpenChange={setDialogoMetaAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Definir meta</DialogTitle>
            <DialogDescription>
              Esse valor aparece como uma linha de referência no gráfico de Entradas x Saídas, pra você ver se bateu a meta.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="valor-meta">Valor da meta</Label>
            <Input
              id="valor-meta"
              placeholder="ex: 10000.00"
              value={metaTexto}
              onChange={(e) => setMetaTexto(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogoMetaAberto(false)}>Cancelar</Button>
            <Button onClick={handleSalvarMeta}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}