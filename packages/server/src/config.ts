import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Ciudadan AgentOffice — server configuration.
 *
 * All settings are environment-driven and documented in `.env.example`.
 * Values already present in the environment are NEVER overridden by the
 * optional `.env` file (see `loadDotEnv`).
 */

export type OrchestrationMode = 'internal' | 'external';

export interface ServerConfig {
    /** 'external' (default): office is a visual shell driven by the external
     *  interface; no LLM, no tools, no autonomous behavior.
     *  'internal': original upstream behavior (Ollama think loop, tools...). */
    mode: OrchestrationMode;
    /** Network interface the server binds to. Local-only by default. */
    host: string;
    /** Colyseus + REST port. */
    port: number;
    /** Ollama endpoint — only used in 'internal' mode. */
    ollamaUrl: string;
    /** SQLite database file for tasks/layouts/memories. */
    databasePath: string;
    /** Hard cap of agent seats. Never exceeds 7 (no dynamic office growth). */
    maxSeats: number;
    /** Whether the external REST API accepts updates (external mode only). */
    externalApiEnabled: boolean;
    /** Clearly-identified demo/test data generator. Disabled by default. */
    externalDemoMode: boolean;
    // ─── Block 2: real agents integration ───
    /** Observe REAL Cline sessions (read-only) and mirror them in the office. */
    realAgentsEnabled: boolean;
    /** Cline data directory (contains db/sessions.db and sessions/). */
    clineDataDir: string;
    /** Poll interval for the read-only Cline watcher, in ms (min 2000). */
    clinePollIntervalMs: number;
    /** DSH observation source: 'none' (not installed) | 'http' (real provider). */
    dshSource: 'none' | 'http';
    /** Real DSH web origin (DSH_SOURCE=http), e.g. http://127.0.0.1:3080. */
    dshUrl?: string;
    /** Reserved: future DSH auth layer token. */
    dshToken?: string;
    /** DSH SessionId that owns/executes the goals created by the provider.
     *  Env: AGENTOFFICE_DSH_SESSION_ID — the harness injects its own
     *  DSH_SESSION_ID into child processes, so this name must not collide. */
    dshSessionId?: string;
    /** Path of the DSH harness credential store (.credentials.yaml) holding
     *  the persisted browser-session cookie-signing secret. */
    dshCredentialsPath: string;
    /** Round cap applied to goals created through the provider (1..50). */
    dshMaxGoalRounds: number;
    /** Optional token; when set, /api/external requires X-AgentOffice-Token. */
    externalApiToken?: string;
    /** Block 3: grace (ms) showing completed/offline sessions before
     *  their seat is released. 0 evicts terminal sessions immediately. */
    terminalGraceMs: number;
    // ─── Block 4: interactive control center ───
    /** MANDATORY server-side credential for ANY control write action.
     *  When empty, control write endpoints answer 503 (they never open
     *  silently). The operator configures it and supplies it from the UI. */
    controlToken?: string;
    /** Master switch for instruction dispatch to real Cline sessions.
     *  Disabled by default: dispatch also requires a validated adapter
     *  (see ClineControlAdapter capabilities). */
    instructionDispatchEnabled: boolean;
    /** Absolute path of the @cline/core ESM bundle (Cline SDK). */
    clineSdkPath: string;
    /** Hub discovery record (url + authToken, read in-memory only). */
    clineHubRecordPath: string;
    /** Max instruction requests per minute (global rate limit). */
    instructionRatePerMinute: number;
    // ─── Block 5: hub-managed sessions ───
    /** Provider/model used for office-launched hub sessions. */
    hubProviderId: string;
    hubModelId: string;
    /** Restrictive tool permissions for managed sessions (default off). */
    hubSessionTools: boolean;
    /** Isolated workspace root for managed sessions (one dir per session). */
    hubSessionWorkspaces: string;
    // ─── Block 5: security ───
    /** Optional token; when set, Colyseus WebSocket joins must present it. */
    officeWsToken?: string;
    /** When HOST is public: only this Origin may call the REST API. */
    allowedOrigin?: string;
}

/**
 * Minimal .env loader. Reads KEY=VALUE lines and applies them to
 * process.env ONLY for keys that are not already defined. Optional file:
 * any read error is silently ignored. No dependencies.
 */
export function loadDotEnv(filePath: string = '.env'): void {
    try {
        if (!fs.existsSync(filePath)) return;
        const lines = fs.readFileSync(filePath, 'utf-8').split(/\r?\n/);
        for (const raw of lines) {
            const line = raw.trim();
            if (!line || line.startsWith('#')) continue;
            const eq = line.indexOf('=');
            if (eq <= 0) continue;
            const key = line.slice(0, eq).trim();
            let value = line.slice(eq + 1).trim();
            if (
                (value.startsWith('"') && value.endsWith('"')) ||
                (value.startsWith("'") && value.endsWith("'"))
            ) {
                value = value.slice(1, -1);
            }
            if (!(key in process.env)) {
                process.env[key] = value;
            }
        }
    } catch {
        // .env is optional — ignore IO errors.
    }
}

function toBool(value: string | undefined, defaultValue: boolean): boolean {
    if (value === undefined || value === '') return defaultValue;
    return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function clampInt(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, Math.round(value)));
}

