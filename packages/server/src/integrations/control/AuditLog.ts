import * as fs from 'fs';
import * as path from 'path';
import { sanitizeMessageText } from '../cline/ClineStateNormalizer';

/**
 * Block 4 (FASE F) — append-only audit log for every control request
 * and result. JSONL under the office data dir. Never stores secrets;
 * prompts are sanitized + truncated for accountability.
 */
export interface AuditEntry {
    ts: string;
    action: string;
    actor: string;
    requestId: string;
    targetSession?: string;
    result: string;
    detail?: string;
}

export class AuditLog {
    constructor(private readonly filePath: string) {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
    }

    record(entry: Omit<AuditEntry, 'ts'>): void {
        const full: AuditEntry = { ts: new Date().toISOString(), ...entry };
        try {
            fs.appendFileSync(this.filePath, JSON.stringify(full) + '\n', 'utf-8');
        } catch {
            // audit failure must never break the control flow
        }
    }

    /** Sanitized tail of the audit (for the UI; no secrets). */
    tail(limit = 50): AuditEntry[] {
        try {
            const lines = fs.readFileSync(this.filePath, 'utf-8').trim().split('\n').filter(Boolean);
            return lines.slice(-limit).map(l => {
                try { return JSON.parse(l); } catch { return null; }
            }).filter(Boolean) as AuditEntry[];
        } catch {
            return [];
        }
    }

    /** Sanitizes instruction text before it is persisted anywhere. */
    static sanitizePrompt(prompt: string): string {
        return sanitizeMessageText(prompt, 500);
    }

    /**
     * Block 5 (FASE E): size-based rotation. When the JSONL exceeds
     * `maxBytes`, it is moved to `<file>.1` (previous .1 is dropped)
     * and a fresh file starts — bounded disk usage, audit preserved.
     */
    rotateIfNeeded(maxBytes = 1_000_000): void {
        try {
            const stat = fs.statSync(this.filePath);
            if (stat.size < maxBytes) return;
            const rotated = this.filePath + '.1';
            if (fs.existsSync(rotated)) fs.unlinkSync(rotated);
            fs.renameSync(this.filePath, rotated);
        } catch {
            // file missing — nothing to rotate
        }
    }
}
