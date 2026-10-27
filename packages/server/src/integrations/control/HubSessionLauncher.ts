import * as fs from 'fs';
import * as path from 'path';
import { ServerConfig } from '../../config';
import { ClineControlAdapter } from './ClineControlAdapter';
import { AuditLog } from './AuditLog';

/**
 * Block 5 (FASE B) — launches and tracks hub-MANAGED Cline sessions.
 *
 * Safety properties:
 *  - NEVER touches existing TUI sessions (only hub-created ones).
 *  - Restrictive tool permissions by default (HUB_SESSION_TOOLS=false).
 *  - Each session gets its own ISOLATED workspace directory.
 *  - Persistent ids: the hub session id is the office agent id.
 *  - Every launch/stop is audited.
 *  - The model/provider comes from operator configuration; credentials
 *    are NEVER read, copied or logged from Cline's internals — the
 *    operator configures the hub provider via `cline auth` (official
 *    procedure, documented in docs/ciudadan/INSTALL.md).
 */
export interface ManagedSessionInfo {
    sessionId: string;
    workspaceDir: string;
    startedAt: string;
    model: string;
}

export class HubSessionLauncher {
    private launched = new Map<string, ManagedSessionInfo>();
    /** Stopped sessions (terminal) — kept for graceful office eviction. */
    private stopped = new Map<string, ManagedSessionInfo & { stoppedAt: string }>();

    constructor(
        private readonly config: ServerConfig,
        private readonly adapter: ClineControlAdapter,
        private readonly audit: AuditLog
    ) {}

    /** Sessions launched by the office (persistent ids). */
    listLaunched(): ManagedSessionInfo[] {
        return [...this.launched.values()];
    }

    /** Sessions stopped by the office (terminal; kept for eviction/history). */
    listStopped(): Array<ManagedSessionInfo & { stoppedAt: string }> {
        return [...this.stopped.values()];
    }

    isLaunched(sessionId: string): boolean {
        return this.launched.has(sessionId) || this.stopped.has(sessionId);
    }

    /**
     * Starts a hub-managed session. The prompt is optional so the
     * operator can launch a session and instruct it later through the
     * authorized pipeline.
     */
    async launch(input: { name?: string; prompt?: string; actor: string }): Promise<
        { ok: boolean; session?: ManagedSessionInfo; error?: string }
    > {
        const caps = await this.adapter.getCapabilities(true);
        if (!caps.hubConnected) {
            return { ok: false, error: 'El hub de Cline no está disponible: ' + caps.dispatchCause };
        }

        // Isolated workspace per session (never shared, never the TUI's).
        const sessionIdPlaceholder = `ws_${Date.now().toString(36)}`;
        const workspaceDir = path.resolve(this.config.hubSessionWorkspaces, sessionIdPlaceholder);
        try {
            fs.mkdirSync(workspaceDir, { recursive: true });
        } catch (e: any) {
            return { ok: false, error: `No se pudo crear el workspace aislado: ${e?.message}` };
        }

        const result = await this.adapter.startManagedSession({
            providerId: this.config.hubProviderId,
            modelId: this.config.hubModelId,
            workspaceDir,
            systemPrompt: 'Eres un agente de Ciudadan AgentOffice gestionado por hub. Sigue las instrucciones del operador con respuestas breves y precisas.',
            prompt: input.prompt,
            enableTools: this.config.hubSessionTools,
            // Interactive sessions persist between turns (E2E-verified);
            // one-shot sessions die after their first turn and cannot
            // receive further instructions.
            interactive: true
        });

        if (!result.ok || !result.sessionId) {
            this.audit.record({
                action: 'session.launch', actor: input.actor,
                requestId: `launch_${Date.now()}`, result: 'failed',
                detail: result.error
            });
            return { ok: false, error: result.error || 'el hub rechazó la sesión' };
        }

        const info: ManagedSessionInfo = {
            sessionId: result.sessionId,
            workspaceDir,
            startedAt: new Date().toISOString(),
            model: `${this.config.hubProviderId}/${this.config.hubModelId}`
        };
        this.launched.set(info.sessionId, info);
        this.audit.record({
            action: 'session.launch', actor: input.actor,
            requestId: info.sessionId, targetSession: info.sessionId,
            result: 'launched', detail: `modelo=${info.model} tools=${this.config.hubSessionTools}`
        });
        return { ok: true, session: info };
    }

    /** Gracefully stops a managed session (never a TUI one). */
    async stop(sessionId: string, actor: string): Promise<{ ok: boolean; error?: string }> {
        if (!this.launched.has(sessionId)) {
            return { ok: false, error: 'Solo se pueden detener sesiones gestionadas por la oficina.' };
        }
        const result = await this.adapter.stopManagedSession(sessionId);
        this.audit.record({
            action: 'session.stop', actor,
            requestId: sessionId, targetSession: sessionId,
            result: result.ok ? 'stopped' : 'failed',
            detail: result.error
        });
        if (result.ok) {
            // Keep a terminal record so the office can evict the
            // character gracefully (grace window + history) instead of
            // letting it vanish silently.
            const info = this.launched.get(sessionId);
            if (info) {
                this.stopped.set(sessionId, { ...info, stoppedAt: new Date().toISOString() });
                this.launched.delete(sessionId);
            }
        }
        return result;
    }
}
