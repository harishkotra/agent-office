import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import * as path from 'path';

// Ciudadan AgentOffice — UI dev server configuration.
// Reads UI_*/PORT/HOST variables from the repo root .env file and the
// process environment (process.env always wins; nothing is overridden).
// Binds to 127.0.0.1 by default — no public exposure.
export default defineConfig(({ mode }) => {
    const fileEnv = loadEnv(mode, path.resolve(__dirname, '../..'), ['UI_', 'PORT', 'HOST', 'AGENT_OFFICE_']);
    const env: Record<string, string> = { ...fileEnv, ...(process.env as Record<string, string>) };

    const uiHost = env.UI_HOST || '127.0.0.1';
    const uiPort = Number(env.UI_PORT || 5173);
    const serverHost = env.HOST || '127.0.0.1';
    const serverPort = Number(env.PORT || 3000);

    return {
        plugins: [
            react()
        ],
        // Block 3 (FASE F — Discord/embedding readiness): the WebSocket
        // endpoint is BUILD-TIME configurable so the UI never depends on
        // a hardcoded host/port. Deployments (iframe, /esfericulos)
        // inject VITE_WS_URL / VITE_WS_PORT; local dev falls back to
        // window.location.hostname (iframe-safe).
        define: {
            __AGENT_OFFICE_WS_URL__: JSON.stringify(env.VITE_WS_URL || ''),
            __AGENT_OFFICE_WS_PORT__: JSON.stringify(env.VITE_WS_PORT || '')
        },
        server: {
            host: uiHost,
            port: uiPort,
            proxy: {
                '/api': `http://${serverHost}:${serverPort}`,
            }
        },
        build: {
            outDir: 'dist'
        }
    };
});
