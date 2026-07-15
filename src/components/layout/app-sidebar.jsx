import { useState } from "react"
import { Users, Settings, LayoutDashboard, Home, ChevronRight } from "lucide-react"
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

const paginasDashboard = [
  { chave: "resumo", titulo: "Resumo" },
  { chave: "clientes", titulo: "Cadastro de Clientes" },
  { chave: "materia-prima", titulo: "Cadastro de Matéria-Prima" },
  { chave: "resumo-cliente", titulo: "Resumo por Cliente" },
  { chave: "transacoes", titulo: "Transações" },
  { chave: "historico", titulo: "Histórico Mensal" },
]

export function AppSidebar({ paginaAtiva, onSelecionarPagina }) {
  const [menuAberto, setMenuAberto] = useState(true)

  return (
    <Sidebar>
      <SidebarHeader className="px-3 py-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-sidebar-primary font-heading text-sm font-semibold text-sidebar-primary-foreground">
            V
          </div>
          <div className="flex flex-col leading-tight">
            <span className="font-heading text-sm font-semibold text-sidebar-foreground">
              Dashboard VilaPack
            </span>
            <span className="text-[11px] text-sidebar-foreground/55">Controle financeiro</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] font-semibold tracking-wider text-sidebar-foreground/45 uppercase">
            Geral
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={paginaAtiva === "inicio"}
                  onClick={() => onSelecionarPagina("inicio")}
                >
                  <Home />
                  <span>Início</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  render={
                    <a href="#" className="no-underline text-inherit">
                      <Users />
                      <span>Usuários</span>
                    </a>
                  }
                />
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={paginaAtiva === "configuracoes"}
                  onClick={() => onSelecionarPagina("configuracoes")}
                >
                  <Settings />
                  <span>Configurações</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

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
                paginasDashboard.map((pagina) => (
                  <SidebarMenuItem key={pagina.chave}>
                    <SidebarMenuButton
                      isActive={paginaAtiva === pagina.chave}
                      onClick={() => onSelecionarPagina(pagina.chave)}
                      className="pl-8"
                    >
                      <span>{pagina.titulo}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}