const fs = require('node:fs');
const path = require('node:path');

const componentDir = __dirname;

describe('production game HUD panels', () => {
    it('uses draggable/minimizable FloatingPanel shells for every heavy overlay', () => {
        ['TaskBoard.tsx', 'ChatPanel.tsx', 'AgentInspector.tsx', 'SystemLog.tsx', 'LayoutEditor.tsx', 'SupervisorPaneBoard.tsx'].forEach((file) => {
            const source = fs.readFileSync(path.join(componentDir, file), 'utf8');
            expect(source).toContain("import { FloatingPanel } from './FloatingPanel'");
            expect(source).toContain('<FloatingPanel');
        });
    });

    it('defaults every pane expanded so localhost:7777 shows the full office dashboard', () => {
        ['TaskBoard.tsx', 'ChatPanel.tsx', 'AgentInspector.tsx', 'SystemLog.tsx', 'LayoutEditor.tsx', 'RelationshipGraph.tsx', 'HighlightsFeed.tsx', 'AgentPulseBoard.tsx', 'EpisodeRecapPanel.tsx', 'ViralControlPanel.tsx', 'SupervisorPaneBoard.tsx'].forEach((file) => {
            const source = fs.readFileSync(path.join(componentDir, file), 'utf8');
            expect(source).not.toContain('defaultMinimized');
        });
    });

    it('uses a fresh versioned FloatingPanel storage key so stale minimized review layouts cannot hide panes', () => {
        const source = fs.readFileSync(path.join(componentDir, 'FloatingPanel.tsx'), 'utf8');
        expect(source).toContain('PANEL_LAYOUT_VERSION');
        expect(source).toContain('v7-visible-panes-reset');
        expect(source).toContain('panel:${id}:state:${PANEL_LAYOUT_VERSION}');
        expect(source).toContain('if (raw && defaultMinimized)');
    });

});
