import * as fs from 'fs';
import * as path from 'path';
import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import { ClineSessionSnapshot, ClineMessageDelta } from './ClineTypes';
import { deriveClineState, sanitizeMessageText, sanitizeTitle, TranscriptTail } from './ClineStateNormalizer';

/**
 * READ-ONLY observation source for REAL Cline sessions (FASE B).
 *
 * Never writes, never spawns Cline processes, never modifies any file
 * owned by Cline. SQLite is opened with OPEN_READONLY (safe against the
 * live WAL writer). Transcript parsing is skipped when the file mtime
 * has not changed since the last poll (low-impact polling).
 */
interface TranscriptInfo {
    count: number;
    lastTs: number | null;
    lastMessageId: string | null;
    lastAssistantToolName: string | null;
    lastAssistantHasToolUse: boolean;
    lastResultToolName: string | null;
    lastToolInputHint: string | null;
    pendingQuestion: boolean;
    /** Path of the most recent editor tool_use — the active file. */
    activeFilePath: string | null;
}

export class ClineSessionSource {
    private db?: Database;
    private readonly sessionsDir: string;
    private readonly dbFile: string;
    /** messages.json mtime cache to avoid re-parsing unchanged files. */
    private mtimeCache = new Map<string, number>();
    /** Parsed messages cache: sessionId → tail info. */
    private transcriptCache = new Map<string, TranscriptInfo>();
    /** Baseline: messages older than this are never replayed as deltas. */
    private readonly startTs: number;
    /** Cursor of the last message already emitted per session. */
    private textCursor = new Map<string, number>();
    private lastError: string | null = null;

    constructor(
        private readonly dataDir: string,
        private readonly options: { maxSessions?: number; inactivityMs?: number } = {}
    ) {
        this.sessionsDir = path.join(dataDir, 'sessions');
        this.dbFile = path.join(dataDir, 'db', 'sessions.db');
        this.startTs = Date.now();
    }

    /** Human-readable state of the source (for logs). */
    describe(): string {
        return `cline-sessions @ ${this.dataDir}${this.lastError ? ` (last error: ${this.lastError})` : ''}`;
    }

    hasData(): boolean {
        return fs.existsSync(this.dbFile);
    }

    private async openDb(): Promise<Database> {
        if (this.db) return this.db;
        this.db = await open({
            filename: this.dbFile,
            driver: sqlite3.Database,
            mode: sqlite3.OPEN_READONLY
        });
        return this.db;
    }

    private async query(sql: string, params: unknown[] = []): Promise<any[]> {
        try {
            const db = await this.openDb();
            return await db.all(sql, params);
        } catch (e: any) {
            this.lastError = e?.message || String(e);
            // Reopen once (e.g. file replaced / lock hiccup).
            this.db = undefined;
            try {
                const db = await this.openDb();
                return await db.all(sql, params);
            } catch (e2: any) {
                this.lastError = e2?.message || String(e2);
                return [];
            }
        }
    }

    /** Process liveness without side effects (kill(pid, 0)). */
    private isPidAlive(pid: number | null | undefined): boolean {
        if (!pid) return false;
        try {
            process.kill(pid, 0);
            return true;
        } catch (e: any) {
            // EPERM = exists but owned by another user → alive.
            return e?.code === 'EPERM';
        }
    }

    /**
     * Robust session liveness (Block 3). A session is ALIVE when:
     *  1. its recorded pid is alive, OR
     *  2. any running process references the session id in its command
     *     line (covers sessions RESUMED with `cline --id <session-id>`,
     *     where the recorded pid stays stale).
     * Both are read-only observations of the OS process table.
     */
    private isSessionAlive(sessionId: string, pid: number | null | undefined, resumedIds: Set<string>): boolean {
        return this.isPidAlive(pid) || resumedIds.has(sessionId);
    }

    /** Scans /proc cmdlines once per observation cycle (cheap, read-only). */
    private scanResumedSessionIds(): Set<string> {
        const found = new Set<string>();
        try {
            const entries = fs.readdirSync('/proc');
            for (const entry of entries) {
                if (entry.charCodeAt(0) < 48 || entry.charCodeAt(0) > 57) continue; // numeric dirs only
                try {
                    const raw = fs.readFileSync(`/proc/${entry}/cmdline`, 'utf-8');
                    const cmdline = raw.replace(/\0/g, ' ');
                    const match = cmdline.match(/--id\s+(\S+)/);
                    if (match) found.add(match[1]);
                } catch {
                    // process exited meanwhile — ignore
                }
            }
        } catch {
            // /proc unavailable — fall back to pid checks only
        }
        return found;
    }

    /** Reads a JSON file, tolerating mid-write partial reads. */
    private readJson<T>(filePath: string): T | null {
        try {
            return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
        } catch {
            return null; // mid-write / not found / corrupt — skip this cycle
        }
    }

