import { useState } from "react"
import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { InicioTab } from "@/pages/inicio-tab"
import { ResumoTab } from "@/pages/resumo-tab"
import { ClientesTab } from "@/pages/clientes-tab"
import { MateriaPrimaTab } from "@/pages/materia-prima-tab"
import { ResumoClienteTab } from "@/pages/resumo-cliente-tab"
import { TransacoesTab } from "@/pages/transacoes-tab"
import { HistoricoMensalTab } from "@/pages/historico-mensal-tab"
import { ConfiguracoesTab } from "@/pages/configuracoes-tab"

function App() {
  const [paginaAtiva, setPaginaAtiva] = useState("inicio")

  const PAGINAS = {
    inicio: { titulo: "Início", Componente: () => <InicioTab onNavegar={setPaginaAtiva} /> },
    resumo: { titulo: "Resumo", Componente: ResumoTab },
    clientes: { titulo: "Cadastro de Clientes", Componente: ClientesTab },
    "materia-prima": { titulo: "Cadastro de Matéria-Prima", Componente: MateriaPrimaTab },
    "resumo-cliente": { titulo: "Resumo por Cliente", Componente: ResumoClienteTab },
    transacoes: { titulo: "Transações", Componente: TransacoesTab },
    historico: { titulo: "Histórico Mensal", Componente: HistoricoMensalTab },
    configuracoes: { titulo: "Configurações", Componente: ConfiguracoesTab },
  }

  const { titulo, Componente } = PAGINAS[paginaAtiva]

  return (
    <DashboardLayout paginaAtiva={paginaAtiva} onSelecionarPagina={setPaginaAtiva}>
      <div className="flex flex-col gap-4">
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
          {titulo}
        </h1>
        <Componente />
      </div>
    </DashboardLayout>
  )
}

export default App