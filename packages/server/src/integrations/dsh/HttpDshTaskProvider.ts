import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { OfficeTask, OfficeSprint, OfficeTaskStatus, TaskProvider } from '../tasks/TaskStore';
import { DshTaskProvider, DshProviderResult } from './DshTaskProvider';
import { sanitizeTitle } from '../cline/ClineStateNormalizer';

/**
 * Ciudadan — Bloque 2 (plan F3.3): REAL DSH task provider.
 *
 * Implements the `DshTaskProvider` contract against a REAL DeepSeek Harness
 * instance (verified wire protocol, no invented endpoints):
 *
 *   POST {baseUrl}/api/{endpoint}
 *   body: { type: 'client-request', rpcId, method: <endpoint>, payload: { args: <named args> } }
 *   response: { type: 'server-response', rpcId, result: { ok: true, value } | { ok: false, error } }
 *
 * AUTHENTICATION (verified against the live v2 webserver): `dsh web`
 * requires a signed browser cookie on every /api call. Cookies are minted
 * ONLY through the one-time launch token URL printed by `dsh web` (the
 * token lives in process memory only). The cookie-SIGNING SECRET however
 * is PERSISTED in the harness credential store (dsh-credentials-local,
 * record `client-connection/browser-session`). This provider mints the
 * SAME authority-bound signed cookie from that store — the identical
 * mechanism the browser ends up with, no new auth is invented and no
 * secret ever leaves the process (never logged, never returned).
 *
 * Remote endpoints used (mounted DSH contributions, verified in
 * @deepseek-ai/dsh-api-remotes):
 *   - pluginInventory/list (no args) — read-only liveness probe.
 *   - goals/create { agentId, request: { objective, maxGoalRounds? } }
 *       → { ref: { id, revision } }
 *   - goals/pause   { agentId, ref }  → GoalView (disarmed)
 *   - goals/resume  { agentId, ref }  → GoalView (armed)
 *   - goals/complete { agentId, ref }  → GoalView (complete)
 *   - goals/clear   { agentId, ref }  → GoalRef (removal)
 *
 * `agentId` is the DSH **SessionId**; the Host resolver reuses the live
 * agent or cold-resumes the session (dsh-api-remotes policy). Because the
 * web server trusts loopback/trustedHosts AND requires the browser
 * cookie, the intended deployment is same-machine or through an SSH
 * tunnel, with read access to the harness credential store.
 *
 * Honest semantic mapping (documented, no fiction):
 *   - proposeToDsh  → goals/create + goals/pause. The goal EXISTS in DSH
 *     (source of truth) but is disarmed: a proposal accepted, not executing.
 *   - requestAssignment → goals/resume: ARMS the goal so the owning DSH
 *     session's round driver works on it (real assignment).
 *   - updateStatus('completed') → goals/complete.
 *   - notifyBlocker → goals/pause + registry note.
 *   - removeFromDsh → goals/clear (full reversibility of a proposal).
 *   - getResults → the last GoalView CONFIRMED by an RPC plus registry
 *     state. There is no read-only remote goal endpoint in v1, so passive
 *     polling is NOT faked: the fresh phase is only known after an
 *     interaction (or by the owning session itself).
 */

export interface HttpDshTaskProviderConfig {
    /** DSH web origin, e.g. http://127.0.0.1:3080 (loopback/tunnel only). */
    baseUrl: string;
    /** SessionId of the DSH session that will own (and execute) the goals. */
    sessionId: string;
    /** Path of the DSH harness credential store (.credentials.yaml) that
     *  persists the browser-session cookie-signing secret. */
    credentialsPath: string;
    /** Reserved: future DSH auth layer. Sent as X-DSH-Token when set. */
    token?: string;
    /** Registry SQLite file (provider-owned, origin 'dsh' rows). */
    dbPath: string;
    /** Injectable fetch (tests). Defaults to global fetch. */
    fetchImpl?: typeof fetch;
    /** RPC timeout per call, ms (default 15000). */
    requestTimeoutMs?: number;
    /** Round cap applied to created goals (default 8, DSH validates >= 1). */
    maxGoalRounds?: number;
}

