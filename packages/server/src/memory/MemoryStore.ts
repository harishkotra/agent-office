import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import { MemoryEntry } from '@agent-office/core';

function cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i]; magA += a[i] * a[i]; magB += b[i] * b[i];
    }
    return dot / (Math.sqrt(magA) * Math.sqrt(magB) || 1);
}

export class MemoryStore {
    private db?: Database;
    private ollamaUrl: string;
    /**
     * Embeddings call Ollama (/api/embeddings). They are NOT needed to show
     * the office, so they are disabled in external mode (no LLM dependency).
     */
    private embeddingsEnabled: boolean;

    constructor(ollamaUrl: string = 'http://localhost:11434', embeddingsEnabled: boolean = true) {
        this.ollamaUrl = ollamaUrl;
        this.embeddingsEnabled = embeddingsEnabled;
    }

    async initialize(
        dbPath: string = './data/office-memory.db',
        opts?: { ollamaUrl?: string; embeddingsEnabled?: boolean }
    ) {
        if (opts?.ollamaUrl !== undefined) this.ollamaUrl = opts.ollamaUrl;
        if (opts?.embeddingsEnabled !== undefined) this.embeddingsEnabled = opts.embeddingsEnabled;

        // Ensure data directory exists
        const { mkdir } = await import('fs/promises');
        const path = await import('path');
        await mkdir(path.dirname(dbPath), { recursive: true });

        this.db = await open({
            filename: dbPath,
            driver: sqlite3.Database
        });

        await this.db.exec(`
            CREATE TABLE IF NOT EXISTS memories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                agent_id TEXT NOT NULL,
                content TEXT NOT NULL,
                type TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                importance REAL NOT NULL DEFAULT 0.5,
                embedding TEXT,
                session_id TEXT,
                created_at TEXT DEFAULT (datetime('now'))
            );
            CREATE INDEX IF NOT EXISTS idx_memories_agent ON memories(agent_id);
            CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance DESC);

            CREATE TABLE IF NOT EXISTS tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                assigned_to TEXT,
                status TEXT DEFAULT 'pending',
                created_at TEXT DEFAULT (datetime('now')),
                completed_at TEXT
            );

            CREATE TABLE IF NOT EXISTS office_layout (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                layout_json TEXT NOT NULL,
                name TEXT NOT NULL DEFAULT 'default',
                updated_at TEXT DEFAULT (datetime('now'))
            );
        `);

        // Migration: add embedding column to existing databases
        try {
            await this.db.exec('ALTER TABLE memories ADD COLUMN embedding TEXT');
        } catch {
            // Column already exists — ignore
        }

        console.log(
            `[MemoryStore] SQLite initialized at ${dbPath} ` +
            `(embeddings: ${this.embeddingsEnabled ? 'enabled' : 'DISABLED'})`
        );
    }

    // --- Embedding Generation ---

    private async generateEmbedding(text: string): Promise<number[] | null> {
        if (!this.embeddingsEnabled) return null;
        try {
            const res = await fetch(`${this.ollamaUrl}/api/embeddings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: 'llama3.2:latest', prompt: text })
            });
            const data = await res.json();
            return data.embedding || null;
        } catch {
            return null;
        }
    }

    // --- Memory Operations ---

    async saveMemory(agentId: string, entry: MemoryEntry, sessionId?: string): Promise<void> {
        if (!this.db) return;
        // Generate embedding for semantic search (async, non-blocking)
        let embeddingStr: string | null = null;
        if (entry.importance >= 0.5) {
            const embedding = await this.generateEmbedding(entry.content);
            if (embedding) embeddingStr = JSON.stringify(embedding);
        }
        await this.db.run(
            'INSERT INTO memories (agent_id, content, type, timestamp, importance, embedding, session_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [agentId, entry.content, entry.type, entry.timestamp, entry.importance, embeddingStr, sessionId || null]
        );
    }

    async saveMemories(agentId: string, entries: MemoryEntry[], sessionId?: string): Promise<void> {
        for (const entry of entries) {
            await this.saveMemory(agentId, entry, sessionId);
        }
    }

    async loadMemories(agentId: string, limit: number = 20): Promise<MemoryEntry[]> {
        if (!this.db) return [];
        const rows = await this.db.all(
            'SELECT content, type, timestamp, importance FROM memories WHERE agent_id = ? ORDER BY importance DESC, created_at DESC LIMIT ?',
            [agentId, limit]
        );
        return rows.map((r: any) => ({
            content: r.content,
            type: r.type,
            timestamp: r.timestamp,
            importance: r.importance
        }));
    }

    async semanticSearch(agentId: string, query: string, topK: number = 5): Promise<MemoryEntry[]> {
        if (!this.db) return [];
        const queryEmbedding = await this.generateEmbedding(query);
        if (!queryEmbedding) return this.loadMemories(agentId, topK); // Fallback to recency

        const rows = await this.db.all(
            'SELECT content, type, timestamp, importance, embedding FROM memories WHERE agent_id = ? AND embedding IS NOT NULL',
            [agentId]
        );

        const scored = rows.map((r: any) => {
            const emb = JSON.parse(r.embedding);
            const score = cosineSimilarity(queryEmbedding, emb);
            return { content: r.content, type: r.type, timestamp: r.timestamp, importance: r.importance, score };
        }).sort((a, b) => b.score - a.score);

        return scored.slice(0, topK).map(s => ({
            content: s.content,
            type: s.type,
            timestamp: s.timestamp,
            importance: s.importance
        }));
    }

    // --- Task Operations ---

    async createTask(title: string, assignedTo?: string): Promise<number> {
        if (!this.db) return -1;
        const result = await this.db.run(
            'INSERT INTO tasks (title, assigned_to) VALUES (?, ?)',
            [title, assignedTo || null]
        );
        return result.lastID || -1;
    }

    async getTasks(): Promise<any[]> {
        if (!this.db) return [];
        return this.db.all('SELECT * FROM tasks ORDER BY created_at DESC LIMIT 50');
    }

    async assignTask(taskId: number, agentId: string): Promise<void> {
        if (!this.db) return;
        await this.db.run('UPDATE tasks SET assigned_to = ?, status = ? WHERE id = ?', [agentId, 'in_progress', taskId]);
    }

    async completeTask(taskId: number): Promise<void> {
        if (!this.db) return;
        await this.db.run("UPDATE tasks SET status = 'completed', completed_at = datetime('now') WHERE id = ?", [taskId]);
    }

    // --- Layout Operations ---

    async saveLayout(name: string, layoutJson: string): Promise<void> {
        if (!this.db) return;
        const existing = await this.db.get('SELECT id FROM office_layout WHERE name = ?', [name]);
        if (existing) {
            await this.db.run("UPDATE office_layout SET layout_json = ?, updated_at = datetime('now') WHERE name = ?", [layoutJson, name]);
        } else {
            await this.db.run('INSERT INTO office_layout (name, layout_json) VALUES (?, ?)', [name, layoutJson]);
        }
    }

    async loadLayout(name: string = 'default'): Promise<any | null> {
        if (!this.db) return null;
        const row = await this.db.get('SELECT layout_json FROM office_layout WHERE name = ?', [name]);
        return row ? JSON.parse(row.layout_json) : null;
    }

    async close(): Promise<void> {
        if (this.db) await this.db.close();
    }
}
