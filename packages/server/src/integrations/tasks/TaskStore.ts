import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import * as path from 'path';
import * as fs from 'fs';
import { sanitizeTitle } from '../cline/ClineStateNormalizer';

/**
 * Block 4 (FASE C) — local storage for AgentOffice task PROPOSALS and
 * sprint organization. Decoupled from any orchestrator:
 *
 *  - origin 'agentoffice': proposals created here. They are NEVER
 *    presented as assigned or executed — only the real systems (DSH
 *    when connected, or a validated Cline dispatch) can confirm them.
 *  - origin 'cline': tasks observed from Cline Teams (read-only view).
 *  - origin 'dsh': reserved; populated only by a real DSH provider.
 *
 * The store lives in its OWN SQLite file so a future DSH provider can
 * replace it without touching Cline's storage or the office engine.
 */

export type OfficeTaskStatus =
    | 'proposed'      // local proposal, not confirmed by any system
    | 'pending'       // accepted for work (by confirmation, not by us)
    | 'assigned'
    | 'in_progress'
    | 'blocked'
    | 'in_review'
    | 'completed';

export type TaskOrigin = 'agentoffice' | 'cline' | 'dsh';

export interface OfficeTask {
    id: string;
    title: string;
    description: string;
    status: OfficeTaskStatus;
    origin: TaskOrigin;
    sprintId: string | null;
    /** Real session id when the task maps to an office agent. */
    assigneeSessionId: string | null;
    dependencies: string[];
    createdAt: string;
    updatedAt: string;
}

export interface OfficeSprint {
    id: string;
    name: string;
    goal: string;
    createdAt: string;
}

/**
 * Provider contract (FASE G seam): a future DSH integration implements
 * this to become the authoritative source of tasks it administers.
 */
export interface TaskProvider {
    readonly kind: 'local' | 'dsh';
    listTasks(): Promise<OfficeTask[]>;
    createProposal(input: { title: string; description?: string }): Promise<OfficeTask>;
    updateStatus(taskId: string, status: OfficeTaskStatus): Promise<OfficeTask | null>;
    listSprints(): Promise<OfficeSprint[]>;
    createSprint(input: { name: string; goal?: string }): Promise<OfficeSprint>;
    assignToSprint(taskId: string, sprintId: string | null): Promise<OfficeTask | null>;
}

/** Statuses a LOCAL proposal may move through (visual organization only). */
const LOCAL_PROPOSAL_STATUSES: OfficeTaskStatus[] = [
    'proposed', 'pending', 'in_review', 'blocked'
];

export class LocalTaskStore implements TaskProvider {
    readonly kind = 'local' as const;
    private db?: Database;

    constructor(private readonly dbPath: string) {}

    private async openDb(): Promise<Database> {
        if (this.db) return this.db;
        fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
        this.db = await open({ filename: this.dbPath, driver: sqlite3.Database });
        await this.db.exec(`
            CREATE TABLE IF NOT EXISTS office_tasks (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT DEFAULT '',
                status TEXT NOT NULL DEFAULT 'proposed',
                origin TEXT NOT NULL DEFAULT 'agentoffice',
                sprint_id TEXT,
                assignee_session_id TEXT,
                dependencies_json TEXT DEFAULT '[]',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS office_sprints (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                goal TEXT DEFAULT '',
                created_at TEXT NOT NULL
            );
        `);
        return this.db;
    }

    async listTasks(): Promise<OfficeTask[]> {
        const db = await this.openDb();
        const rows = await db.all('SELECT * FROM office_tasks ORDER BY created_at DESC LIMIT 200');
        return rows.map((r: any) => this.toTask(r));
    }

    async createProposal(input: { title: string; description?: string }): Promise<OfficeTask> {
        const db = await this.openDb();
        const id = `task_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
        const ts = new Date().toISOString();
        const title = sanitizeTitle(String(input.title || ''));
        if (!title) throw new Error('title requerido');
        await db.run(
            `INSERT INTO office_tasks (id, title, description, status, origin, dependencies_json, created_at, updated_at)
             VALUES (?, ?, ?, 'proposed', 'agentoffice', '[]', ?, ?)`,
            [id, title, sanitizeTitle(String(input.description || ''), 500), ts, ts]
        );
        return (await this.getTask(id))!;
    }

    /**
     * Local proposals only move through ORGANIZATIONAL statuses.
     * Transitions to assigned/in_progress/completed are RESERVED for
     * real systems (DSH/validated dispatch) — never set locally.
     */
    async updateStatus(taskId: string, status: OfficeTaskStatus): Promise<OfficeTask | null> {
        const task = await this.getTask(taskId);
        if (!task) return null;
        if (task.origin === 'agentoffice' && !LOCAL_PROPOSAL_STATUSES.includes(status)) {
            throw new Error(
                `Una propuesta local no puede marcarse como "${status}" sin confirmación de DSH o un despacho validado.`
            );
        }
        if (task.origin !== 'agentoffice') {
            throw new Error('Solo las propuestas locales pueden editarse aquí; las tareas observadas son de solo lectura.');
        }
        const db = await this.openDb();
        await db.run('UPDATE office_tasks SET status = ?, updated_at = ? WHERE id = ?',
            [status, new Date().toISOString(), taskId]);
        return this.getTask(taskId);
    }

    async listSprints(): Promise<OfficeSprint[]> {
        const db = await this.openDb();
        const rows = await db.all('SELECT * FROM office_sprints ORDER BY created_at DESC LIMIT 50');
        return rows.map((r: any) => ({
            id: r.id, name: r.name, goal: r.goal, createdAt: r.created_at
        }));
    }

    async createSprint(input: { name: string; goal?: string }): Promise<OfficeSprint> {
        const db = await this.openDb();
        const id = `sprint_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
        const ts = new Date().toISOString();
        const name = sanitizeTitle(String(input.name || ''));
        if (!name) throw new Error('name requerido');
        await db.run('INSERT INTO office_sprints (id, name, goal, created_at) VALUES (?, ?, ?, ?)',
            [id, name, sanitizeTitle(String(input.goal || ''), 300), ts]);
        return { id, name, goal: String(input.goal || ''), createdAt: ts };
    }

    async assignToSprint(taskId: string, sprintId: string | null): Promise<OfficeTask | null> {
        const task = await this.getTask(taskId);
        if (!task) return null;
        const db = await this.openDb();
        await db.run('UPDATE office_tasks SET sprint_id = ?, updated_at = ? WHERE id = ?',
            [sprintId, new Date().toISOString(), taskId]);
        return this.getTask(taskId);
    }

    async getTask(taskId: string): Promise<OfficeTask | null> {
        const db = await this.openDb();
        const row = await db.get('SELECT * FROM office_tasks WHERE id = ?', [taskId]);
        return row ? this.toTask(row) : null;
    }

    private toTask(r: any): OfficeTask {
        let deps: string[] = [];
        try { deps = JSON.parse(r.dependencies_json || '[]'); } catch { /* tolerate */ }
        return {
            id: r.id,
            title: r.title,
            description: r.description || '',
            status: r.status,
            origin: r.origin,
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