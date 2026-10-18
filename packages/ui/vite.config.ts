import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [
        react()
    ],
    server: {
        port: 7777,
        proxy: {
            '/api': 'http://localhost:3000',
        }
    },
    build: {
        outDir: 'dist',
        // Phaser is intentionally shipped as a dedicated game-engine vendor chunk.
        // Keep the production build warning focused on unexpected app-bundle growth.
        chunkSizeWarningLimit: 1300,
        rollupOptions: {
            output: {
                manualChunks: {
                    phaser: ['phaser'],
                    react: ['react', 'react-dom'],
                    colyseus: ['colyseus.js', '@colyseus/schema']
                }
            }
        }
    }
});
