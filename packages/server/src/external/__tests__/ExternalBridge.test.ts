import { ExternalBridge, OfficeGateway } from '../ExternalBridge';
import { SeatAllocator, DEFAULT_SEAT_TARGETS } from '../SeatAllocator';
import { AgentState } from '../../schema/OfficeState';

function buildHarness() {
    const states = new Map<string, AgentState>();
    const chats: Array<{ sender: string; text: string }> = [];
    const highlights: Array<any> = [];
    const taskUpdates: Array<any> = [];
    const persistedTasks: Array<any> = [];

    const gateway: OfficeGateway = {
        mode: 'external',
        seats: new SeatAllocator(DEFAULT_SEAT_TARGETS.slice()),
        getOfficeTime: () => new Date().toISOString(),
        hasAgent: (id) => states.has(id),
        getAgentState: (id) => states.get(id),
        createAgent: (id, name, opts) => { states.set(id, new AgentState(id, name, opts)); },
        removeAgent: (id) => { states.delete(id); },
        broadcastChat: (sender, text) => { chats.push({ sender, text }); },
        broadcastTaskUpdate: (payload) => { taskUpdates.push(payload); },
        emitHighlight: (type, title, body, agentId) => { highlights.push({ type, title, body, agentId }); },
        persistTask: (title, agentId) => { persistedTasks.push({ title, agentId }); },
        listAgentIds: () => Array.from(states.keys())
    };

    return {
        bridge: new ExternalBridge(gateway),
        states, chats, highlights, taskUpdates, persistedTasks, gateway
    };
}

describe('ExternalBridge.registerAgent', () => {
    it('registers an agent, assigns seat 1 and spawns at the office door', () => {
        const h = buildHarness();
        const result = h.bridge.registerAgent({ id: 'cline-01', name: 'Cline 01', role: 'Backend' });
        expect(result.ok).toBe(true);
        expect(result.seat).toBe(1);
        expect(result.updated).toBe(false);

        const state = h.states.get('cline-01')!;
        expect(state.name).toBe('Cline 01');
        expect(state.role).toBe('Backend');
        expect(state.status).toBe('idle');
        expect(state.x).toBe(20);
        expect(state.y).toBe(2);
    });

    it('rejects invalid payloads', () => {
        const h = buildHarness();
        expect(h.bridge.registerAgent({ id: '', name: 'X', role: '' }).ok).toBe(false);
        expect(h.bridge.registerAgent({ id: 'bad id!', name: 'X', role: '' }).ok).toBe(false);
        expect(h.bridge.registerAgent({ id: 'ok', name: '', role: '' }).ok).toBe(false);
    });

    it('upserts an existing agent keeping its seat', () => {
        const h = buildHarness();
        h.bridge.registerAgent({ id: 'a1', name: 'First', role: 'Dev' });
        const result = h.bridge.registerAgent({ id: 'a1', name: 'Renamed', role: 'QA' });
        expect(result.ok).toBe(true);
        expect(result.updated).toBe(true);
        expect(result.seat).toBe(1);
        expect(h.states.get('a1')!.name).toBe('Renamed');
    });

    it('rejects the 8th agent when the office is full', () => {
        const h = buildHarness();
        for (let i = 1; i <= 7; i++) {
            const r = h.bridge.registerAgent({ id: `a${i}`, name: `A${i}`, role: 'Dev' });
            expect(r.ok).toBe(true);
        }
        const eighth = h.bridge.registerAgent({ id: 'a8', name: 'A8', role: 'Dev' });
        expect(eighth.ok).toBe(false);
        expect(eighth.error).toContain('full');
    });
});

