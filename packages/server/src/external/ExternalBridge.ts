import {
    ExternalOrchestratorAdapter,
    ExternalRegistrationResult,
    ExternalCallResult,
    ExternalAgentDescriptor,
    ExternalAgentStateUpdate,
    ExternalTaskUpdate,
    ExternalMessage,
    ExternalEvent,
    ExternalSessionState,
    ExternalIssue,
    ExternalStatusSnapshot,
    ExternalAgentSnapshot,
    ExternalAgentExecutionStatus
} from '@agent-office/core';
import { SeatAllocator, spriteIndexForSeat } from './SeatAllocator';
import { AgentState } from '../schema/OfficeState';

/** Valid values for ExternalAgentExecutionStatus (validation helper). */
export const EXTERNAL_AGENT_EXECUTION_STATUSES: ExternalAgentExecutionStatus[] = [
    'offline', 'idle', 'running', 'thinking', 'acting',
    'waiting_input', 'blocked', 'error', 'completed',
    // Block 2: real Cline session states
    'working', 'reading', 'editing', 'testing', 'waiting'
];

const EXTERNAL_SESSION_STATES = ['active', 'idle', 'awaiting', 'stopped', 'crashed', 'unknown'];
const EXTERNAL_ACTIONS = ['idle', 'work', 'think', 'talk', 'move'];

/**
 * The slice of OfficeRoom that ExternalBridge is allowed to touch.
 * This abstraction keeps the bridge unit-testable without a live
 * Colyseus room.
 */
export interface OfficeGateway {
    readonly mode: 'internal' | 'external';
    readonly seats: SeatAllocator;
    getOfficeTime(): string;
    hasAgent(id: string): boolean;
    getAgentState(id: string): AgentState | undefined;
    createAgent(id: string, name: string, opts?: { role?: string; spriteIndex?: number }): void;
    removeAgent(id: string): void;
    broadcastChat(sender: string, text: string): void;
    broadcastTaskUpdate(payload: { agentId: string; agentName: string; task: string; status: string }): void;
    emitHighlight(type: string, title: string, body: string, agentId?: string): void;
    persistTask(title: string, agentId: string): void;
    listAgentIds(): string[];
}

/** Default visual action per execution status. */
const ACTION_BY_STATUS: Record<ExternalAgentExecutionStatus, string> = {
    offline: 'idle',
    idle: 'idle',
    running: 'work',
    thinking: 'think',
    acting: 'work',
    waiting_input: 'idle',
    blocked: 'idle',
    error: 'idle',
    completed: 'idle',
    // Block 2: real Cline states — editing/working/testing show the
    // "work" emote at the desk; reading reuses the "think" animation.
    working: 'work',
    reading: 'think',
    editing: 'work',
    testing: 'work',
    waiting: 'idle'
};

function clamp01(value: number): number {
    return Math.max(0, Math.min(1, value));
}

function truncate(value: string, max: number): string {
    return value.length > max ? value.slice(0, max) : value;
}

/**
 * Applies external orchestrator updates onto the office state and
 * broadcasts them through the existing Colyseus/UI channels.
 *
 * This is THE integration point for the Block 2 DSH/Cline adapter.
 */
export class ExternalBridge implements ExternalOrchestratorAdapter {
    constructor(private readonly gateway: OfficeGateway) {}

    registerAgent(descriptor: ExternalAgentDescriptor): ExternalRegistrationResult {
        const id = String(descriptor?.id || '').trim();
        const name = String(descriptor?.name || '').trim();
        const role = String(descriptor?.role || '').trim();

        if (!id) return { ok: false, error: 'Missing required field: id' };
        if (!/^[A-Za-z0-9._-]+$/.test(id)) {
            return { ok: false, error: `Invalid id "${id}" (allowed: letters, digits, . _ -)` };
        }
        if (!name) return { ok: false, error: 'Missing required field: name' };

        // Upsert: an already-registered agent only updates identity fields.
        if (this.gateway.hasAgent(id)) {
            const state = this.gateway.getAgentState(id);
            if (state) {
                state.name = name;
                state.role = role;
            }
            this.gateway.broadcastChat('🔌 Office', `ℹ️ ${name} (${role || 'agent'}) updated.`);
            const seat = this.gateway.seats.seatOf(id);
            return { ok: true, updated: true, seat: seat ? seat.index : undefined };
        }

        if (this.gateway.seats.isFull()) {
            return { ok: false, error: `Office is full (max ${this.gateway.seats.capacity} seats)` };
        }

        const seat = this.gateway.seats.allocate(id);
        if (!seat) return { ok: false, error: 'Seat allocation failed' };

        this.gateway.createAgent(id, name, {
            role,
            spriteIndex: spriteIndexForSeat(seat.index)
        });
        const state = this.gateway.getAgentState(id);
        if (state) {
            // Spawn at the office door (top-center); the movement loop
            // walks the agent to its assigned seat.
            state.x = 20;
            state.y = 2;
        }

        this.gateway.emitHighlight(
            'session',
            `${name} joined the office`,
            `${name}${role ? ` (${role})` : ''} took seat ${seat.index}.`,
            id
        );
        this.gateway.broadcastChat(
            '🔌 Office',
            `👋 ${name}${role ? ` (${role})` : ''} joined — seat ${seat.index}.`
        );
        return { ok: true, updated: false, seat: seat.index };
    }

