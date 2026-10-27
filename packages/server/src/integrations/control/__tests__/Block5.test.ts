import { InstructionService } from '../InstructionService';
import { HubSessionLauncher } from '../HubSessionLauncher';
import { AuditLog } from '../AuditLog';
import { ClineControlAdapter } from '../ClineControlAdapter';
import { OfficeRoom } from '../../../rooms/OfficeRoom';
import { ServerConfig, loadConfig } from '../../../config';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * Block 5 tests (FASE I): hub-managed sessions, instruction lifecycle
 * with REAL transcript evidence, WS auth and audit rotation.
 */

class FakeAdapter {
    constructor(
        public available: boolean,
        public cause: string,
        public transcript: Array<{ role: string; ts: number; text: string }> = []
    ) {}
    async getCapabilities() {
        return {
            sdkLoaded: this.available, hubRecordReadable: this.available, hubConnected: this.available,
            hubSessions: this.available ? 2 : 0, dispatchAvailable: this.available,
            dispatchCause: this.cause,
            readOnly: { listSessions: true, getSession: true, readMessages: true, subscribe: true },
            checkedAt: new Date().toISOString()
        };
    }
    async dispatch() { return this.available ? { ok: true } : { ok: false, error: this.cause }; }
    async readHubTranscript() { return this.transcript; }
    async startManagedSession(input: { providerId: string; modelId: string; workspaceDir: string; systemPrompt: string; prompt?: string; enableTools: boolean }) {
        if (!this.available) return { ok: false, error: this.cause };
        fs.mkdirSync(input.workspaceDir, { recursive: true });
        return { ok: true, sessionId: `hub_managed_${Date.now()}` };
    }
    async stopManagedSession() { return { ok: true }; }
}

function tmpAudit(): { audit: AuditLog; dir: string } {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'b5-audit-'));
    return { audit: new AuditLog(path.join(dir, 'audit.jsonl')), dir };
}

function serviceWith(adapter: FakeAdapter, agents = [{ id: '1791_real', name: 'Cline real', status: 'working' }]) {
    const { audit, dir } = tmpAudit();
    const config: ServerConfig = { ...loadConfig({}), instructionDispatchEnabled: true };
    const svc = new InstructionService({
        config, adapter: adapter as unknown as ClineControlAdapter, audit,
        officeAgents: () => agents,
        now: () => T0 // deterministic clock: dispatchedAt === T0
    });
    return { svc, audit, dir };
}

const T0 = 1_800_000_000_000;

describe('Block 5 (FASE C): instruction lifecycle with REAL hub evidence', () => {
    it('dispatched → acknowledged when an assistant response appears after dispatch (still in flight)', async () => {
        const adapter = new FakeAdapter(true, '', [
            { role: 'user', ts: T0 - 5000, text: 'instrucción previa' },
            { role: 'assistant', ts: T0 + 3000, text: 'respuesta en curso' },
            // A newer non-assistant message means the turn is still
            // processing → acknowledged, NOT completed yet.
            { role: 'user', ts: T0 + 4000, text: '(tool_result en proceso)' }
        ]);
        const { svc } = serviceWith(adapter);
        svc.create({ requestId: 'L1', sessionId: '1791_real', prompt: 'Haz algo', actor: 'op' });
        svc.submit('L1', 'op');
        const approved = await svc.approve('L1', 'op');
        expect(approved.record!.state).toBe('dispatched');

        await svc.refreshFromHub('L1', adapter.transcript);
        const record = svc.get('L1')!;
        expect(record.state).toBe('acknowledged');
    });

    it('acknowledged → completed ONLY with a final assistant text after dispatch', async () => {
        const adapter = new FakeAdapter(true, '', [
            { role: 'user', ts: T0 - 5000, text: 'previa' },
            { role: 'assistant', ts: T0 + 3000, text: 'respuesta final del agente' }
        ]);
        const { svc } = serviceWith(adapter);
        svc.create({ requestId: 'L2', sessionId: '1791_real', prompt: 'Haz algo', actor: 'op' });
        svc.submit('L2', 'op');
        await svc.approve('L2', 'op');
        await svc.refreshFromHub('L2', adapter.transcript);
        const record = svc.get('L2')!;
        expect(record.state).toBe('completed');
        expect(record.response).toContain('respuesta final');
        expect(record.completedAt).toBeGreaterThan(0);
    });

    it('never advances on evidence from BEFORE the dispatch', async () => {
        const adapter = new FakeAdapter(true, '', [
            { role: 'assistant', ts: T0 - 100_000, text: 'respuesta vieja' }
        ]);
        const { svc } = serviceWith(adapter);
        svc.create({ requestId: 'L3', sessionId: '1791_real', prompt: 'Nueva orden', actor: 'op' });
        svc.submit('L3', 'op');
        await svc.approve('L3', 'op');
        await svc.refreshFromHub('L3', adapter.transcript);
        const record = svc.get('L3')!;
        expect(record.state).toBe('dispatched'); // old evidence does NOT count
    });

    it('listRefreshable returns only in-flight instructions', async () => {
        const adapter = new FakeAdapter(true, '', []);
        const { svc } = serviceWith(adapter);
        svc.create({ requestId: 'L4a', sessionId: '1791_real', prompt: 'En vuelo', actor: 'op' });
        svc.submit('L4a', 'op');
        await svc.approve('L4a', 'op');
        svc.create({ requestId: 'L4b', sessionId: '1791_real', prompt: 'Solo borrador', actor: 'op' });
        const ids = svc.listRefreshable().map(r => r.requestId);
        expect(ids).toContain('L4a');
        expect(ids).not.toContain('L4b');
    });
});

