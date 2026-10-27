import { HttpDshTaskProvider } from '../HttpDshTaskProvider';
import { OfficeTask } from '../../tasks/TaskStore';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';

/**
 * Ciudadan Bloque 2 (F3.3) — tests del proveedor REAL de DSH.
 *
 * El mock implementa el protocolo v2 VERIFICADO del servidor web de DSH:
 *   POST /api/{endpoint}
 *   body  { type:'client-request', rpcId, method, payload:{ args } }
 *   resp  { rpcId, result:{ ok:true, value } | { ok:false, error } }
 * y EXIGE una cookie firmada válida (misma construcción criptográfica que
 * dsh-client-connection BrowserAuth) acuñada desde el secreto persistido
 * en el almacén de credenciales. También valida el seguimiento de
 * revisiones (concurrencia optimista real de goals).
 */

interface RecordedCall { endpoint: string; payload: any; cookie: string | undefined; }

function base64url(b: Buffer): string {
    return Buffer.from(b).toString('base64')
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '');
}

/** Writes a browser-session secret fixture and returns a cookie VERIFIER
 *  that mirrors the live server's check (name + HMAC-SHA256). */
function authFixture(dir: string): { credentialsPath: string; verify: (raw: string | undefined) => boolean } {
    const secret = crypto.randomBytes(32);
    const credentialsPath = path.join(dir, '.credentials.yaml');
    fs.writeFileSync(credentialsPath, [
        'version: 1',
        'records:',
        '  client-connection/browser-session:',
        '    kind: grant',
        '    payload:',
        '      version: 1',
        `      secret: ${base64url(secret)}`,
        ''
    ].join('\n'), 'utf8');
    const authority = '127.0.0.1:3080';
    const name = 'dsh-auth-' + base64url(crypto.createHash('sha256').update(authority).digest());
    const verify = (raw: string | undefined) => {
        if (!raw) return false;
        const seg = raw.split(';').map(s => s.trim()).find(s => s.startsWith(name + '='));
        if (!seg) return false;
        const parts = seg.slice(name.length + 1).split('.');
        if (parts.length !== 3 || parts[0] !== 'v1') return false;
        const expected = base64url(crypto.createHmac('sha256', secret).update(parts[1]).digest());
        return expected === parts[2];
    };
    return { credentialsPath, verify };
}

function mockDsh(
    handlers: Record<string, (args: any) => any>,
    verify: (raw: string | undefined) => boolean
): { calls: RecordedCall[]; fetchImpl: typeof fetch } {
    const calls: RecordedCall[] = [];
    const fetchImpl: any = async (url: any, init: any) => {
        const body = JSON.parse(String(init.body));
        calls.push({ endpoint: body.method, payload: body.payload.args, cookie: init.headers.cookie });
        if (!verify(init.headers.cookie)) {
            return { ok: false, status: 401, json: async () => ({}) };
        }
        const handler = handlers[body.method];
        if (!handler) { throw new Error(`endpoint inesperado: ${body.method}`); }
        return {
            ok: true,
            status: 200,
            json: async () => ({ rpcId: body.rpcId, result: { ok: true, value: handler(body.payload.args) } })
        };
    };
    return { calls, fetchImpl };
}

function goalView(id: string, revision: number, phase: string, activation: string): any {
    return {
        roundsStarted: 0, createdAt: 0, updatedAt: 0, activation,
        objective: 'objetivo', phase, maxGoalRounds: 8, id, revision
    };
}

function buildProvider(dir?: string) {
    const theDir = dir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'b2-dsh-'));
    const { credentialsPath, verify } = authFixture(theDir);
    return {
        dir: theDir,
        verify,
        make(fetchOverride?: typeof fetch) {
            return new HttpDshTaskProvider({
                baseUrl: 'http://127.0.0.1:3080',
                sessionId: 'session-test',
                credentialsPath,
                dbPath: path.join(theDir, 'dsh-tasks.db'),
                fetchImpl: fetchOverride
            });
        }
    };
}

function anOfficeTask(id: string, title: string, description = ''): OfficeTask {
    const now = new Date().toISOString();
    return {
        id, title, description, status: 'proposed', origin: 'agentoffice',
        sprintId: null, assigneeSessionId: null, dependencies: [],
        createdAt: now, updatedAt: now
    };
}