    removeAgent(agentId: string): ExternalCallResult {
        const state = this.gateway.getAgentState(agentId);
        if (!state) return { ok: false, error: `Unknown agent "${agentId}"` };

        const name = state.name;
        this.gateway.seats.release(agentId);
        this.gateway.removeAgent(agentId);
        this.gateway.broadcastChat('🔌 Office', `👋 ${name} left the office.`);
        this.gateway.emitHighlight('session', `${name} left`, '', agentId);
        return { ok: true };
    }

    updateAgentState(agentId: string, update: ExternalAgentStateUpdate): ExternalCallResult {
        const state = this.gateway.getAgentState(agentId);
        if (!state) return { ok: false, error: `Unknown agent "${agentId}"` };
        if (!update || typeof update !== 'object') {
            return { ok: false, error: 'Invalid update payload' };
        }

        if (update.status !== undefined) {
            const status = String(update.status);
            if (!EXTERNAL_AGENT_EXECUTION_STATUSES.includes(status as ExternalAgentExecutionStatus)) {
                return { ok: false, error: `Invalid status "${status}"` };
            }
            state.status = status;
            // Running/idle transitions clear stale errors.
            if (status === 'running' || status === 'idle') state.error = '';
            if (update.action === undefined) {
                state.action = ACTION_BY_STATUS[status as ExternalAgentExecutionStatus];
            }
        }

        if (update.action !== undefined) {
            const action = String(update.action);
            if (!EXTERNAL_ACTIONS.includes(action)) {
                return { ok: false, error: `Invalid action "${action}"` };
            }
            state.action = action;
        }

        if (update.currentTask !== undefined) {
            state.currentTask = truncate(String(update.currentTask), 200);
        }
        if (update.thought !== undefined) {
            state.thought = truncate(String(update.thought), 200);
        }
        if (update.mood !== undefined) state.mood = clamp01(Number(update.mood) || 0);
        if (update.reputation !== undefined) state.reputation = clamp01(Number(update.reputation) || 0);
        if (update.riskLevel !== undefined) state.riskLevel = clamp01(Number(update.riskLevel) || 0);
        if (update.momentum !== undefined) state.momentum = clamp01(Number(update.momentum) || 0);

        // ─── Block 3: real evidence fields (Inspector, FASE E) ───
        if (update.activeFile !== undefined) state.activeFile = truncate(String(update.activeFile), 160);
        if (update.workspace !== undefined) state.workspace = truncate(String(update.workspace), 120);
        if (update.gitBranch !== undefined) state.gitBranch = truncate(String(update.gitBranch), 80);
        if (update.sessionType !== undefined) state.sessionType = truncate(String(update.sessionType), 20);
        if (update.lastTool !== undefined) state.lastTool = truncate(String(update.lastTool), 40);
        if (update.updatedAt !== undefined) {
            const at = Number(update.updatedAt) || 0;
            // Stale-event protection: never move the update clock backwards.
            state.updatedAt = Math.max(state.updatedAt, at);
        }

        return { ok: true };
    }

    pushTask(agentId: string, task: ExternalTaskUpdate): ExternalCallResult {
        const sender = this.gateway.getAgentState(agentId);
        if (!sender) return { ok: false, error: `Unknown agent "${agentId}"` };

        const title = truncate(String(task?.title || '').trim(), 200);
        if (!title) return { ok: false, error: 'Missing required field: title' };

        const status = task?.status || 'in_progress';
        const targetId = task?.assigneeId || agentId;
        const target = this.gateway.getAgentState(targetId);
        if (!target) return { ok: false, error: `Unknown assignee "${targetId}"` };

        target.currentTask = status === 'completed' || status === 'failed' ? '' : title;
        this.gateway.persistTask(title, targetId);
        this.gateway.broadcastTaskUpdate({
            agentId: targetId,
            agentName: target.name,
            task: title,
            status
        });
        this.gateway.broadcastChat(sender.name, `📋 Task "${title}" → ${target.name} (${status}).`);
        this.gateway.emitHighlight(
            'task',
            `${sender.name} announced a task`,
            `"${title}" — ${target.name} (${status}).`,
            agentId
        );
        return { ok: true };
    }

