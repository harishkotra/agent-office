import React, { useEffect, useMemo, useState } from 'react';
import { eventBus } from '../events';
import { FloatingPanel } from './FloatingPanel';

type AgentPulse = {
    id: string;
    name: string;
    mood: number;
    reputation: number;
    riskLevel: number;
    momentum: number;
    action: string;
};

function pct(value: number): string {
    return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

export function AgentPulseBoard() {
    const [agents, setAgents] = useState<Record<string, AgentPulse>>({});

    useEffect(() => {
        const onTelemetry = (e: Event) => {
            const detail = (e as CustomEvent).detail as AgentPulse;
            if (!detail?.id) return;
            setAgents((prev) => ({ ...prev, [detail.id]: detail }));
        };

        eventBus.addEventListener('agent-telemetry', onTelemetry);
        return () => eventBus.removeEventListener('agent-telemetry', onTelemetry);
    }, []);

    const sortedAgents = useMemo(
        () => Object.values(agents).sort((a, b) => b.momentum - a.momentum),
        [agents]
    );

    return (
        <FloatingPanel
            id="agent-pulse"
            title="Agent Pulse"
            subtitle="Mood, risk, momentum"
            width={300}
            defaultDock="left"
            defaultY={580}
            bodyMaxHeight={220}
            zIndex={14}
        >
            {sortedAgents.length === 0 && (
                <div style={{ fontSize: 11, color: '#86c6b5' }}>Waiting for live telemetry...</div>
            )}
            {sortedAgents.map((agent) => (
                <div key={agent.id} style={{
                    marginBottom: 8,
                    paddingBottom: 8,
                    borderBottom: '1px solid rgba(255,255,255,0.08)'
                }}>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>
                        {agent.name} <span style={{ fontWeight: 400, color: '#98ccb9' }}>({agent.action})</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, fontSize: 10, marginTop: 4, color: '#cbe9df' }}>
                        <div>Mood: {pct(agent.mood)}</div>
                        <div>Reputation: {pct(agent.reputation)}</div>
                        <div>Risk: {pct(agent.riskLevel)}</div>
                        <div>Momentum: {pct(agent.momentum)}</div>
                    </div>
                </div>
            ))}
        </FloatingPanel>
    );
}
