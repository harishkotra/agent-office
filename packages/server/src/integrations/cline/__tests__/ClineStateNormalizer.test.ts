import {
    deriveClineState,
    sanitizeMessageText,
    sanitizeTitle
} from '../ClineStateNormalizer';

const NOW = 1_800_000_000_000;

function baseTail(overrides: Partial<any> = {}) {
    return {
        rawStatus: 'running',
        pidAlive: true,
        interactive: true,
        lastMessageTs: NOW - 5_000,
        lastAssistantToolName: null,
        lastAssistantHasToolUse: false,
        lastResultToolName: null,
        lastToolInputHint: null,
        pendingQuestion: false,
        ...overrides
    };
}

describe('deriveClineState (evidence-based)', () => {
    it('completed when Cline declares it', () => {
        expect(deriveClineState(baseTail({ rawStatus: 'completed' }), { nowTs: NOW })).toBe('completed');
    });

    it('offline when marked running but the process is dead (disconnection ≠ inactivity)', () => {
        expect(deriveClineState(baseTail({ pidAlive: false }), { nowTs: NOW })).toBe('offline');
    });

    it('idle when running but silent beyond the inactivity window', () => {
        expect(deriveClineState(baseTail({ lastMessageTs: NOW - 300_000 }), { nowTs: NOW })).toBe('idle');
    });

    it('waiting when a question has no answer yet', () => {
        expect(deriveClineState(baseTail({ pendingQuestion: true }), { nowTs: NOW })).toBe('waiting');
    });

    it('reading when the last tool result came from read_files', () => {
        expect(deriveClineState(baseTail({ lastResultToolName: 'read_files' }), { nowTs: NOW })).toBe('reading');
    });

    it('editing when the last tool result came from editor', () => {
        expect(deriveClineState(baseTail({ lastResultToolName: 'editor' }), { nowTs: NOW })).toBe('editing');
    });

    it('testing when the run_commands input looks like a test command', () => {
        const tail = baseTail({
            lastResultToolName: 'run_commands',
            lastToolInputHint: '{"commands":[{"command":"npm test --workspace=@agent-office/server"}]}'
        });
        expect(deriveClineState(tail, { nowTs: NOW })).toBe('testing');
    });

    it('working when the run_commands input is not a test command', () => {
        const tail = baseTail({
            lastResultToolName: 'run_commands',
            lastToolInputHint: '{"commands":[{"command":"ls -la /workspace"}]}'
        });
        expect(deriveClineState(tail, { nowTs: NOW })).toBe('working');
    });

    it('editing when the last assistant message issued an editor tool_use', () => {
        expect(deriveClineState(
            baseTail({ lastAssistantHasToolUse: true, lastAssistantToolName: 'editor' }),
            { nowTs: NOW }
        )).toBe('editing');
    });

    it('idle when the assistant answered with plain text and nothing is pending', () => {
        expect(deriveClineState(baseTail(), { nowTs: NOW })).toBe('idle');
    });

    it('does not invent activity without a transcript', () => {
        expect(deriveClineState(baseTail({ lastMessageTs: null }), { nowTs: NOW })).toBe('idle');
    });

    it('offline for unknown raw status (no invention)', () => {
        expect(deriveClineState(baseTail({ rawStatus: 'weird' }), { nowTs: NOW })).toBe('offline');
    });
});

describe('sanitizeMessageText / sanitizeTitle', () => {
    it('strips NVIDIA, OpenAI and GitHub secrets', () => {
        const out = sanitizeMessageText('uso nvapi-Htq584OqPT2kal5v37 y sk-abc123456789 además ghp_ABCDEFGHIJKLMNOPQR');
        expect(out).not.toContain('nvapi-Htq584OqPT2kal5v37');
        expect(out).not.toContain('sk-abc123456789');
        expect(out).not.toContain('ghp_ABCDEFGHIJKLMNOPQR');
        expect(out).toContain('[nvapi-…]');
        expect(out).toContain('[sk-…]');
    });

    it('truncates long texts', () => {
        const out = sanitizeMessageText('x'.repeat(500), 50);
        expect(out.length).toBeLessThanOrEqual(50);
        expect(out.endsWith('…')).toBe(true);
    });

    it('collapses whitespace and trims', () => {
        expect(sanitizeMessageText('  hola   \n mundo  ')).toBe('hola mundo');
    });

    it('sanitizes titles keeping them single-line', () => {
        const out = sanitizeTitle('l1\nl2   l3');
        expect(out).toBe('l1 l2 l3');
    });
});
