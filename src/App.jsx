import { useState } from "react"
import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { LoginScreen } from "@/components/layout/login-screen"
import { DashboardDataProvider } from "@/context/dashboard-data-context"
import { useAuth } from "@/context/auth-context"
import { InicioTab } from "@/pages/inicio-tab"
import { ClientesTab } from "@/pages/clientes-tab"
import { MateriaPrimaTab } from "@/pages/materia-prima-tab"
import { ResumoClienteTab } from "@/pages/resumo-cliente-tab"
import { TransacoesTab } from "@/pages/transacoes-tab"
import { HistoricoMensalTab } from "@/pages/historico-mensal-tab"
import { ConfiguracoesTab } from "@/pages/configuracoes-tab"
import { UsuariosTab } from "@/pages/usuarios-tab"
import { ContasReceberTab } from "@/pages/contas-receber-tab"
import { ContasPagarTab } from "@/pages/contas-pagar-tab"

const TODAS_PAGINAS = {
  inicio: { titulo: "Início", Componente: InicioTab },
  clientes: { titulo: "Cadastro de Clientes", Componente: ClientesTab },
  "materia-prima": { titulo: "Saídas", Componente: MateriaPrimaTab },
  "resumo-cliente": { titulo: "Resumo por Cliente", Componente: ResumoClienteTab },
  transacoes: { titulo: "Transações", Componente: TransacoesTab },
  historico: { titulo: "Histórico Mensal", Componente: HistoricoMensalTab },
  "contas-receber": { titulo: "Contas a Receber", Componente: ContasReceberTab },
  "contas-pagar": { titulo: "Contas a Pagar", Componente: ContasPagarTab },
  configuracoes: { titulo: "Configurações", Componente: ConfiguracoesTab },
  usuarios: { titulo: "Usuários", Componente: UsuariosTab },
}

function ConteudoDashboard() {
  const { podeAcessar } = useAuth()
  const [paginaAtiva, setPaginaAtiva] = useState("inicio")

  const paginasPermitidas = Object.keys(TODAS_PAGINAS).filter(podeAcessar)

  if (paginasPermitidas.length === 0) {
    return (
      <div className="flex min-h-svh items-center justify-center p-4 text-center text-muted-foreground">
        Seu usuário ainda não tem acesso a nenhuma página. Fale com o administrador.
      </div>
    )
  }

  // Se a página guardada no estado não é mais permitida, cai para a primeira disponível
  const paginaEfetiva = paginasPermitidas.includes(paginaAtiva) ? paginaAtiva : paginasPermitidas[0]
  const { titulo, Componente } = TODAS_PAGINAS[paginaEfetiva]

  return (
    <DashboardLayout paginaAtiva={paginaEfetiva} onSelecionarPagina={setPaginaAtiva} titulo={titulo}>
      <div key={paginaEfetiva} className="flex flex-col gap-4 animar-entrada">
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
          {titulo}
        </h1>
        <Componente />
      </div>
    </DashboardLayout>
  )
}

function App() {
  const { sessao, carregando } = useAuth()

  if (carregando) {
    return (
      <div className="flex min-h-svh items-center justify-center text-muted-foreground">
        Carregando...
      </div>
    )
  }

  if (!sessao) {
    return <LoginScreen />
  }

  // Os dados do Supabase só são buscados depois que a pessoa está autenticada
  return (
    <DashboardDataProvider>
      <ConteudoDashboard />
    </DashboardDataProvider>
  )
}

export default App