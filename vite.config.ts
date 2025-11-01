import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import polyfillNode from 'rollup-plugin-polyfill-node'

// Node core polyfills for browser build
const nodePolyfills = {
  path: 'path-browserify',
}

export default defineConfig({
  plugins: [react()],
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
  },
})
