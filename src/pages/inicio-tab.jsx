import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useDashboardData } from "@/context/dashboard-data-context"

function formatarReais(valor) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function formatarSaldo(valor) {
  const numero = Math.abs(valor).toLocaleString("pt-BR")
  const sinal = valor < 0 ? "-" : ""
  return `${sinal}${numero} R$`
}

export function InicioTab({ onNavegar }) {
  const { clientes, transacoes } = useDashboardData()

  const totalEntrada = transacoes
    .filter((t) => t.tipo === "entrada")
    .reduce((soma, t) => soma + t.valor, 0)

  const totalSaida = transacoes
    .filter((t) => t.tipo === "saida")
    .reduce((soma, t) => soma + t.valor, 0)

  const saldo = totalEntrada - totalSaida
  const saldoPositivo = saldo >= 0

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground">
        Bem-vindo! Aqui está um resumo rápido do seu negócio.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
              Clientes cadastrados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="font-mono text-3xl font-medium tabular-nums">{clientes.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
              Transações registradas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="font-mono text-3xl font-medium tabular-nums">{transacoes.length}</div>
          </CardContent>
        </Card>

        <Card
          className="border-l-4"
          style={{ borderLeftColor: saldoPositivo ? "var(--color-chart-1)" : "var(--color-chart-2)" }}
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
              Saldo atual
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={`font-mono text-3xl font-medium tabular-nums ${
                saldoPositivo ? "text-foreground" : "text-destructive"
              }`}
            >
              {formatarSaldo(saldo)}
            </div>
          </CardContent>
        </Card>
      </div>

      <div>
        <Button onClick={() => onNavegar("resumo")}>Ver Financeiro completo</Button>
      </div>
    </div>
  )
}