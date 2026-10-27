import * as fs from 'fs';
import { ServerConfig } from '../../config';
import {
    ControlCapabilities,
    BLOCKED_DISPATCH_REASONS
} from './ControlCapabilities';

/**
 * Block 4 — Authorized, decoupled adapter for Cline session control
 * (FASE D). Wraps the @cline/core SDK in hub mode.
 *
 * Investigation verdict recorded during FASE A (see
 * docs/ciudadan/CONTROL_CENTER.md):
 *  - The SDK connects to the running hub daemon using the discovery
 *    record's endpoint + authToken (read IN-MEMORY; never logged).
 *  - list/get/readMessages/subscribe/start/send all work at the
 *    transport level.
 *  - EXISTING TUI sessions are NOT hub-registered: send() cannot reach
 *    them, and attaching a second process would be invasive (forbidden).
 *  - End-to-end inference via the hub requires provider credentials in
 *    the hub's own config dir, which this machine lacks (and copying
 *    provider keys is out of scope by spec).
 * → dispatch stays DISABLED with an explicit cause until the operator
 *   enables it AND the adapter validates against a working hub.
 */
export class ClineControlAdapter {
    private sdk: any = null;
    private core: any = null;
    private lastCapabilities: ControlCapabilities | null = null;

    constructor(private readonly config: ServerConfig) {}

    /** Loads the SDK (ESM) dynamically from the configured path. */
    private async loadSdk(): Promise<any> {
        if (this.sdk) return this.sdk;
        try {
            if (!fs.existsSync(this.config.clineSdkPath)) return null;
            this.sdk = await import(this.config.clineSdkPath);
            return this.sdk;
        } catch {
            return null;
        }
    }

    /** Reads the hub discovery record (url + token) — in memory only. */
    private readHubRecord(): { url: string; token: string } | null {
        try {
            const rec = JSON.parse(fs.readFileSync(this.config.clineHubRecordPath, 'utf-8'));
            if (rec?.url && rec?.authToken) {
                return { url: String(rec.url), token: String(rec.authToken) };
            }
            return null;
        } catch {
            return null;
        }
    }

    /** Connects (or returns the existing connection). Never throws. */
    private async connect(): Promise<any> {
        if (this.core) return this.core;
        const sdk = await this.loadSdk();
        if (!sdk?.ClineCore) return null;
        const record = this.readHubRecord();
        if (!record) return null;
        try {
            this.core = await sdk.ClineCore.create({
                clientName: 'ciudadan-agentoffice',
                backendMode: 'hub',
                hub: {
                    endpoint: record.url,
                    authToken: record.token,
                    clientType: 'agentoffice',
                    displayName: 'Ciudadan AgentOffice'
                }
            });
            return this.core;
        } catch {
            this.core = null;
            return null;
        }
    }

    /**
     * HONEST capability report. `dispatchAvailable` is true ONLY when:
     * config enables dispatch AND the hub is connected AND it has at
     * least one dispatchable (hub-registered) session.
     */
    async getCapabilities(force = false): Promise<ControlCapabilities> {
        if (!force && this.lastCapabilities
            && Date.now() - Date.parse(this.lastCapabilities.checkedAt) < 30_000) {
            return this.lastCapabilities;
        }

        const sdk = await this.loadSdk();
        const sdkLoaded = Boolean(sdk?.ClineCore);
        const hubRecordReadable = Boolean(this.readHubRecord());
        let hubConnected = false;
        let hubSessions = 0;

        if (sdkLoaded && hubRecordReadable) {
            const core = await this.connect();
            if (core) {
                try {
                    const sessions = await core.list(50);
                    hubSessions = Array.isArray(sessions) ? sessions.length : 0;
                    hubConnected = true;
                } catch {
                    hubConnected = false;
                }
            }
        }

        let dispatchAvailable = false;
        let dispatchCause = '';
        if (!this.config.instructionDispatchEnabled) {
            dispatchCause = BLOCKED_DISPATCH_REASONS.disabledByConfig;
        } else if (!sdkLoaded) {
            dispatchCause = BLOCKED_DISPATCH_REASONS.noSdk;
        } else if (!hubRecordReadable) {
            dispatchCause = BLOCKED_DISPATCH_REASONS.noHubRecord;
        } else if (!hubConnected) {
            dispatchCause = BLOCKED_DISPATCH_REASONS.hubUnreachable;
        } else if (hubSessions === 0) {
            dispatchCause = BLOCKED_DISPATCH_REASONS.noDispatchableSessions;
        } else {
            dispatchAvailable = true;
            dispatchCause = 'validado a nivel transporte; el hub hospeda sesiones despachables.';
        }

        const caps: ControlCapabilities = {
            sdkLoaded,
            hubRecordReadable,
            hubConnected,
            hubSessions,
            dispatchAvailable,
            dispatchCause,
            readOnly: {
                listSessions: hubConnected,
                getSession: hubConnected,
                readMessages: hubConnected,
                subscribe: hubConnected
            },
            checkedAt: new Date().toISOString()
        };
        this.lastCapabilities = caps;
        return caps;
    }

