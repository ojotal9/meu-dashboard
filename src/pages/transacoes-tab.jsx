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
  const confirmar = useConfirm()
  const { podeExecutarAcao } = useAuth()

  const anoAtual = new Date().getFullYear()
  const mesAtual = MESES[new Date().getMonth()]

  const [cliente, setCliente] = useState("")
  const [valor, setValor] = useState("")
  const [tipo, setTipo] = useState("entrada")
  const [categoria, setCategoria] = useState("Outros")
  const [mes, setMes] = useState(mesAtual)
  const [ano, setAno] = useState(String(anoAtual))
  const [produto, setProduto] = useState("")
  const [custoMateriaPrima, setCustoMateriaPrima] = useState("")
  const [busca, setBusca] = useState("")
  const [ordenacao, setOrdenacao] = useState({ coluna: null, direcao: "asc" })

  const [sheetAberto, setSheetAberto] = useState(false)
  const [editandoId, setEditandoId] = useState(null)
  const [edicao, setEdicao] = useState({
    cliente: "",
    valor: "",
    tipo: "entrada",
    categoria: "Outros",
    mes: mesAtual,
    ano: String(anoAtual),
    produto: "",
    custoMateriaPrima: "",
  })

  function aoClicarColuna(coluna) {
    setOrdenacao((o) =>
      o.coluna === coluna ? { coluna, direcao: o.direcao === "asc" ? "desc" : "asc" } : { coluna, direcao: "asc" }
    )
  }

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

    const custoTexto = custoMateriaPrima.trim().replace(",", ".")
    const custoNumerico = custoTexto ? parseFloat(custoTexto) : 0
    if (custoTexto && isNaN(custoNumerico)) {
      alert("Digite o custo da matéria-prima usando só números, tipo 40.00")
      return
    }

    adicionarTransacao({
      cliente,
      valor: valorNumerico,
      tipo,
      categoria,
      data,
      produto: produto.trim() || null,
      custo_materia_prima: tipo === "entrada" ? custoNumerico : 0,
    })
    setValor("")
    setProduto("")
    setCustoMateriaPrima("")
  }

  function abrirEdicao(t) {
    setEditandoId(t.id)
    const [anoData, mesData] = (t.data || "").split("-")
    setEdicao({
      cliente: t.cliente,
      valor: String(t.valor),
      tipo: t.tipo,
      categoria: t.categoria || "Outros",
      ano: anoData || String(anoAtual),
      mes: MESES[parseInt(mesData, 10) - 1] || mesAtual,
      produto: t.produto || "",
      custoMateriaPrima: t.custo_materia_prima ? String(t.custo_materia_prima) : "",
    })
    setSheetAberto(true)
  }

  function handleSalvarEdicao() {
    const valorTexto = edicao.valor.trim().replace(",", ".")

    if (!edicao.cliente || !valorTexto) {
      alert("Selecione o cliente e preencha o valor")
      return
    }

    const valorNumerico = parseFloat(valorTexto)
    if (isNaN(valorNumerico)) {
      alert("Digite o valor usando só números, tipo 150.00")
      return
    }

    const numeroMes = MESES.indexOf(edicao.mes) + 1
    const data = `${edicao.ano}-${String(numeroMes).padStart(2, "0")}`

    const custoEdicaoTexto = edicao.custoMateriaPrima.trim().replace(",", ".")
    const custoEdicaoNumerico = custoEdicaoTexto ? parseFloat(custoEdicaoTexto) : 0
    if (custoEdicaoTexto && isNaN(custoEdicaoNumerico)) {
      alert("Digite o custo da matéria-prima usando só números, tipo 40.00")
      return
    }

    atualizarTransacao(editandoId, {
      cliente: edicao.cliente,
      valor: valorNumerico,
      tipo: edicao.tipo,
      categoria: edicao.categoria,
      data,
      produto: edicao.produto.trim() || null,
      custo_materia_prima: edicao.tipo === "entrada" ? custoEdicaoNumerico : 0,
    })

    setSheetAberto(false)
  }

  const termo = busca.trim().toLowerCase()
  const transacoesFiltradas = termo
    ? transacoes.filter((t) =>
        [t.cliente, t.categoria, t.produto].some((campo) => campo?.toLowerCase().includes(termo))
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

        <Input placeholder="Produto (opcional)" value={produto} onChange={(e) => setProduto(e.target.value)} className="max-w-[160px]" />

        {tipo === "entrada" && (
          <Input
            placeholder="Custo da matéria-prima (opcional)"
            value={custoMateriaPrima}
            onChange={(e) => setCustoMateriaPrima(e.target.value)}
            className="max-w-[220px]"
          />
        )}

        <Button onClick={handleAdicionar}>Adicionar</Button>
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
            <TableHead>Produto</TableHead>
            <TableHead>Lucro</TableHead>
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
              <TableCell data-label="Produto">{t.produto || "—"}</TableCell>
              <TableCell data-label="Lucro">
                {t.tipo === "entrada" && t.custo_materia_prima > 0 ? (
                  <span className={t.valor - t.custo_materia_prima < 0 ? "font-medium text-destructive" : "font-medium text-emerald-600"}>
                    {formatarReais(t.valor - t.custo_materia_prima)}
                    <span className="ml-1 text-xs text-muted-foreground">
                      ({(((t.valor - t.custo_materia_prima) / t.valor) * 100).toFixed(0)}%)
                    </span>
                  </span>
                ) : (
                  "—"
                )}
              </TableCell>
              <TableCell className="flex gap-2" data-label="Ações">
                <Button variant="outline" size="sm" onClick={() => abrirEdicao(t)}>
                  <Pencil />
                  Editar
                </Button>
                {podeExecutarAcao("transacoes", "remover") && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={async () => {
                      if (await confirmar({ titulo: `Remover essa transação de "${t.cliente}"?` })) {
                        removerTransacao(t.id)
                      }
                    }}
                  >
                    Remover
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
          {transacoesOrdenadas.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="celula-vazia text-center text-muted-foreground">
                Nenhuma transação encontrada
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <Sheet open={sheetAberto} onOpenChange={setSheetAberto}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Editar transação</SheetTitle>
            <SheetDescription>Altere os dados e salve.</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-4 px-4">
            <div className="flex flex-col gap-1.5">
              <Label>Cliente</Label>
              <Select value={edicao.cliente} onValueChange={(v) => setEdicao((f) => ({ ...f, cliente: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {clientes.map((c) => (
                    <SelectItem key={c.id} value={c.nome}>{c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edicao-valor-transacao">Valor</Label>
              <Input
                id="edicao-valor-transacao"
                value={edicao.valor}
                onChange={(e) => setEdicao((f) => ({ ...f, valor: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Tipo</Label>
              <Select value={edicao.tipo} onValueChange={(v) => setEdicao((f) => ({ ...f, tipo: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="entrada">entrada</SelectItem>
                  <SelectItem value="saida">saída</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Categoria</Label>
              <Select value={edicao.categoria} onValueChange={(v) => setEdicao((f) => ({ ...f, categoria: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIAS.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <div className="flex flex-1 flex-col gap-1.5">
                <Label>Mês</Label>
                <Select value={edicao.mes} onValueChange={(v) => setEdicao((f) => ({ ...f, mes: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MESES.map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Ano</Label>
                <Select value={edicao.ano} onValueChange={(v) => setEdicao((f) => ({ ...f, ano: v }))}>
                  <SelectTrigger className="w-[100px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {anosDisponiveis().map((a) => (
                      <SelectItem key={a} value={String(a)}>{a}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edicao-produto-transacao">Produto (opcional)</Label>
              <Input
                id="edicao-produto-transacao"
                value={edicao.produto}
                onChange={(e) => setEdicao((f) => ({ ...f, produto: e.target.value }))}
              />
            </div>
            {edicao.tipo === "entrada" && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edicao-custo-transacao">Custo da matéria-prima usada nessa venda (opcional)</Label>
                <Input
                  id="edicao-custo-transacao"
                  placeholder="ex: 40.00"
                  value={edicao.custoMateriaPrima}
                  onChange={(e) => setEdicao((f) => ({ ...f, custoMateriaPrima: e.target.value }))}
                />
                {edicao.custoMateriaPrima && !isNaN(parseFloat(edicao.custoMateriaPrima.replace(",", "."))) && !isNaN(parseFloat(edicao.valor.replace(",", "."))) && (
                  <p className="text-xs text-muted-foreground">
                    Lucro estimado: {formatarReais(parseFloat(edicao.valor.replace(",", ".")) - parseFloat(edicao.custoMateriaPrima.replace(",", ".")))}
                  </p>
                )}
              </div>
            )}
          </div>
          <SheetFooter>
            <Button onClick={handleSalvarEdicao}>Salvar alterações</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  )
}