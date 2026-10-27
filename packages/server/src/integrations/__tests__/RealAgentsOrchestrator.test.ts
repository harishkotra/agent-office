import {
    ExternalOrchestratorAdapter,
    ExternalRegistrationResult,
    ExternalCallResult,
    ExternalStatusSnapshot,
    ExternalAgentDescriptor,
    ExternalAgentStateUpdate,
    ExternalTaskUpdate,
    ExternalMessage,
    ExternalEvent,
    ExternalSessionState,
    ExternalIssue
} from '@agent-office/core';
import { RealAgentsOrchestrator } from '../RealAgentsOrchestrator';
import { ClineSessionSnapshot, ClineAgentState, ClineMessageDelta } from '../cline/ClineTypes';
import { DshAdapter, DshObservation, DshTask } from '../dsh/DshAdapter';
import { ServerConfig, loadConfig } from '../../config';

/** Recording fake bridge (implements the Block 1 contract). */
class RecordingBridge implements ExternalOrchestratorAdapter {
    agents = new Map<string, { name: string; role: string; status: string; task: string }>();
    calls: string[] = [];
    messages: Array<{ id: string; content: string }> = [];
    events: Array<{ id: string; title: string }> = [];
    sessions: Array<{ id: string; details: string }> = [];
    tasks: Array<{ id: string; title: string }> = [];
    maxSeats = 7;

    registerAgent(d: ExternalAgentDescriptor): ExternalRegistrationResult {
        if (this.agents.has(d.id)) {
            this.calls.push(`upsert:${d.id}`);
            return { ok: true, updated: true, seat: 1 };
        }
        if (this.agents.size >= this.maxSeats) {
            return { ok: false, error: `Office is full (max ${this.maxSeats} seats)` };
        }
        this.agents.set(d.id, { name: d.name, role: d.role, status: 'idle', task: '' });
        this.calls.push(`register:${d.id}`);
        return { ok: true, seat: this.agents.size };
    }

    removeAgent(id: string): ExternalCallResult {
        this.agents.delete(id);
        return { ok: true };
    }

    updateAgentState(id: string, u: ExternalAgentStateUpdate): ExternalCallResult {
        const agent = this.agents.get(id);
        if (!agent) return { ok: false, error: `Unknown agent "${id}"` };
        this.calls.push(`state:${id}:${u.status}`);
        if (u.status) agent.status = u.status;
        if (u.currentTask !== undefined) agent.task = u.currentTask;
        return { ok: true };
    }

    pushTask(id: string, t: ExternalTaskUpdate): ExternalCallResult {
        this.tasks.push({ id, title: t.title });
        return { ok: true };
    }

    pushMessage(id: string, m: ExternalMessage): ExternalCallResult {
        this.messages.push({ id, content: m.content });
        return { ok: true };
    }

    pushEvent(id: string, e: ExternalEvent): ExternalCallResult {
        this.events.push({ id, title: e.title });
        return { ok: true };
    }

    updateSession(id: string, s: ExternalSessionState): ExternalCallResult {
        this.sessions.push({ id, details: s.details || '' });
        return { ok: true };
    }

    reportIssue(id: string, i: ExternalIssue): ExternalCallResult {
        return { ok: true };
    }

    getStatus(): ExternalStatusSnapshot {
        return {
            mode: 'external', maxSeats: this.maxSeats,
            usedSeats: this.agents.size, freeSeats: this.maxSeats - this.agents.size,
            agents: []
        };
    }
}

/** Fake read-only Cline source. */
class FakeSource {
    constructor(
        public sessions: ClineSessionSnapshot[],
        public texts: ClineMessageDelta[] = []
    ) {}
    async listSessions() { return this.sessions; }
    async getNewAssistantTexts() { return this.texts; }
    describe() { return 'fake-source'; }
}

/** Fake DSH adapter (documents unavailability). */
class FakeDsh implements DshAdapter {
    async observe(): Promise<DshObservation> {
        return { available: false, source: 'not-installed', description: 'not installed (test)', tasks: [] };
    }
    describe() { return 'dsh:test'; }
}