    pushMessage(agentId: string, message: ExternalMessage): ExternalCallResult {
        const state = this.gateway.getAgentState(agentId);
        if (!state) return { ok: false, error: `Unknown agent "${agentId}"` };

        const content = truncate(String(message?.content || '').trim(), 1000);
        if (!content) return { ok: false, error: 'Missing required field: content' };

        const from = message?.from || state.name;
        const to = message?.to || '';
        this.gateway.broadcastChat(from, to ? `💬 (to ${to}): ${content}` : `💬 ${content}`);
        this.gateway.emitHighlight(
            'conversation',
            to ? `${from} → ${to}` : `${from} → office`,
            content,
            agentId
        );
        return { ok: true };
    }

    pushEvent(agentId: string, event: ExternalEvent): ExternalCallResult {
        const state = this.gateway.getAgentState(agentId);
        if (!state) return { ok: false, error: `Unknown agent "${agentId}"` };

        const type = truncate(String(event?.type || 'info').trim(), 40);
        const title = truncate(String(event?.title || '').trim(), 120);
        if (!title) return { ok: false, error: 'Missing required field: title' };

        this.gateway.emitHighlight(type, `${state.name}: ${title}`, truncate(String(event?.body || ''), 300), agentId);
        return { ok: true };
    }

    updateSession(agentId: string, session: ExternalSessionState): ExternalCallResult {
        const state = this.gateway.getAgentState(agentId);
        if (!state) return { ok: false, error: `Unknown agent "${agentId}"` };

        const sessionState = String(session?.state || '').trim();
        if (!EXTERNAL_SESSION_STATES.includes(sessionState)) {
            return { ok: false, error: `Invalid session state "${sessionState}"` };
        }

        const parts: string[] = [sessionState];
        if (session?.sessionId) parts.push(`(${truncate(String(session.sessionId), 60)})`);
        if (session?.details) parts.push(`— ${truncate(String(session.details), 120)}`);
        state.session = parts.join(' ');

        if (sessionState === 'crashed' || sessionState === 'stopped') {
            state.status = 'offline';
            state.action = 'idle';
        }

        this.gateway.emitHighlight(
            'session',
            `${state.name}: session ${sessionState}`,
            session?.details ? truncate(String(session.details), 200) : '',
            agentId
        );
        return { ok: true };
    }

    reportIssue(agentId: string, issue: ExternalIssue): ExternalCallResult {
        const state = this.gateway.getAgentState(agentId);
        if (!state) return { ok: false, error: `Unknown agent "${agentId}"` };

        const message = truncate(String(issue?.message || '').trim(), 300);
        const severity = issue?.severity || 'error';
        if (!['warning', 'error', 'fatal'].includes(severity)) {
            return { ok: false, error: `Invalid severity "${severity}"` };
        }

        // An empty message clears the last reported issue.
        if (!message) {
            state.error = '';
            return { ok: true };
        }

        const code = issue?.code ? ` [${truncate(String(issue.code), 40)}]` : '';
        state.error = `${severity}: ${message}${code}`;
        if (issue?.blocked || severity === 'fatal') {
            state.status = 'blocked';
            state.action = 'idle';
        }

        const icon = severity === 'warning' ? '⚠️' : '🚨';
        this.gateway.broadcastChat(state.name, `${icon} ${message}${code}`);
        this.gateway.emitHighlight(
            severity === 'warning' ? 'info' : 'error',
            `${state.name}: ${severity}`,
            message,
            agentId
        );
        return { ok: true };
    }

    getStatus(): ExternalStatusSnapshot {
        const seats = this.gateway.seats;
        const ids = this.gateway.listAgentIds();

        // Order agents by seat (unseated agents last, insertion order).
        const seatOfId = new Map<string, number>();
        for (const id of ids) {
            const seat = seats.seatOf(id);
            if (seat) seatOfId.set(id, seat.index);
        }
        const orderedIds = [...ids].sort((a, b) => {
            const sa = seatOfId.has(a) ? seatOfId.get(a)! : Number.MAX_SAFE_INTEGER;
            const sb = seatOfId.has(b) ? seatOfId.get(b)! : Number.MAX_SAFE_INTEGER;
            return sa - sb;
        });

        const agents: ExternalAgentSnapshot[] = [];
        for (const id of orderedIds) {
            const state = this.gateway.getAgentState(id);
            if (!state) continue;
            const seat = seats.seatOf(id);
            agents.push({
                id: state.id,
                name: state.name,
                role: state.role,
                status: state.status as ExternalAgentExecutionStatus,
                currentTask: state.currentTask,
                thought: state.thought,
                action: state.action,
                session: state.session,
                error: state.error,
                seat: seat ? seat.index : null,
                x: state.x,
                y: state.y
            });
        }

        return {
            mode: this.gateway.mode,
            maxSeats: seats.capacity,
            usedSeats: seats.usedSeats,
            freeSeats: seats.freeSeats,
            agents
        };
    }
}