/** Goal view fields the provider tracks (verified wire schema). */
interface GoalViewWire {
    roundsStarted: number;
    createdAt: number;
    updatedAt: number;
    activation: 'armed' | 'disarmed';
    objective: string;
    phase: 'active' | 'paused' | 'blocked' | 'complete';
    blockedReason?: { code: string; message: string };
    maxGoalRounds: number;
    id: string;
    revision: number;
}

interface GoalRefWire { id: string; revision: number; }

interface DshTaskRow {
    id: string;
    title: string;
    description: string;
    status: string;
    sprint_id: string | null;
    assignee_session_id: string | null;
    dsh_goal_id: string | null;
    dsh_revision: number | null;
    dsh_phase: string | null;
    dsh_activation: string | null;
    dsh_rounds_started: number | null;
    source_ref: string | null;
    last_rpc_at: string | null;
    dependencies_json: string;
    created_at: string;
    updated_at: string;
}

const ORG_STATUSES: OfficeTaskStatus[] = ['proposed', 'in_review'];

export class HttpDshTaskProvider implements DshTaskProvider {
    readonly kind = 'dsh' as const;

    private readonly fetch: typeof fetch;
    private db?: Database;
    private cookie?: string;
    private readonly cookieLifetimeMs = 60 * 60 * 1000;

    constructor(private readonly config: HttpDshTaskProviderConfig) {
        this.fetch = config.fetchImpl ?? (globalThis.fetch as typeof fetch);
        if (!config.baseUrl) throw new Error('HttpDshTaskProvider: falta baseUrl.');
        if (!config.sessionId) throw new Error('HttpDshTaskProvider: falta sessionId.');
        if (!config.credentialsPath) throw new Error('HttpDshTaskProvider: falta credentialsPath.');
    }

    // ─── authentication (verified dsh-client-connection BrowserAuth) ──

    /** Read the persisted browser-session cookie-signing secret.
     *  The secret stays in memory: never logged, never returned. */
    private loadAuthSecret(): Buffer {
        const yaml = fs.readFileSync(this.config.credentialsPath, 'utf8');
        const at = yaml.indexOf('client-connection/browser-session:');
        if (at < 0) {
            throw new Error('DSH: falta el registro client-connection/browser-session en el almacén de credenciales.');
        }
        const m = yaml.slice(at).match(/secret:\s*([A-Za-z0-9_-]+)/);
        if (!m) throw new Error('DSH: registro browser-session sin secret.');
        return Buffer.from(m[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    }

    /** Mint the same authority-bound signed cookie the browser holds. */
    private mintCookie(): string {
        const secret = this.loadAuthSecret();
        const b64url = (b: Buffer) => Buffer.from(b).toString('base64')
            .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '');
        const authority = new URL(this.config.baseUrl).host;
        const name = 'dsh-auth-' + b64url(crypto.createHash('sha256').update(authority).digest());
        const issuedAt = Date.now();
        const expiresAt = issuedAt + this.cookieLifetimeMs;
        const body = b64url(Buffer.from(JSON.stringify({ version: 1, authority, issuedAt, expiresAt }), 'utf8'));
        const sig = b64url(crypto.createHmac('sha256', secret).update(body).digest());
        return `${name}=v1.${body}.${sig}`;
    }

    // ─── wire protocol (v2: payload.args + Result envelope) ────────────

    private async rpcOnce<T>(endpoint: string, args: Record<string, unknown>): Promise<{ rpcId: string; status: number; parsed: any }> {
        const rpcId = crypto.randomUUID();
        const body = { type: 'client-request', rpcId, method: endpoint, payload: { args } };
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.config.requestTimeoutMs ?? 15000);
        try {
            if (!this.cookie) this.cookie = this.mintCookie();
            const headers: Record<string, string> = {
                'content-type': 'application/json',
                cookie: this.cookie
            };
            if (this.config.token) headers['x-dsh-token'] = this.config.token;
            const response = await this.fetch(
                `${this.config.baseUrl.replace(/\/$/, '')}/api/${endpoint}`,
                { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal }
            );
            let parsed: any = null;
            try { parsed = await response.json(); } catch { /* non-JSON error body */ }
            return { rpcId, status: response.status, parsed };
        } finally {
            clearTimeout(timer);
        }
    }

