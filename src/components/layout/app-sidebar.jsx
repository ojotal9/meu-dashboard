import { useState } from "react"
import {
  Users,
  Settings,
  LayoutDashboard,
  Home,
  ChevronRight,
  LogOut,
  UserPlus,
  Package,
  ClipboardList,
  ArrowLeftRight,
  History,
  TrendingUp,
  Wallet,
} from "lucide-react"
import logoVilaPack from "@/assets/logo-vilapack.png"
import { useAuth } from "@/context/auth-context"
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

const paginasDashboard = [
  { chave: "clientes", titulo: "Cadastro de Clientes", Icone: UserPlus },
  { chave: "materia-prima", titulo: "Saídas", Icone: Package },
  { chave: "resumo-cliente", titulo: "Resumo por Cliente", Icone: ClipboardList },
  { chave: "transacoes", titulo: "Transações", Icone: ArrowLeftRight },
  { chave: "contas-receber", titulo: "Contas a Receber", Icone: TrendingUp },
  { chave: "contas-pagar", titulo: "Contas a Pagar", Icone: Wallet },
  { chave: "historico", titulo: "Histórico Mensal", Icone: History },
]

export function AppSidebar({ paginaAtiva, onSelecionarPagina }) {
  const [menuAberto, setMenuAberto] = useState(true)
  const { podeAcessar, sair } = useAuth()

  const paginasVisiveis = paginasDashboard.filter((pagina) => podeAcessar(pagina.chave))

  return (
    <Sidebar>
      <SidebarHeader className="p-3">
        <div className="flex flex-col gap-2 rounded-lg border-b-2 border-sidebar-primary bg-sidebar-accent/60 px-3 py-3">
          <img src={logoVilaPack} alt="VilaPack" className="h-11 w-auto object-contain" />
          <span className="text-[11px] text-sidebar-foreground/55">Controle financeiro</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] font-semibold tracking-wider text-sidebar-foreground/45 uppercase">
            Geral
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {podeAcessar("inicio") && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={paginaAtiva === "inicio"}
                    onClick={() => onSelecionarPagina("inicio")}
                  >
                    <Home />
                    <span>Início</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}

              {podeAcessar("usuarios") && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={paginaAtiva === "usuarios"}
                    onClick={() => onSelecionarPagina("usuarios")}
                  >
                    <Users />
                    <span>Usuários</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}

              {podeAcessar("configuracoes") && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={paginaAtiva === "configuracoes"}
                    onClick={() => onSelecionarPagina("configuracoes")}
                  >
                    <Settings />
                    <span>Configurações</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {paginasVisiveis.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-[10px] font-semibold tracking-wider text-sidebar-foreground/45 uppercase">
              Financeiro
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton onClick={() => setMenuAberto((aberto) => !aberto)}>
                    <LayoutDashboard />
                    <span>Módulos</span>
                    <ChevronRight
                      className={`ml-auto transition-transform ${menuAberto ? "rotate-90" : ""}`}
                    />
                  </SidebarMenuButton>
                </SidebarMenuItem>

                {menuAberto &&
                  paginasVisiveis.map((pagina) => (
                    <SidebarMenuItem key={pagina.chave}>
                      <SidebarMenuButton
                        isActive={paginaAtiva === pagina.chave}
                        onClick={() => onSelecionarPagina(pagina.chave)}
                        className="pl-8"
                      >
                        <pagina.Icone />
                        <span>{pagina.titulo}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={sair}>
              <LogOut />
              <span>Sair</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}