import { useState } from "react"
import { Pencil, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
import { CampoBusca } from "@/components/campo-busca"
import { CabecalhoOrdenavel } from "@/components/cabecalho-ordenavel"
import { useDashboardData } from "@/context/dashboard-data-context"
import { formatarDataBR, mascararDataDigitada, dataBrParaIso, dataIsoParaBr, ordenarLista } from "@/lib/utils"

const TIPOS = ["Tinta", "Fitilho", "Matriz", "Clichê", "Outros"]

function hoje() {
  return new Date().toISOString().slice(0, 10) // yyyy-MM-dd
}

export function MateriaPrimaTab() {
  const { materiaPrimas, adicionarMateriaPrima, atualizarMateriaPrima, removerMateriaPrima } = useDashboardData()

  const [tipo, setTipo] = useState("Tinta")
  const [valor, setValor] = useState("")
  const [dataTexto, setDataTexto] = useState(dataIsoParaBr(hoje()))
  const [observacao, setObservacao] = useState("")
  const [busca, setBusca] = useState("")
  const [editandoId, setEditandoId] = useState(null)
  const [ordenacao, setOrdenacao] = useState({ coluna: null, direcao: "asc" })

  function aoClicarColuna(coluna) {
    setOrdenacao((o) =>
      o.coluna === coluna ? { coluna, direcao: o.direcao === "asc" ? "desc" : "asc" } : { coluna, direcao: "asc" }
    )
  }

  function handleDataChange(e) {
    setDataTexto(mascararDataDigitada(e.target.value))
  }

  function iniciarEdicao(item) {
    setEditandoId(item.id)
    setTipo(item.tipo)
    setValor(String(item.valor))
    setDataTexto(dataIsoParaBr(item.data))
    setObservacao(item.observacao || "")
  }

  function cancelarEdicao() {
    setEditandoId(null)
    setTipo("Tinta")
    setValor("")
    setDataTexto(dataIsoParaBr(hoje()))
    setObservacao("")
  }

  function handleSalvar() {
    const valorTexto = valor.trim().replace(",", ".")

    if (!valorTexto || !dataTexto) {
      alert("Preencha o valor e a data antes de adicionar")
      return
    }

    const dataIso = dataBrParaIso(dataTexto)
    if (!dataIso) {
      alert("Digite a data no formato dd/mm/aaaa")
      return
    }

    const valorNumerico = parseFloat(valorTexto)
    if (isNaN(valorNumerico)) {
      alert("Digite o valor usando só números, tipo 150.00")
      return
    }

    const dados = {
      tipo,
      valor: valorNumerico,
      data: dataIso,
      observacao: observacao.trim(),
    }

    if (editandoId) {
      atualizarMateriaPrima(editandoId, dados)
    } else {
      adicionarMateriaPrima(dados)
    }

    cancelarEdicao()
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
          onChange={handleDataChange}
          inputMode="numeric"
          maxLength={10}
          className="max-w-[140px]"
        />
        <Input placeholder="Observação" value={observacao} onChange={(e) => setObservacao(e.target.value)} className="max-w-[220px]" />
        <Button onClick={handleSalvar}>{editandoId ? "Salvar edição" : "Adicionar"}</Button>
        {editandoId && (
          <Button variant="outline" onClick={cancelarEdicao}>
            <X />
            Cancelar
          </Button>
        )}
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
                <Button variant="outline" size="sm" onClick={() => iniciarEdicao(item)}>
                  <Pencil />
                  Editar
                </Button>
                <Button variant="destructive" size="sm" onClick={() => removerMateriaPrima(item.id)}>
                  Remover
                </Button>
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
    </div>
  )
}