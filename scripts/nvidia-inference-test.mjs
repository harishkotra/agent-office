#!/usr/bin/env node
/**
 * Ciudadan AgentOffice — Block 2 (FASE E): OPTIONAL NVIDIA inference test.
 *
 * Strictly optional, standalone verification of inference compatibility
 * through the EXISTING OpenAICompatibleAdapter (@agent-office/adapters).
 * It is completely isolated from the real Cline/DSH integration:
 *   - ONE single message, temperature 0, NO retries, NO concurrency.
 *   - NO tools, NO autonomous cycles, NO agent state is touched.
 *   - Never logs the API key.
 *
 * Configuration (env):
 *   NVIDIA_BASE_URL  default https://integrate.api.nvidia.com/v1
 *   NVIDIA_MODEL     default deepseek-ai/deepseek-v4-flash-0731 (subject
 *                    to availability in the account)
 *   NVIDIA_API_KEY   the credential. If unset, the script tries the
 *                    provider key configured in the authorized Cline
 *                    settings directory (CLINE_DATA_DIR or ~/.cline/data).
 *
 * Usage: npm run test:nvidia
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { OpenAICompatibleAdapter } from '../packages/adapters/dist/index.js';

const DEFAULT_BASE_URL = 'https://integrate.api.nvidia.com/v1';
const DEFAULT_MODEL = 'deepseek-ai/deepseek-v4-flash-0731';
const TIMEOUT_MS = 20_000;

/** Loads the repo-root .env without overriding existing variables. */
function loadRepoDotEnv() {
    try {
        const envFile = path.resolve(path.dirname(process.argv[1] || ''), '..', '.env');
        if (!fs.existsSync(envFile)) return;
        for (const raw of fs.readFileSync(envFile, 'utf-8').split(/\r?\n/)) {
            const line = raw.trim();
            if (!line || line.startsWith('#')) continue;
            const eq = line.indexOf('=');
            if (eq <= 0) continue;
            const key = line.slice(0, eq).trim();
            let value = line.slice(eq + 1).trim();
            if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
                value = value.slice(1, -1);
            }
            if (!(key in process.env)) process.env[key] = value;
        }
    } catch {
        // optional file — ignore
    }
}
loadRepoDotEnv();

/** Resolves the Cline data dir (CLINE_DATA_DIR or ~/.cline/data). */
function clineDataDir() {
    return process.env.CLINE_DATA_DIR || path.join(os.homedir(), '.cline', 'data');
}

function readClineProviderKey() {
    try {
        const providersFile = path.join(clineDataDir(), 'settings', 'providers.json');
        if (!fs.existsSync(providersFile)) return null;
        const raw = JSON.parse(fs.readFileSync(providersFile, 'utf-8'));
        const key = raw?.providers?.nvidia?.settings?.apiKey;
        return typeof key === 'string' && key.length > 8 ? key : null;
    } catch {
        return null;
    }
}

function normalizeBaseUrl(url) {
    // OpenAICompatibleAdapter appends '/v1/chat/completions' itself,
    // so a trailing '/v1' in the env var must be stripped.
    let base = String(url || DEFAULT_BASE_URL).trim();
    if (base.endsWith('/')) base = base.slice(0, -1);
    if (base.endsWith('/v1')) base = base.slice(0, -3);
    return base;
}

async function main() {
    const baseUrl = normalizeBaseUrl(process.env.NVIDIA_BASE_URL || DEFAULT_BASE_URL);
    const model = (process.env.NVIDIA_MODEL || DEFAULT_MODEL).trim();
    let apiKey = (process.env.NVIDIA_API_KEY || '').trim();
    let keySource = 'env:NVIDIA_API_KEY';
    if (!apiKey) {
        const clineKey = readClineProviderKey();
        if (clineKey) {
            apiKey = clineKey;
            keySource = 'cline:providers.json (authorized settings)';
        }
    }

    console.log('[NVIDIA test] mode: single-message inference compatibility check');
    console.log(`[NVIDIA test] base URL: ${baseUrl}`);
    console.log(`[NVIDIA test] model:    ${model}`);

    if (!apiKey) {
        console.log('[NVIDIA test] ❌ MISSING CREDENTIAL: NVIDIA_API_KEY is not set and no');
        console.log('              nvidia provider key exists in the authorized Cline settings.');
        console.log('              Configuration is ready — set NVIDIA_API_KEY to run this test.');
        process.exit(2);
    }
    console.log(`[NVIDIA test] credential: found (${keySource}) — value not shown`);

    const adapter = new OpenAICompatibleAdapter(baseUrl, apiKey, 'nvidia');

    const request = {
        model,
        messages: [
            { role: 'user', content: 'Responde únicamente con la palabra: OK' }
        ],
        temperature: 0
        // NOTE: no tools — model responses can never trigger tool execution.
    };

    const started = Date.now();
    try {
        const result = await Promise.race([
            adapter.complete(request),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error(`timeout after ${TIMEOUT_MS}ms`)), TIMEOUT_MS)
            )
        ]);

        const snippet = String(result.content || '').replace(/\s+/g, ' ').trim().slice(0, 120);
        console.log('[NVIDIA test] ✅ INFERENCE OK');
        console.log(`  response:  "${snippet}"`);
        console.log(`  usage:     prompt=${result.usage.prompt} tokens, completion=${result.usage.completion} tokens`);
        console.log(`  latency:   ${result.latency} ms (total ${Date.now() - started} ms)`);
        console.log('[NVIDIA test] No tools were offered; no autonomous behavior was triggered.');
        process.exit(0);
    } catch (e) {
        const message = String(e?.message || e);
        console.log('[NVIDIA test] ❌ INFERENCE FAILED');
        console.log(`  error: ${message.slice(0, 300)}`);
        if (/404|not found|model/i.test(message) && /model/i.test(message)) {
            console.log('  hint:  the model may not be available in this NVIDIA account.');
            console.log('         Set NVIDIA_MODEL to an available model and retry.');
        }
        if (/401|unauthorized|api key/i.test(message)) {
            console.log('  hint:  check the NVIDIA_API_KEY credential.');
        }
        process.exit(1);
    }
}

main();
