const fs = require('node:fs');
const path = require('node:path');

describe('Codex supervisor state adapter', () => {
    const sourcePath = path.join(__dirname, 'SupervisorState.ts');

    it('reads supervisor state files and tmux pane tails instead of inventing social AI chatter', () => {
        const source = fs.readFileSync(sourcePath, 'utf8');
        expect(source).toContain('buildSupervisorSnapshotFromStateFiles');
        expect(source).toContain('PROMPTS_FILE');
        expect(source).toContain('PROJECT_ROOT');
        expect(source).toContain('tmux');
        expect(source).toContain('capture-pane');
        expect(source).toContain('GENERAL_MANAGER');
        expect(source).toContain('VALIDATOR');
        expect(source).toContain('DEBUG');
        expect(source).not.toContain('Alice');
        expect(source).not.toContain('Anime-inspired');
    });

    it('has supervisor-shaped fallback panes when no tmux state is active', () => {
        const source = fs.readFileSync(sourcePath, 'utf8');
        [
            'CEO / Operator',
            'General Manager',
            'Debug Lane',
            'Validator Lane',
            'Dynamic Worker',
            'fallbackSupervisorSnapshot'
        ].forEach((marker) => expect(source).toContain(marker));
    });
});
