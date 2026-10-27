import { InstructionService } from '../InstructionService';
import { AuditLog } from '../AuditLog';
import { ClineControlAdapter } from '../ClineControlAdapter';
import { ServerConfig, loadConfig } from '../../../config';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * Block 4 tests (FASE I): instruction pipeline — approval, rejection of
 * invalid targets, duplicate prevention, rate limiting, honest pending
 * states when dispatch is unavailable, and the audit trail.
 */

/** Fake adapter: dispatch NEVER validated unless the test enables it. */
class FakeAdapter {
    constructor(public available: boolean, public cause: string) {}
    async getCapabilities() {
        return {
            sdkLoaded: this.available,
            hubRecordReadable: this.available,
            hubConnected: this.available,
            hubSessions: this.available ? 1 : 0,
            dispatchAvailable: this.available,
            dispatchCause: this.cause,
            readOnly: { listSessions: true, getSession: true, readMessages: true, subscribe: true },
            checkedAt: new Date().toISOString()
        };
    }
    async dispatch() { return this.available ? { ok: true } : { ok: false, error: this.cause }; }
}

function buildService(opts: {
    adapterAvailable?: boolean;
    cause?: string;
    ratePerMinute?: number;
    agents?: Array<{ id: string; name: string; status: string }>;
} = {}) {
    const config: ServerConfig = {
        ...loadConfig({}),
        instructionDispatchEnabled: true,
        instructionRatePerMinute: opts.ratePerMinute ?? 10
    };
    const adapter = new FakeAdapter(
        opts.adapterAvailable ?? false,
        opts.cause ?? 'ENVÍO DESHABILITADO — causa de prueba'
    ) as unknown as ClineControlAdapter;
    const auditDir = fs.mkdtempSync(path.join(os.tmpdir(), 'b4-audit-'));
    const audit = new AuditLog(path.join(auditDir, 'audit.jsonl'));
    const agents = opts.agents ?? [{ id: '1791_real', name: 'Cline real', status: 'working' }];
    const service = new InstructionService({
        config, adapter, audit,
        officeAgents: () => agents
    });
    return { service, audit, auditDir, adapter };
}

describe('InstructionService (FASE E/F)', () => {
    it('creates drafts only for REAL registered sessions', () => {
        const { service } = buildService();
        const ok = service.create({ requestId: 'r1', sessionId: '1791_real', prompt: 'Revisa el login', actor: 'op' });
        expect(ok.ok).toBe(true);
        expect(ok.record!.state).toBe('draft');

        const bad = service.create({ requestId: 'r2', sessionId: 'fake-session', prompt: 'x', actor: 'op' });
        expect(bad.ok).toBe(false);
        expect(bad.error).toContain('no registrada');
    });

    it('is idempotent by requestId — duplicates never double-send', () => {
        const { service } = buildService();
        const first = service.create({ requestId: 'dup', sessionId: '1791_real', prompt: 'Instrucción original', actor: 'op' });
        const second = service.create({ requestId: 'dup', sessionId: '1791_real', prompt: 'Cambio tardío', actor: 'op' });
        expect(second.duplicated).toBe(true);
        expect(second.record!.prompt).toBe('Instrucción original'); // original preserved
        expect(service.list()).toHaveLength(1);
    });

    it('applies the global rate limit', () => {
        const { service } = buildService({ ratePerMinute: 2 });
        expect(service.create({ requestId: 'a', sessionId: '1791_real', prompt: 'primera', actor: 'op' }).ok).toBe(true);
        expect(service.create({ requestId: 'b', sessionId: '1791_real', prompt: 'segunda', actor: 'op' }).ok).toBe(true);
        const limited = service.create({ requestId: 'c', sessionId: '1791_real', prompt: 'tercera', actor: 'op' });
        expect(limited.ok).toBe(false);
        expect(limited.error).toContain('frecuencia');
    });

    it('full happy path: draft → pending → approved → dispatched (validated adapter)', async () => {
        const { service } = buildService({ adapterAvailable: true });
        service.create({ requestId: 'r9', sessionId: '1791_real', prompt: 'Ejecuta X', actor: 'op' });
        service.submit('r9', 'op');
        const approved = await service.approve('r9', 'op');
        expect(approved.record!.state).toBe('dispatched'); // adapter validated → dispatched
        expect(approved.record!.pendingDispatchCause).toBeUndefined();
    });

    it('HONEST pending: approved but NOT dispatched when the adapter is unavailable', async () => {
        const { service } = buildService({
            adapterAvailable: false,
            cause: 'ENVÍO DESHABILITADO — el hub no tiene sesiones despachables'
        });
        service.create({ requestId: 'r10', sessionId: '1791_real', prompt: 'Ejecuta Y', actor: 'op' });
        service.submit('r10', 'op');
        const result = await service.approve('r10', 'op');
        expect(result.record!.state).toBe('approved');      // NOT 'dispatched'
        expect(result.record!.pendingDispatchCause).toContain('DESHABILITADO');
    });

    it('rejects instructions and refuses invalid transitions', async () => {
        const { service } = buildService();
        service.create({ requestId: 'r20', sessionId: '1791_real', prompt: 'Instrucción descartable', actor: 'op' });
        const rejected = service.reject('r20', 'op', 'no aplica');
        expect(rejected.record!.state).toBe('rejected');
        expect(rejected.record!.error).toBe('no aplica');

        // A rejected instruction cannot be submitted or approved.
        expect(service.submit('r20', 'op').ok).toBe(false);
        const approved = await service.approve('r20', 'op');
        expect(approved.ok).toBe(false);
    });

    it('only pending_approval instructions can be approved', async () => {
        const { service } = buildService();
        service.create({ requestId: 'r30', sessionId: '1791_real', prompt: 'Todavía borrador', actor: 'op' });
        const early = await service.approve('r30', 'op'); // still draft
        expect(early.ok).toBe(false);
        expect(early.error).toContain('pendientes');
    });

    it('sanitizes prompts before storing (no secrets in the pipeline)', () => {
        const { service } = buildService();
        const created = service.create({
            requestId: 'r40', sessionId: '1791_real',
            prompt: 'usa la clave nvapi-SECRETSECRET123 y ejecuta sk-KEY12345678',
            actor: 'op'
        });
        expect(created.ok).toBe(true);
        expect(created.record!.prompt).not.toContain('SECRETSECRET123');
        expect(created.record!.prompt).not.toContain('sk-KEY12345678');
        expect(created.record!.prompt).toContain('[nvapi-…]');
    });

    it('writes the complete audit trail', async () => {
        const { service, audit } = buildService();
        service.create({ requestId: 'r50', sessionId: '1791_real', prompt: 'audita', actor: 'op' });
        service.submit('r50', 'op');
        await service.approve('r50', 'op');
        const entries = audit.tail(10);
        const actions = entries.map(e => e.action);
        expect(actions).toContain('instruction.create');
        expect(actions).toContain('instruction.submit');
        expect(actions).toContain('instruction.approve');
        expect(actions).toContain('instruction.dispatch');
        // The dispatch audit records the honest pending state.
        const dispatch = entries.find(e => e.action === 'instruction.dispatch');
        expect(dispatch!.result).toContain('pending');
    });
});