    /**
     * Observes all top-level Cline sessions. Returns at most `maxSessions`
     * (most recent ones), ordered oldest→newest for stable seat mapping.
     */
    async listSessions(): Promise<ClineSessionSnapshot[]> {
        const max = this.options.maxSessions ?? 7;
        const rows = await this.query(
            `SELECT * FROM (
                SELECT session_id, pid, status, interactive, provider, model,
                       cwd, workspace_root, team_name, started_at, ended_at
                FROM sessions
                WHERE is_subagent = 0
                ORDER BY started_at DESC
                LIMIT ?
            ) ORDER BY started_at ASC`,
            [max]
        );

        const nowTs = Date.now();
        // One cheap /proc scan per cycle: which session ids are running
        // right now (covers sessions resumed with `cline --id <id>`).
        const resumedIds = this.scanResumedSessionIds();
        const snapshots: ClineSessionSnapshot[] = [];
        for (const row of rows) {
            const snap = this.buildSnapshot(row, nowTs, resumedIds);
            if (snap) snapshots.push(snap);
        }
        return snapshots;
    }

    private buildSnapshot(row: any, nowTs: number, resumedIds: Set<string>): ClineSessionSnapshot | null {
        const sessionId = String(row.session_id || '');
        if (!sessionId) return null;
        const shortId = sessionId.includes('_') ? sessionId.split('_').pop()! : sessionId;

        // Session metadata file (richer: git branch, title, usage).
        const metaPath = path.join(this.sessionsDir, sessionId, `${sessionId}.json`);
        const meta = this.readJson<any>(metaPath) || {};

        const rawStatus = String(meta.status || row.status || 'unknown');
        const pid = Number(meta.pid ?? row.pid) || null;
        const interactive = Boolean(meta.interactive ?? Number(row.interactive));
        const model = String(meta.model || row.model || '');
        const provider = String(meta.provider || row.provider || '');
        const gitBranch = meta?.metadata?.git?.branch ? String(meta.metadata.git.branch) : null;
        const title = sanitizeTitle(String(meta?.metadata?.title || ''));

        const transcript = this.readTranscript(sessionId);
        const pidAlive = this.isSessionAlive(sessionId, pid, resumedIds);

        const tail: TranscriptTail = {
            rawStatus,
            pidAlive,
            interactive,
            lastMessageTs: transcript?.lastTs ?? null,
            lastAssistantToolName: transcript?.lastAssistantToolName ?? null,
            lastAssistantHasToolUse: transcript?.lastAssistantHasToolUse ?? false,
            lastResultToolName: transcript?.lastResultToolName ?? null,
            lastToolInputHint: transcript?.lastToolInputHint ?? null,
            pendingQuestion: transcript?.pendingQuestion ?? false
        };
        const state = deriveClineState(tail, { nowTs, inactivityMs: this.options.inactivityMs });

        return {
            sessionId,
            shortId,
            name: `Cline ${shortId}`,
            role: model || provider || 'Cline',
            pid,
            rawStatus,
            state,
            interactive,
            provider,
            model,
            cwd: String(row.cwd || meta.cwd || ''),
            workspaceRoot: String(row.workspace_root || meta.workspace_root || ''),
            teamName: row.team_name || meta.team_name || null,
            gitBranch,
            title,
            startedAt: String(row.started_at || meta.started_at || ''),
            endedAt: row.ended_at || meta.ended_at || null,
            lastActivityAt: transcript?.lastTs ?? null,
            lastToolName: transcript?.lastAssistantToolName || transcript?.lastResultToolName || null,
            /** Active file being edited — real evidence, null otherwise. */
            activeFile: transcript?.activeFilePath
                ? sanitizeTitle(transcript.activeFilePath)
                : null,
            containerId: null,
            messageCount: transcript?.count ?? 0,
            lastMessageId: transcript?.lastMessageId ?? null,
            pidAlive
        };
    }

