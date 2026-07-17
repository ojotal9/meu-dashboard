import { createContext, useContext, useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [sessao, setSessao] = useState(null)
  const [perfil, setPerfil] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [todosPerfis, setTodosPerfis] = useState([])

  async function carregarPerfil(userId) {
    const { data } = await supabase.from("perfis").select("*").eq("id", userId).single()
    setPerfil(data ?? null)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSessao(session)
      if (session?.user) {
        carregarPerfil(session.user.id).finally(() => setCarregando(false))
      } else {
        setCarregando(false)
      }
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_evento, session) => {
      setSessao(session)
      if (session?.user) {
        carregarPerfil(session.user.id)
      } else {
        setPerfil(null)
      }
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  async function entrar(email, senha) {
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
    return error
  }

  async function sair() {
    await supabase.auth.signOut()
  }

  // Enquanto o perfil não carrega, ninguém tem acesso a nada (evita "piscar" conteúdo)
  const ehAdmin = perfil?.role === "admin"

  function podeAcessar(chaveDaPagina) {
    if (ehAdmin) return true
    return perfil?.paginas_permitidas?.includes(chaveDaPagina) ?? false
  }

  // ---------- Gestão de usuários (perfis) — só admins conseguem, a política do banco garante isso ----------
  async function carregarTodosPerfis() {
    const { data, error } = await supabase.from("perfis").select("*").order("nome")
    if (!error) setTodosPerfis(data)
    return { data, error }
  }

  async function criarPerfil(novoPerfil) {
    const { data, error } = await supabase.from("perfis").insert(novoPerfil).select().single()
    if (!error) setTodosPerfis((prev) => [...prev, data].sort((a, b) => (a.nome || "").localeCompare(b.nome || "")))
    return { data, error }
  }

  async function atualizarPerfil(id, mudancas) {
    const { data, error } = await supabase.from("perfis").update(mudancas).eq("id", id).select().single()
    if (!error) {
      setTodosPerfis((prev) => prev.map((p) => (p.id === id ? data : p)))
      // Se a pessoa editou o próprio perfil, atualiza também o que está em uso agora
      if (perfil?.id === id) setPerfil(data)
    }
    return { data, error }
  }

  async function removerPerfil(id) {
    const { error } = await supabase.from("perfis").delete().eq("id", id)
    if (!error) setTodosPerfis((prev) => prev.filter((p) => p.id !== id))
    return { error }
  }

  const valor = {
    sessao,
    perfil,
    carregando,
    entrar,
    sair,
    ehAdmin,
    podeAcessar,
    todosPerfis,
    carregarTodosPerfis,
    criarPerfil,
    atualizarPerfil,
    removerPerfil,
  }

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const contexto = useContext(AuthContext)
  if (!contexto) {
    throw new Error("useAuth precisa ser usado dentro de um AuthProvider")
  }
  return contexto
}