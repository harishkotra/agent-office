import React from 'react';
import { FloatingPanel } from './FloatingPanel';

export function AgentInspector({ agent }: { agent?: any }) {
    if (!agent) return null;
    return (
        <FloatingPanel
            id="agent-inspector"
            title={`Inspector: ${agent.name}`}
            subtitle="Selected worker stats"
            width={260}
            defaultDock="center"
            defaultY={20}
            bodyMaxHeight={110}
            zIndex={17}
        >
            <div style={{ fontSize: '13px' }}>
                <p style={{ margin: '4px 0' }}><strong>Role:</strong> {agent.role}</p>
                <p style={{ margin: '4px 0' }}><strong>Status:</strong> {agent.status}</p>
                <p style={{ margin: '4px 0' }}><strong>Current Task:</strong> {agent.currentTask || 'None'}</p>
            </div>
        </FloatingPanel>
    );
}
