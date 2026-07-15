import { Sun, Moon } from "lucide-react"
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu"
import { useTheme } from "@/context/theme-context"
import { AppSidebar } from "./app-sidebar"

export function DashboardLayout({ children, paginaAtiva, onSelecionarPagina }) {
  const { tema, setTema } = useTheme()

  return (
    <SidebarProvider>
      <AppSidebar paginaAtiva={paginaAtiva} onSelecionarPagina={onSelecionarPagina} />
      <SidebarInset>
        <header className="flex h-14 items-center justify-between gap-2 border-b px-4">
          <div className="flex items-center gap-2">
            <SidebarTrigger />
            <span className="h-4 w-px bg-border" />
            <h1 className="font-heading text-sm font-medium text-foreground/70">Dashboard</h1>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="icon">
                  {tema === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setTema("light")}>
                <Sun className="h-4 w-4" />
                Claro
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTema("dark")}>
                <Moon className="h-4 w-4" />
                Escuro
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
        <main className="flex-1 p-4">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  )
}