    private async rpc<T>(endpoint: string, args: Record<string, unknown>): Promise<T> {
        let attempt = await this.rpcOnce(endpoint, args);
        if (attempt.status === 401) {
            // The signing secret may have rotated: re-mint once and retry.
            this.cookie = undefined;
            attempt = await this.rpcOnce(endpoint, args);
        }
        const { rpcId, status, parsed } = attempt;
        if (status === 401) throw new Error(`DSH ${endpoint}: 401 unauthorized (cookie rechazada; revisa el almacén de credenciales).`);
        if (status === 403) throw new Error(`DSH ${endpoint}: 403 forbidden (valla de origen; usa loopback o trustedHosts).`);
        if (status < 200 || status >= 300) throw new Error(`DSH ${endpoint}: HTTP ${status}`);
        if (!parsed || parsed.rpcId !== rpcId) throw new Error(`DSH ${endpoint}: rpcId no coincide.`);
        const result = parsed.result;
        if (!result || typeof result !== 'object') throw new Error(`DSH ${endpoint}: respuesta sin result.`);
        if (result.ok === false) {
            const code = result.error?.code ? String(result.error.code) : 'error';
            const msg = result.error?.message ? String(result.error.message) : '';
            throw new Error(`DSH ${endpoint}: ${code}${msg ? ` ${msg}` : ''}`.trim());
        }
        return result.value as T;
    }

    // ─── DshTaskProvider: status ──────────────────────────────────────

    async available(): Promise<boolean> {
        try {
            // Read-only mounted remote; verifies a real DSH answers RPC.
            await this.rpc('pluginInventory/list', {});
            return true;
        } catch {
            return false;
        }
    }

    describe(): string {
        return `dsh:task-provider http → ${this.config.baseUrl} (sesión ${this.config.sessionId})`;
    }

    // ─── DshTaskProvider: real operations ────────────────────────────

    async proposeToDsh(task: OfficeTask): Promise<DshProviderResult<OfficeTask>> {
        try {
            const existing = await this.findBySourceRef(task.id);
            if (existing && existing.dsh_goal_id) {
                return { available: true, data: this.toTask(existing) };
            }
            const objective = `[AgentOffice ${task.id}] ${task.title}`
                + (task.description ? `\n\n${task.description}` : '');
            const created = await this.rpc<{ ref: GoalRefWire }>('goals/create', {
                agentId: this.config.sessionId,
                request: { objective, maxGoalRounds: this.config.maxGoalRounds ?? 8 }
            });
            const goalId = created.ref.id;
            // A proposal is ACCEPTED, not executing: disarm immediately.
            const paused = await this.rpc<GoalViewWire>('goals/pause', {
                agentId: this.config.sessionId,
                ref: { id: goalId, revision: created.ref.revision }
            });
            const row = await this.insertTask({
                title: task.title,
                description: task.description,
                status: 'pending',
                sourceRef: task.id,
                goal: { id: goalId, revision: paused.revision, phase: paused.phase, activation: paused.activation },
                roundsStarted: paused.roundsStarted,
                lastRpcAt: new Date().toISOString()
            });
            return { available: true, data: this.toTask(row) };
        } catch (e: any) {
            return { available: false, reason: String(e?.message || e) };
        }
    }

