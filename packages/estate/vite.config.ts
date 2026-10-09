import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  assetsInclude: ['**/*.wasm'],
  optimizeDeps: {
    exclude: ['@dimforge/rapier3d-compat'],
  },
  server: {
    port: 5174,
    strictPort: true,
    host: true,
  },
})
