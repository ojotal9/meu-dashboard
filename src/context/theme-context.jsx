import { createContext, useContext, useEffect, useState } from "react"

const ThemeContext = createContext(null)
const CHAVE_TEMA = "meudashboard_tema"

export function ThemeProvider({ children }) {
  const [tema, setTema] = useState(() => {
    const salvo = localStorage.getItem(CHAVE_TEMA)
    if (salvo) return salvo
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
  })

  useEffect(() => {
    const root = document.documentElement
    if (tema === "dark") {
      root.classList.add("dark")
    } else {
      root.classList.remove("dark")
    }
    localStorage.setItem(CHAVE_TEMA, tema)
  }, [tema])

  return (
    <ThemeContext.Provider value={{ tema, setTema }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const contexto = useContext(ThemeContext)
  if (!contexto) {
    throw new Error("useTheme precisa ser usado dentro de um ThemeProvider")
  }
  return contexto
}