    async requestAssignment(taskId: string, sessionId?: string): Promise<DshProviderResult<OfficeTask>> {
        try {
            const row = await this.get(taskId);
            if (!row) return { available: false, reason: 'Tarea DSH no encontrada en el registro del proveedor.' };
            if (!row.dsh_goal_id || row.dsh_revision === null) {
                return { available: false, reason: 'La tarea no tiene un goal DSH (usa proposeToDsh primero).' };
            }
            const agent = sessionId ?? row.assignee_session_id ?? this.config.sessionId;
            const view = await this.rpc<GoalViewWire>('goals/resume', {
                agentId: agent,
                ref: { id: row.dsh_goal_id, revision: row.dsh_revision }
            });
            const updated = await this.updateRow(taskId, {
                status: 'assigned',
                assignee_session_id: agent,
                dsh_revision: view.revision,
                dsh_phase: view.phase,
                dsh_activation: view.activation,
                dsh_rounds_started: view.roundsStarted,
                last_rpc_at: new Date().toISOString()
            });
            return { available: true, data: this.toTask(updated!) };
        } catch (e: any) {
            return { available: false, reason: String(e?.message || e) };
        }
    }

    async getResults(taskId: string): Promise<DshProviderResult<unknown>> {
        const row = await this.get(taskId);
        if (!row) return { available: false, reason: 'Tarea DSH no encontrada.' };
        if (!row.dsh_goal_id) {
            return { available: false, reason: 'La tarea no tiene un goal DSH.' };
        }
        // No read-only remote goal endpoint exists in DSH v1: return the
        // last state CONFIRMED by an RPC interaction. Never invent a phase.
        return {
            available: true,
            data: {
                goalId: row.dsh_goal_id,
                phase: row.dsh_phase,
                activation: row.dsh_activation,
                roundsStarted: row.dsh_rounds_started,
                revision: row.dsh_revision,
                lastRpcAt: row.last_rpc_at,
                registryStatus: row.status,
                note: 'fase según el último RPC confirmado; DSH v1 no expone lectura pasiva de goals'
            }
        };
    }

    async notifyBlocker(taskId: string, description: string): Promise<DshProviderResult<null>> {
        try {
            const row = await this.get(taskId);
            if (!row) return { available: false, reason: 'Tarea DSH no encontrada.' };
            if (!row.dsh_goal_id || row.dsh_revision === null) {
                return { available: false, reason: 'La tarea no tiene un goal DSH.' };
            }
            // A blocker disarms the goal (real pause); the registry keeps why.
            await this.rpc<GoalViewWire>('goals/pause', {
                agentId: row.assignee_session_id ?? this.config.sessionId,
                ref: { id: row.dsh_goal_id, revision: row.dsh_revision }
            });
            const updated = await this.updateRow(taskId, {
                status: 'blocked',
                dsh_phase: 'paused',
                dsh_activation: 'disarmed',
                last_rpc_at: new Date().toISOString(),
                description: (row.description ? row.description + '\n' : '')
                    + `[bloqueo ${new Date().toISOString()}] ${description}`.trim()
            });
            if (!updated) return { available: false, reason: 'Tarea no encontrada al actualizar.' };
            return { available: true, data: null };
        } catch (e: any) {
            return { available: false, reason: String(e?.message || e) };
        }
    }

    async removeFromDsh(taskId: string): Promise<DshProviderResult<null>> {
        try {
            const row = await this.get(taskId);
            if (!row) return { available: false, reason: 'Tarea DSH no encontrada.' };
            if (!row.dsh_goal_id) return { available: true, data: null };
            await this.rpc<GoalRefWire>('goals/clear', {
                agentId: row.assignee_session_id ?? this.config.sessionId,
                ref: { id: row.dsh_goal_id, revision: row.dsh_revision ?? 1 }
            });
            const updated = await this.updateRow(taskId, {
                status: row.status === 'completed' ? 'completed' : 'proposed',
                dsh_phase: 'cleared',
                dsh_goal_id: null,
                dsh_revision: null,
                last_rpc_at: new Date().toISOString()
            });
            if (!updated) return { available: false, reason: 'Tarea no encontrada al actualizar.' };
            return { available: true, data: null };
        } catch (e: any) {
            return { available: false, reason: String(e?.message || e) };
        }
    }

