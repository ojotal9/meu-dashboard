import { createContext, useContext, useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/context/auth-context"

const PresenceContext = createContext(null)

export function PresenceProvider({ children }) {
  const { sessao, perfil } = useAuth()
  const [usuariosOnline, setUsuariosOnline] = useState([])

  useEffect(() => {
    if (!sessao?.user) return

    const canal = supabase.channel("presenca-dashboard", {
      config: { presence: { key: sessao.user.id } },
    })

    function atualizarLista() {
      const estado = canal.presenceState()
      const lista = Object.values(estado)
        .map((entradas) => entradas[0])
        .filter(Boolean)
        .sort((a, b) => (a.nome || "").localeCompare(b.nome || ""))
      setUsuariosOnline(lista)
    }

    canal
      .on("presence", { event: "sync" }, atualizarLista)
      .on("presence", { event: "join" }, atualizarLista)
      .on("presence", { event: "leave" }, atualizarLista)
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await canal.track({
            id: sessao.user.id,
            nome: perfil?.nome || sessao.user.email?.split("@")[0] || "Sem nome",
            email: sessao.user.email,
            desde: new Date().toISOString(),
          })
        }
      })

    return () => {
      supabase.removeChannel(canal)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessao?.user?.id])

  return (
    <PresenceContext.Provider value={{ usuariosOnline }}>
      {children}
    </PresenceContext.Provider>
  )
}

export function usePresence() {
  const contexto = useContext(PresenceContext)
  if (!contexto) {
    throw new Error("usePresence precisa ser usado dentro de um PresenceProvider")
  }
  return contexto
}