describe('ExternalBridge state and events', () => {
    it('updateAgentState maps status to visual action and validates values', () => {
        const h = buildHarness();
        h.bridge.registerAgent({ id: 'a1', name: 'A1', role: 'Dev' });

        expect(h.bridge.updateAgentState('a1', { status: 'running' }).ok).toBe(true);
        expect(h.states.get('a1')!.action).toBe('work');
        expect(h.states.get('a1')!.status).toBe('running');

        expect(h.bridge.updateAgentState('a1', { status: 'thinking' }).ok).toBe(true);
        expect(h.states.get('a1')!.action).toBe('think');

        expect(h.bridge.updateAgentState('a1', { status: 'not-a-status' as any }).ok).toBe(false);
        expect(h.bridge.updateAgentState('unknown', { status: 'idle' }).ok).toBe(false);
    });

    it('running/idle clears a previously reported error', () => {
        const h = buildHarness();
        h.bridge.registerAgent({ id: 'a1', name: 'A1', role: 'Dev' });
        h.bridge.reportIssue('a1', { severity: 'error', message: 'boom' });
        expect(h.states.get('a1')!.error).toContain('boom');
        h.bridge.updateAgentState('a1', { status: 'running' });
        expect(h.states.get('a1')!.error).toBe('');
    });

    it('pushMessage requires content and broadcasts to chat + highlight', () => {
        const h = buildHarness();
        h.bridge.registerAgent({ id: 'a1', name: 'A1', role: 'Dev' });

        expect(h.bridge.pushMessage('a1', { content: '' }).ok).toBe(false);

        const r = h.bridge.pushMessage('a1', { content: 'hola equipo' });
        expect(r.ok).toBe(true);
        expect(h.chats.some(c => c.text.includes('hola equipo'))).toBe(true);
        expect(h.highlights.some(hl => hl.type === 'conversation')).toBe(true);
    });

    it('pushTask assigns the task, persists it and broadcasts task-update', () => {
        const h = buildHarness();
        h.bridge.registerAgent({ id: 'a1', name: 'A1', role: 'Dev' });
        h.bridge.registerAgent({ id: 'a2', name: 'A2', role: 'QA' });

        const r = h.bridge.pushTask('a1', { title: 'Revisar PR', assigneeId: 'a2' });
        expect(r.ok).toBe(true);
        expect(h.states.get('a2')!.currentTask).toBe('Revisar PR');
        expect(h.persistedTasks).toHaveLength(1);
        expect(h.taskUpdates[0]).toMatchObject({ agentId: 'a2', task: 'Revisar PR' });

        h.bridge.pushTask('a1', { title: 'Revisar PR', status: 'completed', assigneeId: 'a2' });
        expect(h.states.get('a2')!.currentTask).toBe('');
    });

    it('reportIssue marks the agent as blocked and can be cleared', () => {
        const h = buildHarness();
        h.bridge.registerAgent({ id: 'a1', name: 'A1', role: 'Dev' });

        const r = h.bridge.reportIssue('a1', { severity: 'error', message: 'no responde', blocked: true });
        expect(r.ok).toBe(true);
        expect(h.states.get('a1')!.status).toBe('blocked');
        expect(h.states.get('a1')!.error).toContain('no responde');

        h.bridge.reportIssue('a1', { severity: 'error', message: '' });
        expect(h.states.get('a1')!.error).toBe('');
    });

    it('updateSession validates states and marks crashed sessions offline', () => {
        const h = buildHarness();
        h.bridge.registerAgent({ id: 'a1', name: 'A1', role: 'Dev' });

        expect(h.bridge.updateSession('a1', { state: 'sleeping' as any }).ok).toBe(false);

        expect(h.bridge.updateSession('a1', { state: 'active', sessionId: 's-1' }).ok).toBe(true);
        expect(h.states.get('a1')!.session).toContain('active');
        expect(h.states.get('a1')!.session).toContain('s-1');

        h.bridge.updateSession('a1', { state: 'crashed' });
        expect(h.states.get('a1')!.status).toBe('offline');
    });

    it('removeAgent frees the seat for the next agent', () => {
        const h = buildHarness();
        h.bridge.registerAgent({ id: 'a1', name: 'A1', role: 'Dev' });
        expect(h.bridge.removeAgent('a1').ok).toBe(true);
        expect(h.states.has('a1')).toBe(false);
        expect(h.gateway.seats.usedSeats).toBe(0);

        const next = h.bridge.registerAgent({ id: 'a2', name: 'A2', role: 'Dev' });
        expect(next.seat).toBe(1);
    });

    it('getStatus returns a seat-ordered snapshot with correct counters', () => {
        const h = buildHarness();
        h.bridge.registerAgent({ id: 'a1', name: 'A1', role: 'Dev' });
        h.bridge.registerAgent({ id: 'a2', name: 'A2', role: 'QA' });
        h.bridge.updateAgentState('a2', { status: 'running' });

        const status = h.bridge.getStatus();
        expect(status.mode).toBe('external');
        expect(status.maxSeats).toBe(7);
        expect(status.usedSeats).toBe(2);
        expect(status.freeSeats).toBe(5);
        expect(status.agents).toHaveLength(2);
        expect(status.agents[0].id).toBe('a1');
        expect(status.agents[1].seat).toBe(2);
        expect(status.agents[1].status).toBe('running');
    });
});

