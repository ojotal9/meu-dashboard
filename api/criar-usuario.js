import { createClient } from "@supabase/supabase-js"

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Método não permitido" })
    return
  }

  const token = (req.headers.authorization || "").replace("Bearer ", "")
  if (!token) {
    res.status(401).json({ error: "Não autenticado" })
    return
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    res.status(500).json({ error: "Configuração do servidor incompleta (faltam variáveis de ambiente)" })
    return
  }

  // Cliente com a chave pública, só pra confirmar quem está fazendo a requisição
  const supabaseComoUsuario = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })

  const {
    data: { user },
    error: erroUsuario,
  } = await supabaseComoUsuario.auth.getUser()

  if (erroUsuario || !user) {
    res.status(401).json({ error: "Sessão inválida" })
    return
  }

  // Cliente com a chave secreta — só existe aqui no servidor, nunca chega no navegador
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

  // Confirma que quem está pedindo é realmente um administrador
  const { data: perfilSolicitante, error: erroPerfil } = await supabaseAdmin
    .from("perfis")
    .select("role")
    .eq("id", user.id)
    .single()

  if (erroPerfil || perfilSolicitante?.role !== "admin") {
    res.status(403).json({ error: "Só administradores podem criar usuários" })
    return
  }

  const { email, senha, nome, role, paginas_permitidas, acoes_restritas } = req.body || {}

  if (!email || !senha || !nome) {
    res.status(400).json({ error: "Preencha e-mail, senha e nome" })
    return
  }

  // Cria o login de verdade no Supabase Auth
  const { data: novoUsuario, error: erroCriacao } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
  })

  if (erroCriacao) {
    res.status(400).json({ error: erroCriacao.message })
    return
  }

  // Cria o perfil (papel + páginas permitidas) ligado a esse login
  const { data: perfilCriado, error: erroPerfilNovo } = await supabaseAdmin
    .from("perfis")
    .insert({
      id: novoUsuario.user.id,
      nome,
      email,
      role: role === "admin" ? "admin" : "funcionario",
      paginas_permitidas: role === "admin" ? [] : paginas_permitidas || [],
      acoes_restritas: role === "admin" ? {} : acoes_restritas || {},
    })
    .select()
    .single()

  if (erroPerfilNovo) {
    // Se der erro ao criar o perfil, desfaz o login pra não ficar um usuário órfão
    await supabaseAdmin.auth.admin.deleteUser(novoUsuario.user.id)
    res.status(400).json({ error: erroPerfilNovo.message })
    return
  }

  res.status(200).json({ perfil: perfilCriado })
}