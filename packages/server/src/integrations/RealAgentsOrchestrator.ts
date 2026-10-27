import {
    ExternalOrchestratorAdapter,
    ExternalAgentExecutionStatus
} from '@agent-office/core';
import { ClineSessionSource } from './cline/ClineSessionSource';
import { ClineSessionSnapshot, ClineAgentState } from './cline/ClineTypes';
import { DshAdapter } from './dsh/DshAdapter';
import { ClineTeamsObserver } from './dsh/ClineTeamsObserver';
import { ServerConfig } from '../config';
import { OccupancyPolicy } from './occupancy/OccupancyPolicy';

/**
 * Ciudadan AgentOffice — Block 2 (FASE D).
 *
 * Connects the REAL observation sources (Cline sessions, Cline teams,
 * DSH slot) to the Block 1 external contract (ExternalBridge). Runs a
 * low-impact polling loop inside the AgentOffice server process:
 *
 *   Cline sessions.db/JSON  ─┐
 *   Cline teams.db          ─┼─► RealAgentsOrchestrator ─► ExternalBridge ─► Colyseus/UI
 *   DSH (slot, pending)     ─┘
 *
 * Guarantees:
 *  - Read-only against every observed system (no Cline/DSH writes ever).
 *  - Stable agent ids (Cline session_id) → no duplicates across polls.
 *  - No fictional agents to fill empty seats.
 *  - Re-attaches automatically when the office room (re)appears.
 *  - Survives source errors by skipping the cycle (keeps last snapshot).
 */

/** Cline state → office ExternalAgentExecutionStatus (1:1 for most). */
function toOfficeStatus(state: ClineAgentState): ExternalAgentExecutionStatus {
    switch (state) {
        case 'idle': return 'idle';
        case 'working': return 'working';
        case 'reading': return 'reading';
        case 'editing': return 'editing';
        case 'testing': return 'testing';
        case 'waiting': return 'waiting';
        case 'blocked': return 'blocked';
        case 'completed': return 'completed';
        case 'offline': return 'offline';
        default: return 'idle';
    }
}

/** Short, human summary of the last known activity (no content). */
function activityThought(session: ClineSessionSnapshot): string {
    const parts: string[] = [];
    if (session.lastToolName) parts.push(session.lastToolName);
    if (session.lastActivityAt) {
        const secs = Math.max(0, Math.round((Date.now() - session.lastActivityAt) / 1000));
        parts.push(secs < 60 ? `actividad hace ${secs}s` : `actividad hace ${Math.round(secs / 60)}min`);
    } else {
        parts.push('sin mensajes observables');
    }
    return parts.join(' · ').slice(0, 120);
}

interface OrchestratorDeps {
    config: ServerConfig;
    source: ClineSessionSource;
    teams: ClineTeamsObserver;
    dsh: DshAdapter;
    /** Resolves the current ExternalBridge (null while no room exists). */
    bridgeResolver: () => ExternalOrchestratorAdapter | null;
    /**
     * Block 5: office-launched HUB sessions (real characters derived
     * from live hub API evidence). Optional — absent when control is
     * fully disabled.
     */
    hubObserver?: { listSnapshots(): Promise<ClineSessionSnapshot[]> };
    /** Injectable clock for tests. */
    now?: () => number;
}

export class RealAgentsOrchestrator {
    private timer: ReturnType<typeof setInterval> | null = null;
    private ticking = false;
    /** Session ids already registered in the CURRENT room generation. */
    private registered = new Set<string>();
    /** Last office status pushed per session (change detection). */
    private lastStatus = new Map<string, string>();
    /** Bridge instance of the current generation (change → re-register). */
    private bridgeGeneration: ExternalOrchestratorAdapter | null = null;
    private announcedDshState = false;
    /** Block 3 (FASE D): desk occupancy policy + its bookkeeping. */
    private readonly policy: OccupancyPolicy;
    private firstSeenTerminalAt = new Map<string, number>();
    /** Historical (evicted) sessions — preserved, never shown as active. */
    private history: Array<{
        sessionId: string; name: string; role: string;
        state: string; endedAt: number | null; removedAt: number;
    }> = [];
    private readonly log = (msg: string) => console.log(`[RealAgents] ${msg}`);

