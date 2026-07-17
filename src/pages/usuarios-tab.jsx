import { useEffect, useState } from "react"
import { LogOut, Pencil, Trash2, UserPlus, X } from "lucide-react"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
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
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table"
import { useAuth } from "@/context/auth-context"

const PAGINAS_DISPONIVEIS = [
  { chave: "inicio", titulo: "Início" },
  { chave: "clientes", titulo: "Cadastro de Clientes" },
  { chave: "materia-prima", titulo: "Saídas" },
  { chave: "resumo-cliente", titulo: "Resumo por Cliente" },
  { chave: "transacoes", titulo: "Transações" },
  { chave: "contas-receber", titulo: "Contas a Receber" },
  { chave: "contas-pagar", titulo: "Contas a Pagar" },
  { chave: "historico", titulo: "Histórico Mensal" },
  { chave: "configuracoes", titulo: "Configurações" },
  { chave: "usuarios", titulo: "Usuários" },
]

const FORMULARIO_VAZIO = { nome: "", email: "", senha: "", role: "funcionario", paginas_permitidas: [] }

export function UsuariosTab() {
  const {
    sessao,
    perfil,
    ehAdmin,
    sair,
    todosPerfis,
    carregarTodosPerfis,
    atualizarPerfil,
    criarUsuarioCompleto,
    removerUsuarioCompleto,
  } = useAuth()

  const [mostrarFormulario, setMostrarFormulario] = useState(false)
  const [editandoId, setEditandoId] = useState(null)
  const [formulario, setFormulario] = useState(FORMULARIO_VAZIO)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (ehAdmin) carregarTodosPerfis()
  }, [ehAdmin])

  function alternarPagina(chave) {
    setFormulario((f) => ({
      ...f,
      paginas_permitidas: f.paginas_permitidas.includes(chave)
        ? f.paginas_permitidas.filter((p) => p !== chave)
        : [...f.paginas_permitidas, chave],
    }))
  }

  function iniciarEdicao(p) {
    setEditandoId(p.id)
    setFormulario({
      nome: p.nome || "",
      email: p.email || "",
      senha: "",
      role: p.role,
      paginas_permitidas: p.paginas_permitidas || [],
    })
    setMostrarFormulario(true)
  }

  function cancelarFormulario() {
    setMostrarFormulario(false)
    setEditandoId(null)
    setFormulario(FORMULARIO_VAZIO)
  }

  async function handleSalvar() {
    if (!formulario.nome.trim()) {
      alert("Digite o nome da pessoa")
      return
    }

    setSalvando(true)

    let resultado
    if (editandoId) {
      resultado = await atualizarPerfil(editandoId, {
        nome: formulario.nome.trim(),
        email: formulario.email.trim(),
        role: formulario.role,
        paginas_permitidas: formulario.role === "admin" ? [] : formulario.paginas_permitidas,
      })
    } else {
      if (!formulario.email.trim() || !formulario.senha.trim()) {
        setSalvando(false)
        alert("Preencha e-mail e senha pra criar o login")
        return
      }
      if (formulario.senha.trim().length < 6) {
        setSalvando(false)
        alert("A senha precisa ter pelo menos 6 caracteres")
        return
      }
      resultado = await criarUsuarioCompleto({
        email: formulario.email.trim(),
        senha: formulario.senha.trim(),
        nome: formulario.nome.trim(),
        role: formulario.role,
        paginas_permitidas: formulario.paginas_permitidas,
      })
    }

    setSalvando(false)

    if (resultado.error) {
      alert("Erro ao salvar: " + resultado.error.message)
      return
    }

    cancelarFormulario()
  }

  async function handleRemover(id) {
    if (id === sessao?.user?.id) {
      alert("Você não pode remover o próprio acesso por aqui.")
      return
    }
    if (!confirm("Remover essa pessoa? Isso apaga o login dela por completo, não dá pra desfazer.")) return

    const { error } = await removerUsuarioCompleto(id)
    if (error) alert("Erro ao remover: " + error.message)
  }

  if (!ehAdmin) {
    return (
      <div className="flex flex-col gap-4 max-w-md">
        <Card>
          <CardHeader>
            <CardTitle>Usuário logado</CardTitle>
            <CardDescription>
              {perfil?.nome ? `${perfil.nome} — ` : ""}
              {sessao?.user?.email}
              {" · "}
              Funcionário
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={sair}>
              <LogOut />
              Sair e trocar de usuário
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground">Gerencie quem tem acesso ao dashboard e o que cada um pode ver</p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={sair}>
            <LogOut />
            Sair
          </Button>
          {!mostrarFormulario && (
            <Button onClick={() => setMostrarFormulario(true)}>
              <UserPlus />
              Adicionar usuário
            </Button>
          )}
        </div>
      </div>

      {mostrarFormulario && (
        <Card>
          <CardHeader>
            <CardTitle>{editandoId ? "Editar usuário" : "Adicionar usuário"}</CardTitle>
            {!editandoId && (
              <CardDescription>
                Isso já cria o login de verdade — a pessoa consegue entrar direto com esse e-mail e senha.
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="nome-usuario">Nome</Label>
                <Input
                  id="nome-usuario"
                  value={formulario.nome}
                  onChange={(e) => setFormulario((f) => ({ ...f, nome: e.target.value }))}
                  className="w-[180px]"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email-usuario">E-mail</Label>
                <Input
                  id="email-usuario"
                  type="email"
                  value={formulario.email}
                  onChange={(e) => setFormulario((f) => ({ ...f, email: e.target.value }))}
                  disabled={!!editandoId}
                  className="w-[220px]"
                />
              </div>
              {!editandoId && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="senha-usuario">Senha</Label>
                  <Input
                    id="senha-usuario"
                    type="text"
                    placeholder="mín. 6 caracteres"
                    value={formulario.senha}
                    onChange={(e) => setFormulario((f) => ({ ...f, senha: e.target.value }))}
                    className="w-[160px]"
                  />
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <Label>Papel</Label>
                <Select
                  value={formulario.role}
                  onValueChange={(v) => setFormulario((f) => ({ ...f, role: v }))}
                >
                  <SelectTrigger className="w-[160px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="funcionario">Funcionário</SelectItem>
                    <SelectItem value="admin">Administrador</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {formulario.role === "funcionario" && (
              <div className="flex flex-col gap-2">
                <Label>Páginas permitidas</Label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {PAGINAS_DISPONIVEIS.map((pagina) => (
                    <label
                      key={pagina.chave}
                      className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                    >
                      <input
                        type="checkbox"
                        checked={formulario.paginas_permitidas.includes(pagina.chave)}
                        onChange={() => alternarPagina(pagina.chave)}
                        className="accent-primary"
                      />
                      {pagina.titulo}
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <Button onClick={handleSalvar} disabled={salvando}>
                {salvando ? "Salvando..." : "Salvar"}
              </Button>
              <Button variant="outline" onClick={cancelarFormulario}>
                <X />
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Usuários com acesso</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Papel</TableHead>
                <TableHead>Páginas permitidas</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {todosPerfis.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium" data-label="Nome">
                    {p.nome || "—"}
                    {p.id === sessao?.user?.id && (
                      <span className="ml-1.5 text-xs text-muted-foreground">(você)</span>
                    )}
                  </TableCell>
                  <TableCell data-label="E-mail">{p.email || "—"}</TableCell>
                  <TableCell data-label="Papel">{p.role === "admin" ? "Administrador" : "Funcionário"}</TableCell>
                  <TableCell data-label="Páginas permitidas">
                    {p.role === "admin"
                      ? "Todas"
                      : p.paginas_permitidas?.length
                        ? p.paginas_permitidas
                            .map((chave) => PAGINAS_DISPONIVEIS.find((pg) => pg.chave === chave)?.titulo || chave)
                            .join(", ")
                        : "Nenhuma"}
                  </TableCell>
                  <TableCell className="flex gap-2" data-label="Ações">
                    <Button variant="outline" size="sm" onClick={() => iniciarEdicao(p)}>
                      <Pencil />
                      Editar
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => handleRemover(p.id)}>
                      <Trash2 />
                      Remover
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {todosPerfis.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="celula-vazia text-center text-muted-foreground">
                    Nenhum usuário cadastrado ainda
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}