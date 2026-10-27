/**
 * Ciudadan AgentOffice — Block 2: read-only observation of REAL Cline
 * sessions (FASE B).
 *
 * Observation sources (all READ-ONLY, no Cline process is ever touched,
 * spawned or modified):
 *  - `<clineDataDir>/db/sessions.db`  — authoritative session registry
 *    (SQLite, opened with OPEN_READONLY; WAL allows concurrent readers).
 *  - `<clineDataDir>/sessions/<id>/<id>.json`         — session metadata
 *    (status, pid, provider, model, git branch, title, usage).
 *  - `<clineDataDir>/sessions/<id>/<id>.messages.json` — live transcript
 *    (only structural info is extracted: roles, timestamps, tool names;
 *     message CONTENT is never forwarded raw to the frontend).
 *
 * Limitations (documented per spec):
 *  - Polling-based (default every 5s) — not a live event stream.
 *  - The Cline hub daemon (127.0.0.1:25463, /hub) exposes no REST routes
 *    (404 on every probe); it appears to be a WebSocket endpoint for
 *    `-z/--zen` background sessions and was NOT reverse-engineered to
 *    avoid interfering with a live agent.
 *  - `blocked` is only reported when the session file declares it;
 *    otherwise it is not invented.
 *  - Container id is not available (no Docker in this environment).
 */

/** Normalized, evidence-derived execution state of a Cline session. */
export type ClineAgentState =
    | 'idle'
    | 'working'
    | 'reading'
    | 'editing'
    | 'testing'
    | 'waiting'
    | 'blocked'
    | 'completed'
    | 'offline';

/** A single REAL Cline session as observed from the filesystem. */
export interface ClineSessionSnapshot {
    /** Stable, persistent id (e.g. "1791652292571_3vb8s"). */
    sessionId: string;
    /** Human-friendly short suffix (e.g. "3vb8s"). */
    shortId: string;
    /** Display name, deterministic from the session id. */
    name: string;
    /** Display role — the real model in use (e.g. "z-ai/glm-5.3"). */
    role: string;
    pid: number | null;
    /** Raw status from Cline ("running" | "completed" | ...). */
    rawStatus: string;
    /** Normalized state derived from observable evidence. */
    state: ClineAgentState;
    interactive: boolean;
    provider: string;
    model: string;
    cwd: string;
    workspaceRoot: string;
    teamName: string | null;
    gitBranch: string | null;
    /** Observable task (session title), sanitized + truncated. */
    title: string;
    startedAt: string;
    endedAt: string | null;
    /** Epoch ms of the last observed message. */
    lastActivityAt: number | null;
    /** Last tool used (evidence for the derived state). */
    lastToolName: string | null;
    /** Active file (from the last editor tool_use) — null if unknown. */
    activeFile: string | null;
    /** Container id — null: no containers in this environment. */
    containerId: null;
    messageCount: number;
    /** Id of the newest message (for delta detection). */
    lastMessageId: string | null;
    /** Whether the process was alive at observation time (running sessions). */
    pidAlive: boolean;
}

/** Structural summary of one message (no content). */
export interface ClineMessageDelta {
    sessionId: string;
    messageId: string;
    role: 'user' | 'assistant';
    ts: number;
    /** Sanitized, truncated assistant text (only for assistant text blocks). */
    text?: string;
    toolName?: string;
}
