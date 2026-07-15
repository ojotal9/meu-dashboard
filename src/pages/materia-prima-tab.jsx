import { useState } from "react"
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
import { useDashboardData } from "@/context/dashboard-data-context"

const TIPOS = ["Tinta", "Fitilho", "Matriz", "Clichê", "Outros"]

function hoje() {
  return new Date().toISOString().slice(0, 10) // yyyy-MM-dd
}

export function MateriaPrimaTab() {
  const { materiaPrimas, adicionarMateriaPrima, removerMateriaPrima } = useDashboardData()

  const [tipo, setTipo] = useState("Tinta")
  const [valor, setValor] = useState("")
  const [data, setData] = useState(hoje())
  const [observacao, setObservacao] = useState("")

  function handleAdicionar() {
    const valorTexto = valor.trim().replace(",", ".")

    if (!valorTexto || !data) {
      alert("Preencha o valor e a data antes de adicionar")
      return
    }

    const valorNumerico = parseFloat(valorTexto)
    if (isNaN(valorNumerico)) {
      alert("Digite o valor usando só números, tipo 150.00")
      return
    }

    adicionarMateriaPrima({
      tipo,
      valor: valorNumerico,
      data,
      observacao: observacao.trim(),
    })

    setValor("")
    setObservacao("")
  }

  function formatarReais(valor) {
    return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
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
        <Input type="date" value={data} onChange={(e) => setData(e.target.value)} className="max-w-[160px]" />
        <Input placeholder="Observação" value={observacao} onChange={(e) => setObservacao(e.target.value)} className="max-w-[220px]" />
        <Button onClick={handleAdicionar}>Adicionar</Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tipo</TableHead>
            <TableHead>Valor</TableHead>
            <TableHead>Data</TableHead>
            <TableHead>Observação</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {materiaPrimas.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="font-medium">{item.tipo}</TableCell>
              <TableCell>{formatarReais(item.valor)}</TableCell>
              <TableCell>{item.data}</TableCell>
              <TableCell>{item.observacao}</TableCell>
              <TableCell>
                <Button variant="destructive" size="sm" onClick={() => removerMateriaPrima(item.id)}>
                  Remover
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}