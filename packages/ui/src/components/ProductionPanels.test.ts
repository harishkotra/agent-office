const fs = require('node:fs');
const path = require('node:path');

const componentDir = __dirname;
const uiSrcDir = path.join(componentDir, '..');

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

    it('gives the shared HUD shell professional game-grade chrome instead of plain debug boxes', () => {
        const source = fs.readFileSync(path.join(componentDir, 'FloatingPanel.tsx'), 'utf8');
        [
            'HUD_ACCENT_COLORS',
            'radial-gradient(circle at 18% 0%',
            'linear-gradient(135deg, rgba(6,8,18,0.96)',
            'inset 0 1px 0 rgba(255,255,255,0.18)',
            'data-testid={`hud-panel-${id}`',
            'LIVE',
            'boxShadow: `0 0 16px ${accent}88`'
        ].forEach((marker) => expect(source).toContain(marker));
    });

    it('adds a professional cinematic viewport treatment around the Phaser scene', () => {
        const source = fs.readFileSync(path.join(uiSrcDir, 'App.tsx'), 'utf8');
        [
            'CinematicViewportChrome',
            'agent-office-vignette',
            'agent-office-scanlines',
            'radial-gradient(circle at 50% 48%',
            'linear-gradient(180deg, transparent 0 70%',
            'PRODUCTION FLOOR',
            'WASD / ARROWS'
        ].forEach((marker) => expect(source).toContain(marker));
    });

});
