import { clsx } from "clsx";
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// Converte uma data completa no formato "aaaa-mm-dd" para "dd-mm-aaaa"
export function formatarDataBR(dataIso) {
  if (!dataIso) return ""
  const [ano, mes, dia] = dataIso.split("-")
  if (!ano || !mes || !dia) return dataIso
  return `${dia}-${mes}-${ano}`
}

// Aplica a máscara dd/mm/aaaa enquanto a pessoa digita
export function mascararDataDigitada(valor) {
  const digitos = valor.replace(/\D/g, "").slice(0, 8)
  const partes = []
  if (digitos.length > 0) partes.push(digitos.slice(0, 2))
  if (digitos.length > 2) partes.push(digitos.slice(2, 4))
  if (digitos.length > 4) partes.push(digitos.slice(4, 8))
  return partes.join("/")
}

// Converte "dd/mm/aaaa" para "aaaa-mm-dd". Retorna null se a data for inválida.
export function dataBrParaIso(dataBr) {
  const partes = (dataBr || "").split("/")
  if (partes.length !== 3) return null

  const [diaTexto, mesTexto, anoTexto] = partes
  if (anoTexto.length !== 4) return null

  const dia = parseInt(diaTexto, 10)
  const mes = parseInt(mesTexto, 10)
  const ano = parseInt(anoTexto, 10)
  if (!dia || !mes || !ano) return null

  const dataObjeto = new Date(ano, mes - 1, dia)
  const dataValida =
    dataObjeto.getFullYear() === ano &&
    dataObjeto.getMonth() === mes - 1 &&
    dataObjeto.getDate() === dia
  if (!dataValida) return null

  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`
}

// Converte "aaaa-mm-dd" para "dd/mm/aaaa" (usado para preencher o campo de data)
export function dataIsoParaBr(dataIso) {
  if (!dataIso) return ""
  const [ano, mes, dia] = dataIso.split("-")
  if (!ano || !mes || !dia) return ""
  return `${dia}/${mes}/${ano}`
}

// Ordena uma lista por uma coluna (campo do objeto), em ordem crescente ou decrescente.
// Funciona com texto e número, e coloca valores vazios sempre por último.
export function ordenarLista(lista, coluna, direcao) {
  if (!coluna) return lista
  const copia = [...lista]
  copia.sort((a, b) => {
    const va = a[coluna]
    const vb = b[coluna]
    if (va == null || va === "") return 1
    if (vb == null || vb === "") return -1
    if (typeof va === "number" && typeof vb === "number") {
      return direcao === "asc" ? va - vb : vb - va
    }
    return direcao === "asc"
      ? String(va).localeCompare(String(vb), "pt-BR")
      : String(vb).localeCompare(String(va), "pt-BR")
  })
  return copia
}

const NOMES_MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]

// Converte uma chave de mês/ano no formato "aaaa-mm" para "Mês de aaaa" (ex: "Julho de 2026")
export function formatarMesAnoBR(chave) {
  if (!chave) return ""
  const [ano, mes] = chave.split("-")
  const numeroMes = parseInt(mes, 10)
  if (!ano || !numeroMes || numeroMes < 1 || numeroMes > 12) return chave
  return `${NOMES_MESES[numeroMes - 1]} de ${ano}`
}

// Estilo padrão do tooltip dos gráficos (Recharts), pra acompanhar o tema claro/escuro
// do dashboard em vez do fundo branco fixo que vem por padrão.
export const estiloTooltipGrafico = {
  contentStyle: {
    backgroundColor: "var(--color-popover)",
    borderColor: "var(--color-border)",
    borderRadius: "0.5rem",
    color: "var(--color-popover-foreground)",
  },
  labelStyle: { color: "var(--color-popover-foreground)", fontWeight: 700 },
  itemStyle: { color: "var(--color-popover-foreground)" },
}