    /**
     * Parses the session transcript ONLY when its mtime changed.
     * Extracts structural tail info; message content is not retained.
     */
    private readTranscript(sessionId: string): TranscriptInfo | null {
        const filePath = path.join(this.sessionsDir, sessionId, `${sessionId}.messages.json`);
        let mtime: number;
        try {
            mtime = fs.statSync(filePath).mtimeMs;
        } catch {
            return null; // no transcript yet
        }
        if (this.transcriptCache.has(sessionId) && this.mtimeCache.get(sessionId) === mtime) {
            return this.transcriptCache.get(sessionId)!;
        }

        const data = this.readJson<any>(filePath);
        const messages: any[] = Array.isArray(data?.messages) ? data.messages : [];
        if (!messages.length) return null;

        const info: TranscriptInfo = {
            count: messages.length,
            lastTs: Number(messages[messages.length - 1]?.ts) || null,
            lastMessageId: messages[messages.length - 1]?.id ?? null,
            lastAssistantToolName: null,
            lastAssistantHasToolUse: false,
            lastResultToolName: null,
            lastToolInputHint: null,
            pendingQuestion: false,
            activeFilePath: null
        };

        // Walk the tail backwards to gather evidence.
        let lastAssistant: any = null;
        let lastQuestion: { msgIndex: number; toolUseId: string } | null = null;
        for (let i = messages.length - 1; i >= 0; i--) {
            const msg = messages[i];
            const blocks = Array.isArray(msg?.content) ? msg.content : null;
            if (!blocks) continue;

            if (msg.role === 'assistant') {
                if (!info.activeFilePath) {
                    for (const b of blocks) {
                        if (b?.type === 'tool_use' && b?.name === 'editor' && b?.input?.path) {
                            info.activeFilePath = String(b.input.path).slice(0, 160);
                            break;
                        }
                    }
                }
                if (!lastQuestion) {
                    for (const b of blocks) {
                        if (b?.type === 'tool_use' && b?.name === 'ask_question') {
                            lastQuestion = { msgIndex: i, toolUseId: String(b.id || '') };
                            break;
                        }
                    }
                }
            }

            if (!lastAssistant && msg.role === 'assistant') {
                lastAssistant = msg;
                const toolUses = blocks.filter((b: any) => b?.type === 'tool_use');
                info.lastAssistantHasToolUse = toolUses.length > 0;
                if (toolUses.length > 0) {
                    const last = toolUses[toolUses.length - 1];
                    info.lastAssistantToolName = String(last?.name || '') || null;
                    try {
                        info.lastToolInputHint = JSON.stringify(last?.input || '').slice(0, 500);
                    } catch {
                        info.lastToolInputHint = null;
                    }
                }
            }
            if (!lastQuestion && msg.role === 'assistant') {
                for (const b of blocks) {
                    if (b?.type === 'tool_use' && b?.name === 'ask_question') {
                        lastQuestion = { msgIndex: i, toolUseId: String(b.id || '') };
                        break;
                    }
                }
            }
            if (lastAssistant && lastQuestion) break;
        }

        // Overall last message: user tool_result → agent processing results.
        const last = messages[messages.length - 1];
        if (Array.isArray(last?.content)) {
            const results = last.content.filter((b: any) => b?.type === 'tool_result');
            if (last.role === 'user' && results.length > 0) {
                info.lastResultToolName = String(results[results.length - 1]?.name || '') || null;
            }
        }

        // Pending question: an ask_question with NO answer after it.
        // The answer can be a matching tool_result or the user's plain
        // reply in any LATER message (not just the last one).
        if (lastQuestion) {
            let answered = false;
            for (let i = lastQuestion.msgIndex + 1; i < messages.length; i++) {
                const msg = messages[i];
                if (msg.role !== 'user' || !Array.isArray(msg.content)) continue;
                const matchingResult = msg.content.some(
                    (b: any) => b?.type === 'tool_result' && String(b?.tool_use_id || '') === lastQuestion!.toolUseId
                );
                const plainReply = msg.content.some(
                    (b: any) => typeof b === 'string' || (b && typeof b === 'object' && b.type === 'text')
                );
                if (matchingResult || plainReply) {
                    answered = true;
                    break;
                }
            }
            info.pendingQuestion = !answered;
        } else {
            info.pendingQuestion = false;
        }

        this.mtimeCache.set(sessionId, mtime);
        this.transcriptCache.set(sessionId, info);
        return info;
    }

    /**
     * New assistant TEXT messages since the last call (per session).
     * Baseline: only messages produced AFTER the source was created are
     * ever returned (no history replay). Texts are sanitized; thinking
     * blocks and tool results are never returned.
     */
    async getNewAssistantTexts(
        sessions: ClineSessionSnapshot[],
        limitPerSession = 2
    ): Promise<ClineMessageDelta[]> {
        const out: ClineMessageDelta[] = [];
        for (const session of sessions) {
            const filePath = path.join(this.sessionsDir, session.sessionId, `${session.sessionId}.messages.json`);
            const data = this.readJson<any>(filePath);
            const messages: any[] = Array.isArray(data?.messages) ? data.messages : [];
            const cursor = this.textCursor.get(session.sessionId) ?? this.startTs;

            const fresh: ClineMessageDelta[] = [];
            for (const msg of messages) {
                const ts = Number(msg?.ts) || 0;
                if (ts <= cursor || ts < this.startTs) continue;
                if (msg.role !== 'assistant' || !Array.isArray(msg.content)) continue;
                const textBlock = msg.content.find((b: any) => b?.type === 'text' && typeof b?.text === 'string');
                if (!textBlock) continue;
                const sanitized = sanitizeMessageText(textBlock.text);
                if (!sanitized) continue;
                fresh.push({
                    sessionId: session.sessionId,
                    messageId: String(msg.id ?? `${ts}`),
                    role: 'assistant',
                    ts,
                    text: sanitized
                });
            }

            const limited = fresh.slice(-limitPerSession);
            out.push(...limited);
            const newest = fresh.length ? fresh[fresh.length - 1].ts : cursor;
            this.textCursor.set(session.sessionId, Math.max(cursor, newest));
        }
        return out;
    }
}


