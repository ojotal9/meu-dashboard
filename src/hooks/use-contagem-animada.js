import { useEffect, useRef, useState } from "react"

// Anima um número contando suavemente do valor anterior até o novo valor,
// em vez de trocar de uma vez. Usado nos números grandes dos cards do dashboard.
export function useContagemAnimada(valorFinal, duracaoMs = 600) {
  const [valorExibido, setValorExibido] = useState(valorFinal)
  const valorAnteriorRef = useRef(valorFinal)
  const frameRef = useRef(null)

  useEffect(() => {
    const valorInicial = valorAnteriorRef.current
    const diferenca = valorFinal - valorInicial

    if (!diferenca) {
      setValorExibido(valorFinal)
      return
    }

    const inicio = performance.now()

    function passo(agora) {
      const progresso = Math.min((agora - inicio) / duracaoMs, 1)
      const suavizado = 1 - Math.pow(1 - progresso, 3) // ease-out cúbico
      setValorExibido(valorInicial + diferenca * suavizado)

      if (progresso < 1) {
        frameRef.current = requestAnimationFrame(passo)
      } else {
        valorAnteriorRef.current = valorFinal
        setValorExibido(valorFinal)
      }
    }

    frameRef.current = requestAnimationFrame(passo)
    return () => cancelAnimationFrame(frameRef.current)
  }, [valorFinal, duracaoMs])

  return valorExibido
}
