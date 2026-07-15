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

// Converte uma chave de mês/ano no formato "aaaa-mm" para "mm-aaaa"
export function formatarMesAnoBR(chave) {
  if (!chave) return ""
  const [ano, mes] = chave.split("-")
  if (!ano || !mes) return chave
  return `${mes}-${ano}`
}