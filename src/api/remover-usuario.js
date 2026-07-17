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

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

  const { data: perfilSolicitante } = await supabaseAdmin
    .from("perfis")
    .select("role")
    .eq("id", user.id)
    .single()

  if (perfilSolicitante?.role !== "admin") {
    res.status(403).json({ error: "Só administradores podem remover usuários" })
    return
  }

  const { id } = req.body || {}
  if (!id) {
    res.status(400).json({ error: "Falta o id do usuário" })
    return
  }
  if (id === user.id) {
    res.status(400).json({ error: "Você não pode remover o próprio acesso" })
    return
  }

  // Remove o login do Supabase Auth — a linha em "perfis" some junto automaticamente
  // (a tabela tem "on delete cascade" ligada ao login)
  const { error } = await supabaseAdmin.auth.admin.deleteUser(id)
  if (error) {
    res.status(400).json({ error: error.message })
    return
  }

  res.status(200).json({ ok: true })
}