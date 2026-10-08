import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    outDir: 'dist-perf',
    emptyOutDir: true,
    rollupOptions: {
      input: 'perf.html',
    },
  },
})
