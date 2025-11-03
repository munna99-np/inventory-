import { contextBridge } from 'electron'

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electron', {
  // Add any Electron APIs you need to expose to the renderer process here
  platform: process.platform,
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron,
  },
})

// Inject Supabase configuration if available in process.env
// This allows Electron to access env vars that are available in the main process
if (process.env.VITE_SUPABASE_URL && process.env.VITE_SUPABASE_ANON_KEY) {
  contextBridge.exposeInMainWorld('__SUPABASE_CONFIG__', {
    VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY,
  })
}

// Type declarations for TypeScript
declare global {
  interface Window {
    electron: {
      platform: string
      versions: {
        node: string
        chrome: string
        electron: string
      }
    }
    __SUPABASE_CONFIG__?: {
      VITE_SUPABASE_URL: string
      VITE_SUPABASE_ANON_KEY: string
    }
  }
}
