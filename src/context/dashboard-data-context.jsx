import { createContext, useContext, useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { useToast } from "@/context/toast-context"
import { adicionarMesesData, gerarValoresParcelas } from "@/lib/utils"

const DashboardDataContext = createContext(null)

// Linha fixa usada na tabela "metas" — é uma meta única do negócio, não uma por linha/usuário
const ID_META = "00000000-0000-0000-0000-000000000001"

// Remove o "id" de cada item, deixando o banco gerar um novo — usado ao importar backup
function removerIds(itens) {
  return itens.map(({ id, ...resto }) => resto)
}

export function DashboardDataProvider({ children }) {
  const { mostrarToast } = useToast()
  const [clientes, setClientes] = useState([])
  const [materiaPrimas, setMateriaPrimas] = useState([])
  const [transacoes, setTransacoes] = useState([])
  const [contasReceber, setContasReceber] = useState([])
  const [contasPagar, setContasPagar] = useState([])
  const [meta, setMeta] = useState(0)
  const [carregando, setCarregando] = useState(true)

  // ---------- Busca de uma tabela por vez (usado no tempo real e após ações em lote) ----------
  async function carregarClientes() {
    const { data, error } = await supabase.from("clientes").select("*").order("created_at")
    if (!error) setClientes(data)
  }

  async function carregarMateriaPrimas() {
    const { data, error } = await supabase.from("materia_primas").select("*").order("created_at")
    if (!error) setMateriaPrimas(data)
  }

  async function carregarTransacoes() {
    const { data, error } = await supabase.from("transacoes").select("*").order("created_at")
    if (!error) setTransacoes(data)
  }

  async function carregarContasReceber() {
    const { data, error } = await supabase.from("contas_receber").select("*").order("vencimento")
    if (!error) setContasReceber(data)
  }

  async function carregarContasPagar() {
    const { data, error } = await supabase.from("contas_pagar").select("*").order("vencimento")
    if (!error) setContasPagar(data)
  }

  async function carregarMeta() {
    const { data, error } = await supabase.from("metas").select("*").eq("id", ID_META).maybeSingle()
    if (!error && data) setMeta(data.valor)
  }

  async function carregarTudo() {
    await Promise.all([
      carregarClientes(),
      carregarMateriaPrimas(),
      carregarTransacoes(),
      carregarContasReceber(),
      carregarContasPagar(),
      carregarMeta(),
    ])
    setCarregando(false)
  }

  useEffect(() => {
    carregarTudo()

    // Escuta mudanças feitas por OUTRAS pessoas e atualiza só a tabela que mudou
    // (as próprias ações da pessoa já atualizam a tela na hora, sem esperar isso aqui)
    const canal = supabase
      .channel("dashboard-mudancas")
      .on("postgres_changes", { event: "*", schema: "public", table: "clientes" }, carregarClientes)
      .on("postgres_changes", { event: "*", schema: "public", table: "materia_primas" }, carregarMateriaPrimas)
      .on("postgres_changes", { event: "*", schema: "public", table: "transacoes" }, carregarTransacoes)
      .on("postgres_changes", { event: "*", schema: "public", table: "contas_receber" }, carregarContasReceber)
      .on("postgres_changes", { event: "*", schema: "public", table: "contas_pagar" }, carregarContasPagar)
      .on("postgres_changes", { event: "*", schema: "public", table: "metas" }, carregarMeta)
      .subscribe()

    return () => {
      supabase.removeChannel(canal)
    }
  }, [])

  // ---------- Meta ----------
  // Usa sempre a mesma linha fixa na tabela "metas" — é uma meta única do negócio,
  // não uma por usuário.
  async function definirMeta(valor) {
    const { data, error } = await supabase
      .from("metas")
      .upsert({ id: ID_META, valor })
      .select()
      .single()
    if (error) {
      alert("Erro ao salvar meta: " + error.message)
      return
    }
    setMeta(data.valor)
    mostrarToast("Meta salva")
  }

  // ---------- Clientes ----------
  async function adicionarCliente(cliente) {
    const { data, error } = await supabase.from("clientes").insert(cliente).select().single()
    if (error) {
      alert("Erro ao adicionar cliente: " + error.message)
      return
    }
    setClientes((prev) => [...prev, data])
    mostrarToast("Cliente adicionado")
  }

  async function atualizarCliente(id, mudancas) {
    const { data, error } = await supabase.from("clientes").update(mudancas).eq("id", id).select().single()
    if (error) {
      alert("Erro ao atualizar cliente: " + error.message)
      return
    }
    setClientes((prev) => prev.map((c) => (c.id === id ? data : c)))
    mostrarToast("Cliente atualizado")
  }

  async function removerCliente(id) {
    const { error } = await supabase.from("clientes").delete().eq("id", id)
    if (error) {
      alert("Erro ao remover cliente: " + error.message)
      return
    }
    setClientes((prev) => prev.filter((c) => c.id !== id))
    mostrarToast("Cliente removido")
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

    setMateriaPrimas((prev) => [...prev, data])

    // Toda compra de matéria-prima também vira uma "saída" automática nas transações
    await adicionarTransacao(
      {
        cliente: `Matéria-prima: ${data.tipo}`,
        valor: data.valor,
        tipo: "saida",
        categoria: "Matéria-prima",
        data: data.data,
      },
      { semAviso: true }
    )

    mostrarToast("Saída adicionada")
  }

  async function atualizarMateriaPrima(id, mudancas) {
    const itemAntigo = materiaPrimas.find((m) => m.id === id)
    const { data, error } = await supabase
      .from("materia_primas")
      .update(mudancas)
      .eq("id", id)
      .select()
      .single()

    if (error) {
      alert("Erro ao atualizar saída: " + error.message)
      return
    }

    setMateriaPrimas((prev) => prev.map((m) => (m.id === id ? data : m)))

    // Atualiza também a transação automática que essa saída gerou
    if (itemAntigo) {
      const { data: transacaoAtualizada } = await supabase
        .from("transacoes")
        .update({
          cliente: `Matéria-prima: ${data.tipo}`,
          valor: data.valor,
          data: data.data,
        })
        .eq("tipo", "saida")
        .eq("cliente", `Matéria-prima: ${itemAntigo.tipo}`)
        .eq("valor", itemAntigo.valor)
        .eq("data", itemAntigo.data)
        .select()
        .single()

      if (transacaoAtualizada) {
        setTransacoes((prev) => prev.map((t) => (t.id === transacaoAtualizada.id ? transacaoAtualizada : t)))
      }
    }

    mostrarToast("Saída atualizada")
  }

  async function removerMateriaPrima(id) {
    const item = materiaPrimas.find((m) => m.id === id)
    const { error } = await supabase.from("materia_primas").delete().eq("id", id)

    if (error) {
      alert("Erro ao remover matéria-prima: " + error.message)
      return
    }

    setMateriaPrimas((prev) => prev.filter((m) => m.id !== id))

    // Remove também a saída correspondente das transações
    if (item) {
      const cliente = `Matéria-prima: ${item.tipo}`
      await supabase
        .from("transacoes")
        .delete()
        .eq("tipo", "saida")
        .eq("cliente", cliente)
        .eq("valor", item.valor)
        .eq("data", item.data)

      setTransacoes((prev) =>
        prev.filter(
          (t) => !(t.tipo === "saida" && t.cliente === cliente && t.valor === item.valor && t.data === item.data)
        )
      )
    }

    mostrarToast("Saída removida")
  }

  // ---------- Transações ----------
  async function adicionarTransacao(transacao, opcoes = {}) {
    const { data, error } = await supabase.from("transacoes").insert(transacao).select().single()
    if (error) {
      alert("Erro ao adicionar transação: " + error.message)
      return
    }
    setTransacoes((prev) => [...prev, data])
    if (!opcoes.semAviso) mostrarToast("Transação adicionada")
  }

  async function atualizarTransacao(id, mudancas) {
    const { data, error } = await supabase.from("transacoes").update(mudancas).eq("id", id).select().single()
    if (error) {
      alert("Erro ao atualizar transação: " + error.message)
      return
    }
    setTransacoes((prev) => prev.map((t) => (t.id === id ? data : t)))
    mostrarToast("Transação atualizada")
  }

  async function removerTransacao(id) {
    const { error } = await supabase.from("transacoes").delete().eq("id", id)
    if (error) {
      alert("Erro ao remover transação: " + error.message)
      return
    }
    setTransacoes((prev) => prev.filter((t) => t.id !== id))
    mostrarToast("Transação removida")
  }

  // ---------- Contas a Receber ----------
  async function adicionarContaReceber(conta) {
    const parcelas = conta.forma_pagamento === "cartao_credito" ? conta.parcelas || 1 : 1
    const valoresParcelas = gerarValoresParcelas(conta.valor, parcelas)
    const grupoParcela = parcelas > 1 ? crypto.randomUUID() : null

    const registrosNovos = []
    for (let i = 0; i < parcelas; i++) {
      const registro = {
        descricao: conta.descricao,
        cliente: conta.cliente,
        vencimento: adicionarMesesData(conta.vencimento, i),
        valor: valoresParcelas[i],
        status: conta.status,
        forma_pagamento: conta.forma_pagamento,
        parcelas,
        parcela_atual: i + 1,
        grupo_parcela: grupoParcela,
      }

      const { data, error } = await supabase.from("contas_receber").insert(registro).select().single()
      if (error) {
        alert("Erro ao adicionar conta a receber: " + error.message)
        return
      }
      registrosNovos.push(data)

      // Toda conta a receber já entra automaticamente como entrada nas transações/gráficos
      await adicionarTransacao(
        {
          cliente: `Conta a receber: ${data.descricao}`,
          valor: data.valor,
          tipo: "entrada",
          categoria: "Contas a Receber",
          data: data.vencimento.slice(0, 7),
        },
        { semAviso: true }
      )
    }

    setContasReceber((prev) => [...prev, ...registrosNovos])
    mostrarToast(parcelas > 1 ? `Conta a receber adicionada em ${parcelas}x` : "Conta a receber adicionada")
  }

  async function marcarContaReceberComoRecebida(id) {
    const { data, error } = await supabase
      .from("contas_receber")
      .update({ status: "recebido" })
      .eq("id", id)
      .select()
      .single()
    if (error) {
      alert("Erro ao atualizar conta: " + error.message)
      return
    }
    setContasReceber((prev) => prev.map((c) => (c.id === id ? data : c)))
    mostrarToast("Conta marcada como recebida")
  }

  async function reabrirContaReceber(id) {
    const { data, error } = await supabase
      .from("contas_receber")
      .update({ status: "pendente" })
      .eq("id", id)
      .select()
      .single()
    if (error) {
      alert("Erro ao atualizar conta: " + error.message)
      return
    }
    setContasReceber((prev) => prev.map((c) => (c.id === id ? data : c)))
    mostrarToast("Conta reaberta")
  }

  async function removerContaReceber(id) {
    const conta = contasReceber.find((c) => c.id === id)
    const { error } = await supabase.from("contas_receber").delete().eq("id", id)
    if (error) {
      alert("Erro ao remover conta: " + error.message)
      return
    }
    setContasReceber((prev) => prev.filter((c) => c.id !== id))

    // Remove também a entrada correspondente das transações
    if (conta) {
      const cliente = `Conta a receber: ${conta.descricao}`
      const mes = conta.vencimento.slice(0, 7)
      await supabase
        .from("transacoes")
        .delete()
        .eq("tipo", "entrada")
        .eq("cliente", cliente)
        .eq("valor", conta.valor)
        .eq("data", mes)

      setTransacoes((prev) =>
        prev.filter((t) => !(t.tipo === "entrada" && t.cliente === cliente && t.valor === conta.valor && t.data === mes))
      )
    }

    mostrarToast("Conta a receber removida")
  }

  // ---------- Contas a Pagar ----------
  async function adicionarContaPagar(conta) {
    const parcelas = conta.forma_pagamento === "cartao_credito" ? conta.parcelas || 1 : 1
    const valoresParcelas = gerarValoresParcelas(conta.valor, parcelas)
    const grupoParcela = parcelas > 1 ? crypto.randomUUID() : null

    const registrosNovos = []
    for (let i = 0; i < parcelas; i++) {
      const registro = {
        descricao: conta.descricao,
        fornecedor: conta.fornecedor,
        vencimento: adicionarMesesData(conta.vencimento, i),
        valor: valoresParcelas[i],
        status: conta.status,
        forma_pagamento: conta.forma_pagamento,
        parcelas,
        parcela_atual: i + 1,
        grupo_parcela: grupoParcela,
      }

      const { data, error } = await supabase.from("contas_pagar").insert(registro).select().single()
      if (error) {
        alert("Erro ao adicionar conta a pagar: " + error.message)
        return
      }
      registrosNovos.push(data)

      // Toda conta a pagar já entra automaticamente como saída nas transações/gráficos
      await adicionarTransacao(
        {
          cliente: `Conta a pagar: ${data.descricao}`,
          valor: data.valor,
          tipo: "saida",
          categoria: "Contas a Pagar",
          data: data.vencimento.slice(0, 7),
        },
        { semAviso: true }
      )
    }

    setContasPagar((prev) => [...prev, ...registrosNovos])
    mostrarToast(parcelas > 1 ? `Conta a pagar adicionada em ${parcelas}x` : "Conta a pagar adicionada")
  }

  async function marcarContaPagarComoPaga(id) {
    const { data, error } = await supabase
      .from("contas_pagar")
      .update({ status: "pago" })
      .eq("id", id)
      .select()
      .single()
    if (error) {
      alert("Erro ao atualizar conta: " + error.message)
      return
    }
    setContasPagar((prev) => prev.map((c) => (c.id === id ? data : c)))
    mostrarToast("Conta marcada como paga")
  }

  async function reabrirContaPagar(id) {
    const { data, error } = await supabase
      .from("contas_pagar")
      .update({ status: "pendente" })
      .eq("id", id)
      .select()
      .single()
    if (error) {
      alert("Erro ao atualizar conta: " + error.message)
      return
    }
    setContasPagar((prev) => prev.map((c) => (c.id === id ? data : c)))
    mostrarToast("Conta reaberta")
  }

  async function removerContaPagar(id) {
    const conta = contasPagar.find((c) => c.id === id)
    const { error } = await supabase.from("contas_pagar").delete().eq("id", id)
    if (error) {
      alert("Erro ao remover conta: " + error.message)
      return
    }
    setContasPagar((prev) => prev.filter((c) => c.id !== id))

    // Remove também a saída correspondente das transações
    if (conta) {
      const cliente = `Conta a pagar: ${conta.descricao}`
      const mes = conta.vencimento.slice(0, 7)
      await supabase
        .from("transacoes")
        .delete()
        .eq("tipo", "saida")
        .eq("cliente", cliente)
        .eq("valor", conta.valor)
        .eq("data", mes)

      setTransacoes((prev) =>
        prev.filter((t) => !(t.tipo === "saida" && t.cliente === cliente && t.valor === conta.valor && t.data === mes))
      )
    }

    mostrarToast("Conta a pagar removida")
  }

  // ---------- Limpar tudo ----------
  async function limparDados() {
    await supabase.from("transacoes").delete().neq("id", "00000000-0000-0000-0000-000000000000")
    await supabase.from("materia_primas").delete().neq("id", "00000000-0000-0000-0000-000000000000")
    await carregarTransacoes()
    await carregarMateriaPrimas()
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
    meta,
    definirMeta,
    carregando,
    adicionarCliente,
    atualizarCliente,
    removerCliente,
    adicionarMateriaPrima,
    atualizarMateriaPrima,
    removerMateriaPrima,
    adicionarTransacao,
    atualizarTransacao,
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