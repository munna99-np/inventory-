import './index.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from './App'
import { applyTheme } from './lib/settings'

const isElectron =
  typeof window !== 'undefined' &&
  (window.process?.type === 'renderer' || (window.navigator as any)?.userAgent?.includes('Electron'))

try {
  applyTheme()
} catch {}

if (isElectron) {
  try {
    if (!localStorage.getItem('app_locale')) {
      localStorage.setItem('app_locale', 'en-IN')
    }
    if (!localStorage.getItem('app_currency')) {
      localStorage.setItem('app_currency', 'INR')
    }
  } catch (error) {
    console.warn('Could not initialize localStorage:', error)
  }
}

if (typeof window !== 'undefined') {
  import('./lib/offlineStorage').then(({ offlineStorage }) => {
    offlineStorage.init().catch((error) => {
      console.error('Failed to initialize offline storage:', error)
    })
  })

  import('./lib/syncService').then(({ syncService }) => {
    if (syncService.isConnected()) {
      syncService.sync().catch((error) => {
        console.error('Initial sync failed:', error)
      })
    }
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
