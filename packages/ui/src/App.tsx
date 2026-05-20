import React from 'react';
import { ChatPanel } from './components/ChatPanel';
import { TaskBoard } from './components/TaskBoard';
import { AgentInspector } from './components/AgentInspector';
import { LayoutEditor } from './components/LayoutEditor';
import { SystemLog } from './components/SystemLog';
import { ViralControlPanel } from './components/ViralControlPanel';
import { HighlightsFeed } from './components/HighlightsFeed';
import { AgentPulseBoard } from './components/AgentPulseBoard';
import { RelationshipGraph } from './components/RelationshipGraph';
import { EpisodeRecapPanel } from './components/EpisodeRecapPanel';
import { SupervisorPaneBoard } from './components/SupervisorPaneBoard';

function CinematicViewportChrome() {
    return (
        <>
            <div
                aria-hidden="true"
                data-testid="agent-office-vignette"
                style={{
                    position: 'absolute',
                    inset: 0,
                    zIndex: 3,
                    pointerEvents: 'none',
                    background: `
                        radial-gradient(circle at 50% 48%, transparent 0 48%, rgba(5,6,14,0.28) 76%, rgba(3,4,10,0.68) 100%),
                        linear-gradient(180deg, rgba(255,255,255,0.08), transparent 16%, transparent 78%, rgba(0,0,0,0.34))
                    `,
                    mixBlendMode: 'screen'
                }}
            />
            <div
                aria-hidden="true"
                data-testid="agent-office-scanlines"
                style={{
                    position: 'absolute',
                    inset: 0,
                    zIndex: 4,
                    pointerEvents: 'none',
                    opacity: 0.18,
                    backgroundImage: 'linear-gradient(180deg, transparent 0 70%, rgba(255,255,255,0.16) 72% 74%, transparent 76% 100%)',
                    backgroundSize: '100% 6px'
                }}
            />
        </>
    );
}

function BrandPlaque() {
    return (
        <div style={{
            position: 'absolute',
            bottom: 20,
            left: 20,
            zIndex: 12,
            width: 286,
            color: '#f8fbff',
            padding: '13px 15px 12px',
            borderRadius: 16,
            border: '1px solid rgba(88,213,255,0.42)',
            background: `
                radial-gradient(circle at 18% 0%, rgba(88,213,255,0.26), transparent 42%),
                linear-gradient(135deg, rgba(6,8,18,0.94), rgba(23,20,43,0.9))
            `,
            boxShadow: '0 18px 42px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.16)',
            backdropFilter: 'blur(10px) saturate(1.25)'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div>
                    <div style={{
                        margin: 0,
                        fontSize: 18,
                        fontWeight: 900,
                        letterSpacing: '0.03em',
                        lineHeight: 1,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8
                    }}>
                        <span aria-hidden="true">🏢</span>
                        <span>AgentOffice</span>
                    </div>
                    <div style={{
                        marginTop: 6,
                        color: 'rgba(230,238,255,0.7)',
                        fontSize: 11,
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase'
                    }}>
                        Codex Supervisor live TUI office
                    </div>
                </div>
                <div style={{
                    border: '1px solid rgba(102,226,141,0.42)',
                    color: '#8affb2',
                    borderRadius: 999,
                    padding: '4px 8px',
                    fontSize: 9,
                    fontWeight: 900,
                    letterSpacing: '0.08em',
                    background: 'rgba(102,226,141,0.12)',
                    boxShadow: '0 0 18px rgba(102,226,141,0.16)'
                }}>
                    PRODUCTION FLOOR
                </div>
            </div>
            <div style={{
                marginTop: 11,
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 8,
                color: 'rgba(248,251,255,0.72)',
                fontSize: 10
            }}>
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.12)', paddingTop: 7 }}>
                    🖱️ Click agent to follow
                </div>
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.12)', paddingTop: 7 }}>
                    ⌨️ WASD / ARROWS pan
                </div>
            </div>
        </div>
    );
}

export function App() {
    return (
        <>
            <CinematicViewportChrome />
            <BrandPlaque />
            <SupervisorPaneBoard />
            <ChatPanel />
            <TaskBoard />
            <AgentInspector agent={{
                name: 'Codex Supervisor',
                role: 'Control Plane',
                status: 'Streaming TUI panes',
                currentTask: 'Render live tmux activity and lane handoffs'
            }} />
            <LayoutEditor />
            <SystemLog />
            <ViralControlPanel />
            <RelationshipGraph />
            <HighlightsFeed />
            <AgentPulseBoard />
            <EpisodeRecapPanel />
        </>
    );
}