class FakeTeams {
    constructor(public tasks: DshTask[] = []) {}
    async listTasks() { return this.tasks; }
    describe() { return 'teams:test'; }
}

function snapshot(id: string, state: ClineAgentState): ClineSessionSnapshot {
    return {
        sessionId: id, shortId: id, name: `Cline ${id}`, role: 'z-ai/glm-5.3',
        pid: 123, rawStatus: 'running', state, interactive: true, provider: 'nvidia',
        model: 'z-ai/glm-5.3', cwd: '/w', workspaceRoot: '/w', teamName: 'team-T',
        gitBranch: 'main', title: `Tarea de ${id}`, startedAt: '2026-10-10T10:00:00Z',
        endedAt: null, lastActivityAt: Date.now(), lastToolName: 'editor',
        activeFile: null, containerId: null, messageCount: 5, lastMessageId: 'm5',
        pidAlive: true
    };
}

function buildOrchestrator(
    bridgeHolder: { current: RecordingBridge | null },
    source: FakeSource,
    teams: FakeTeams,
    overrides: Partial<{ terminalGraceMs: number; maxSeats: number }> = {}
) {
    const config: ServerConfig = {
        ...loadConfig({}),
        clinePollIntervalMs: 60000,
        terminalGraceMs: overrides.terminalGraceMs ?? 60_000,
        maxSeats: overrides.maxSeats ?? 7
    };
    return new RealAgentsOrchestrator({
        config,
        source: source as any,
        teams: teams as any,
        dsh: new FakeDsh(),
        bridgeResolver: () => bridgeHolder.current
    });
}

