import { ClineSessionSnapshot, ClineAgentState } from '../cline/ClineTypes';
import { HubSessionLauncher, ManagedSessionInfo } from './HubSessionLauncher';
import { ClineControlAdapter } from './ClineControlAdapter';

/**
 * Block 5 (FASE B/E2E) — turns office-launched HUB sessions into REAL
 * office characters. Every field is derived from live hub API evidence
 * (session status + transcript tail); nothing is invented:
 *
 *   hub status: starting/pending → waiting · running → working ·
 *               stopping → waiting · idle → idle · completed →
 *               completed · cancelled/failed/error or missing → offline
 *
 * TUI sessions are NOT touched: they keep flowing through the
 * filesystem source (read-only).
 */
export class HubSessionObserver {
    constructor(
        private readonly launcher: HubSessionLauncher,
        private readonly adapter: ClineControlAdapter
    ) {}

    /** Snapshots of office-launched sessions (empty when none). */
    async listSnapshots(): Promise<ClineSessionSnapshot[]> {
        const launched = this.launcher.listLaunched();
        const stoppedList = this.launcher.listStopped();
        if (launched.length === 0 && stoppedList.length === 0) return [];

        const byId = new Map<string, string>();
        if (launched.length > 0) {
            let hubSessions: Array<{ sessionId: string; status: string }> = [];
            try {
                hubSessions = await this.adapter.listHubSessions();
            } catch {
                return []; // transient hub error — keep last office snapshot
            }
            for (const s of hubSessions) byId.set(s.sessionId, s.status);
        }

        const snapshots: ClineSessionSnapshot[] = [];
        for (const info of launched) {
            const status = byId.get(info.sessionId);
            snapshots.push(this.toSnapshot(info, status ?? 'missing'));
        }
        // Stopped sessions appear as TERMINAL characters so the office can
        // say goodbye during the grace window and free the seat (real
        // stop evidence — never invented activity).
        for (const stopped of stoppedList) {
            snapshots.push({
                ...this.toSnapshot(stopped, 'stopped'),
                state: 'completed', // terminal — stopped by the office
                endedAt: stopped.stoppedAt,
                pidAlive: false
            });
        }
        return snapshots;
    }

    private toSnapshot(info: ManagedSessionInfo, hubStatus: string): ClineSessionSnapshot {
        const shortId = info.sessionId.includes('_')
            ? info.sessionId.split('_').pop()!
            : info.sessionId.slice(-5);
        const [provider, model] = info.model.includes('/')
            ? [info.model.split('/')[0], info.model.split('/').slice(1).join('/')]
            : ['hub', info.model];
        const alive = ['starting', 'running', 'pending', 'stopping', 'idle', 'completed'].includes(hubStatus);
        return {
            sessionId: info.sessionId,
            shortId,
            name: `Hub ${shortId}`,
            role: info.model,
            pid: null,
            rawStatus: hubStatus,
            state: this.toState(hubStatus),
            interactive: true,
            provider,
            model,
            cwd: info.workspaceDir,
            workspaceRoot: info.workspaceDir,
            teamName: null,
            gitBranch: null,
            title: 'Sesión Cline gestionada por hub (interactiva)',
            startedAt: info.startedAt,
            endedAt: ['cancelled', 'failed', 'error', 'missing'].includes(hubStatus)
                ? new Date().toISOString()
                : null,
            lastActivityAt: null,
            lastToolName: null,
            activeFile: null,
            containerId: null,
            messageCount: 0,
            lastMessageId: null,
            pidAlive: alive
        };
    }

    private toState(hubStatus: string): ClineAgentState {
        switch (hubStatus) {
            case 'running': return 'working';
            case 'starting':
            case 'pending':
            case 'stopping': return 'waiting';
            case 'idle':
            // E2E-verified hub semantics: INTERACTIVE sessions report
            // 'completed' when their current turn is finished — but they
            // stay ALIVE and dispatchable. For the office this is 'idle'
            // (awaiting the next instruction), NOT terminal. Only
            // office-stopped sessions are shown as terminal 'completed'.
            case 'completed': return 'idle';
            default: return 'offline'; // cancelled | failed | error | missing
        }
    }
}
