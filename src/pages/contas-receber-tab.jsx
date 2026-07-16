import { useState } from "react"
import { Plus, Check, RotateCcw } from "lucide-react"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table"
import { useDashboardData } from "@/context/dashboard-data-context"
import { formatarDataBR, mascararDataDigitada, dataBrParaIso } from "@/lib/utils"

function formatarReais(valor) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function hojeIso() {
  return new Date().toISOString().slice(0, 10)
}

// Uma conta pendente cujo vencimento já passou é considerada atrasada
function statusReal(conta) {
  if (conta.status === "recebido") return "recebido"
  return conta.vencimento < hojeIso() ? "atrasado" : "pendente"
}

const ESTILO_STATUS = {
  pendente: "bg-amber-500/15 text-amber-500",
  recebido: "bg-emerald-500/15 text-emerald-500",
  atrasado: "bg-destructive/15 text-destructive",
}

const ROTULO_STATUS = {
  pendente: "Pendente",
  recebido: "Recebido",
  atrasado: "Atrasado",
}

export function ContasReceberTab() {
  const { contasReceber, adicionarContaReceber, marcarContaReceberComoRecebida, reabrirContaReceber, removerContaReceber } =
    useDashboardData()

  const [mostrarFormulario, setMostrarFormulario] = useState(false)
  const [descricao, setDescricao] = useState("")
  const [cliente, setCliente] = useState("")
  const [vencimentoTexto, setVencimentoTexto] = useState("")
  const [valor, setValor] = useState("")

  const contasComStatus = contasReceber.map((c) => ({ ...c, statusReal: statusReal(c) }))
  const totalPendentes = contasComStatus.filter((c) => c.statusReal === "pendente").length
  const totalRecebidos = contasComStatus.filter((c) => c.statusReal === "recebido").length
  const totalAtrasados = contasComStatus.filter((c) => c.statusReal === "atrasado").length

  function limparFormulario() {
    setDescricao("")
    setCliente("")
    setVencimentoTexto("")
    setValor("")
    setMostrarFormulario(false)
  }

  function handleSalvar() {
    const valorTexto = valor.trim().replace(",", ".")
    const vencimentoIso = dataBrParaIso(vencimentoTexto)

    if (!descricao.trim() || !valorTexto || !vencimentoIso) {
      alert("Preencha descrição, valor e uma data de vencimento válida (dd/mm/aaaa)")
      return
    }

    const valorNumerico = parseFloat(valorTexto)
    if (isNaN(valorNumerico)) {
      alert("Digite o valor usando só números, tipo 150.00")
      return
    }

    adicionarContaReceber({
      descricao: descricao.trim(),
      cliente: cliente.trim(),
      vencimento: vencimentoIso,
      valor: valorNumerico,
      status: "pendente",
    })

    limparFormulario()
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground">Gerencie suas receitas e recebimentos</p>
        <Button onClick={() => setMostrarFormulario((v) => !v)}>
          <Plus />
          Nova Conta
        </Button>
      </div>

      {mostrarFormulario && (
        <Card>
          <CardHeader>
            <CardTitle>Nova conta a receber</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="descricao-receber">Descrição</Label>
              <Input id="descricao-receber" value={descricao} onChange={(e) => setDescricao(e.target.value)} className="w-[200px]" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cliente-receber">Cliente</Label>
              <Input id="cliente-receber" value={cliente} onChange={(e) => setCliente(e.target.value)} className="w-[180px]" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="vencimento-receber">Vencimento</Label>
              <Input
                id="vencimento-receber"
                placeholder="dd/mm/aaaa"
                value={vencimentoTexto}
                onChange={(e) => setVencimentoTexto(mascararDataDigitada(e.target.value))}
                inputMode="numeric"
                maxLength={10}
                className="w-[140px]"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="valor-receber">Valor</Label>
              <Input
                id="valor-receber"
                placeholder="ex: 150.00"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                className="w-[140px]"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSalvar}>Salvar</Button>
              <Button variant="outline" onClick={limparFormulario}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="border-l-4 border-l-amber-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
              Pendentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="font-mono text-3xl font-medium tabular-nums">{totalPendentes}</div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-emerald-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
              Recebidos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="font-mono text-3xl font-medium tabular-nums">{totalRecebidos}</div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-destructive">
          <CardHeader className="pb-2">
            <CardTitle className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
              Atrasados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="font-mono text-3xl font-medium tabular-nums">{totalAtrasados}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Todas as Contas</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Descrição</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contasComStatus.map((conta) => (
                <TableRow key={conta.id}>
                  <TableCell className="font-medium">{conta.descricao}</TableCell>
                  <TableCell>{conta.cliente}</TableCell>
                  <TableCell>{formatarDataBR(conta.vencimento)}</TableCell>
                  <TableCell>{formatarReais(conta.valor)}</TableCell>
                  <TableCell>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ESTILO_STATUS[conta.statusReal]}`}>
                      {ROTULO_STATUS[conta.statusReal]}
                    </span>
                  </TableCell>
                  <TableCell className="flex gap-2">
                    {conta.status === "recebido" ? (
                      <Button variant="outline" size="sm" onClick={() => reabrirContaReceber(conta.id)}>
                        <RotateCcw />
                        Reabrir
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" onClick={() => marcarContaReceberComoRecebida(conta.id)}>
                        <Check />
                        Recebido
                      </Button>
                    )}
                    <Button variant="destructive" size="sm" onClick={() => removerContaReceber(conta.id)}>
                      Remover
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}