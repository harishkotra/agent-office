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

export function App() {
    return (
        <>
            <div style={{ position: 'absolute', bottom: 20, left: 20, color: 'white', backgroundColor: 'rgba(10,10,30,0.85)', padding: '12px 16px', borderRadius: '10px', zIndex: 10, border: '1px solid rgba(108,92,231,0.3)' }}>
                <h1 style={{ margin: 0, fontSize: '18px', display: 'flex', alignItems: 'center', gap: 8 }}>🏢 AgentOffice</h1>
                <p style={{ margin: '4px 0 0', opacity: 0.6, fontSize: '11px' }}>Codex Supervisor live TUI office</p>
            </div>
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