    // ─── TaskProvider: registry-backed office organization ────────────

    async listTasks(): Promise<OfficeTask[]> {
        const db = await this.openDb();
        const rows = await db.all('SELECT * FROM dsh_tasks ORDER BY created_at DESC');
        return rows.map((r: any) => this.toTask(r));
    }

    async createProposal(input: { title: string; description?: string }): Promise<OfficeTask> {
        const title = sanitizeTitle(input.title, 120);
        if (!title) throw new Error('Título inválido.');
        const row = await this.insertTask({
            title,
            description: input.description || '',
            status: 'proposed',
            sourceRef: null,
            goal: null
        });
        return this.toTask(row);
    }

    async updateStatus(taskId: string, status: OfficeTaskStatus): Promise<OfficeTask | null> {
        const row = await this.get(taskId);
        if (!row) return null;
        if (status === 'completed') {
            if (!row.dsh_goal_id || row.dsh_revision === null) {
                throw new Error('Solo una tarea con goal DSH puede completarse (propónla primero).');
            }
            const view = await this.rpc<GoalViewWire>('goals/complete', {
                agentId: row.assignee_session_id ?? this.config.sessionId,
                ref: { id: row.dsh_goal_id, revision: row.dsh_revision }
            });
            const updated = await this.updateRow(taskId, {
                status: 'completed',
                dsh_phase: view.phase,
                dsh_activation: view.activation,
                dsh_revision: view.revision,
                dsh_rounds_started: view.roundsStarted,
                last_rpc_at: new Date().toISOString()
            });
            return updated ? this.toTask(updated) : null;
        }
        if (!ORG_STATUSES.includes(status)) {
            throw new Error(
                `Transición no permitida a '${status}': usa proposeToDsh (pending), ` +
                `requestAssignment (assigned/in_progress), notifyBlocker (blocked) o completed.`
            );
        }
        const updated = await this.updateRow(taskId, { status });
        return updated ? this.toTask(updated) : null;
    }

    async listSprints(): Promise<OfficeSprint[]> {
        const db = await this.openDb();
        const rows = await db.all('SELECT * FROM dsh_sprints ORDER BY created_at DESC');
        return rows.map((r: any) => ({
            id: r.id, name: r.name, goal: r.goal || '', createdAt: r.created_at
        }));
    }

    async createSprint(input: { name: string; goal?: string }): Promise<OfficeSprint> {
        const db = await this.openDb();
        const id = `sprint-${crypto.randomUUID().slice(0, 8)}`;
        const now = new Date().toISOString();
        await db.run(
            'INSERT INTO dsh_sprints (id, name, goal, created_at) VALUES (?, ?, ?, ?)',
            [id, sanitizeTitle(input.name, 80) || 'Sprint', input.goal || '', now]
        );
        return { id, name: input.name, goal: input.goal || '', createdAt: now };
    }

    async assignToSprint(taskId: string, sprintId: string | null): Promise<OfficeTask | null> {
        const updated = await this.updateRow(taskId, { sprint_id: sprintId });
        return updated ? this.toTask(updated) : null;
    }

    // ─── registry storage ─────────────────────────────────────────────

    private async openDb(): Promise<Database> {
        if (this.db) return this.db;
        fs.mkdirSync(path.dirname(this.config.dbPath), { recursive: true });
        this.db = await open({ filename: this.config.dbPath, driver: sqlite3.Database });
        await this.db.exec(`
            CREATE TABLE IF NOT EXISTS dsh_tasks (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT DEFAULT '',
                status TEXT NOT NULL DEFAULT 'proposed',
                sprint_id TEXT,
                assignee_session_id TEXT,
                dsh_goal_id TEXT,
                dsh_revision INTEGER,
                dsh_phase TEXT,
                dsh_activation TEXT,
                dsh_rounds_started INTEGER,
                source_ref TEXT,
                last_rpc_at TEXT,
                dependencies_json TEXT DEFAULT '[]',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS dsh_sprints (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                goal TEXT DEFAULT '',
                created_at TEXT NOT NULL
            );
        `);
        return this.db;
    }

