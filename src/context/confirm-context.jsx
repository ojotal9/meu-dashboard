import { createContext, useCallback, useContext, useRef, useState } from "react"
import { AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"

const ConfirmContext = createContext(null)

export function ConfirmProvider({ children }) {
  const [estado, setEstado] = useState(null)
  const resolverRef = useRef(null)

  const confirmar = useCallback((opcoes) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve
      setEstado({
        titulo: opcoes?.titulo || "Tem certeza?",
        descricao: opcoes?.descricao || "Essa ação não pode ser desfeita.",
        textoConfirmar: opcoes?.textoConfirmar || "Remover",
        destrutivo: opcoes?.destrutivo ?? true,
      })
    })
  }, [])

  function responder(valor) {
    setEstado(null)
    resolverRef.current?.(valor)
    resolverRef.current = null
  }

  return (
    <ConfirmContext.Provider value={confirmar}>
      {children}
      <Dialog
        open={!!estado}
        onOpenChange={(aberto) => {
          if (!aberto) responder(false)
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <div className="flex items-center gap-2">
              {estado?.destrutivo && (
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-destructive/10">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                </span>
              )}
              <DialogTitle>{estado?.titulo}</DialogTitle>
            </div>
            <DialogDescription>{estado?.descricao}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => responder(false)}>
              Cancelar
            </Button>
            <Button variant={estado?.destrutivo ? "destructive" : "default"} onClick={() => responder(true)}>
              {estado?.textoConfirmar}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  )
}

export function useConfirm() {
  const contexto = useContext(ConfirmContext)
  if (!contexto) {
    throw new Error("useConfirm precisa ser usado dentro de um ConfirmProvider")
  }
  return contexto
}