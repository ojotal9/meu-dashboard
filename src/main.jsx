import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { DashboardDataProvider } from './context/dashboard-data-context.jsx'
import { ThemeProvider } from './context/theme-context.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <DashboardDataProvider>
        <App />
      </DashboardDataProvider>
    </ThemeProvider>
  </StrictMode>,
)
