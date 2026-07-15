import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs"
import { ResumoTab } from "@/pages/resumo-tab"
import { ClientesTab } from "@/pages/clientes-tab"
import { MateriaPrimaTab } from "@/pages/materia-prima-tab"
import { ResumoClienteTab } from "@/pages/resumo-cliente-tab"
import { TransacoesTab } from "@/pages/transacoes-tab"
import { HistoricoMensalTab } from "@/pages/historico-mensal-tab"

export function DashboardHome() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">Meu Dashboard</h1>

      <Tabs defaultValue="resumo" className="w-full">
        <TabsList>
          <TabsTrigger value="resumo">Resumo</TabsTrigger>
          <TabsTrigger value="clientes">Cadastro de Clientes</TabsTrigger>
          <TabsTrigger value="materia-prima">Cadastro de Matéria-Prima</TabsTrigger>
          <TabsTrigger value="resumo-cliente">Resumo por Cliente</TabsTrigger>
          <TabsTrigger value="transacoes">Transações</TabsTrigger>
          <TabsTrigger value="historico">Histórico Mensal</TabsTrigger>
        </TabsList>

        <TabsContent value="resumo">
          <ResumoTab />
        </TabsContent>
        <TabsContent value="clientes">
          <ClientesTab />
        </TabsContent>
        <TabsContent value="materia-prima">
          <MateriaPrimaTab />
        </TabsContent>
        <TabsContent value="resumo-cliente">
          <ResumoClienteTab />
        </TabsContent>
        <TabsContent value="transacoes">
          <TransacoesTab />
        </TabsContent>
        <TabsContent value="historico">
          <HistoricoMensalTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}