import { Express, Request, Response } from 'express';
import { OfficeRoom } from '../rooms/OfficeRoom';
import { ServerConfig } from '../config';
import { ExternalBridge } from './ExternalBridge';
import { getRealAgentsRuntime } from '../integrations';

/**
 * REST surface of the external orchestration interface
 * (docs/ciudadan/EXTERNAL_INTERFACE.md).
 *
 * All endpoints are served by the same Express/Colyseus HTTP server
 * (default 127.0.0.1:3000) — no public exposure by default.
 */

function noRoom(res: Response): void {
    res.status(503).json({
        ok: false,
        error: 'No active office room. Open the office UI once so the room is created.'
    });
}

function wrongMode(res: Response): void {
    res.status(409).json({
        ok: false,
        error: 'External API requires AGENT_OFFICE_MODE=external (server is running in "internal" mode).'
    });
}

function resolveBridge(req: Request, res: Response): ExternalBridge | null {
    const room = OfficeRoom.getActiveRoom();
    if (!room) {
        noRoom(res);
        return null;
    }
    const bridge = room.getExternalBridge();
    if (!bridge) {
        wrongMode(res);
        return null;
    }
    return bridge;
}

function sendResult(
    res: Response,
    result: { ok: boolean; error?: string },
    successStatus = 200
): void {
    if (result.ok) {
        res.status(successStatus).json(result);
    } else {
        res.status(400).json(result);
    }
}

function agentCall(
    req: Request,
    res: Response,
    invoke: (bridge: ExternalBridge) => { ok: boolean; error?: string },
    successStatus = 200
): void {
    const bridge = resolveBridge(req, res);
    if (!bridge) return;
    const result = invoke(bridge);
    if (!result.ok && result.error && result.error.includes('Unknown')) {
        res.status(404).json(result);
        return;
    }
    sendResult(res, result, successStatus);
}

export function registerExternalRoutes(app: Express, config: ServerConfig): void {
    // FASE F: optional bearer-token guard. When EXTERNAL_API_TOKEN is set,
    // every /api/external call must present it (header X-AgentOffice-Token
    // or Authorization: Bearer <token>). The in-process orchestrator
    // bypasses REST entirely (direct ExternalBridge calls), so real-agents
    // syncing is unaffected.
    if (config.externalApiToken) {
        app.use('/api/external', (req: Request, res: Response, next) => {
            const header = req.header('x-agent-office-token') || '';
            const auth = (req.header('authorization') || '').replace(/^Bearer\s+/i, '');
            if (header !== config.externalApiToken && auth !== config.externalApiToken) {
                res.status(401).json({ ok: false, error: 'Unauthorized (missing/invalid X-AgentOffice-Token).' });
                return;
            }
            next();
        });
        console.log('[Server] External API token guard ACTIVE (EXTERNAL_API_TOKEN set).');
    }

    // Health/info — available in both modes (mode + seat counters only).
    app.get('/api/external/status', (req: Request, res: Response) => {
        const room = OfficeRoom.getActiveRoom();
        if (!room) return noRoom(res);
        const bridge = room.getExternalBridge();
        if (!bridge) {
            return res.json({
                ok: true,
                mode: 'internal',
                note: 'External interface is inactive in internal mode.',
                maxSeats: config.maxSeats
            });
        }
        // Block 3: historical (evicted) sessions — preserved, never active.
        const runtime = getRealAgentsRuntime();
        res.json({
            ok: true,
            ...bridge.getStatus(),
            history: runtime ? runtime.getHistory() : []
        });
    });

    if (!config.externalApiEnabled) {
        // Surface a clear message when the API was explicitly disabled.
        app.all('/api/external/*', (req: Request, res: Response) => {
            res.status(503).json({ ok: false, error: 'External API disabled (EXTERNAL_API_ENABLED=false).' });
        });
        console.log('[Server] External REST API disabled via EXTERNAL_API_ENABLED=false');
        return;
    }

    // Register (upsert) an agent.
    app.post('/api/external/agents', (req: Request, res: Response) => {
        const bridge = resolveBridge(req, res);
        if (!bridge) return;
        const result = bridge.registerAgent(req.body || {});
        if (result.ok) {
            res.status(result.updated ? 200 : 201).json(result);
        } else if (result.error && result.error.includes('full')) {
            res.status(507).json(result);
        } else {
            res.status(400).json(result);
        }
    });

    // Remove an agent.
    app.delete('/api/external/agents/:id', (req: Request, res: Response) => {
        agentCall(req, res, (bridge) => bridge.removeAgent(req.params.id));
    });

    // Update runtime state.
    app.patch('/api/external/agents/:id/state', (req: Request, res: Response) => {
        agentCall(req, res, (bridge) => bridge.updateAgentState(req.params.id, req.body || {}));
    });

    // Announce a task.
    app.post('/api/external/agents/:id/tasks', (req: Request, res: Response) => {
        agentCall(req, res, (bridge) => bridge.pushTask(req.params.id, req.body || {}), 201);
    });

    // Send a chat message.
    app.post('/api/external/agents/:id/messages', (req: Request, res: Response) => {
        agentCall(req, res, (bridge) => bridge.pushMessage(req.params.id, req.body || {}), 201);
    });

    // Emit a highlight/feed event.
    app.post('/api/external/agents/:id/events', (req: Request, res: Response) => {
        agentCall(req, res, (bridge) => bridge.pushEvent(req.params.id, req.body || {}), 201);
    });

    // Update session state.
    app.post('/api/external/agents/:id/session', (req: Request, res: Response) => {
        agentCall(req, res, (bridge) => bridge.updateSession(req.params.id, req.body || {}));
    });

    // Report an error/blocker.
    app.post('/api/external/agents/:id/issues', (req: Request, res: Response) => {
        agentCall(req, res, (bridge) => bridge.reportIssue(req.params.id, req.body || {}), 201);
    });

    console.log('[Server] External REST API registered under /api/external (localhost by default)');
}
