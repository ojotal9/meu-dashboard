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
import { formatarMesAnoBR, ordenarLista } from "@/lib/utils"

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]

const CATEGORIAS = [
  "Venda", "Serviço", "Matéria-prima", "Frete", "Salário",
  "Aluguel", "Imposto", "Manutenção", "Contas a Pagar", "Contas a Receber", "Outros",
]

function anosDisponiveis() {
  const atual = new Date().getFullYear()
  return [atual - 2, atual - 1, atual, atual + 1, atual + 2]
}

function formatarReais(valor) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

export function TransacoesTab() {
  const { clientes, transacoes, adicionarTransacao, atualizarTransacao, removerTransacao } = useDashboardData()

  const anoAtual = new Date().getFullYear()
  const mesAtual = MESES[new Date().getMonth()]

  const [cliente, setCliente] = useState("")
  const [valor, setValor] = useState("")
  const [tipo, setTipo] = useState("entrada")
  const [categoria, setCategoria] = useState("Outros")
  const [mes, setMes] = useState(mesAtual)
  const [ano, setAno] = useState(String(anoAtual))
  const [busca, setBusca] = useState("")
  const [editandoId, setEditandoId] = useState(null)
  const [ordenacao, setOrdenacao] = useState({ coluna: null, direcao: "asc" })

  function aoClicarColuna(coluna) {
    setOrdenacao((o) =>
      o.coluna === coluna ? { coluna, direcao: o.direcao === "asc" ? "desc" : "asc" } : { coluna, direcao: "asc" }
    )
  }

  function iniciarEdicao(t) {
    setEditandoId(t.id)
    setCliente(t.cliente)
    setValor(String(t.valor))
    setTipo(t.tipo)
    setCategoria(t.categoria || "Outros")
    const [anoData, mesData] = (t.data || "").split("-")
    setAno(anoData || String(anoAtual))
    setMes(MESES[parseInt(mesData, 10) - 1] || mesAtual)
  }

  function cancelarEdicao() {
    setEditandoId(null)
    setCliente("")
    setValor("")
    setTipo("entrada")
    setCategoria("Outros")
    setMes(mesAtual)
    setAno(String(anoAtual))
  }

  function handleSalvar() {
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

    if (editandoId) {
      atualizarTransacao(editandoId, { cliente, valor: valorNumerico, tipo, categoria, data })
    } else {
      adicionarTransacao({ cliente, valor: valorNumerico, tipo, categoria, data })
    }

    cancelarEdicao()
  }

  const termo = busca.trim().toLowerCase()
  const transacoesFiltradas = termo
    ? transacoes.filter((t) =>
        [t.cliente, t.categoria].some((campo) => campo?.toLowerCase().includes(termo))
      )
    : transacoes

  const transacoesOrdenadas = ordenarLista(transacoesFiltradas, ordenacao.coluna, ordenacao.direcao)

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

        <Select value={categoria} onValueChange={setCategoria}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIAS.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
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

        <Button onClick={handleSalvar}>{editandoId ? "Salvar edição" : "Adicionar"}</Button>
        {editandoId && (
          <Button variant="outline" onClick={cancelarEdicao}>
            <X />
            Cancelar
          </Button>
        )}
      </div>

      <CampoBusca value={busca} onChange={setBusca} placeholder="Buscar por cliente ou categoria..." />

      <Table>
        <TableHeader>
          <TableRow>
            <CabecalhoOrdenavel coluna="cliente" ordenacao={ordenacao} aoClicar={aoClicarColuna}>Cliente</CabecalhoOrdenavel>
            <CabecalhoOrdenavel coluna="valor" ordenacao={ordenacao} aoClicar={aoClicarColuna}>Valor</CabecalhoOrdenavel>
            <CabecalhoOrdenavel coluna="tipo" ordenacao={ordenacao} aoClicar={aoClicarColuna}>Tipo</CabecalhoOrdenavel>
            <CabecalhoOrdenavel coluna="categoria" ordenacao={ordenacao} aoClicar={aoClicarColuna}>Categoria</CabecalhoOrdenavel>
            <CabecalhoOrdenavel coluna="data" ordenacao={ordenacao} aoClicar={aoClicarColuna}>Data</CabecalhoOrdenavel>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {transacoesOrdenadas.map((t) => (
            <TableRow key={t.id}>
              <TableCell className="font-medium" data-label="Cliente">{t.cliente}</TableCell>
              <TableCell data-label="Valor">{formatarReais(t.valor)}</TableCell>
              <TableCell data-label="Tipo">{t.tipo}</TableCell>
              <TableCell data-label="Categoria">{t.categoria || "—"}</TableCell>
              <TableCell data-label="Data">{formatarMesAnoBR(t.data)}</TableCell>
              <TableCell className="flex gap-2" data-label="Ações">
                <Button variant="outline" size="sm" onClick={() => iniciarEdicao(t)}>
                  <Pencil />
                  Editar
                </Button>
                <Button variant="destructive" size="sm" onClick={() => removerTransacao(t.id)}>
                  Remover
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {transacoesOrdenadas.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="celula-vazia text-center text-muted-foreground">
                Nenhuma transação encontrada
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}