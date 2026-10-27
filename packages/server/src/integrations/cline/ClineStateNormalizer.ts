import { ClineAgentState } from './ClineTypes';

/**
 * Pure, evidence-based derivation of a Cline session state from its
 * transcript tail. No activity is ever invented: when the source does
 * not allow determining the state, the session is reported as `idle`.
 */

export interface TranscriptTail {
    /** Raw session status from Cline ("running", "completed", ...). */
    rawStatus: string;
    /** Session process alive (only meaningful for "running" sessions). */
    pidAlive: boolean;
    interactive: boolean;
    /** Epoch ms of the last message in the transcript. */
    lastMessageTs: number | null;
    /** Name of the tool of the last tool_use block in the last assistant
     *  message, if any. */
    lastAssistantToolName: string | null;
    /** Whether the last assistant message contains tool_use blocks. */
    lastAssistantHasToolUse: boolean;
    /** Name of the tool of the last tool_result block when the overall
     *  last message is a user tool_result (agent processing results). */
    lastResultToolName: string | null;
    /** Serialized input of the last tool_use, used ONLY to detect test
     *  commands (never forwarded). */
    lastToolInputHint: string | null;
    /** True when an ask_question tool call has no answer yet. */
    pendingQuestion: boolean;
}

export interface DeriveOptions {
    nowTs: number;
    /** A session with no messages for longer than this is "idle". */
    inactivityMs?: number;
}

/** Tool name → state mapping (evidence: the tool Cline chose to use). */
function stateFromTool(toolName: string | null, toolInputHint: string | null): ClineAgentState | null {
    if (!toolName) return null;
    switch (toolName) {
        case 'read_files':
        case 'search_codebase':
            return 'reading';
        case 'editor':
            return 'editing';
        case 'ask_question':
            return 'waiting';
        case 'run_commands': {
            // Evidence-based: the command content itself tells whether
            // the agent is running tests or other work.
            const hint = (toolInputHint || '').toLowerCase();
            const testPattern = /(npm|yarn|pnpm)?\s*(test|jest|vitest|pytest|mocha)|--passWithNoTests|run_tests|\.test\.|\.spec\./;
            return testPattern.test(hint) ? 'testing' : 'working';
        }
        default:
            return 'working';
    }
}

export function deriveClineState(tail: TranscriptTail, options: DeriveOptions): ClineAgentState {
    const inactivityMs = options.inactivityMs ?? 120_000;

    // 1) Terminal statuses win — they come from Cline itself.
    if (tail.rawStatus === 'completed' || tail.rawStatus === 'exited') {
        return 'completed';
    }

    // 2) A session marked running whose process is dead → offline
    //    (distinguishes disconnection from inactivity).
    if (tail.rawStatus === 'running' && !tail.pidAlive) {
        return 'offline';
    }

    if (tail.rawStatus !== 'running') {
        // Unknown raw status without evidence → do not invent.
        return 'offline';
    }

    // 3) Running session, no transcript at all → idle (nothing observed).
    if (tail.lastMessageTs === null) {
        return 'idle';
    }

    // 4) Inactivity: running process but silent for a while → idle.
    //    (Inactividad ≠ desconexión: the process is still alive.)
    if (options.nowTs - tail.lastMessageTs > inactivityMs) {
        return 'idle';
    }

    // 5) Pending question → waiting for a human.
    if (tail.pendingQuestion) {
        return 'waiting';
    }

    // 6) Agent processing tool results → state from the executed tool.
    const fromResult = stateFromTool(tail.lastResultToolName, tail.lastToolInputHint);
    if (fromResult) return fromResult;

    // 7) Last assistant message issued tool calls → state from the tool.
    if (tail.lastAssistantHasToolUse) {
        const fromTool = stateFromTool(tail.lastAssistantToolName, tail.lastToolInputHint);
        if (fromTool) return fromTool;
        return 'working'; // reasoning/tool dispatch in progress
    }

    // 8) Assistant answered with plain text and nothing is pending →
    //    the session awaits the next user input.
    return 'idle';
}

// ─── Message sanitization (FASE F: nothing sensitive reaches the UI) ───

const SECRET_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
    { pattern: /nvapi-[A-Za-z0-9_-]+/g, replacement: '[nvapi-…]' },
    { pattern: /sk-[A-Za-z0-9_-]{8,}/g, replacement: '[sk-…]' },
    { pattern: /ghp_[A-Za-z0-9]{10,}/g, replacement: '[ghp-…]' },
    { pattern: /gho_[A-Za-z0-9]{10,}/g, replacement: '[gho-…]' },
    { pattern: /Bearer\s+[A-Za-z0-9._-]{10,}/gi, replacement: 'Bearer [redacted]' },
    { pattern: /(?:AIza|AKIA)[A-Za-z0-9_-]{10,}/g, replacement: '[api-key]' },
    { pattern: /[A-Fa-f0-9]{32,}/g, replacement: '[hex-…]' }
];

/**
 * Sanitizes text destined to the office chat: strips secrets, collapses
 * whitespace and truncates. Terminal outputs are never forwarded (only
 * assistant text blocks pass through here).
 */
export function sanitizeMessageText(text: string, maxLength = 200): string {
    let out = String(text || '');
    for (const { pattern, replacement } of SECRET_PATTERNS) {
        out = out.replace(pattern, replacement);
    }
    out = out.replace(/\s+/g, ' ').trim();
    if (out.length > maxLength) {
        out = out.slice(0, maxLength - 1).trimEnd() + '…';
    }
    return out;
}

/** Sanitizes a session title for use as the observable "current task". */
export function sanitizeTitle(title: string, maxLength = 120): string {
    let out = String(title || '')
        .replace(/\r?\n/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    for (const { pattern, replacement } of SECRET_PATTERNS) {
        out = out.replace(pattern, replacement);
    }
    if (out.length > maxLength) {
        out = out.slice(0, maxLength - 1).trimEnd() + '…';
    }
    return out;
}

