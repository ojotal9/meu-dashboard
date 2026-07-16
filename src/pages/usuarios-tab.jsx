import { LogOut } from "lucide-react"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/context/auth-context"

export function UsuariosTab() {
  const { sessao, perfil, ehAdmin, sair } = useAuth()

  return (
    <div className="flex flex-col gap-4 max-w-md">
      <Card>
        <CardHeader>
          <CardTitle>Usuário logado</CardTitle>
          <CardDescription>
            {perfil?.nome ? `${perfil.nome} — ` : ""}
            {sessao?.user?.email}
            {" · "}
            {ehAdmin ? "Administrador" : "Funcionário"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={sair}>
            <LogOut />
            Sair e trocar de usuário
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}