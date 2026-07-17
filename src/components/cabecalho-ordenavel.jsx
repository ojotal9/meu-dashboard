import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react"
import { TableHead } from "@/components/ui/table"

export function CabecalhoOrdenavel({ coluna, ordenacao, aoClicar, children }) {
  const ativo = ordenacao.coluna === coluna
  const Icone = ativo ? (ordenacao.direcao === "asc" ? ChevronUp : ChevronDown) : ChevronsUpDown

  return (
    <TableHead>
      <button
        type="button"
        onClick={() => aoClicar(coluna)}
        className="flex items-center gap-1 text-left hover:text-foreground"
      >
        {children}
        <Icone className={`h-3.5 w-3.5 ${ativo ? "text-foreground" : "text-muted-foreground/60"}`} />
      </button>
    </TableHead>
  )
}