    constructor(private readonly deps: OrchestratorDeps) {
        this.policy = new OccupancyPolicy(
            this.deps.config.maxSeats,
            this.deps.config.terminalGraceMs
        );
    }

    /** Historical sessions (evicted after grace) — for REST/reporting. */
    getHistory() {
        return this.history.slice();
    }

    start(): void {
        if (this.timer) return;
        const interval = this.deps.config.clinePollIntervalMs;
        this.log(
            `started (poll ${interval}ms, source: ${this.deps.source.describe()}, ` +
            `teams: ${this.deps.teams.describe()}, dsh: ${this.deps.dsh.describe()})`
        );
        void this.tick();
        this.timer = setInterval(() => void this.tick(), interval);
    }

    stop(): void {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
            this.log('stopped');
        }
    }

    /** One polling cycle. Never throws (errors keep the last snapshot). */
    async tick(): Promise<void> {
        if (this.ticking) return; // avoid overlapping cycles
        this.ticking = true;
        try {
            const bridge = this.deps.bridgeResolver();
            if (!bridge) return; // office room not created yet — retry later

            // Room generation changed (server/room restart) → re-register.
            if (this.bridgeGeneration !== bridge) {
                this.bridgeGeneration = bridge;
                this.registered.clear();
                this.lastStatus.clear();
                this.firstSeenTerminalAt.clear();
                this.announcedDshState = false;
            }

            const tuiSessions = await this.deps.source.listSessions();
            // Block 5: merge office-launched HUB sessions (real hub API
            // evidence) with the filesystem-observed TUI sessions. TUI ids
            // win on collision (they are the authoritative records).
            const hubSessions = this.deps.hubObserver
                ? await this.deps.hubObserver.listSnapshots()
                : [];
            const sessions = [
                ...tuiSessions,
                ...hubSessions.filter(h => !tuiSessions.some(t => t.sessionId === h.sessionId))
            ];
            if (sessions.length === 0) return;

            // ─── Block 3 (FASE D): occupancy policy ───
            // Active sessions have seat priority; terminal sessions are
            // shown only during the grace window, then their seat is
            // released (history is preserved below).
            const now = Date.now();
            const decision = this.policy.select(
                sessions.map(s => ({
                    sessionId: s.sessionId,
                    state: s.state,
                    lastActivityAt: s.lastActivityAt,
                    endedAt: s.endedAt ? (Date.parse(s.endedAt) || null) : null
                })),
                now,
                this.firstSeenTerminalAt
            );

            // 1) Evict terminal sessions past their grace — release seats.
            for (const id of decision.evict) {
                const session = sessions.find(s => s.sessionId === id);
                if (!session) continue;
                if (this.registered.has(id)) {
                    // Farewell event BEFORE removing (pushEvent needs the agent).
                    bridge.pushEvent(id, {
                        type: 'session',
                        title: `${session.name}: puesto liberado`,
                        body: `Sesión ${session.state}; conservada en el historial.`
                    });
                    bridge.removeAgent(id);
                    this.registered.delete(id);
                    this.lastStatus.delete(id);
                    this.log(`evicted ${session.name} (terminal, grace over) — seat freed`);
                }
                // Historical record for EVERY evicted terminal (seated or
                // not): real data, preserved, never shown as an active agent.
                if (!this.history.some(h => h.sessionId === id)) {
                    this.history.push({
                        sessionId: id,
                        name: session.name,
                        role: session.role,
                        state: session.state,
                        endedAt: session.endedAt ? (Date.parse(session.endedAt) || null) : null,
                        removedAt: now
                    });
                    if (this.history.length > 20) this.history.shift();
                }
                this.firstSeenTerminalAt.delete(id);
            }

            // 2) Register new eligible sessions (stable ids, no fake agents).
            for (const id of decision.seat) {
                if (this.registered.has(id)) continue;
                const session = sessions.find(s => s.sessionId === id);
                if (!session) continue;
                const result = bridge.registerAgent({
                    id: session.sessionId,
                    name: session.name,
                    role: session.role
                });
                if (result.ok) {
                    this.registered.add(session.sessionId);
                    this.log(`registered ${session.name} (${session.sessionId}) → seat ${result.seat}`);
                } else {
                    this.log(`could not register ${session.sessionId}: ${result.error}`);
                    continue;
                }
                this.pushSessionInfo(bridge, session);
            }

            // 3) Push state changes + REAL evidence fields (FASE E).
            for (const id of decision.seat) {
                const session = sessions.find(s => s.sessionId === id);
                if (!session || !this.registered.has(id)) continue;
                const officeStatus = toOfficeStatus(session.state);
                const changed = this.lastStatus.get(id) !== officeStatus;
                this.lastStatus.set(id, officeStatus);

                const update = bridge.updateAgentState(id, {
                    status: officeStatus,
                    currentTask: session.title,
                    thought: activityThought(session),
                    activeFile: session.activeFile || '',
                    workspace: session.workspaceRoot || session.cwd || '',
                    gitBranch: session.gitBranch || '',
                    sessionType: session.interactive ? 'interactive' : 'batch',
                    lastTool: session.lastToolName || '',
                    updatedAt: now
                });
                if (!update.ok) {
                    this.log(`state update failed for ${id}: ${update.error}`);
                    continue;
                }
                if (changed) {
                    // Announce meaningful transitions in the highlights feed.
                    const terminal = officeStatus === 'completed' || officeStatus === 'offline';
                    const graceLeft = decision.inGrace.get(id);
                    bridge.pushEvent(id, {
                        type: 'session',
                        title: `${session.name}: ${officeStatus}`,
                        body: terminal && graceLeft !== undefined
                            ? `Liberará su puesto en ~${Math.round(graceLeft / 1000)}s (gracia configurada).`
                            : session.title || ''
                    });
                }
            }

            // 3) Forward NEW sanitized assistant messages to the office chat.
            const texts = await this.deps.source.getNewAssistantTexts(sessions);
            for (const delta of texts) {
                if (!delta.text) continue;
                bridge.pushMessage(delta.sessionId, { content: delta.text });
            }

            // 4) Real team tasks (Cline native teams; NOT DSH — see
            //    ClineTeamsObserver). Only tasks with a registered assignee
            //    hit the TaskBoard; the rest are announced as events.
            const tasks = await this.deps.teams.listTasks();
            for (const task of tasks.slice(0, 10)) {
                if (!task.title) continue;
                const assignee = task.assigneeId && this.registered.has(task.assigneeId)
                    ? task.assigneeId
                    : undefined;
                if (assignee) {
                    bridge.pushTask(assignee, {
                        title: task.title,
                        status: task.status === 'completed' ? 'completed' : 'in_progress'
                    });
                } else {
                    bridge.pushEvent(sessions[0].sessionId, {
                        type: 'task',
                        title: `Task: ${task.title}`,
                        body: `estado=${task.status}${task.assigneeName ? ` · asignado a ${task.assigneeName}` : ' · sin asignar'}`
                    });
                }
            }

            // 5) DSH slot status — announced once per room generation.
            if (!this.announcedDshState) {
                this.announcedDshState = true;
                const dsh = await this.deps.dsh.observe();
                bridge.pushEvent(sessions[0].sessionId, {
                    type: 'info',
                    title: dsh.available ? 'DSH observado' : 'DSH no disponible',
                    body: dsh.available
                        ? dsh.description
                        : 'Los eventos de tareas del orquestador DSH se mostrarán aquí cuando esté instalado.'
                });
                if (!dsh.available) {
                    this.log(`DSH slot: ${dsh.source} (${dsh.description.slice(0, 120)})`);
                }
            }
        } catch (e: any) {
            this.log(`cycle error (kept last snapshot): ${e?.message || e}`);
        } finally {
            this.ticking = false;
        }
    }

    /** Publishes the session summary shown in the Inspector. */
    private pushSessionInfo(bridge: ExternalOrchestratorAdapter, session: ClineSessionSnapshot): void {
        const parts: string[] = [];
        if (session.model) parts.push(`modelo ${session.model}`);
        if (session.interactive) parts.push('sesión interactiva');
        if (session.gitBranch) parts.push(`rama ${session.gitBranch}`);
        if (session.teamName) parts.push(`equipo ${session.teamName}`);
        parts.push(session.workspaceRoot ? `workspace ${session.workspaceRoot}` : `cwd ${session.cwd}`);
        bridge.updateSession(session.sessionId, {
            state: session.state === 'offline' || session.state === 'completed' ? 'stopped' : 'active',
            sessionId: session.shortId,
            details: parts.join(' · ').slice(0, 160)
        });
    }
}
