import { app, BrowserWindow } from 'electron'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

// Note: Environment variables are embedded during build via vite.config.ts
// No need to load .env file in production - values are already in the code

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬─┬ dist-electron
// │ │ │ ├── main.js
// │ │ │ └── preload.js
// │ │
// Fix path resolution for packaged and unpackaged builds
if (app.isPackaged) {
  // In production, paths are relative to the app
  process.env.DIST = join(__dirname, '../dist')
  process.env.VITE_PUBLIC = process.env.DIST
} else {
  // In development, use standard paths
  process.env.DIST = join(__dirname, '../dist')
  process.env.VITE_PUBLIC = join(process.env.DIST, '../public')
}

let win: BrowserWindow | null = null
// Here, you can also use other preload
const preload = join(__dirname, 'preload.js')
const indexHtml = join(process.env.DIST!, 'index.html')

function createWindow() {
  const vitePublic = process.env.VITE_PUBLIC || join(process.env.DIST!, '../public')
  win = new BrowserWindow({
    icon: join(vitePublic, 'favicon.ico'),
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload,
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
    },
    titleBarStyle: 'default',
    show: false, // Don't show until ready
  })

  // Show window when ready to prevent visual flash
  win.once('ready-to-show', () => {
    win?.show()
  })

  // Test if it's a Vite dev server URL or a production build
  if (!app.isPackaged && process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL)
    win.webContents.openDevTools()
  } else {
    // Load from file system in production
    // Use loadFile for proper Electron file loading with hash router
    try {
      // Load the HTML file first, then let React Router handle the hash
      win.loadFile(indexHtml, { hash: 'signin' }).catch((err) => {
        console.error('Failed to load index.html:', err)
        console.error('Attempted path:', indexHtml)
        // Fallback: Try loading without hash, router will handle default route
        win?.loadFile(indexHtml).catch((fallbackErr) => {
          console.error('Fallback load also failed:', fallbackErr)
        })
      })
    } catch (err) {
      console.error('Error in loadFile:', err)
      // Last resort: try direct file URL
      const filePath = indexHtml.replace(/\\/g, '/')
      win?.loadURL(`file://${filePath}#/signin`)
    }
  }

  // Handle navigation errors
  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error('Failed to load:', errorCode, errorDescription, validatedURL)
    if (app.isPackaged) {
      win?.webContents.executeJavaScript(`
        document.body.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100vh; font-family: sans-serif;">
          <div style="text-align: center;">
            <h1>Failed to Load</h1>
            <p>Error: ${errorDescription}</p>
            <p>Check console for details</p>
          </div>
        </div>';
      `)
    }
  })

  // Enable console logging in production for debugging
  win.webContents.on('console-message', (_event, level, message) => {
    console.log(`[Renderer ${level}]:`, message)
  })

  win.on('closed', () => {
    win = null
  })
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  // On macOS, re-create a window when the dock icon is clicked and there are no
  // other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// This method will be called when Electron has finished initialization and is
// ready to create browser windows. Some APIs can only be used after this event
// occurs.
app.on('ready', () => {
  createWindow()
})

// Exit cleanly on request from parent process in development mode.
if (import.meta.url === `file://${process.argv[1]}`) {
  app.quit()
}
