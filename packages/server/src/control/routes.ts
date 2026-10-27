import { Express, Request, Response, NextFunction } from 'express';
import { ServerConfig } from '../config';
import { ClineControlAdapter, InstructionService, AuditLog, HubSessionLauncher } from '../integrations/control';
import { TaskProvider, OfficeTaskStatus } from '../integrations/tasks/TaskStore';
import { DshTaskProvider } from '../integrations/dsh/DshTaskProvider';
import { ClineTeamsObserver } from '../integrations/dsh/ClineTeamsObserver';
import { OfficeRoom } from '../rooms/OfficeRoom';

/**
 * Block 4 — REST surface of the interactive control center.
 *
 * Authorization model (FASE F):
 *  - READ endpoints (GET) are open on localhost (same trust boundary
 *    as the rest of the office).
 *  - WRITE endpoints REQUIRE the server-side control credential in the
 *    `X-AgentOffice-Control-Token` header. When the credential is not
 *    configured, writes answer 503 — they never open silently. A React
 *    confirmation is never treated as authorization.
 *  - Every action is audited; responses never contain secrets.
 */

export interface ControlRuntime {
    adapter: ClineControlAdapter;
    instructions: InstructionService;
    audit: AuditLog;
    tasks: TaskProvider;
    dsh: DshTaskProvider;
    clineTeams: ClineTeamsObserver;
    launcher: HubSessionLauncher;
}

