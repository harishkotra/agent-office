import { ServerConfig } from '../../config';
import { ClineControlAdapter } from './ClineControlAdapter';
import { AuditLog } from './AuditLog';

/**
 * Block 4 (FASE E) — Instruction pipeline state machine.
 *
 * States: draft → pending_approval → approved → dispatched →
 *          acknowledged | rejected | failed
 *
 * Hard rules (FASE F):
 *  - Server-side authorization happens BEFORE any state change (the
 *    React "confirm" button is NEVER the authority).
 *  - requestId idempotency: duplicated submissions never double-send.
 *  - Rate limit: max N instruction requests per minute (global).
 *  - Target validation: the session must be a real office agent.
 *  - Instructions are never marked executed just because they were
 *    sent: 'dispatched' only after the adapter accepted, and the final
 *    'acknowledged' requires real confirmation evidence.
 *  - With dispatch unavailable, approved instructions remain
 *    PENDING (pendingDispatch) with the documented cause — never faked.
 */
export type InstructionState =
    | 'draft'
    | 'pending_approval'
    | 'approved'
    | 'dispatched'
    | 'acknowledged'
    | 'completed'
    | 'rejected'
    | 'failed';

export interface InstructionRecord {
    requestId: string;
    sessionId: string;
    sessionName: string;
    prompt: string;
    state: InstructionState;
    createdAt: string;
    updatedAt: string;
    /** Why dispatch is blocked, when it is (honest cause). */
    pendingDispatchCause?: string;
    /** Epoch ms when the adapter accepted the dispatch (real send). */
    dispatchedAt?: number;
    /** Epoch ms when completion was observed with transcript evidence. */
    completedAt?: number;
    /** Real response observed in the hub transcript (sanitized tail). */
    response?: string;
    error?: string;
}

export interface InstructionServiceDeps {
    config: ServerConfig;
    adapter: ClineControlAdapter;
    audit: AuditLog;
    /** Resolves the currently registered office agents (validation). */
    officeAgents: () => Array<{ id: string; name: string; status: string }>;
    /** Injectable clock for tests. */
    now?: () => number;
}

const MAX_PROMPT = 2000;

export class InstructionService {
    private records = new Map<string, InstructionRecord>();
    /** Timestamps (ms) of accepted create requests for rate limiting. */
    private rateWindow: number[] = [];

    constructor(private readonly deps: InstructionServiceDeps) {}

    private now(): number {
        return this.deps.now ? this.deps.now() : Date.now();
    }

    private checkRateLimit(): boolean {
        const nowMs = this.now();
        this.rateWindow = this.rateWindow.filter(t => nowMs - t < 60_000);
        if (this.rateWindow.length >= this.deps.config.instructionRatePerMinute) {
            return false;
        }
        this.rateWindow.push(nowMs);
        return true;
    }

