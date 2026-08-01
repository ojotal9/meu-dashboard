import { useState } from "react"
import { Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet"
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
import { useDashboardData } from "@/context/dashboard-data-context"
import { useAuth } from "@/context/auth-context"
import { useConfirm } from "@/context/confirm-context"
import { useToast } from "@/context/toast-context"
import { formatarDataBR, mascararDataDigitada, dataBrParaIso, dataIsoParaBr, ordenarLista } from "@/lib/utils"

const TIPOS = ["Produção", "Matéria-prima", "Fretes", "Comercial", "Administrativo", "Manutenção"]

function hoje() {
  return new Date().toISOString().slice(0, 10) // yyyy-MM-dd
}

export function MateriaPrimaTab() {
  const { materiaPrimas, adicionarMateriaPrima, atualizarMateriaPrima, removerMateriaPrima } = useDashboardData()
  const confirmar = useConfirm()
  const { podeExecutarAcao } = useAuth()
  const { mostrarToast } = useToast()

  const [tipo, setTipo] = useState("Produção")
  const [valor, setValor] = useState("")
  const [dataTexto, setDataTexto] = useState(dataIsoParaBr(hoje()))
  const [observacao, setObservacao] = useState("")
  const [busca, setBusca] = useState("")
  const [ordenacao, setOrdenacao] = useState({ coluna: null, direcao: "asc" })

  const [sheetAberto, setSheetAberto] = useState(false)
  const [editandoId, setEditandoId] = useState(null)
  const [edicao, setEdicao] = useState({ tipo: "Produção", valor: "", dataTexto: "", observacao: "" })

  function aoClicarColuna(coluna) {
    setOrdenacao((o) =>
      o.coluna === coluna ? { coluna, direcao: o.direcao === "asc" ? "desc" : "asc" } : { coluna, direcao: "asc" }
    )
  }

  function handleAdicionar() {
    const valorTexto = valor.trim().replace(",", ".")

    if (!valorTexto || !dataTexto) {
      mostrarToast("Preencha o valor e a data antes de adicionar", "erro")
      return
    }

    const dataIso = dataBrParaIso(dataTexto)
    if (!dataIso) {
      mostrarToast("Digite a data no formato dd/mm/aaaa", "erro")
      return
    }

    const valorNumerico = parseFloat(valorTexto)
    if (isNaN(valorNumerico)) {
      mostrarToast("Digite o valor usando só números, tipo 150.00", "erro")
      return
    }

    adicionarMateriaPrima({
      tipo,
      valor: valorNumerico,
      data: dataIso,
      observacao: observacao.trim(),
    })

    setValor("")
    setObservacao("")
  }

  function abrirEdicao(item) {
    setEditandoId(item.id)
    setEdicao({
      tipo: item.tipo,
      valor: String(item.valor),
      dataTexto: dataIsoParaBr(item.data),
      observacao: item.observacao || "",
    })
    setSheetAberto(true)
  }

  function handleSalvarEdicao() {
    const valorTexto = edicao.valor.trim().replace(",", ".")

    if (!valorTexto || !edicao.dataTexto) {
      mostrarToast("Preencha o valor e a data", "erro")
      return
    }

    const dataIso = dataBrParaIso(edicao.dataTexto)
    if (!dataIso) {
      mostrarToast("Digite a data no formato dd/mm/aaaa", "erro")
      return
    }

    const valorNumerico = parseFloat(valorTexto)
    if (isNaN(valorNumerico)) {
      mostrarToast("Digite o valor usando só números, tipo 150.00", "erro")
      return
    }

    atualizarMateriaPrima(editandoId, {
      tipo: edicao.tipo,
      valor: valorNumerico,
      data: dataIso,
      observacao: edicao.observacao.trim(),
    })

    setSheetAberto(false)
  }

  function formatarReais(valor) {
    return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
  }

  const termo = busca.trim().toLowerCase()
  const itensFiltrados = termo
    ? materiaPrimas.filter((item) =>
        [item.tipo, item.observacao].some((campo) => campo?.toLowerCase().includes(termo))
      )
    : materiaPrimas

  const itensOrdenados = ordenarLista(itensFiltrados, ordenacao.coluna, ordenacao.direcao)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-2">
        <Select value={tipo} onValueChange={setTipo}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            {TIPOS.map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input placeholder="Valor (ex: 150.00)" value={valor} onChange={(e) => setValor(e.target.value)} className="max-w-[140px]" />
        <Input
          placeholder="dd/mm/aaaa"
          value={dataTexto}
          onChange={(e) => setDataTexto(mascararDataDigitada(e.target.value))}
          inputMode="numeric"
          maxLength={10}
          className="max-w-[140px]"
        />
        <Input placeholder="Observação" value={observacao} onChange={(e) => setObservacao(e.target.value)} className="max-w-[220px]" />
        <Button onClick={handleAdicionar}>Adicionar</Button>
      </div>

      <CampoBusca value={busca} onChange={setBusca} placeholder="Buscar por tipo ou observação..." />

      <Table>
        <TableHeader>
          <TableRow>
            <CabecalhoOrdenavel coluna="tipo" ordenacao={ordenacao} aoClicar={aoClicarColuna}>Tipo</CabecalhoOrdenavel>
            <CabecalhoOrdenavel coluna="valor" ordenacao={ordenacao} aoClicar={aoClicarColuna}>Valor</CabecalhoOrdenavel>
            <CabecalhoOrdenavel coluna="data" ordenacao={ordenacao} aoClicar={aoClicarColuna}>Data</CabecalhoOrdenavel>
            <TableHead>Observação</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {itensOrdenados.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="font-medium" data-label="Tipo">{item.tipo}</TableCell>
              <TableCell data-label="Valor">{formatarReais(item.valor)}</TableCell>
              <TableCell data-label="Data">{formatarDataBR(item.data)}</TableCell>
              <TableCell data-label="Observação">{item.observacao}</TableCell>
              <TableCell className="flex gap-2" data-label="Ações">
                <Button variant="outline" size="sm" onClick={() => abrirEdicao(item)}>
                  <Pencil />
                  Editar
                </Button>
                {podeExecutarAcao("materia-prima", "remover") && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={async () => {
                      if (await confirmar({ titulo: `Remover essa saída de "${item.tipo}"?` })) {
                        removerMateriaPrima(item.id)
                      }
                    }}
                  >
                    Remover
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
          {itensOrdenados.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="celula-vazia text-center text-muted-foreground">
                Nenhum item encontrado
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <Sheet open={sheetAberto} onOpenChange={setSheetAberto}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Editar saída</SheetTitle>
            <SheetDescription>Altere os dados e salve.</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-4 px-4">
            <div className="flex flex-col gap-1.5">
              <Label>Tipo</Label>
              <Select value={edicao.tipo} onValueChange={(v) => setEdicao((f) => ({ ...f, tipo: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edicao-valor">Valor</Label>
              <Input
                id="edicao-valor"
                value={edicao.valor}
                onChange={(e) => setEdicao((f) => ({ ...f, valor: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edicao-data">Data</Label>
              <Input
                id="edicao-data"
                placeholder="dd/mm/aaaa"
                value={edicao.dataTexto}
                onChange={(e) => setEdicao((f) => ({ ...f, dataTexto: mascararDataDigitada(e.target.value) }))}
                inputMode="numeric"
                maxLength={10}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edicao-observacao">Observação</Label>
              <Input
                id="edicao-observacao"
                value={edicao.observacao}
                onChange={(e) => setEdicao((f) => ({ ...f, observacao: e.target.value }))}
              />
            </div>
          </div>
          <SheetFooter>
            <Button onClick={handleSalvarEdicao}>Salvar alterações</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  )
}