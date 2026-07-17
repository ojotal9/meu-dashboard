import { useState } from "react"
import { Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import { ordenarLista } from "@/lib/utils"

const FORMULARIO_VAZIO = { nome: "", telefone: "", email: "", cpf: "", representante: "" }

export function ClientesTab() {
  const { clientes, adicionarCliente, atualizarCliente, removerCliente } = useDashboardData()

  const [novoCliente, setNovoCliente] = useState(FORMULARIO_VAZIO)
  const [busca, setBusca] = useState("")
  const [ordenacao, setOrdenacao] = useState({ coluna: null, direcao: "asc" })

  const [sheetAberto, setSheetAberto] = useState(false)
  const [editandoId, setEditandoId] = useState(null)
  const [formularioEdicao, setFormularioEdicao] = useState(FORMULARIO_VAZIO)

  function aoClicarColuna(coluna) {
    setOrdenacao((o) =>
      o.coluna === coluna ? { coluna, direcao: o.direcao === "asc" ? "desc" : "asc" } : { coluna, direcao: "asc" }
    )
  }

  function handleAdicionar() {
    if (!novoCliente.nome.trim()) {
      alert("Digite pelo menos o nome do cliente")
      return
    }

    adicionarCliente({
      nome: novoCliente.nome.trim(),
      telefone: novoCliente.telefone.trim(),
      email: novoCliente.email.trim(),
      cpf: novoCliente.cpf.trim(),
      representante: novoCliente.representante.trim(),
    })

    setNovoCliente(FORMULARIO_VAZIO)
  }

  function abrirEdicao(cliente) {
    setEditandoId(cliente.id)
    setFormularioEdicao({
      nome: cliente.nome || "",
      telefone: cliente.telefone || "",
      email: cliente.email || "",
      cpf: cliente.cpf || "",
      representante: cliente.representante || "",
    })
    setSheetAberto(true)
  }

  function handleSalvarEdicao() {
    if (!formularioEdicao.nome.trim()) {
      alert("Digite pelo menos o nome do cliente")
      return
    }

    atualizarCliente(editandoId, {
      nome: formularioEdicao.nome.trim(),
      telefone: formularioEdicao.telefone.trim(),
      email: formularioEdicao.email.trim(),
      cpf: formularioEdicao.cpf.trim(),
      representante: formularioEdicao.representante.trim(),
    })

    setSheetAberto(false)
  }

  const termo = busca.trim().toLowerCase()
  const clientesFiltrados = termo
    ? clientes.filter((c) =>
        [c.nome, c.telefone, c.email, c.cpf, c.representante]
          .some((campo) => campo?.toLowerCase().includes(termo))
      )
    : clientes

  const clientesOrdenados = ordenarLista(clientesFiltrados, ordenacao.coluna, ordenacao.direcao)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-2">
        <Input placeholder="Nome" value={novoCliente.nome} onChange={(e) => setNovoCliente((f) => ({ ...f, nome: e.target.value }))} className="max-w-[180px]" />
        <Input placeholder="Telefone" value={novoCliente.telefone} onChange={(e) => setNovoCliente((f) => ({ ...f, telefone: e.target.value }))} className="max-w-[140px]" />
        <Input placeholder="E-mail" value={novoCliente.email} onChange={(e) => setNovoCliente((f) => ({ ...f, email: e.target.value }))} className="max-w-[180px]" />
        <Input placeholder="CPF" value={novoCliente.cpf} onChange={(e) => setNovoCliente((f) => ({ ...f, cpf: e.target.value }))} className="max-w-[140px]" />
        <Input placeholder="Representante" value={novoCliente.representante} onChange={(e) => setNovoCliente((f) => ({ ...f, representante: e.target.value }))} className="max-w-[180px]" />
        <Button onClick={handleAdicionar}>Adicionar cliente</Button>
      </div>

      <CampoBusca value={busca} onChange={setBusca} placeholder="Buscar cliente por nome, telefone, e-mail ou CPF..." />

      <Table>
        <TableHeader>
          <TableRow>
            <CabecalhoOrdenavel coluna="nome" ordenacao={ordenacao} aoClicar={aoClicarColuna}>Nome</CabecalhoOrdenavel>
            <CabecalhoOrdenavel coluna="telefone" ordenacao={ordenacao} aoClicar={aoClicarColuna}>Telefone</CabecalhoOrdenavel>
            <CabecalhoOrdenavel coluna="email" ordenacao={ordenacao} aoClicar={aoClicarColuna}>E-mail</CabecalhoOrdenavel>
            <TableHead>CPF</TableHead>
            <TableHead>Representante</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {clientesOrdenados.map((cliente) => (
            <TableRow key={cliente.id}>
              <TableCell className="font-medium" data-label="Nome">{cliente.nome}</TableCell>
              <TableCell data-label="Telefone">{cliente.telefone}</TableCell>
              <TableCell data-label="E-mail">{cliente.email}</TableCell>
              <TableCell data-label="CPF">{cliente.cpf}</TableCell>
              <TableCell data-label="Representante">{cliente.representante}</TableCell>
              <TableCell className="flex gap-2" data-label="Ações">
                <Button variant="outline" size="sm" onClick={() => abrirEdicao(cliente)}>
                  <Pencil />
                  Editar
                </Button>
                <Button variant="destructive" size="sm" onClick={() => removerCliente(cliente.id)}>
                  Remover
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {clientesOrdenados.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="celula-vazia text-center text-muted-foreground">
                Nenhum cliente encontrado
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <Sheet open={sheetAberto} onOpenChange={setSheetAberto}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Editar cliente</SheetTitle>
            <SheetDescription>Altere os dados e salve.</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-4 px-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edicao-nome">Nome</Label>
              <Input
                id="edicao-nome"
                value={formularioEdicao.nome}
                onChange={(e) => setFormularioEdicao((f) => ({ ...f, nome: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edicao-telefone">Telefone</Label>
              <Input
                id="edicao-telefone"
                value={formularioEdicao.telefone}
                onChange={(e) => setFormularioEdicao((f) => ({ ...f, telefone: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edicao-email">E-mail</Label>
              <Input
                id="edicao-email"
                type="email"
                value={formularioEdicao.email}
                onChange={(e) => setFormularioEdicao((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edicao-cpf">CPF</Label>
              <Input
                id="edicao-cpf"
                value={formularioEdicao.cpf}
                onChange={(e) => setFormularioEdicao((f) => ({ ...f, cpf: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edicao-representante">Representante</Label>
              <Input
                id="edicao-representante"
                value={formularioEdicao.representante}
                onChange={(e) => setFormularioEdicao((f) => ({ ...f, representante: e.target.value }))}
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