import { createContext, useContext, useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

const DashboardDataContext = createContext(null)

// Remove o "id" de cada item, deixando o banco gerar um novo — usado ao importar backup
function removerIds(itens) {
  return itens.map(({ id, ...resto }) => resto)
}

export function DashboardDataProvider({ children }) {
  const [clientes, setClientes] = useState([])
  const [materiaPrimas, setMateriaPrimas] = useState([])
  const [transacoes, setTransacoes] = useState([])
  const [contasReceber, setContasReceber] = useState([])
  const [contasPagar, setContasPagar] = useState([])
  const [carregando, setCarregando] = useState(true)

  async function carregarTudo() {
    const [resClientes, resMateriaPrimas, resTransacoes, resContasReceber, resContasPagar] =
      await Promise.all([
        supabase.from("clientes").select("*").order("created_at"),
        supabase.from("materia_primas").select("*").order("created_at"),
        supabase.from("transacoes").select("*").order("created_at"),
        supabase.from("contas_receber").select("*").order("vencimento"),
        supabase.from("contas_pagar").select("*").order("vencimento"),
      ])

    if (!resClientes.error) setClientes(resClientes.data)
    if (!resMateriaPrimas.error) setMateriaPrimas(resMateriaPrimas.data)
    if (!resTransacoes.error) setTransacoes(resTransacoes.data)
    if (!resContasReceber.error) setContasReceber(resContasReceber.data)
    if (!resContasPagar.error) setContasPagar(resContasPagar.data)
    setCarregando(false)
  }

  useEffect(() => {
    carregarTudo()

    // Escuta mudanças feitas por qualquer pessoa e atualiza a tela na hora
    const canal = supabase
      .channel("dashboard-mudancas")
      .on("postgres_changes", { event: "*", schema: "public", table: "clientes" }, carregarTudo)
      .on("postgres_changes", { event: "*", schema: "public", table: "materia_primas" }, carregarTudo)
      .on("postgres_changes", { event: "*", schema: "public", table: "transacoes" }, carregarTudo)
      .on("postgres_changes", { event: "*", schema: "public", table: "contas_receber" }, carregarTudo)
      .on("postgres_changes", { event: "*", schema: "public", table: "contas_pagar" }, carregarTudo)
      .subscribe()

    return () => {
      supabase.removeChannel(canal)
    }
  }, [])

  // ---------- Clientes ----------
  async function adicionarCliente(cliente) {
    const { error } = await supabase.from("clientes").insert(cliente)
    if (error) alert("Erro ao adicionar cliente: " + error.message)
  }

  async function removerCliente(id) {
    const { error } = await supabase.from("clientes").delete().eq("id", id)
    if (error) alert("Erro ao remover cliente: " + error.message)
  }

  // ---------- Matéria-prima ----------
  async function adicionarMateriaPrima(materiaPrima) {
    const { data, error } = await supabase
      .from("materia_primas")
      .insert(materiaPrima)
      .select()
      .single()

    if (error) {
      alert("Erro ao adicionar matéria-prima: " + error.message)
      return
    }

    // Toda compra de matéria-prima também vira uma "saída" automática nas transações
    await adicionarTransacao({
      cliente: `Matéria-prima: ${data.tipo}`,
      valor: data.valor,
      tipo: "saida",
      categoria: "Matéria-prima",
      data: data.data,
    })
  }

  async function removerMateriaPrima(id) {
    const item = materiaPrimas.find((m) => m.id === id)
    const { error } = await supabase.from("materia_primas").delete().eq("id", id)

    if (error) {
      alert("Erro ao remover matéria-prima: " + error.message)
      return
    }

    // Remove também a saída correspondente das transações
    if (item) {
      await supabase
        .from("transacoes")
        .delete()
        .eq("tipo", "saida")
        .eq("cliente", `Matéria-prima: ${item.tipo}`)
        .eq("valor", item.valor)
        .eq("data", item.data)
    }
  }

  // ---------- Transações ----------
  async function adicionarTransacao(transacao) {
    const { error } = await supabase.from("transacoes").insert(transacao)
    if (error) alert("Erro ao adicionar transação: " + error.message)
  }

  async function removerTransacao(id) {
    const { error } = await supabase.from("transacoes").delete().eq("id", id)
    if (error) alert("Erro ao remover transação: " + error.message)
  }

  // ---------- Contas a Receber ----------
  async function adicionarContaReceber(conta) {
    const { error } = await supabase.from("contas_receber").insert(conta)
    if (error) alert("Erro ao adicionar conta a receber: " + error.message)
  }

  async function marcarContaReceberComoRecebida(id) {
    const { error } = await supabase.from("contas_receber").update({ status: "recebido" }).eq("id", id)
    if (error) alert("Erro ao atualizar conta: " + error.message)
  }

  async function reabrirContaReceber(id) {
    const { error } = await supabase.from("contas_receber").update({ status: "pendente" }).eq("id", id)
    if (error) alert("Erro ao atualizar conta: " + error.message)
  }

  async function removerContaReceber(id) {
    const { error } = await supabase.from("contas_receber").delete().eq("id", id)
    if (error) alert("Erro ao remover conta: " + error.message)
  }

  // ---------- Contas a Pagar ----------
  async function adicionarContaPagar(conta) {
    const { error } = await supabase.from("contas_pagar").insert(conta)
    if (error) alert("Erro ao adicionar conta a pagar: " + error.message)
  }

  async function marcarContaPagarComoPaga(id) {
    const { error } = await supabase.from("contas_pagar").update({ status: "pago" }).eq("id", id)
    if (error) alert("Erro ao atualizar conta: " + error.message)
  }

  async function reabrirContaPagar(id) {
    const { error } = await supabase.from("contas_pagar").update({ status: "pendente" }).eq("id", id)
    if (error) alert("Erro ao atualizar conta: " + error.message)
  }

  async function removerContaPagar(id) {
    const { error } = await supabase.from("contas_pagar").delete().eq("id", id)
    if (error) alert("Erro ao remover conta: " + error.message)
  }

  // ---------- Limpar tudo ----------
  async function limparDados() {
    await supabase.from("transacoes").delete().neq("id", "00000000-0000-0000-0000-000000000000")
    await supabase.from("materia_primas").delete().neq("id", "00000000-0000-0000-0000-000000000000")
  }

  // ---------- Backup (exportar / importar) ----------
  function exportarDados() {
    const backup = {
      versao: 1,
      exportadoEm: new Date().toISOString(),
      clientes,
      materiaPrimas,
      transacoes,
      contasReceber,
      contasPagar,
    }

    const conteudo = JSON.stringify(backup, null, 2)
    const blob = new Blob([conteudo], { type: "application/json" })
    const url = URL.createObjectURL(blob)

    const dataArquivo = new Date().toISOString().slice(0, 10)
    const link = document.createElement("a")
    link.href = url
    link.download = `meu-dashboard-backup-${dataArquivo}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  // Lê um arquivo de backup (File do input), substitui os dados atuais no banco
  // compartilhado e retorna um resumo do que foi importado.
  async function importarDados(arquivo) {
    if (!arquivo) {
      throw "Nenhum arquivo selecionado"
    }

    let dados
    try {
      const texto = await arquivo.text()
      dados = JSON.parse(texto)
    } catch {
      throw "Não foi possível ler o arquivo. Verifique se é um backup gerado pelo próprio dashboard."
    }

    if (!dados || typeof dados !== "object") {
      throw "O arquivo não parece ser um backup válido"
    }

    const novosClientes = Array.isArray(dados.clientes) ? dados.clientes : []
    const novasMateriaPrimas = Array.isArray(dados.materiaPrimas) ? dados.materiaPrimas : []
    const novasTransacoes = Array.isArray(dados.transacoes) ? dados.transacoes : []
    const novasContasReceber = Array.isArray(dados.contasReceber) ? dados.contasReceber : []
    const novasContasPagar = Array.isArray(dados.contasPagar) ? dados.contasPagar : []

    // Substitui completamente o que está no banco compartilhado
    await supabase.from("transacoes").delete().neq("id", "00000000-0000-0000-0000-000000000000")
    await supabase.from("materia_primas").delete().neq("id", "00000000-0000-0000-0000-000000000000")
    await supabase.from("clientes").delete().neq("id", "00000000-0000-0000-0000-000000000000")
    await supabase.from("contas_receber").delete().neq("id", "00000000-0000-0000-0000-000000000000")
    await supabase.from("contas_pagar").delete().neq("id", "00000000-0000-0000-0000-000000000000")

    if (novosClientes.length) await supabase.from("clientes").insert(removerIds(novosClientes))
    if (novasMateriaPrimas.length)
      await supabase.from("materia_primas").insert(removerIds(novasMateriaPrimas))
    if (novasTransacoes.length) await supabase.from("transacoes").insert(removerIds(novasTransacoes))
    if (novasContasReceber.length)
      await supabase.from("contas_receber").insert(removerIds(novasContasReceber))
    if (novasContasPagar.length)
      await supabase.from("contas_pagar").insert(removerIds(novasContasPagar))

    await carregarTudo()

    return {
      clientes: novosClientes.length,
      materiaPrimas: novasMateriaPrimas.length,
      transacoes: novasTransacoes.length,
      contasReceber: novasContasReceber.length,
      contasPagar: novasContasPagar.length,
    }
  }

  const valor = {
    clientes,
    materiaPrimas,
    transacoes,
    contasReceber,
    contasPagar,
    carregando,
    adicionarCliente,
    removerCliente,
    adicionarMateriaPrima,
    removerMateriaPrima,
    adicionarTransacao,
    removerTransacao,
    adicionarContaReceber,
    marcarContaReceberComoRecebida,
    reabrirContaReceber,
    removerContaReceber,
    adicionarContaPagar,
    marcarContaPagarComoPaga,
    reabrirContaPagar,
    removerContaPagar,
    limparDados,
    exportarDados,
    importarDados,
  }

  return (
    <DashboardDataContext.Provider value={valor}>
      {children}
    </DashboardDataContext.Provider>
  )
}

export function useDashboardData() {
  const contexto = useContext(DashboardDataContext)
  if (!contexto) {
    throw new Error("useDashboardData precisa ser usado dentro de um DashboardDataProvider")
  }
  return contexto
}