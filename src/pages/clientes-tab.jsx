import { useState } from "react"
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
import { useDashboardData } from "@/context/dashboard-data-context"

export function ClientesTab() {
  const { clientes, adicionarCliente, removerCliente } = useDashboardData()

  const [nome, setNome] = useState("")
  const [telefone, setTelefone] = useState("")
  const [email, setEmail] = useState("")
  const [cpf, setCpf] = useState("")
  const [representante, setRepresentante] = useState("")
  const [busca, setBusca] = useState("")

  function handleAdicionar() {
    if (!nome.trim()) {
      alert("Digite pelo menos o nome do cliente")
      return
    }

    adicionarCliente({
      nome: nome.trim(),
      telefone: telefone.trim(),
      email: email.trim(),
      cpf: cpf.trim(),
      representante: representante.trim(),
    })

    setNome("")
    setTelefone("")
    setEmail("")
    setCpf("")
    setRepresentante("")
  }

  const termo = busca.trim().toLowerCase()
  const clientesFiltrados = termo
    ? clientes.filter((c) =>
        [c.nome, c.telefone, c.email, c.cpf, c.representante]
          .some((campo) => campo?.toLowerCase().includes(termo))
      )
    : clientes

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <Input placeholder="Nome" value={nome} onChange={(e) => setNome(e.target.value)} className="max-w-[180px]" />
        <Input placeholder="Telefone" value={telefone} onChange={(e) => setTelefone(e.target.value)} className="max-w-[140px]" />
        <Input placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} className="max-w-[180px]" />
        <Input placeholder="CPF" value={cpf} onChange={(e) => setCpf(e.target.value)} className="max-w-[140px]" />
        <Input placeholder="Representante" value={representante} onChange={(e) => setRepresentante(e.target.value)} className="max-w-[180px]" />
        <Button onClick={handleAdicionar}>Adicionar cliente</Button>
      </div>

      <CampoBusca value={busca} onChange={setBusca} placeholder="Buscar cliente por nome, telefone, e-mail ou CPF..." />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>Telefone</TableHead>
            <TableHead>E-mail</TableHead>
            <TableHead>CPF</TableHead>
            <TableHead>Representante</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {clientesFiltrados.map((cliente) => (
            <TableRow key={cliente.id}>
              <TableCell className="font-medium" data-label="Nome">{cliente.nome}</TableCell>
              <TableCell data-label="Telefone">{cliente.telefone}</TableCell>
              <TableCell data-label="E-mail">{cliente.email}</TableCell>
              <TableCell data-label="CPF">{cliente.cpf}</TableCell>
              <TableCell data-label="Representante">{cliente.representante}</TableCell>
              <TableCell data-label="Ações">
                <Button variant="destructive" size="sm" onClick={() => removerCliente(cliente.id)}>
                  Remover
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {clientesFiltrados.length === 0 && (
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