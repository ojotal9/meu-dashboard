import { useRef, useState } from "react"
import { Download, Upload, AlertTriangle } from "lucide-react"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useDashboardData } from "@/context/dashboard-data-context"

export function ConfiguracoesTab() {
  const { clientes, materiaPrimas, transacoes, exportarDados, importarDados } = useDashboardData()
  const inputArquivoRef = useRef(null)
  const [mensagem, setMensagem] = useState(null) // { tipo: "sucesso" | "erro", texto: string }

  function handleExportar() {
    exportarDados()
    setMensagem({ tipo: "sucesso", texto: "Backup exportado! Verifique os downloads do navegador." })
  }

  function handleEscolherArquivo() {
    inputArquivoRef.current?.click()
  }

  function handleArquivoSelecionado(evento) {
    const arquivo = evento.target.files?.[0]
    // Limpa o input para permitir importar o mesmo arquivo de novo, se precisar
    evento.target.value = ""
    if (!arquivo) return

    const confirmar = window.confirm(
      "Importar este arquivo vai substituir todos os clientes, matérias-primas e transações atuais. Deseja continuar?"
    )
    if (!confirmar) return

    importarDados(arquivo)
      .then((resumo) => {
        setMensagem({
          tipo: "sucesso",
          texto: `Backup importado com sucesso: ${resumo.clientes} cliente(s), ${resumo.materiaPrimas} matéria(s)-prima e ${resumo.transacoes} transação(ões).`,
        })
      })
      .catch((erro) => {
        setMensagem({ tipo: "erro", texto: typeof erro === "string" ? erro : "Erro ao importar o backup." })
      })
  }

  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      <p className="text-muted-foreground">
        Seus dados ficam guardados só neste navegador. Exporte um backup regularmente para não
        perder nada e poder restaurar em outro computador ou navegador.
      </p>

      <Card>
        <CardHeader>
          <CardTitle>Exportar backup</CardTitle>
          <CardDescription>
            Baixa um arquivo .json com todos os clientes, matérias-primas e transações cadastrados.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="text-sm text-muted-foreground">
            Atualmente: {clientes.length} cliente(s), {materiaPrimas.length} matéria(s)-prima,{" "}
            {transacoes.length} transação(ões).
          </div>
          <div>
            <Button onClick={handleExportar}>
              <Download />
              Exportar backup (.json)
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Importar backup</CardTitle>
          <CardDescription>
            Restaura os dados a partir de um arquivo .json exportado anteriormente.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-start gap-2 rounded-md border border-yellow-600/30 bg-yellow-600/10 p-3 text-sm text-yellow-700 dark:text-yellow-400">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              Importar substitui totalmente os dados atuais deste navegador. Exporte um backup
              antes, se quiser guardar o que já está cadastrado.
            </span>
          </div>
          <div>
            <Button variant="outline" onClick={handleEscolherArquivo}>
              <Upload />
              Escolher arquivo de backup
            </Button>
            <input
              ref={inputArquivoRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={handleArquivoSelecionado}
            />
          </div>
        </CardContent>
      </Card>

      {mensagem && (
        <div
          className={`rounded-md border p-3 text-sm ${
            mensagem.tipo === "sucesso"
              ? "border-green-600/30 bg-green-600/10 text-green-700 dark:text-green-400"
              : "border-destructive/30 bg-destructive/10 text-destructive"
          }`}
        >
          {mensagem.texto}
        </div>
      )}
    </div>
  )
}