    /**
     * Sends an instruction to a HUB-REGISTERED session. The caller is
     * responsible for authorization; this method re-validates the
     * capabilities and refuses otherwise (defense in depth).
     */
    async dispatch(sessionId: string, prompt: string): Promise<{ ok: boolean; error?: string }> {
        const caps = await this.getCapabilities(true);
        if (!caps.dispatchAvailable) {
            return { ok: false, error: caps.dispatchCause };
        }
        const core = await this.connect();
        if (!core) return { ok: false, error: 'hub no conectado' };
        try {
            await core.send({ sessionId, prompt, delivery: 'queue', timeoutMs: 60_000 });
            return { ok: true };
        } catch (e: any) {
            return { ok: false, error: String(e?.message || e).slice(0, 200) };
        }
    }

    /** Read-only: hub session list (ids + statuses; no secrets). */
    async listHubSessions(): Promise<Array<{ sessionId: string; status: string }>> {
        const core = await this.connect();
        if (!core) return [];
        try {
            const sessions = await core.list(50);
            return (Array.isArray(sessions) ? sessions : []).map((s: any) => ({
                sessionId: String(s.session_id ?? s.sessionId ?? ''),
                status: String(s.status ?? '')
            })).filter((s: any) => s.sessionId);
        } catch {
            return [];
        }
    }

    /**
     * Block 5 (FASE B): starts a NEW hub-managed session with a
     * persistent id, restrictive tool permissions and an ISOLATED
     * workspace. Never touches existing TUI sessions.
     */
    async startManagedSession(input: {
        providerId: string;
        modelId: string;
        workspaceDir: string;
        systemPrompt: string;
        prompt?: string;
        enableTools: boolean;
        /** E2E-verified: interactive sessions STAY ALIVE between turns
         *  (one-shot sessions die after their first turn). */
        interactive: boolean;
    }): Promise<{ ok: boolean; sessionId?: string; error?: string }> {
        const core = await this.connect();
        if (!core) return { ok: false, error: 'hub no conectado' };
        try {
            const result = await core.start({
                source: 'agentoffice',
                config: {
                    providerId: input.providerId,
                    modelId: input.modelId,
                    cwd: input.workspaceDir,
                    workspaceRoot: input.workspaceDir,
                    mode: 'act',
                    enableTools: input.enableTools,
                    enableSpawnAgent: false,
                    enableAgentTeams: false,
                    systemPrompt: input.systemPrompt
                },
                prompt: input.prompt,
                interactive: input.interactive
            });
            const sessionId = String(result?.sessionId || '');
            if (!sessionId) return { ok: false, error: 'el hub no devolvió sessionId' };
            return { ok: true, sessionId };
        } catch (e: any) {
            return { ok: false, error: String(e?.message || e).slice(0, 250) };
        }
    }

    /**
     * Block 5 (FASE C): reads the tail of a hub session transcript —
     * REAL evidence used to advance instruction states (acknowledged /
     * completed). Only structural info is returned, never full content.
     */
    async readHubTranscript(sessionId: string): Promise<Array<{ role: string; ts: number; text: string }>> {
        const core = await this.connect();
        if (!core) return [];
        try {
            const messages = await core.readMessages(sessionId);
            if (!Array.isArray(messages)) return [];
            return messages.map((m: any) => {
                const blocks = Array.isArray(m?.content) ? m.content : [];
                const textBlock = blocks.find((b: any) => b?.type === 'text');
                return {
                    role: String(m?.role || ''),
                    ts: Number(m?.ts || 0),
                    text: typeof textBlock?.text === 'string' ? textBlock.text : ''
                };
            });
        } catch {
            return [];
        }
    }

    /** Stops a hub-managed session (graceful end of a test/managed run). */
    async stopManagedSession(sessionId: string): Promise<{ ok: boolean; error?: string }> {
        const core = await this.connect();
        if (!core) return { ok: false, error: 'hub no conectado' };
        try {
            await core.stop(sessionId);
            return { ok: true };
        } catch (e: any) {
            return { ok: false, error: String(e?.message || e).slice(0, 200) };
        }
    }

    async dispose(): Promise<void> {
        try { await this.core?.dispose?.(); } catch { /* ignore */ }
        this.core = null;
    }
}