import { createContext, useContext, useState } from "react"
import { CheckCircle2, XCircle } from "lucide-react"

const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  function mostrarToast(mensagem, tipo = "sucesso") {
    const id = crypto.randomUUID()
    setToasts((prev) => [...prev, { id, mensagem, tipo }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 3000)
  }

  return (
    <ToastContext.Provider value={{ mostrarToast }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-4 sm:items-end">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast-entra pointer-events-auto flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white shadow-lg ${
              t.tipo === "erro" ? "bg-destructive" : "bg-emerald-600"
            }`}
          >
            {t.tipo === "erro" ? (
              <XCircle className="h-4 w-4 shrink-0" />
            ) : (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            )}
            {t.mensagem}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const contexto = useContext(ToastContext)
  if (!contexto) {
    throw new Error("useToast precisa ser usado dentro de um ToastProvider")
  }
  return contexto
}