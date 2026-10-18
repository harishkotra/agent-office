import React, { useEffect, useState } from 'react';
import { getColyseusRoom } from '../game/Game';
import { eventBus } from '../events';
import { FloatingPanel } from './FloatingPanel';

const SCENARIOS = ['Startup Crunch', 'Hackathon Night', 'Incident War Room', 'Product Launch'] as const;
const CHAOS_EVENTS = [
    { id: 'server_outage', label: 'Server Outage' },
    { id: 'funding_cut', label: 'Funding Cut' },
    { id: 'client_escalation', label: 'Client Escalation' },
    { id: 'surprise_launch', label: 'Surprise Launch' },
    { id: 'viral_tweet', label: 'Viral Tweet' },
] as const;

export function ViralControlPanel() {
    const [scenario, setScenario] = useState<string>(SCENARIOS[0]);
    const [cinematicMode, setCinematicMode] = useState(true);
    const [lastEvent, setLastEvent] = useState('Idle');
    const [voteStatus, setVoteStatus] = useState('');

    useEffect(() => {
        eventBus.dispatchEvent(new CustomEvent('cinematic-toggle', { detail: { enabled: cinematicMode } }));
    }, [cinematicMode]);

    useEffect(() => {
        const handler = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            if (detail?.label) {
                setLastEvent(detail.label);
            } else if (detail?.scenario) {
                setLastEvent(`Scenario: ${detail.scenario}`);
            }
        };
        eventBus.addEventListener('scenario-event', handler);
        return () => eventBus.removeEventListener('scenario-event', handler);
    }, []);

    const startScenario = () => {
        const room = getColyseusRoom();
        if (!room) return;
        room.send('start-scenario', { scenario });
    };

    const triggerChaos = (eventId: string) => {
        const room = getColyseusRoom();
        if (!room) return;
        room.send('trigger-chaos', { event: eventId });
    };

    const castVote = async (eventId: string) => {
        try {
            const response = await fetch('/api/vote-chaos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    event: eventId,
                    voterId: `local-${Math.random().toString(36).slice(2, 8)}`
                })
            });
            const data = await response.json();
            if (data?.ok) {
                setVoteStatus(`${eventId}: ${data.tally} votes${data.triggered ? ' (TRIGGERED)' : ''}`);
            } else {
                setVoteStatus('Vote failed');
            }
        } catch {
            setVoteStatus('Vote failed');
        }
    };

    return (
        <FloatingPanel
            id="viral-control"
            title="Showrunner Controls"
            subtitle="Viral Mode Console"
            width={330}
            defaultDock="right"
            defaultY={20}
            bodyMaxHeight={250}
            zIndex={18}
        >
            <div style={{ fontSize: 11, color: '#babedc', marginTop: 8, marginBottom: 10 }}>
                Last event: <strong style={{ color: '#ffd6a5' }}>{lastEvent}</strong>
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <select
                    value={scenario}
                    onChange={(e) => setScenario(e.target.value)}
                    style={{
                        flex: 1,
                        background: '#181f45',
                        color: '#fff',
                        borderRadius: 8,
                        border: '1px solid rgba(255,255,255,0.2)',
                        padding: '8px 10px',
                        fontSize: 12
                    }}
                >
                    {SCENARIOS.map((item) => (
                        <option key={item} value={item}>{item}</option>
                    ))}
                </select>
                <button
                    onClick={startScenario}
                    style={{
                        border: 'none',
                        borderRadius: 8,
                        padding: '8px 12px',
                        cursor: 'pointer',
                        fontWeight: 700,
                        color: '#150f21',
                        background: 'linear-gradient(135deg, #ffadad, #ffd6a5)'
                    }}
                >
                    Start
                </button>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 10 }}>
                <input
                    type="checkbox"
                    checked={cinematicMode}
                    onChange={(e) => setCinematicMode(e.target.checked)}
                />
                Cinematic camera auto-focus
            </label>

            <div style={{ fontSize: 12, marginBottom: 6, color: '#ffcad4' }}>Chaos Buttons</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {CHAOS_EVENTS.map((event) => (
                    <div key={event.id} style={{ display: 'flex', gap: 4 }}>
                        <button
                            onClick={() => triggerChaos(event.id)}
                            style={{
                                flex: 1,
                                border: '1px solid rgba(255,255,255,0.12)',
                                background: 'rgba(255,255,255,0.06)',
                                color: '#f0f3ff',
                                borderRadius: 8,
                                padding: '7px 8px',
                                cursor: 'pointer',
                                fontSize: 11
                            }}
                        >
                            {event.label}
                        </button>
                        <button
                            onClick={() => castVote(event.id)}
                            title="Audience vote"
                            style={{
                                border: '1px solid rgba(255,255,255,0.12)',
                                background: 'rgba(255, 214, 165, 0.2)',
                                color: '#ffe5c2',
                                borderRadius: 8,
                                padding: '7px 8px',
                                cursor: 'pointer',
                                fontSize: 11
                            }}
                        >
                            Vote
                        </button>
                    </div>
                ))}
            </div>
            <div style={{ marginTop: 8, fontSize: 11, color: '#ffd6a5', minHeight: 16 }}>
                {voteStatus}
            </div>
        </FloatingPanel>
    );
}
