import React, { useEffect, useState } from 'react';
import { eventBus } from '../events';
import { FloatingPanel } from './FloatingPanel';

type SupervisorPane = {
    id: string;
    name: string;
    role: 'General Manager' | 'Validator Lane' | 'Debug Lane' | 'Dynamic Worker' | 'CEO / Operator' | string;
    lane: string;
    project: string;
    session: string;
    state: string;
    action: string;
    currentTask: string;
    thought: string;
    tail: string[];
};

type SupervisorSnapshot = {
    source: string;
    updatedAt: string;
    panes: SupervisorPane[];
};

export function SupervisorPaneBoard() {
    const [snapshot, setSnapshot] = useState<SupervisorSnapshot>({
        source: 'loading codex-supervisor state',
        updatedAt: '',
        panes: []
    });

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                const response = await fetch('/api/supervisor-state');
                const data = await response.json();
                if (!cancelled && Array.isArray(data?.panes)) setSnapshot(data as SupervisorSnapshot);
            } catch {
                if (!cancelled) {
                    setSnapshot({
                        source: 'failed to load supervisor state',
                        updatedAt: new Date().toISOString(),
                        panes: []
                    });
                }
            }
        };
        load();
        const timer = window.setInterval(load, 5000);
        const onSupervisorState = (event: Event) => {
            const detail = (event as CustomEvent).detail;
            if (Array.isArray(detail?.panes)) setSnapshot(detail as SupervisorSnapshot);
        };
        eventBus.addEventListener('supervisor-state', onSupervisorState);
        return () => {
            cancelled = true;
            window.clearInterval(timer);
            eventBus.removeEventListener('supervisor-state', onSupervisorState);
        };
    }, []);

    return (
        <FloatingPanel
            id="supervisor-tui-sessions"
            title="Codex Supervisor TUI Sessions"
            subtitle="Live panes, lanes, tails"
            width={420}
            defaultDock="left"
            defaultY={20}
            bodyMaxHeight={360}
            zIndex={24}
        >
            <div style={{ fontSize: 10, color: '#9fb3c8', marginBottom: 8 }}>
                Source: {snapshot.source} {snapshot.updatedAt && `· ${new Date(snapshot.updatedAt).toLocaleTimeString()}`}
            </div>
            {snapshot.panes.length === 0 && (
                <div style={{ fontSize: 12, color: '#ffcf99' }}>
                    No live panes found. Start `codex-supervisor` to stream actual TUI sessions.
                </div>
            )}
            {snapshot.panes.map((pane) => (
                <div
                    key={pane.id}
                    style={{
                        marginBottom: 10,
                        padding: 9,
                        borderRadius: 8,
                        background: 'rgba(12,18,28,0.88)',
                        border: '1px solid rgba(125,211,252,0.18)'
                    }}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 4 }}>
                        <strong style={{ fontSize: 12, color: '#f6e2b7' }}>{pane.role}</strong>
                        <span style={{ fontSize: 10, color: '#7dd3fc' }}>{pane.state}</span>
                    </div>
                    <div style={{ fontSize: 11, color: '#d8d8d8' }}>{pane.name}</div>
                    <div style={{ fontSize: 10, color: '#abdfa7', marginTop: 2 }}>
                        {pane.project} · {pane.session} · {pane.lane} · {pane.action}
                    </div>
                    <pre style={{
                        margin: '7px 0 0',
                        padding: 7,
                        maxHeight: 96,
                        overflow: 'auto',
                        borderRadius: 6,
                        background: '#05070b',
                        color: '#d8d8d8',
                        fontSize: 10,
                        whiteSpace: 'pre-wrap'
                    }}>{pane.tail.slice(-4).join('\n') || pane.thought || pane.currentTask}</pre>
                </div>
            ))}
        </FloatingPanel>
    );
}