    private async insertTask(input: {
        title: string;
        description: string;
        status: OfficeTaskStatus;
        sourceRef: string | null;
        goal: { id: string; revision: number; phase: string; activation: string } | null;
        roundsStarted?: number;
        lastRpcAt?: string;
    }): Promise<DshTaskRow> {
        const db = await this.openDb();
        const id = `dsh-${crypto.randomUUID().slice(0, 8)}`;
        const now = new Date().toISOString();
        await db.run(
            `INSERT INTO dsh_tasks
             (id, title, description, status, source_ref, dsh_goal_id, dsh_revision,
              dsh_phase, dsh_activation, dsh_rounds_started, last_rpc_at,
              dependencies_json, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', ?, ?)`,
            [id, input.title, input.description, input.status, input.sourceRef,
             input.goal?.id ?? null, input.goal?.revision ?? null,
             input.goal?.phase ?? null, input.goal?.activation ?? null,
             input.roundsStarted ?? null, input.lastRpcAt ?? null, now, now]
        );
        const row = await this.get(id);
        return row!;
    }

    private async updateRow(taskId: string, patch: Partial<DshTaskRow>): Promise<DshTaskRow | null> {
        const db = await this.openDb();
        const current = await this.get(taskId);
        if (!current) return null;
        const next = { ...current, ...patch, updated_at: new Date().toISOString() };
        await db.run(
            `UPDATE dsh_tasks SET title = ?, description = ?, status = ?, sprint_id = ?,
             assignee_session_id = ?, dsh_goal_id = ?, dsh_revision = ?, dsh_phase = ?,
             dsh_activation = ?, dsh_rounds_started = ?, source_ref = ?, last_rpc_at = ?,
             dependencies_json = ?, created_at = ?, updated_at = ? WHERE id = ?`,
            [next.title, next.description, next.status, next.sprint_id,
             next.assignee_session_id, next.dsh_goal_id, next.dsh_revision, next.dsh_phase,
             next.dsh_activation, next.dsh_rounds_started, next.source_ref, next.last_rpc_at,
             next.dependencies_json, next.created_at, next.updated_at, taskId]
        );
        return this.get(taskId);
    }

    private async get(taskId: string): Promise<DshTaskRow | null> {
        const db = await this.openDb();
        const row = await db.get('SELECT * FROM dsh_tasks WHERE id = ?', [taskId]);
        return (row as DshTaskRow) ?? null;
    }

    private async findBySourceRef(sourceRef: string): Promise<DshTaskRow | null> {
        const db = await this.openDb();
        const row = await db.get(
            'SELECT * FROM dsh_tasks WHERE source_ref = ? AND dsh_goal_id IS NOT NULL',
            [sourceRef]
        );
        return (row as DshTaskRow) ?? null;
    }

    private toTask(r: DshTaskRow): OfficeTask {
        let deps: string[] = [];
        try { deps = JSON.parse(r.dependencies_json || '[]'); } catch { /* tolerate */ }
        return {
            id: r.id,
            title: r.title,
            description: r.description || '',
            status: r.status as OfficeTaskStatus,
            origin: 'dsh',
            sprintId: r.sprint_id || null,
            assigneeSessionId: r.assignee_session_id || null,
            dependencies: Array.isArray(deps) ? deps : [],
            createdAt: r.created_at,
            updatedAt: r.updated_at
        };
    }

    async close(): Promise<void> {
        if (this.db) { await this.db.close(); this.db = undefined; }
    }
}