describe('Block 5 (FASE B): HubSessionLauncher', () => {
    function buildLauncher(adapter: FakeAdapter, overrides: Partial<ServerConfig> = {}) {
        const { audit, dir } = tmpAudit();
        const config: ServerConfig = {
            ...loadConfig({}),
            hubSessionWorkspaces: path.join(dir, 'ws'),
            ...overrides
        };
        const launcher = new HubSessionLauncher(config, adapter as unknown as ClineControlAdapter, audit);
        return { launcher, audit, config, dir };
    }

    it('launches a managed session with restrictive tools and isolated workspace', async () => {
        const adapter = new FakeAdapter(true, '');
        const { launcher } = buildLauncher(adapter);
        const result = await launcher.launch({ prompt: 'prueba inocua', actor: 'op' });
        expect(result.ok).toBe(true);
        expect(result.session!.sessionId).toMatch(/^hub_managed_/);
        expect(fs.existsSync(result.session!.workspaceDir)).toBe(true); // isolated dir created
        expect(launcher.isLaunched(result.session!.sessionId)).toBe(true);
    });

    it('refuses to launch when the hub is unavailable, with the honest cause', async () => {
        const adapter = new FakeAdapter(false, 'ENVÍO DESHABILITADO — hub sin proveedor');
        const { launcher } = buildLauncher(adapter);
        const result = await launcher.launch({ actor: 'op' });
        expect(result.ok).toBe(false);
        expect(result.error).toContain('hub');
    });

    it('stop only affects office-launched sessions (never TUI ones)', async () => {
        const adapter = new FakeAdapter(true, '');
        const { launcher } = buildLauncher(adapter);
        const tuiStop = await launcher.stop('1791652292571_3vb8s', 'op'); // TUI id
        expect(tuiStop.ok).toBe(false);
        expect(tuiStop.error).toContain('gestionadas');

        const launched = await launcher.launch({ actor: 'op' });
        const stop = await launcher.stop(launched.session!.sessionId, 'op');
        expect(stop.ok).toBe(true);
        // After stop: not ACTIVE anymore, but kept as terminal for the
        // office's graceful eviction (grace window + history).
        expect(launcher.listLaunched().some(s => s.sessionId === launched.session!.sessionId)).toBe(false);
        expect(launcher.listStopped().some(s => s.sessionId === launched.session!.sessionId)).toBe(true);
    });

    it('audits launch and stop', async () => {
        const adapter = new FakeAdapter(true, '');
        const { launcher, audit } = buildLauncher(adapter);
        const launched = await launcher.launch({ actor: 'op' });
        await launcher.stop(launched.session!.sessionId, 'op');
        const actions = audit.tail(10).map(e => e.action);
        expect(actions).toContain('session.launch');
        expect(actions).toContain('session.stop');
    });
});

describe('Block 5 (FASE E): security additions', () => {
    it('AuditLog rotates when the file exceeds the size limit', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'b5-rot-'));
        const file = path.join(dir, 'audit.jsonl');
        const audit = new AuditLog(file);
        for (let i = 0; i < 500; i++) {
            audit.record({ action: 'test', actor: 'x', requestId: `r${i}`, result: 'ok' });
        }
        audit.rotateIfNeeded(5_000); // tiny limit → forces rotation
        expect(fs.existsSync(file + '.1')).toBe(true);  // rotated archive
        expect(audit.tail(50)).toHaveLength(0);          // fresh file
    });

    it('OfficeRoom.onAuth rejects joins without the configured WS token', () => {
        // Build a bare OfficeRoom without running onCreate.
        const room = Object.create(OfficeRoom.prototype) as any;
        room.serverConfig = { officeWsToken: 'secret-ws' };
        expect(room.onAuth({ sessionId: 'c1' } as any, {})).toBe(false);          // no token
        expect(room.onAuth({ sessionId: 'c2' } as any, { token: 'wrong' })).toBe(false); // bad token
        expect(room.onAuth({ sessionId: 'c3' } as any, { token: 'secret-ws' })).toBe(true);  // valid

        room.serverConfig = { officeWsToken: undefined };
        expect(room.onAuth({ sessionId: 'c4' } as any, {})).toBe(true);           // localhost mode: open
    });
});
