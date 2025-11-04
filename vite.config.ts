import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import polyfillNode from 'rollup-plugin-polyfill-node'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'

// Node core polyfills for browser build
const nodePolyfills = {
  path: 'path-browserify',
}

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, process.cwd(), '')
  const isElectron = process.env.BUILD_ELECTRON === 'true'
  
  return {
    // Use relative base only for Electron builds (file:// protocol)
    // Using './' in web deployments like Vercel causes chunk requests to
    // resolve relative to the current route (e.g. /signin/assets/...),
    // which breaks lazy loaded pages such as the sign-in screen. Setting
    // the base to '/' keeps asset URLs absolute while still allowing
    // Electron to opt in to the relative base when needed.
    base: isElectron ? './' : '/',
    plugins: [
      react(),
      ...(isElectron
        ? [
            electron([
              {
                // Main-Process entry file of the Electron App.
                entry: 'electron-main.ts',
                onstart(options) {
                  options.reload()
                },
                vite: {
                  build: {
                    sourcemap: true,
                    minify: process.env.NODE_ENV === 'production',
                    outDir: 'dist-electron',
                    rollupOptions: {
                      external: ['electron'],
                    },
                  },
                },
              },
              {
                entry: 'preload.ts',
                onstart(options) {
                  options.reload()
                },
                vite: {
                  build: {
                    sourcemap: 'inline',
                    minify: process.env.NODE_ENV === 'production',
                    outDir: 'dist-electron',
                    rollupOptions: {
                      external: ['electron'],
                    },
                  },
                },
              },
            ]),
            renderer({ nodeIntegration: false }),
          ]
        : []),
    ],
    resolve: {
      alias: nodePolyfills,
    },
    optimizeDeps: {
      esbuildOptions: {
        define: {
          global: 'globalThis',
          'process.env': '{}',
        },
      },
    },
    server: {
      port: 5173,
      open: true,
    },
    esbuild: {
      drop: process.env.NODE_ENV === 'production' ? ['console', 'debugger'] : [],
    },
    build: {
      sourcemap: false,
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        plugins: [polyfillNode()],
        output: {
          manualChunks: {
            // Split large vendor chunks for better caching
            react: ['react', 'react-dom', 'react-router-dom'],
            supabase: ['@supabase/supabase-js'],
            charts: ['chart.js', 'react-chartjs-2', 'recharts', '@mui/x-charts'],
            mui: ['@mui/material', '@mui/icons-material', '@emotion/react', '@emotion/styled'],
          },
        },
      },
      // Drop noisy logs in production bundles
      // Note: keep warnings in dev for debugging
      minify: 'esbuild',
      target: 'es2019',
      // Ensure assets are properly referenced in Electron
      assetsInlineLimit: 0,
      // Ensure proper asset paths for Electron
      assetsDir: 'assets',
    },
    // Define environment variables that should be available in production
    // These are embedded at build time from .env file or Vercel env vars
    // Note: Vite automatically exposes VITE_* env vars, but we define them explicitly for reliability
    define: {
      // Use process.env for build-time values, fallback to empty string
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(
        env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
      ),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(
        env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
      ),
      // Ensure mode is available
      'import.meta.env.MODE': JSON.stringify(mode),
      'import.meta.env.PROD': JSON.stringify(mode === 'production'),
      'import.meta.env.DEV': JSON.stringify(mode === 'development'),
    },
  }
})
