/**
 * External orchestration contract for Ciudadan AgentOffice.
 *
 * These types define the *inbound* interface the office exposes to receive
 * state from real agents living outside of this process. In Block 1 the
 * interface is implemented by the server's REST API
 * (see `docs/ciudadan/EXTERNAL_INTERFACE.md`); no real agent integration
 * exists yet. In Block 2 a DSH/Cline adapter will push data through this
 * contract (either via HTTP or by importing `ExternalBridge` in-process).
 *
 * The original Ollama-driven orchestrator is unrelated to this contract:
 * when `AGENT_OFFICE_MODE=external` the office renders ONLY what it receives
 * through this interface (plus user-driven UI actions).
 */

/** High-level execution status of an external agent (e.g. a Cline agent). */
export type ExternalAgentExecutionStatus =
    | 'offline'
    | 'idle'
    | 'running'
    | 'thinking'
    | 'acting'
    | 'waiting_input'
    | 'blocked'
    | 'error'
    | 'completed'
    // ─── Block 2: real Cline session states (evidence-derived) ───
    | 'working'
    | 'reading'
    | 'editing'
    | 'testing'
    | 'waiting';

/** Static identity of an external agent. `id` must be stable and unique. */
export interface ExternalAgentDescriptor {
    /** Stable unique id (e.g. "cline-01"). Used for all subsequent calls. */
    id: string;
    /** Display name (e.g. "Cline 01"). */
    name: string;
    /** Display role (e.g. "Backend Developer"). */
    role: string;
}

/**
 * Partial update of an external agent's runtime state.
 * All fields are optional; only provided fields are applied.
 */
export interface ExternalAgentStateUpdate {
    status?: ExternalAgentExecutionStatus;
    /** Task the agent is currently working on ("" clears it). */
    currentTask?: string;
    /** Short summary shown in the thought bubble (~120 chars recommended). */
    thought?: string;
    /** Visual action for the sprite. Defaults are derived from `status`. */
    action?: 'idle' | 'work' | 'think' | 'talk' | 'move';
    /** Optional cosmetic metrics (0..1). */
    mood?: number;
    reputation?: number;
    riskLevel?: number;
    momentum?: number;
    // ─── Block 3: real evidence fields for the Inspector (FASE E) ───
    /** Active file being edited, when observable. */
    activeFile?: string;
    /** Workspace root of the session. */
    workspace?: string;
    /** Active Git branch of the session. */
    gitBranch?: string;
    /** Session type: "interactive" | "batch". */
    sessionType?: string;
    /** Last observed tool name (real evidence). */
    lastTool?: string;
    /** Epoch ms of this update (stale-event protection on the receiver). */
    updatedAt?: number;
}

/** A task owned/created by an external agent. */
export interface ExternalTaskUpdate {
    title: string;
    status?: 'pending' | 'in_progress' | 'completed' | 'failed';
    /** Optional agent id of the assignee (defaults to the sender). */
    assigneeId?: string;
}

/** A message emitted by an external agent (rendered in the Chat panel). */
export interface ExternalMessage {
    /** Display sender; defaults to the agent's name. */
    from?: string;
    content: string;
    /** Display target (agent name, "all", etc.) — purely informative. */
    to?: string;
    timestamp?: string;
}

/** A highlight/feed event emitted by an external agent. */
export interface ExternalEvent {
    /** Free-form type: info | task | tool | conversation | error | session | ... */
    type: string;
    title: string;
    body?: string;
}

/** Lifecycle state of the external agent's session (e.g. Cline session). */
export interface ExternalSessionState {
    state: 'active' | 'idle' | 'awaiting' | 'stopped' | 'crashed' | 'unknown';
    /** External session identifier, if any. */
    sessionId?: string;
    /** Extra human-readable details. */
    details?: string;
}

/** An error or blocker reported for an external agent. */
export interface ExternalIssue {
    severity: 'warning' | 'error' | 'fatal';
    message: string;
    /** Machine-readable error code, if available. */
    code?: string;
    /** true when the agent cannot make progress until intervention. */
    blocked?: boolean;
}

/** Read model of a registered external agent. */
export interface ExternalAgentSnapshot {
    id: string;
    name: string;
    role: string;
    status: ExternalAgentExecutionStatus;
    currentTask: string;
    thought: string;
    action: string;
    session: string;
    error: string;
    /** Assigned seat number (1-based) or null when not seated. */
    seat: number | null;
    x: number;
    y: number;
}

/** Read model of the whole external surface. */
export interface ExternalStatusSnapshot {
    mode: 'internal' | 'external';
    maxSeats: number;
    usedSeats: number;
    freeSeats: number;
    agents: ExternalAgentSnapshot[];
}

/** Result of a registration call. */
export interface ExternalRegistrationResult {
    ok: boolean;
    /** Assigned seat number (1-based) on success. */
    seat?: number;
    /** true when an existing agent was updated instead of created. */
    updated?: boolean;
    error?: string;
}

/** Generic ok/error result for external calls. */
export interface ExternalCallResult {
    ok: boolean;
    error?: string;
}

/**
 * The inbound interface the office exposes to an external orchestrator.
 * Implemented by `ExternalBridge` in `@agent-office/server`.
 * A Block 2 DSH/Cline adapter should program against THIS interface.
 */
export interface ExternalOrchestratorAdapter {
    /** Register (or update) an agent. Fails when the office is full. */
    registerAgent(descriptor: ExternalAgentDescriptor): ExternalRegistrationResult;
    /** Remove an agent and free its seat. */
    removeAgent(agentId: string): ExternalCallResult;
    /** Update runtime state (status, task, thought, visual action...). */
    updateAgentState(agentId: string, update: ExternalAgentStateUpdate): ExternalCallResult;
    /** Announce a task created/updated by the agent. */
    pushTask(agentId: string, task: ExternalTaskUpdate): ExternalCallResult;
    /** Send a message to the office chat as the agent. */
    pushMessage(agentId: string, message: ExternalMessage): ExternalCallResult;
    /** Emit a highlight/feed event as the agent. */
    pushEvent(agentId: string, event: ExternalEvent): ExternalCallResult;
    /** Update the agent's session state. */
    updateSession(agentId: string, session: ExternalSessionState): ExternalCallResult;
    /** Report an error/blocker for the agent. */
    reportIssue(agentId: string, issue: ExternalIssue): ExternalCallResult;
    /** Full read model of the external surface. */
    getStatus(): ExternalStatusSnapshot;
}