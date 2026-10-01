/**
 * LineList Application Entry Point
 *
 * This is the main entry point for the LineList application.
 * It sets up React with StrictMode and wraps the app in the LocaleProvider
 * for international number format support.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { LocaleProvider } from './contexts/LocaleContext'
import { ErrorBoundary } from './components/ErrorBoundary'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Outermost, so a failure while starting up shows a message rather than
        a blank page; each module has its own boundary inside App. */}
    <div className="h-screen flex flex-col">
      <ErrorBoundary>
        <LocaleProvider>
          <App />
        </LocaleProvider>
      </ErrorBoundary>
    </div>
  </StrictMode>,
)
