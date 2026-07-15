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
import { formatarMesAnoBR } from "@/lib/utils"

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]

function anosDisponiveis() {
  const atual = new Date().getFullYear()
  return [atual - 2, atual - 1, atual, atual + 1, atual + 2]
}

function formatarReais(valor) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

export function TransacoesTab() {
  const { clientes, transacoes, adicionarTransacao, removerTransacao } = useDashboardData()

  const anoAtual = new Date().getFullYear()
  const mesAtual = MESES[new Date().getMonth()]

  const [cliente, setCliente] = useState("")
  const [valor, setValor] = useState("")
  const [tipo, setTipo] = useState("entrada")
  const [mes, setMes] = useState(mesAtual)
  const [ano, setAno] = useState(String(anoAtual))

  function handleAdicionar() {
    const valorTexto = valor.trim().replace(",", ".")

    if (!cliente || !valorTexto) {
      if (clientes.length === 0) {
        alert('Você ainda não cadastrou nenhum cliente. Vá na aba "Cadastro de Clientes" e adicione um primeiro.')
      } else {
        alert("Selecione o cliente e preencha o valor antes de adicionar")
      }
      return
    }

    const valorNumerico = parseFloat(valorTexto)
    if (isNaN(valorNumerico)) {
      alert("Digite o valor usando só números, tipo 150.00")
      return
    }

    const numeroMes = MESES.indexOf(mes) + 1
    const data = `${ano}-${String(numeroMes).padStart(2, "0")}`

    adicionarTransacao({ cliente, valor: valorNumerico, tipo, data })
    setValor("")
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={cliente} onValueChange={setCliente}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Selecione o cliente" />
          </SelectTrigger>
          <SelectContent>
            {clientes.map((c) => (
              <SelectItem key={c.id} value={c.nome}>{c.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input placeholder="Valor (ex: 150.00)" value={valor} onChange={(e) => setValor(e.target.value)} className="max-w-[140px]" />

        <Select value={tipo} onValueChange={setTipo}>
          <SelectTrigger className="w-[110px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="entrada">entrada</SelectItem>
            <SelectItem value="saida">saída</SelectItem>
          </SelectContent>
        </Select>

        <Select value={mes} onValueChange={setMes}>
          <SelectTrigger className="w-[130px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MESES.map((m) => (
              <SelectItem key={m} value={m}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={ano} onValueChange={setAno}>
          <SelectTrigger className="w-[100px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {anosDisponiveis().map((a) => (
              <SelectItem key={a} value={String(a)}>{a}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button onClick={handleAdicionar}>Adicionar</Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Cliente</TableHead>
            <TableHead>Valor</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Data</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {transacoes.map((t) => (
            <TableRow key={t.id}>
              <TableCell className="font-medium">{t.cliente}</TableCell>
              <TableCell>{formatarReais(t.valor)}</TableCell>
              <TableCell>{t.tipo}</TableCell>
              <TableCell>{formatarMesAnoBR(t.data)}</TableCell>
              <TableCell>
                <Button variant="destructive" size="sm" onClick={() => removerTransacao(t.id)}>
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