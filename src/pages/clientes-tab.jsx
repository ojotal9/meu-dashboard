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
import { useDashboardData } from "@/context/dashboard-data-context"

export function ClientesTab() {
  const { clientes, adicionarCliente, removerCliente } = useDashboardData()

  const [nome, setNome] = useState("")
  const [telefone, setTelefone] = useState("")
  const [email, setEmail] = useState("")
  const [cpf, setCpf] = useState("")
  const [representante, setRepresentante] = useState("")

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
          {clientes.map((cliente) => (
            <TableRow key={cliente.id}>
              <TableCell className="font-medium">{cliente.nome}</TableCell>
              <TableCell>{cliente.telefone}</TableCell>
              <TableCell>{cliente.email}</TableCell>
              <TableCell>{cliente.cpf}</TableCell>
              <TableCell>{cliente.representante}</TableCell>
              <TableCell>
                <Button variant="destructive" size="sm" onClick={() => removerCliente(cliente.id)}>
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