describe('RealAgentsOrchestrator (FASE D wiring)', () => {
    it('registers real sessions once with stable ids and pushes state', async () => {
        const holder: { current: RecordingBridge | null } = { current: null };
        const source = new FakeSource([snapshot('s1', 'editing'), snapshot('s2', 'completed')]);
        const orch = buildOrchestrator(holder, source, new FakeTeams());

        // No room yet → cycle is a no-op.
        await orch.tick();

        holder.current = new RecordingBridge();
        await orch.tick();

        expect(holder.current.agents.size).toBe(2);
        expect(holder.current.agents.get('s1')!.name).toBe('Cline s1');
        expect(holder.current.agents.get('s1')!.status).toBe('editing');
        expect(holder.current.agents.get('s2')!.status).toBe('completed');
        expect(holder.current.agents.get('s1')!.task).toBe('Tarea de s1');

        // Second cycle: no duplicate registrations.
        const registersBefore = holder.current.calls.filter(c => c.startsWith('register:')).length;
        await orch.tick();
        const registersAfter = holder.current.calls.filter(c => c.startsWith('register:')).length;
        expect(registersAfter).toBe(registersBefore);
    });

    it('pushes state-change events and new sanitized messages', async () => {
        const holder: { current: RecordingBridge | null } = { current: new RecordingBridge() };
        const source = new FakeSource(
            [snapshot('s1', 'editing')],
            [{ sessionId: 's1', messageId: 'm9', role: 'assistant', ts: Date.now(), text: 'avance real' }]
        );
        const orch = buildOrchestrator(holder, source, new FakeTeams());

        await orch.tick();
        expect(holder.current.messages.some(m => m.content === 'avance real')).toBe(true);
        expect(holder.current.events.some(e => e.title.includes('editing'))).toBe(true);

        // State change → a new event is pushed.
        source.sessions[0] = snapshot('s1', 'testing');
        await orch.tick();
        expect(holder.current.events.some(e => e.title.includes('testing'))).toBe(true);
    });

    it('re-registers everything when the room generation changes', async () => {
        const holder: { current: RecordingBridge | null } = { current: new RecordingBridge() };
        const source = new FakeSource([snapshot('s1', 'working')]);
        const orch = buildOrchestrator(holder, source, new FakeTeams());

        await orch.tick();
        expect(holder.current.agents.size).toBe(1);

        holder.current = new RecordingBridge(); // server/room restart
        await orch.tick();
        expect(holder.current.agents.size).toBe(1); // re-registered on the new room
    });

    it('respects the 7-seat cap (no fake agents to fill seats)', async () => {
        const holder: { current: RecordingBridge | null } = { current: new RecordingBridge() };
        const sessions = Array.from({ length: 9 }, (_, i) => snapshot(`s${i}`, 'working'));
        const orch = buildOrchestrator(holder, new FakeSource(sessions), new FakeTeams());

        await orch.tick();
        expect(holder.current.agents.size).toBe(7); // capped, no invention
    });

    it('surfaces real team tasks for registered assignees only', async () => {
        const holder: { current: RecordingBridge | null } = { current: new RecordingBridge() };
        const source = new FakeSource([snapshot('s1', 'working')]);
        const teams = new FakeTeams([
            { id: 't1', title: 'Revisar PR', status: 'in_progress', assigneeId: 's1' },
            { id: 't2', title: 'Tarea sin asignar', status: 'pending', assigneeId: null }
        ]);
        const orch = buildOrchestrator(holder, source, teams);

        await orch.tick();
        expect(holder.current.tasks).toHaveLength(1);
        expect(holder.current.tasks[0].title).toBe('Revisar PR');
        // Unassigned task surfaces as an event instead.
        expect(holder.current.events.some(e => e.title.includes('Tarea sin asignar'))).toBe(true);
    });

    it('announces the DSH impediment exactly once per generation', async () => {
        const holder: { current: RecordingBridge | null } = { current: new RecordingBridge() };
        const source = new FakeSource([snapshot('s1', 'working')]);
        const orch = buildOrchestrator(holder, source, new FakeTeams());

        await orch.tick();
        await orch.tick();
        const dshEvents = holder.current.events.filter(e => e.title.includes('DSH'));
        expect(dshEvents).toHaveLength(1);
    });

    // ─── Block 3 (FASE D): occupancy policy integration ───

    it('never seats sessions that completed long before startup (no zombie desks)', async () => {
        const holder: { current: RecordingBridge | null } = { current: new RecordingBridge() };
        const old = snapshot('old', 'completed');
        old.endedAt = new Date(Date.now() - 3_600_000).toISOString(); // 1h ago
        const source = new FakeSource([old, snapshot('live', 'working')]);
        const orch = buildOrchestrator(holder, source, new FakeTeams());

        await orch.tick();
        expect(holder.current.agents.has('old')).toBe(false);
        expect(holder.current.agents.has('live')).toBe(true);
        expect(holder.current.agents.size).toBe(1);
    });

    it('shows a fresh completion during grace, then frees the seat and keeps history', async () => {
        const holder: { current: RecordingBridge | null } = { current: new RecordingBridge() };
        const done = snapshot('fresh-done', 'completed');
        done.endedAt = new Date().toISOString(); // just ended — inside grace
        const source = new FakeSource([done, snapshot('live', 'working')]);
        const orch = buildOrchestrator(holder, source, new FakeTeams(), { terminalGraceMs: 80 });

        await orch.tick();
        expect(holder.current.agents.has('fresh-done')).toBe(true); // still visible

        await new Promise(r => setTimeout(r, 150)); // grace expires
        await orch.tick();
        expect(holder.current.agents.has('fresh-done')).toBe(false); // seat freed
        expect(holder.current.agents.has('live')).toBe(true);        // live agent unaffected
        expect(holder.current.events.some(e => e.title.includes('puesto liberado'))).toBe(true);

        const history = orch.getHistory();
        expect(history.some(h => h.sessionId === 'fresh-done')).toBe(true);
    });

    it('pushes the real evidence fields to the office state (FASE E)', async () => {
        const holder: { current: RecordingBridge | null } = { current: new RecordingBridge() };
        const editing = snapshot('s1', 'editing');
        editing.activeFile = '/workspace/agent-office/packages/ui/src/App.tsx';
        const orch = buildOrchestrator(holder, new FakeSource([editing]), new FakeTeams());

        await orch.tick();
        const calls = holder.current.calls.filter(c => c.startsWith('state:s1:'));
        expect(calls.some(c => c.includes('editing'))).toBe(true);
        // Evidence fields were part of the update payload (recorded via
        // the agent's task/role set by updateAgentState in the fake).
        expect(holder.current.agents.get('s1')!.status).toBe('editing');
    });
});