/** Flujo completo de handlers para una tarea (revisiones realistas). */
function fullFlowHandlers() {
    return {
        'pluginInventory/list': () => ({ entries: [] }),
        'goals/create': (a: any) => {
            expect(a.agentId).toBe('session-test');
            expect(a.request.objective).toContain('[AgentOffice src-1]');
            expect(a.request.maxGoalRounds).toBe(8);
            return { ref: { id: 'goal-e2e', revision: 1 } };
        },
        'goals/pause': (a: any) => {
            expect(a.ref.revision).toBeGreaterThanOrEqual(1);
            return goalView('goal-e2e', a.ref.revision + 1, 'paused', 'disarmed');
        },
        'goals/resume': (a: any) => goalView('goal-e2e', a.ref.revision + 1, 'active', 'armed'),
        'goals/complete': (a: any) => goalView('goal-e2e', a.ref.revision + 1, 'complete', 'disarmed'),
        'goals/clear': (a: any) => ({ id: a.ref.id, revision: a.ref.revision })
    };
}

describe('HttpDshTaskProvider (protocol real v2 + cookie firmada)', () => {
    it('available() sondea con pluginInventory/list y cookie válida', async () => {
        const { make, verify } = buildProvider();
        const { calls, fetchImpl } = mockDsh({ 'pluginInventory/list': () => ({ entries: [] }) }, verify);
        const provider = make(fetchImpl);
        expect(await provider.available()).toBe(true);
        expect(calls).toHaveLength(1);
        expect(calls[0].endpoint).toBe('pluginInventory/list');
        expect(calls[0].payload).toEqual({});
        // La cookie viajó firmada con el secreto del almacén.
        expect(verify(calls[0].cookie)).toBe(true);
        expect(provider.describe()).toContain('http → http://127.0.0.1:3080');
        await provider.close();
    });

    it('sin cookie válida el servidor rechaza 401 y available() es false', async () => {
        const { make } = buildProvider();
        const rejectAll: (raw: string | undefined) => boolean = () => false;
        const { fetchImpl } = mockDsh({ 'pluginInventory/list': () => ({ entries: [] }) }, rejectAll);
        const provider = make(fetchImpl);
        expect(await provider.available()).toBe(false);
        await provider.close();
    });

    it('available() es false cuando el almacén de credenciales no existe', async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'b2-dsh-'));
        const provider = new HttpDshTaskProvider({
            baseUrl: 'http://127.0.0.1:3080',
            sessionId: 'session-test',
            credentialsPath: path.join(dir, 'no-existe.yaml'),
            dbPath: path.join(dir, 'dsh-tasks.db'),
            fetchImpl: ((): any => async () => { throw new Error('no debe llamarse'); })()
        });
        expect(await provider.available()).toBe(false);
        await provider.close();
    });

    it('proposeToDsh crea el goal REAL y lo DESARMA (propuesta ≠ ejecución)', async () => {
        const { make, verify } = buildProvider();
        const { calls, fetchImpl } = mockDsh(fullFlowHandlers(), verify);
        const provider = make(fetchImpl);

        const result = await provider.proposeToDsh(anOfficeTask('src-1', 'Verificar temporal2-agent4', 'Sondeo de solo lectura'));
        expect(result.available).toBe(true);
        expect(result.data!.status).toBe('pending');
        expect(result.data!.origin).toBe('dsh');

        // create (armed) seguido inmediatamente de pause (disarmed).
        expect(calls.map(c => c.endpoint)).toEqual(['goals/create', 'goals/pause']);
        expect(calls[0].payload.request.objective).toContain('Verificar temporal2-agent4');
        expect(calls[1].payload.ref).toEqual({ id: 'goal-e2e', revision: 1 });

        const results = await provider.getResults(result.data!.id);
        expect(results.available).toBe(true);
        expect((results.data as any).phase).toBe('paused');
        expect((results.data as any).activation).toBe('disarmed');
        await provider.close();
    });

    it('proposeToDsh es idempotente por tarea de origen (no duplica goals)', async () => {
        const { make, verify } = buildProvider();
        const { calls, fetchImpl } = mockDsh(fullFlowHandlers(), verify);
        const provider = make(fetchImpl);
        const task = anOfficeTask('src-1', 'Tarea única');
        await provider.proposeToDsh(task);
        const second = await provider.proposeToDsh(task);
        expect(second.available).toBe(true);
        expect(calls.filter(c => c.endpoint === 'goals/create')).toHaveLength(1);
        await provider.close();
    });

    it('requestAssignment ARMA el goal con la revisión correcta (goals/resume)', async () => {
        const { make, verify } = buildProvider();
        const { calls, fetchImpl } = mockDsh(fullFlowHandlers(), verify);
        const provider = make(fetchImpl);
        const created = (await provider.proposeToDsh(anOfficeTask('src-1', 'Tarea'))).data!;

        const assigned = await provider.requestAssignment(created.id);
        expect(assigned.available).toBe(true);
        expect(assigned.data!.status).toBe('assigned');
        expect(assigned.data!.assigneeSessionId).toBe('session-test');
        expect(calls[2].endpoint).toBe('goals/resume');
        // La revisión enviada es la que devolvió goals/pause (2).
        expect(calls[2].payload.ref).toEqual({ id: 'goal-e2e', revision: 2 });
        await provider.close();
    });

    it('notifyBlocker pausa el goal y anota la causa en el registro', async () => {
        const { make, verify } = buildProvider();
        const { fetchImpl } = mockDsh(fullFlowHandlers(), verify);
        const provider = make(fetchImpl);
        const created = (await provider.proposeToDsh(anOfficeTask('src-1', 'Tarea'))).data!;
        await provider.requestAssignment(created.id);

        const blocked = await provider.notifyBlocker(created.id, 'red del hub caída');
        expect(blocked.available).toBe(true);
        const [task] = (await provider.listTasks()).filter(t => t.id === created.id);
        expect(task.status).toBe('blocked');
        expect(task.description).toContain('[bloqueo');
        expect(task.description).toContain('red del hub caída');
        await provider.close();
    });

    it("updateStatus('completed') completa el goal REAL (goals/complete)", async () => {
        const { make, verify } = buildProvider();
        const { calls, fetchImpl } = mockDsh(fullFlowHandlers(), verify);
        const provider = make(fetchImpl);
        const created = (await provider.proposeToDsh(anOfficeTask('src-1', 'Tarea'))).data!;
        await provider.requestAssignment(created.id);

        const done = await provider.updateStatus(created.id, 'completed');
        expect(done!.status).toBe('completed');
        const results = await provider.getResults(created.id);
        expect((results.data as any).phase).toBe('complete');
        expect((results.data as any).activation).toBe('disarmed');
        expect(calls[3].endpoint).toBe('goals/complete');
        expect(calls[3].payload.ref.revision).toBe(3);
        await provider.close();
    });

    it('solo las rutas reales cambian el estado de ejecución (nada simulado)', async () => {
        const { make, verify } = buildProvider();
        const { fetchImpl } = mockDsh(fullFlowHandlers(), verify);
        const provider = make(fetchImpl);
        const created = (await provider.proposeToDsh(anOfficeTask('src-1', 'Tarea'))).data!;
        await expect(provider.updateStatus(created.id, 'in_progress')).rejects.toThrow(/requestAssignment/);
        await expect(provider.updateStatus(created.id, 'assigned')).rejects.toThrow(/requestAssignment/);
        await provider.close();
    });

    it('removeFromDsh limpia el goal (reversibilidad completa)', async () => {
        const { make, verify } = buildProvider();
        const { calls, fetchImpl } = mockDsh(fullFlowHandlers(), verify);
        const provider = make(fetchImpl);
        const created = (await provider.proposeToDsh(anOfficeTask('src-1', 'Tarea'))).data!;

        const cleared = await provider.removeFromDsh(created.id);
        expect(cleared.available).toBe(true);
        expect(calls[calls.length - 1].endpoint).toBe('goals/clear');
        const [task] = (await provider.listTasks()).filter(t => t.id === created.id);
        expect(task.status).toBe('proposed');
        const results = await provider.getResults(created.id);
        expect(results.available).toBe(false); // sin goal no hay estado que leer
        await provider.close();
    });

    it('el registro persiste entre reaperturas (SQLite propio, origen dsh)', async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'b2-dsh-'));
        const { credentialsPath } = authFixture(dir);
        const dbPath = path.join(dir, 'dsh-tasks.db');
        const { fetchImpl } = mockDsh(fullFlowHandlers(), () => true);
        const first = new HttpDshTaskProvider({
            baseUrl: 'http://127.0.0.1:3080', sessionId: 'session-test',
            credentialsPath, dbPath, fetchImpl
        });
        const created = (await first.proposeToDsh(anOfficeTask('src-1', 'Persistente'))).data!;
        await first.close();

        const reopened = new HttpDshTaskProvider({
            baseUrl: 'http://127.0.0.1:3080', sessionId: 'session-test',
            credentialsPath, dbPath, fetchImpl
        });
        const tasks = await reopened.listTasks();
        expect(tasks.some(t => t.id === created.id && t.status === 'pending')).toBe(true);
        await reopened.close();
    });
});
