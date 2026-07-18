import { useState } from "react"
import { Plus, Check, RotateCcw } from "lucide-react"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
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
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table"
import { useDashboardData } from "@/context/dashboard-data-context"
import { useConfirm } from "@/context/confirm-context"
import { formatarDataBR, mascararDataDigitada, dataBrParaIso } from "@/lib/utils"

function formatarReais(valor) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function hojeIso() {
  return new Date().toISOString().slice(0, 10)
}

// Uma conta pendente cujo vencimento já passou é considerada atrasada
function statusReal(conta) {
  if (conta.status === "pago") return "pago"
  return conta.vencimento < hojeIso() ? "atrasado" : "pendente"
}

const ESTILO_STATUS = {
  pendente: "bg-amber-500/15 text-amber-500",
  pago: "bg-emerald-500/15 text-emerald-500",
  atrasado: "bg-destructive/15 text-destructive",
}

const ROTULO_STATUS = {
  pendente: "Pendente",
  pago: "Pago",
  atrasado: "Atrasado",
}

export function ContasPagarTab() {
  const { contasPagar, adicionarContaPagar, marcarContaPagarComoPaga, reabrirContaPagar, removerContaPagar } =
    useDashboardData()
  const confirmar = useConfirm()

  const [dialogoAberto, setDialogoAberto] = useState(false)
  const [descricao, setDescricao] = useState("")
  const [fornecedor, setFornecedor] = useState("")
  const [vencimentoTexto, setVencimentoTexto] = useState("")
  const [valor, setValor] = useState("")

  const contasComStatus = contasPagar.map((c) => ({ ...c, statusReal: statusReal(c) }))
  const totalPendentes = contasComStatus.filter((c) => c.statusReal === "pendente").length
  const totalPagos = contasComStatus.filter((c) => c.statusReal === "pago").length
  const totalAtrasados = contasComStatus.filter((c) => c.statusReal === "atrasado").length

  function limparFormulario() {
    setDescricao("")
    setFornecedor("")
    setVencimentoTexto("")
    setValor("")
    setDialogoAberto(false)
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

    adicionarContaPagar({
      descricao: descricao.trim(),
      fornecedor: fornecedor.trim(),
      vencimento: vencimentoIso,
      valor: valorNumerico,
      status: "pendente",
    })

    limparFormulario()
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground">Gerencie suas despesas e pagamentos</p>
        <Button onClick={() => setDialogoAberto(true)}>
          <Plus />
          Nova Conta
        </Button>
      </div>

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
              Pagos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="font-mono text-3xl font-medium tabular-nums">{totalPagos}</div>
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
                <TableHead>Fornecedor</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contasComStatus.map((conta) => (
                <TableRow key={conta.id}>
                  <TableCell className="font-medium" data-label="Descrição">{conta.descricao}</TableCell>
                  <TableCell data-label="Fornecedor">{conta.fornecedor}</TableCell>
                  <TableCell data-label="Vencimento">{formatarDataBR(conta.vencimento)}</TableCell>
                  <TableCell data-label="Valor">{formatarReais(conta.valor)}</TableCell>
                  <TableCell data-label="Status">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ESTILO_STATUS[conta.statusReal]}`}>
                      {ROTULO_STATUS[conta.statusReal]}
                    </span>
                  </TableCell>
                  <TableCell className="flex gap-2" data-label="Ações">
                    {conta.status === "pago" ? (
                      <Button variant="outline" size="sm" onClick={() => reabrirContaPagar(conta.id)}>
                        <RotateCcw />
                        Reabrir
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" onClick={() => marcarContaPagarComoPaga(conta.id)}>
                        <Check />
                        Pago
                      </Button>
                    )}
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={async () => {
                        if (await confirmar({ titulo: `Remover a conta "${conta.descricao}"?` })) {
                          removerContaPagar(conta.id)
                        }
                      }}
                    >
                      Remover
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={dialogoAberto} onOpenChange={(aberto) => (aberto ? setDialogoAberto(true) : limparFormulario())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova conta a pagar</DialogTitle>
            <DialogDescription>Preencha os dados abaixo e salve.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="descricao-pagar">Descrição</Label>
              <Input id="descricao-pagar" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fornecedor-pagar">Fornecedor</Label>
              <Input id="fornecedor-pagar" value={fornecedor} onChange={(e) => setFornecedor(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="vencimento-pagar">Vencimento</Label>
              <Input
                id="vencimento-pagar"
                placeholder="dd/mm/aaaa"
                value={vencimentoTexto}
                onChange={(e) => setVencimentoTexto(mascararDataDigitada(e.target.value))}
                inputMode="numeric"
                maxLength={10}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="valor-pagar">Valor</Label>
              <Input
                id="valor-pagar"
                placeholder="ex: 150.00"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={limparFormulario}>Cancelar</Button>
            <Button onClick={handleSalvar}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}