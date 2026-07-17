import { useState } from "react"
import { Pencil, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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

  const [formulario, setFormulario] = useState(FORMULARIO_VAZIO)
  const [editandoId, setEditandoId] = useState(null)
  const [busca, setBusca] = useState("")
  const [ordenacao, setOrdenacao] = useState({ coluna: null, direcao: "asc" })

  function aoClicarColuna(coluna) {
    setOrdenacao((o) =>
      o.coluna === coluna ? { coluna, direcao: o.direcao === "asc" ? "desc" : "asc" } : { coluna, direcao: "asc" }
    )
  }

  function iniciarEdicao(cliente) {
    setEditandoId(cliente.id)
    setFormulario({
      nome: cliente.nome || "",
      telefone: cliente.telefone || "",
      email: cliente.email || "",
      cpf: cliente.cpf || "",
      representante: cliente.representante || "",
    })
  }

  function cancelarEdicao() {
    setEditandoId(null)
    setFormulario(FORMULARIO_VAZIO)
  }

  function handleSalvar() {
    if (!formulario.nome.trim()) {
      alert("Digite pelo menos o nome do cliente")
      return
    }

    const dados = {
      nome: formulario.nome.trim(),
      telefone: formulario.telefone.trim(),
      email: formulario.email.trim(),
      cpf: formulario.cpf.trim(),
      representante: formulario.representante.trim(),
    }

    if (editandoId) {
      atualizarCliente(editandoId, dados)
    } else {
      adicionarCliente(dados)
    }

    cancelarEdicao()
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
        <Input placeholder="Nome" value={formulario.nome} onChange={(e) => setFormulario((f) => ({ ...f, nome: e.target.value }))} className="max-w-[180px]" />
        <Input placeholder="Telefone" value={formulario.telefone} onChange={(e) => setFormulario((f) => ({ ...f, telefone: e.target.value }))} className="max-w-[140px]" />
        <Input placeholder="E-mail" value={formulario.email} onChange={(e) => setFormulario((f) => ({ ...f, email: e.target.value }))} className="max-w-[180px]" />
        <Input placeholder="CPF" value={formulario.cpf} onChange={(e) => setFormulario((f) => ({ ...f, cpf: e.target.value }))} className="max-w-[140px]" />
        <Input placeholder="Representante" value={formulario.representante} onChange={(e) => setFormulario((f) => ({ ...f, representante: e.target.value }))} className="max-w-[180px]" />
        <Button onClick={handleSalvar}>{editandoId ? "Salvar edição" : "Adicionar cliente"}</Button>
        {editandoId && (
          <Button variant="outline" onClick={cancelarEdicao}>
            <X />
            Cancelar
          </Button>
        )}
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
                <Button variant="outline" size="sm" onClick={() => iniciarEdicao(cliente)}>
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
    </div>
  )
}