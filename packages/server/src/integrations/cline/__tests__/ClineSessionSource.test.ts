import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import { ClineSessionSource } from '../ClineSessionSource';

/** Builds a fixture Cline data dir (sessions.db + session JSONs). */
async function buildFixture(): Promise<{ root: string; db: Database }> {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cline-fx-'));
    fs.mkdirSync(path.join(root, 'db'), { recursive: true });
    fs.mkdirSync(path.join(root, 'sessions'), { recursive: true });

    const db = await open({
        filename: path.join(root, 'db', 'sessions.db'),
        driver: sqlite3.Database
    });
    await db.exec(`
        CREATE TABLE sessions (
            session_id TEXT PRIMARY KEY, source TEXT, pid INTEGER,
            started_at TEXT, ended_at TEXT, exit_code INTEGER, status TEXT,
            status_lock INTEGER, interactive INTEGER, provider TEXT, model TEXT,
            cwd TEXT, workspace_root TEXT, team_name TEXT,
            enable_tools INTEGER, enable_spawn INTEGER, enable_teams INTEGER,
            parent_session_id TEXT, parent_agent_id TEXT, agent_id TEXT,
            conversation_id TEXT, is_subagent INTEGER, prompt TEXT,
            metadata_json TEXT, transcript_path TEXT, hook_path TEXT,
            messages_path TEXT, updated_at TEXT
        );
    `);

    const addSession = async (
        id: string,
        opts: {
            status: string; pid: number | null; interactive: number;
            startedAt: string; endedAt?: string; isSubagent?: number;
        },
        meta: any,
        messages: any[]
    ) => {
        await db.run(
            `INSERT INTO sessions (session_id, pid, status, interactive, provider, model,
                cwd, workspace_root, team_name, started_at, ended_at, is_subagent, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                id, opts.pid, opts.status, opts.interactive, 'nvidia', 'z-ai/glm-5.3',
                '/workspace/agent-office', '/workspace/agent-office', 'team-TEST',
                opts.startedAt, opts.endedAt ?? null, opts.isSubagent ?? 0,
                new Date().toISOString()
            ]
        );
        const dir = path.join(root, 'sessions', id);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify({
            version: 1, session_id: id, pid: opts.pid, status: opts.status,
            interactive: opts.interactive === 1, provider: 'nvidia',
            model: 'z-ai/glm-5.3', cwd: '/workspace/agent-office',
            workspace_root: '/workspace/agent-office', team_name: 'team-TEST',
            started_at: opts.startedAt, ended_at: opts.endedAt ?? null,
            metadata: meta
        }, null, 2));
        fs.writeFileSync(path.join(dir, `${id}.messages.json`), JSON.stringify({
            version: 1, updated_at: new Date().toISOString(),
            sessionId: id, origin: 'cli', agent: 'lead',
            messages, system_prompt: ''
        }));
    };

    const now = Date.now();
    // Completed batch session (old).
    await addSession('1000_aaa', {
        status: 'completed', pid: null, interactive: 0,
        startedAt: '2026-10-10T10:00:00.000Z', endedAt: '2026-10-10T10:00:05.000Z'
    }, { title: 'Responde unicamente OK', git: { branch: 'main' } }, [
        { id: 'm1', role: 'user', content: 'ok', ts: now - 1000 },
        { id: 'm2', role: 'assistant', ts: now - 900, content: [{ type: 'text', text: 'OK' }] }
    ]);

    // Running interactive session — currently EDITING (editor tool result).
    // Includes an OLD ask_question that WAS answered: must NOT produce
    // a "waiting" state (regression: answer detection looks beyond the
    // last message).
    await addSession('2000_bbb', {
        status: 'running', pid: process.pid, interactive: 1,
        startedAt: '2026-10-10T11:00:00.000Z'
    }, { title: 'Fix login bug', git: { branch: 'feature/test' } }, [
        {
            id: 'm2', role: 'assistant', ts: now - 5_000,
            content: [{ type: 'tool_use', id: 'tq1', name: 'ask_question', input: {} }]
        },
        {
            id: 'm2b', role: 'user', ts: now - 4_000,
            content: [{ type: 'text', text: 'sí, continúa' }]
        },
        {
            id: 'm3', role: 'assistant', ts: now - 2_000,
            content: [{ type: 'tool_use', id: 'tu1', name: 'editor', input: { path: 'a.ts' } }]
        },
        {
            id: 'm4', role: 'user', ts: now - 1_000,
            content: [{ type: 'tool_result', tool_use_id: 'tu1', name: 'editor', content: 'ok' }]
        }
    ]);

    // Subagent — must NOT be listed.
    await addSession('3000_ccc', {
        status: 'running', pid: process.pid, interactive: 1,
        startedAt: '2026-10-10T12:00:00.000Z', isSubagent: 1
    }, { title: 'sub' }, []);

    return { root, db };
}

describe('ClineSessionSource (read-only)', () => {
    let root: string;
    let fixtureDb: Database;
    let source: ClineSessionSource;

    beforeAll(async () => {
        const fixture = await buildFixture();
        root = fixture.root;
        fixtureDb = fixture.db;
        source = new ClineSessionSource(root, { maxSessions: 7 });
    });

    afterAll(async () => {
        await fixtureDb.close();
        fs.rmSync(root, { recursive: true, force: true });
    });

    it('lists top-level sessions only, ordered by started_at (stable seats)', async () => {
        const sessions = await source.listSessions();
        expect(sessions).toHaveLength(2);
        expect(sessions[0].sessionId).toBe('1000_aaa');
        expect(sessions[1].sessionId).toBe('2000_bbb');
        expect(sessions.map(s => s.sessionId)).not.toContain('3000_ccc');
    });

    it('maps identity fields from the real session metadata', async () => {
        const sessions = await source.listSessions();
        const running = sessions.find(s => s.sessionId === '2000_bbb')!;
        expect(running.name).toBe('Cline bbb');
        expect(running.role).toBe('z-ai/glm-5.3');
        expect(running.gitBranch).toBe('feature/test');
        expect(running.title).toBe('Fix login bug');
        expect(running.interactive).toBe(true);
        expect(running.pidAlive).toBe(true);
        expect(running.containerId).toBeNull();
    });

    it('derives editing from the last editor tool result (not waiting: old question was answered)', async () => {
        const sessions = await source.listSessions();
        const running = sessions.find(s => s.sessionId === '2000_bbb')!;
        expect(running.state).toBe('editing');
        expect(running.lastToolName).toBe('editor');
    });

    it('derives completed for finished sessions', async () => {
        const sessions = await source.listSessions();
        const done = sessions.find(s => s.sessionId === '1000_aaa')!;
        expect(done.state).toBe('completed');
        expect(done.endedAt).toBeTruthy();
    });

    it('does not replay history, but surfaces NEW assistant texts once (sanitized)', async () => {
        const sessions = await source.listSessions();
        // First call: baseline — nothing new (fixture predates the source).
        let texts = await source.getNewAssistantTexts(sessions);
        expect(texts).toHaveLength(0);

        // Append a NEW assistant text message containing a secret.
        const running = sessions.find(s => s.sessionId === '2000_bbb')!;
        const file = path.join(root, 'sessions', running.sessionId, `${running.sessionId}.messages.json`);
        const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
        data.messages.push({
            id: 'm99', role: 'assistant', ts: Date.now(),
            content: [{ type: 'text', text: 'Apliqué el parche con nvapi-SECRETKEY123456 y funcionó.' }]
        });
        fs.writeFileSync(file, JSON.stringify(data));

        texts = await source.getNewAssistantTexts(sessions);
        expect(texts).toHaveLength(1);
        expect(texts[0].sessionId).toBe('2000_bbb');
        expect(texts[0].text).toContain('[nvapi-…]');
        expect(texts[0].text).not.toContain('SECRETKEY123456');

        // Second call: cursor advanced → no duplicates.
        const again = await source.getNewAssistantTexts(sessions);
        expect(again).toHaveLength(0);
    });

    it('marks running sessions with a dead pid as offline', async () => {
        const metaFile = path.join(root, 'sessions', '2000_bbb', '2000_bbb.json');
        const meta = JSON.parse(fs.readFileSync(metaFile, 'utf-8'));
        meta.pid = 9_999_999; // nonexistent pid
        fs.writeFileSync(metaFile, JSON.stringify(meta));

        const sessions = await source.listSessions();
        const running = sessions.find(s => s.sessionId === '2000_bbb')!;
        expect(running.pidAlive).toBe(false);
        expect(running.state).toBe('offline');
    });
});

