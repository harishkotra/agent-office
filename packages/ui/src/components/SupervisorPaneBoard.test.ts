const fs = require('node:fs');
const path = require('node:path');

describe('SupervisorPaneBoard', () => {
    it('renders Codex Supervisor TUI pane activity rather than generic office chat', () => {
        const source = fs.readFileSync(path.join(__dirname, 'SupervisorPaneBoard.tsx'), 'utf8');
        expect(source).toContain('supervisor-state');
        expect(source).toContain('TUI Sessions');
        expect(source).toContain('pane.tail');
        expect(source).toContain('General Manager');
        expect(source).toContain('Validator Lane');
        expect(source).not.toContain('Office environment initialized');
    });
});