    /** Lists instructions (newest first). */
    list(): InstructionRecord[] {
        return [...this.records.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }

    get(requestId: string): InstructionRecord | undefined {
        return this.records.get(requestId);
    }

    /**
     * Creates a DRAFT instruction. Idempotent by requestId: repeated
     * submissions return the existing record unchanged (no double-send).
     */
    create(input: {
        requestId: string;
        sessionId: string;
        prompt: string;
        actor: string;
    }): { ok: boolean; record?: InstructionRecord; error?: string; duplicated?: boolean } {
        const requestId = String(input.requestId || '').trim();
        if (!requestId) return { ok: false, error: 'requestId requerido (idempotencia).' };
        if (this.records.has(requestId)) {
            return { ok: true, record: this.records.get(requestId), duplicated: true };
        }
        if (!this.checkRateLimit()) {
            return { ok: false, error: 'Límite de frecuencia alcanzado; reintenta en un minuto.' };
        }

        // Target validation: must be a real, currently-registered agent.
        const agent = this.deps.officeAgents().find(a => a.id === input.sessionId);
        if (!agent) {
            return { ok: false, error: `Sesión objetivo no registrada en la oficina: "${input.sessionId}".` };
        }

        const prompt = AuditLog.sanitizePrompt(String(input.prompt || ''));
        if (!prompt || prompt.length < 3) return { ok: false, error: 'Instrucción vacía.' };
        if (prompt.length > MAX_PROMPT) {
            return { ok: false, error: `Instrucción demasiado larga (máx. ${MAX_PROMPT}).` };
        }

        const ts = new Date(this.now()).toISOString();
        const record: InstructionRecord = {
            requestId,
            sessionId: agent.id,
            sessionName: agent.name,
            prompt,
            state: 'draft',
            createdAt: ts,
            updatedAt: ts
        };
        this.records.set(requestId, record);
        this.deps.audit.record({
            action: 'instruction.create',
            actor: input.actor,
            requestId,
            targetSession: agent.id,
            result: 'draft'
        });
        return { ok: true, record };
    }

    /** Submits a draft for approval (pending_approval). No dispatch. */
    submit(requestId: string, actor: string): { ok: boolean; record?: InstructionRecord; error?: string } {
        const record = this.records.get(requestId);
        if (!record) return { ok: false, error: 'Instrucción no encontrada.' };
        if (record.state !== 'draft') {
            return { ok: false, error: `Estado inválido para envío a aprobación: ${record.state}.` };
        }
        record.state = 'pending_approval';
        record.updatedAt = new Date(this.now()).toISOString();
        this.deps.audit.record({
            action: 'instruction.submit',
            actor,
            requestId,
            targetSession: record.sessionId,
            result: 'pending_approval'
        });
        return { ok: true, record };
    }

    /**
     * Approves a pending instruction. This is the SERVER-side human
     * authorization step; afterwards the service tries to dispatch.
     * With dispatch unavailable, the record stays 'approved' with
     * pendingDispatchCause — honest "pendiente", never faked.
     */
    async approve(requestId: string, actor: string): Promise<{ ok: boolean; record?: InstructionRecord; error?: string }> {
        const record = this.records.get(requestId);
        if (!record) return { ok: false, error: 'Instrucción no encontrada.' };
        if (record.state !== 'pending_approval') {
            return { ok: false, error: `Solo se aprueban instrucciones pendientes (estado actual: ${record.state}).` };
        }

        record.state = 'approved';
        record.updatedAt = new Date(this.now()).toISOString();
        this.deps.audit.record({
            action: 'instruction.approve',
            actor,
            requestId,
            targetSession: record.sessionId,
            result: 'approved'
        });

        // Attempt dispatch immediately; keep it honest.
        return this.tryDispatch(record, actor);
    }

    /** Explicit rejection (before or during approval). */
    reject(requestId: string, actor: string, reason = ''): { ok: boolean; record?: InstructionRecord; error?: string } {
        const record = this.records.get(requestId);
        if (!record) return { ok: false, error: 'Instrucción no encontrada.' };
        if (!['draft', 'pending_approval', 'approved'].includes(record.state)) {
            return { ok: false, error: `Ya no se puede rechazar (estado: ${record.state}).` };
        }
        record.state = 'rejected';
        record.error = reason || 'rechazada por el operador';
        record.updatedAt = new Date(this.now()).toISOString();
        this.deps.audit.record({
            action: 'instruction.reject',
            actor,
            requestId,
            targetSession: record.sessionId,
            result: 'rejected',
            detail: record.error
        });
        return { ok: true, record };
    }

    /**
     * Dispatch attempt. Only possible when the adapter reports a
     * validated capability; otherwise the record remains approved with
     * the blocking cause (pending state — never a fake success).
     */
    private async tryDispatch(record: InstructionRecord, actor: string): Promise<{ ok: boolean; record: InstructionRecord; error?: string }> {
        const caps = await this.deps.adapter.getCapabilities(true);
        if (!caps.dispatchAvailable) {
            record.pendingDispatchCause = caps.dispatchCause;
            record.updatedAt = new Date(this.now()).toISOString();
            this.deps.audit.record({
                action: 'instruction.dispatch',
                actor,
                requestId: record.requestId,
                targetSession: record.sessionId,
                result: 'pending (dispatch no disponible)',
                detail: caps.dispatchCause
            });
            return { ok: true, record };
        }

        const result = await this.deps.adapter.dispatch(record.sessionId, record.prompt);
        if (result.ok) {
            record.state = 'dispatched';
            record.dispatchedAt = this.now();
            record.pendingDispatchCause = undefined;
            this.deps.audit.record({
                action: 'instruction.dispatch',
                actor,
                requestId: record.requestId,
                targetSession: record.sessionId,
                result: 'dispatched'
            });
        } else {
            record.state = 'failed';
            record.error = result.error || 'error del adaptador';
            this.deps.audit.record({
                action: 'instruction.dispatch',
                actor,
                requestId: record.requestId,
                targetSession: record.sessionId,
                result: 'failed',
                detail: record.error
            });
        }
        record.updatedAt = new Date(this.now()).toISOString();
        return { ok: true, record };
    }

    /**
     * Block 5 (FASE C): advances dispatched instructions using REAL
     * transcript evidence from the hub — never assumptions.
     *  - 'acknowledged': an assistant response appeared AFTER dispatch.
     *  - 'completed': the response finished (no newer activity) and the
     *    session is no longer mid-turn.
     */
    async refreshFromHub(requestId: string, transcript: Array<{ role: string; ts: number; text: string }>): Promise<InstructionRecord | undefined> {
        const record = this.records.get(requestId);
        if (!record || !record.dispatchedAt) return record;
        if (record.state !== 'dispatched' && record.state !== 'acknowledged') return record;

        const dispatchedAt = record.dispatchedAt;
        const after = transcript.filter(m => m.ts > dispatchedAt);
        const assistantAfter = after.filter(m => m.role === 'assistant');

        if (record.state === 'dispatched' && assistantAfter.length > 0) {
            record.state = 'acknowledged';
            record.updatedAt = new Date(this.now()).toISOString();
            this.deps.audit.record({
                action: 'instruction.refresh',
                actor: 'system',
                requestId,
                targetSession: record.sessionId,
                result: 'acknowledged (respuesta real observada)'
            });
        }

        // 'completed' requires evidence the turn finished: an assistant
        // text response exists after dispatch AND the transcript shows no
        // pending tool activity. With tools disabled (default), a final
        // assistant text is the completion evidence.
        if ((record.state === 'acknowledged') && assistantAfter.length > 0) {
            const lastMsg = transcript[transcript.length - 1];
            const hasFinalText = assistantAfter.some(m => m.text && m.text.trim().length > 0);
            if (hasFinalText && lastMsg && lastMsg.role === 'assistant' && lastMsg.text) {
                record.state = 'completed';
                record.completedAt = this.now();
                record.response = lastMsg.text.slice(0, 400);
                record.updatedAt = new Date(this.now()).toISOString();
                this.deps.audit.record({
                    action: 'instruction.refresh',
                    actor: 'system',
                    requestId,
                    targetSession: record.sessionId,
                    result: 'completed (respuesta final observada)'
                });
            }
        }
        return record;
    }

    /** Instructions awaiting hub-evidence refresh (for the poller). */
    listRefreshable(): InstructionRecord[] {
        return [...this.records.values()]
            .filter(r => r.state === 'dispatched' || r.state === 'acknowledged');
    }
}