export function registerControlRoutes(app: Express, config: ServerConfig, runtime: ControlRuntime): void {
    const requireWriteAuth = (req: Request, res: Response, next: NextFunction) => {
        if (!config.controlToken) {
            res.status(503).json({
                ok: false,
                error: 'Control deshabilitado: falta la credencial de control del servidor (AGENTOFFICE_CONTROL_TOKEN).'
            });
            return;
        }
        // Canonical header name: X-AgentOffice-Control-Token.
        const header = req.header('x-agentoffice-control-token') || '';
        const auth = (req.header('authorization') || '').replace(/^Bearer\s+/i, '');
        if (header !== config.controlToken && auth !== config.controlToken) {
            res.status(401).json({ ok: false, error: 'Credencial de control inválida.' });
            return;
        }
        next();
    };

    // ── READ: capabilities (what is really enabled and why) ──
    app.get('/api/control/capabilities', async (req: Request, res: Response) => {
        const caps = await runtime.adapter.getCapabilities();
        const bridge = OfficeRoom.getActiveRoom()?.getExternalBridge();
        const hubSessions = await runtime.adapter.listHubSessions();
        const hubIds = new Set(hubSessions.map(s => s.sessionId));
        res.json({
            ok: true,
            controlEnabled: Boolean(config.controlToken),
            dispatchConfigEnabled: config.instructionDispatchEnabled,
            capabilities: caps,
            agents: bridge
                ? bridge.getStatus().agents.map(a => ({
                    id: a.id,
                    name: a.name,
                    status: a.status,
                    // Session kind (FASE B): hub-managed sessions can
                    // receive instructions; TUI ones are read-only.
                    kind: runtime.launcher.isLaunched(a.id) ? 'managed'
                        : hubIds.has(a.id) ? 'managed'
                        : a.status === 'completed' ? 'completed'
                        : a.status === 'offline' ? 'disconnected'
                        : 'observed',
                    controllable: hubIds.has(a.id)
                }))
                : [],
            dsh: runtime.dsh.describe()
        });
    });

    // ── READ: instructions ──
    app.get('/api/control/instructions', (req: Request, res: Response) => {
        res.json({ ok: true, instructions: runtime.instructions.list() });
    });

    // ── WRITE: create draft (idempotent by requestId) ──
    app.post('/api/control/instructions', requireWriteAuth, (req: Request, res: Response) => {
        const { requestId, sessionId, prompt } = req.body || {};
        const result = runtime.instructions.create({
            requestId: String(requestId || ''),
            sessionId: String(sessionId || ''),
            prompt: String(prompt || ''),
            actor: 'operator'
        });
        if (!result.ok) { res.status(400).json(result); return; }
        res.status(result.duplicated ? 200 : 201).json(result);
    });

    // ── WRITE: submit for approval ──
    app.post('/api/control/instructions/:requestId/submit', requireWriteAuth, (req: Request, res: Response) => {
        const result = runtime.instructions.submit(req.params.requestId, 'operator');
        if (!result.ok) { res.status(400).json(result); return; }
        res.json(result);
    });

    // ── WRITE: approve (server-side human authorization) ──
    app.post('/api/control/instructions/:requestId/approve', requireWriteAuth, async (req: Request, res: Response) => {
        const result = await runtime.instructions.approve(req.params.requestId, 'operator');
        if (!result.ok) { res.status(400).json(result); return; }
        res.json(result);
    });

    // ── WRITE: reject ──
    app.post('/api/control/instructions/:requestId/reject', requireWriteAuth, (req: Request, res: Response) => {
        const result = runtime.instructions.reject(
            req.params.requestId, 'operator', String((req.body || {}).reason || '')
        );
        if (!result.ok) { res.status(400).json(result); return; }
        res.json(result);
    });

    // ── READ: tasks (proposals + observed Cline teams + DSH state) ──
    app.get('/api/control/tasks', async (req: Request, res: Response) => {
        const [proposals, observed, sprints, dshTasks] = await Promise.all([
            runtime.tasks.listTasks(),
            runtime.clineTeams.listTasks(),
            runtime.tasks.listSprints(),
            runtime.dsh.listTasks()
        ]);
        const dshAvailable = await runtime.dsh.available();
        res.json({
            ok: true,
            proposals,
            observed: observed.map(t => ({
                id: t.id, title: t.title, status: t.status,
                assignee: t.assigneeId, dependencies: t.dependsOn, origin: 'cline' as const
            })),
            sprints,
            dshTasks,
            dsh: { available: dshAvailable, description: runtime.dsh.describe() }
        });
    });

    // ── WRITE: create a proposal ──
    app.post('/api/control/tasks', requireWriteAuth, async (req: Request, res: Response) => {
        try {
            const task = await runtime.tasks.createProposal({
                title: String((req.body || {}).title || ''),
                description: String((req.body || {}).description || '')
            });
            res.status(201).json({ ok: true, task });
        } catch (e: any) {
            res.status(400).json({ ok: false, error: String(e?.message || e) });
        }
    });

    // ── WRITE: update proposal status (organizational only) ──
    app.patch('/api/control/tasks/:id', requireWriteAuth, async (req: Request, res: Response) => {
        try {
            const task = await runtime.tasks.updateStatus(
                req.params.id, String((req.body || {}).status || '') as OfficeTaskStatus
            );
            if (!task) { res.status(404).json({ ok: false, error: 'Tarea no encontrada.' }); return; }
            res.json({ ok: true, task });
        } catch (e: any) {
            res.status(400).json({ ok: false, error: String(e?.message || e) });
        }
    });

    // ── WRITE: sprints ──
    app.post('/api/control/sprints', requireWriteAuth, async (req: Request, res: Response) => {
        try {
            const sprint = await runtime.tasks.createSprint({
                name: String((req.body || {}).name || ''),
                goal: String((req.body || {}).goal || '')
            });
            res.status(201).json({ ok: true, sprint });
        } catch (e: any) {
            res.status(400).json({ ok: false, error: String(e?.message || e) });
        }
    });

    app.post('/api/control/tasks/:id/sprint', requireWriteAuth, async (req: Request, res: Response) => {
        const sprintId = (req.body || {}).sprintId || null;
        const task = await runtime.tasks.assignToSprint(req.params.id, sprintId ? String(sprintId) : null);
        if (!task) { res.status(404).json({ ok: false, error: 'Tarea no encontrada.' }); return; }
        res.json({ ok: true, task });
    });

    // ── Ciudadan Bloque 2: REAL DSH tasks (goals as tasks) ─────────────
    // DSH stays the source of truth; these endpoints only drive the
    // provider contract. Every write is token-protected and audited.
    const dshRid = () => `dsh-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    app.post('/api/control/dsh-tasks', requireWriteAuth, async (req: Request, res: Response) => {
        try {
            const title = String((req.body || {}).title || '');
            if (!title.trim()) { res.status(400).json({ ok: false, error: 'Falta el título.' }); return; }
            const proposal = await runtime.dsh.createProposal({
                title,
                description: String((req.body || {}).description || '')
            });
            const result = await runtime.dsh.proposeToDsh(proposal);
            if (!result.available) {
                res.status(502).json({ ok: false, error: result.reason || 'DSH no aceptó la propuesta.' });
                return;
            }
            runtime.audit.record({
                action: 'dsh-task-propose', actor: 'operator', requestId: dshRid(),
                result: 'ok', detail: `goal=${title}`
            });
            res.status(201).json({ ok: true, task: result.data });
        } catch (e: any) {
            res.status(400).json({ ok: false, error: String(e?.message || e) });
        }
    });

    app.post('/api/control/dsh-tasks/:id/assign', requireWriteAuth, async (req: Request, res: Response) => {
        const result = await runtime.dsh.requestAssignment(
            req.params.id,
            (req.body || {}).sessionId ? String((req.body || {}).sessionId) : undefined
        );
        if (!result.available) { res.status(400).json({ ok: false, error: result.reason }); return; }
        runtime.audit.record({
            action: 'dsh-task-assign', actor: 'operator', requestId: dshRid(),
            result: 'ok', detail: req.params.id
        });
        res.json({ ok: true, task: result.data });
    });

    app.get('/api/control/dsh-tasks/:id/results', async (req: Request, res: Response) => {
        const result = await runtime.dsh.getResults(req.params.id);
        res.json({ ok: true, result });
    });

    app.post('/api/control/dsh-tasks/:id/block', requireWriteAuth, async (req: Request, res: Response) => {
        const result = await runtime.dsh.notifyBlocker(
            req.params.id, String((req.body || {}).description || '(sin detalle)')
        );
        if (!result.available) { res.status(400).json({ ok: false, error: result.reason }); return; }
        runtime.audit.record({
            action: 'dsh-task-block', actor: 'operator', requestId: dshRid(),
            result: 'ok', detail: req.params.id
        });
        res.json({ ok: true });
    });

    app.post('/api/control/dsh-tasks/:id/complete', requireWriteAuth, async (req: Request, res: Response) => {
        try {
            const task = await runtime.dsh.updateStatus(req.params.id, 'completed');
            if (!task) { res.status(404).json({ ok: false, error: 'Tarea DSH no encontrada.' }); return; }
            runtime.audit.record({
                action: 'dsh-task-complete', actor: 'operator', requestId: dshRid(),
                result: 'ok', detail: req.params.id
            });
            res.json({ ok: true, task });
        } catch (e: any) {
            res.status(400).json({ ok: false, error: String(e?.message || e) });
        }
    });

    app.post('/api/control/dsh-tasks/:id/clear', requireWriteAuth, async (req: Request, res: Response) => {
        const result = await runtime.dsh.removeFromDsh(req.params.id);
        if (!result.available) { res.status(400).json({ ok: false, error: result.reason }); return; }
        runtime.audit.record({
            action: 'dsh-task-clear', actor: 'operator', requestId: dshRid(),
            result: 'ok', detail: req.params.id
        });
        res.json({ ok: true });
    });

    // ── READ: audit tail (sanitized; accountability) ──
    app.get('/api/control/audit', (req: Request, res: Response) => {
        res.json({ ok: true, entries: runtime.audit.tail(50) });
    });

    // ── Block 5 (FASE B): hub-managed sessions ──
    // Launch a NEW hub session (isolated workspace, restrictive tools).
    app.post('/api/control/sessions', requireWriteAuth, async (req: Request, res: Response) => {
        const result = await runtime.launcher.launch({
            prompt: String((req.body || {}).prompt || '') || undefined,
            actor: 'operator'
        });
        if (!result.ok) { res.status(400).json({ ok: false, error: result.error }); return; }
        res.status(201).json({ ok: true, session: result.session });
    });

    // List office-launched sessions + hub visibility.
    app.get('/api/control/sessions', async (req: Request, res: Response) => {
        const hubSessions = await runtime.adapter.listHubSessions();
        res.json({
            ok: true,
            launched: runtime.launcher.listLaunched(),
            hubSessions
        });
    });

    // Gracefully stop an office-launched session (never a TUI one).
    app.delete('/api/control/sessions/:id', requireWriteAuth, async (req: Request, res: Response) => {
        const result = await runtime.launcher.stop(req.params.id, 'operator');
        if (!result.ok) { res.status(400).json({ ok: false, error: result.error }); return; }
        res.json({ ok: true });
    });

    console.log('[Server] Control center REST registered under /api/control ' +
        `(writes ${config.controlToken ? 'require control token' : 'DISABLED — no server credential configured'}).`);
}