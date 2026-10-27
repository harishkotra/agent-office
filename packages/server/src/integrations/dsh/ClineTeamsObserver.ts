import * as fs from 'fs';
import * as path from 'path';
import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import { DshTask } from './DshAdapter';

/**
 * ⚠️ NOT DSH — read-only observer for Cline's NATIVE teams feature.
 *
 * Cline (>= 3.x) ships a "teams" subsystem that stores real tasks,
 * members and events in `<clineDataDir>/db/teams.db`. When a Cline team
 * session assigns tasks (team_task create/...), those are REAL tasks
 * executed by REAL Cline agents — this observer surfaces them into the
 * office TaskBoard.
 *
 * This is an independent, complementary source. It does NOT replace DSH:
 * - DSH (when installed): orchestrates across agents → DshAdapter.
 * - Cline teams (today): real tasks inside Cline team sessions → this.
 *
 * Read-only: SQLite opened with OPEN_READONLY; nothing is ever written.
 */
export class ClineTeamsObserver {
    private db?: Database;
    private readonly dbFile: string;
    private lastError: string | null = null;

    constructor(dataDir: string) {
        this.dbFile = path.join(dataDir, 'db', 'teams.db');
    }

    describe(): string {
        return `cline-teams @ ${this.dbFile}${this.lastError ? ` (last error: ${this.lastError})` : ''}`;
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

    /**
     * Lists real Cline-team tasks (ordered by update time).
     * Returns [] when teams.db exists but has no team activity (the
     * current state of this machine — no tasks are invented).
     */
    async listTasks(): Promise<DshTask[]> {
        if (!this.hasData()) return [];
        try {
            const db = await this.openDb();
            const rows = await db.all(
                `SELECT team_name, task_id, title, status, assignee, depends_on_json, summary, updated_at
                 FROM team_tasks
                 ORDER BY updated_at DESC
                 LIMIT 50`
            );
            this.lastError = null;
            return rows.map((r: any) => {
                let dependsOn: string[] = [];
                try {
                    const parsed = JSON.parse(r.depends_on_json || '[]');
                    if (Array.isArray(parsed)) dependsOn = parsed.map(String);
                } catch { /* tolerate malformed rows */ }
                return {
                    id: String(r.task_id || ''),
                    title: String(r.title || ''),
                    status: String(r.status || 'pending'),
                    assigneeId: r.assignee ? String(r.assignee) : null,
                    assigneeName: r.assignee ? String(r.assignee) : null,
                    dependsOn,
                    summary: r.summary ? String(r.summary) : null,
                    updatedAt: r.updated_at ? String(r.updated_at) : null
                } as DshTask;
            });
        } catch (e: any) {
            this.lastError = e?.message || String(e);
            this.db = undefined;
            return [];
        }
    }

    async close(): Promise<void> {
        if (this.db) {
            await this.db.close();
            this.db = undefined;
        }
    }
}
