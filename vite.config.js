import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const liveApi = require('./electron/dev-api.cjs')

export default defineConfig({
  plugins: [react(), liveApi()],
  base: './',
  server: {
    port: 5173,
    host: 'localhost',
    strictPort: true,
  },
  build: {
    outDir: 'dist',
  },
})
