/**
 * EpiKit Application Entry Point
 *
 * This is the main entry point for the EpiKit application.
 * It sets up React with StrictMode and wraps the app in the LocaleProvider
 * for international number format support.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { LocaleProvider } from './contexts/LocaleContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LocaleProvider>
      <App />
    </LocaleProvider>
  </StrictMode>,
)