/** Expands a leading `~` to the user's home directory. */
export function expandHome(value: string): string {
    if (value.startsWith('~/') || value === '~') {
        const home = process.env.HOME || '';
        return value === '~' ? home : home + value.slice(1);
    }
    return value;
}

/** Default DSH credential store: <DSH_HOME>/.credentials.yaml (or ~/.dsh). */
function defaultDshCredentialsPath(): string {
    const dshHome = process.env.DSH_HOME && process.env.DSH_HOME.trim()
        ? process.env.DSH_HOME
        : path.join(os.homedir(), '.dsh');
    return path.join(dshHome, '.credentials.yaml');
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
    const rawMode = (env.AGENT_OFFICE_MODE || 'external').trim().toLowerCase();
    if (rawMode !== 'internal' && rawMode !== 'external') {
        throw new Error(
            `[Config] Invalid AGENT_OFFICE_MODE "${rawMode}". Use "external" or "internal".`
        );
    }

    const port = clampInt(Number(env.PORT || 3000) || 3000, 1, 65535);
    const maxSeats = clampInt(Number(env.MAX_SEATS || 7) || 7, 1, 7);

    const rawDshSource = (env.DSH_SOURCE || 'none').trim().toLowerCase();
    if (rawDshSource !== 'none' && rawDshSource !== 'http') {
        throw new Error(`[Config] Invalid DSH_SOURCE "${rawDshSource}". Use "none" or "http".`);
    }

    return {
        mode: rawMode,
        host: (env.HOST || '127.0.0.1').trim(),
        port,
        ollamaUrl: (env.OLLAMA_URL || 'http://127.0.0.1:11434').trim(),
        databasePath: (env.DATABASE_PATH || './data/office-memory.db').trim(),
        maxSeats,
        externalApiEnabled: toBool(env.EXTERNAL_API_ENABLED, true),
        externalDemoMode: toBool(env.EXTERNAL_DEMO_MODE, false),
        realAgentsEnabled: toBool(env.REAL_AGENTS_ENABLED, true),
        clineDataDir: expandHome((env.CLINE_DATA_DIR || '~/.cline/data').trim()),
        clinePollIntervalMs: clampInt(Number(env.CLINE_POLL_INTERVAL_MS || 5000) || 5000, 2000, 60000),
        dshSource: rawDshSource as 'none' | 'http',
        dshUrl: (env.DSH_URL || '').trim() || undefined,
        dshToken: (env.DSH_TOKEN || '').trim() || undefined,
        dshSessionId: (env.AGENTOFFICE_DSH_SESSION_ID || '').trim() || undefined,
        dshCredentialsPath: (env.AGENTOFFICE_DSH_CREDENTIALS || '').trim() || defaultDshCredentialsPath(),
        dshMaxGoalRounds: clampInt(Number(env.DSH_MAX_GOAL_ROUNDS || 8) || 8, 1, 50),
        externalApiToken: (env.EXTERNAL_API_TOKEN || '').trim() || undefined,
        terminalGraceMs: clampInt(Number(env.TERMINAL_GRACE_MS || 60000) || 60000, 0, 600000),
        controlToken: (env.AGENTOFFICE_CONTROL_TOKEN || '').trim() || undefined,
        instructionDispatchEnabled: toBool(env.INSTRUCTION_DISPATCH_ENABLED, false),
        clineSdkPath: (env.CLINE_SDK_PATH || '/usr/lib/node_modules/cline/node_modules/@cline/core/dist/index.js').trim(),
        clineHubRecordPath: (env.CLINE_HUB_RECORD_PATH || '~/.cline/data/locks/hub/production.json').trim().replace(/^~/, () => process.env.HOME || ''),
        instructionRatePerMinute: clampInt(Number(env.INSTRUCTION_RATE_PER_MINUTE || 10) || 10, 1, 120),
        hubProviderId: (env.HUB_PROVIDER_ID || 'nvidia').trim(),
        hubModelId: (env.HUB_MODEL_ID || 'z-ai/glm-5.3').trim(),
        hubSessionTools: toBool(env.HUB_SESSION_TOOLS, false),
        hubSessionWorkspaces: (env.HUB_SESSION_WORKSPACES || './data/hub-workspaces').trim(),
        officeWsToken: (env.OFFICE_WS_TOKEN || '').trim() || undefined,
        allowedOrigin: (env.ALLOWED_ORIGIN || '').trim() || undefined
    };
}

/** Human-readable summary used in startup logs. */
export function describeConfig(config: ServerConfig): string {
    return [
        `mode=${config.mode}`,
        `listen=${config.host}:${config.port}`,
        `ollama=${config.mode === 'internal' ? config.ollamaUrl : '(disabled)'}`,
        `db=${config.databasePath}`,
        `seats=${config.maxSeats}`,
        `externalApi=${config.externalApiEnabled ? 'enabled' : 'disabled'}`,
        `demoData=${config.externalDemoMode ? 'ON (test data)' : 'off'}`,
        `dsh=${config.dshSource}${config.dshSource === 'http' && config.dshUrl ? ` → ${config.dshUrl}` : ''}`
    ].join(' ');
}
