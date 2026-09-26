import React, { useState, useEffect, useRef } from 'react';
import { eventBus } from '../events';
import { FloatingPanel } from './FloatingPanel';

interface LogEntry {
    id: number;
    agent: string;
    action: string;
    thought: string;
    time: string;
}

const actionIcons: Record<string, string> = {
    'work': '💻', 'talk': '💬', 'idle': '😌',
    'use_tool': '🔧', 'move': '🚶', 'think': '💡',
    'play_ping_pong': '🏓', 'play_arcade': '🕹️', 'sit_sofa': '🛋️',
    'coffee_break': '☕', 'browse_books': '📚', 'whiteboard_jam': '📝'
};

export function SystemLog() {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const scrollRef = useRef<HTMLDivElement>(null);
    const idRef = useRef(0);
    const lastEntryPerAgent = useRef<Record<string, string>>({});

    useEffect(() => {
        const handler = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            const key = `${detail.agent}:${detail.action}:${detail.thought}`;
            if (lastEntryPerAgent.current[detail.agent] === key) return;
            lastEntryPerAgent.current[detail.agent] = key;

            setLogs(prev => {
                const newLog: LogEntry = { id: idRef.current++, ...detail };
                return [...prev, newLog].slice(-30);
            });
        };
        eventBus.addEventListener('activity-log', handler);
        return () => eventBus.removeEventListener('activity-log', handler);
    }, []);

    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [logs]);

    return (
        <FloatingPanel
            id="system-log"
            title="📊 System Activity Log"
            subtitle="Deduped agent events"
            width={300}
            defaultDock="right"
            defaultY={330}
            bodyMaxHeight={180}
            zIndex={16}
        >
            <div ref={scrollRef} style={{ maxHeight: '28vh', overflowY: 'auto', fontSize: '10px', lineHeight: 1.5 }}>
                {logs.length === 0 && (
                    <p style={{ color: '#8f86aa', fontStyle: 'italic', margin: 0 }}>Waiting for agent events...</p>
                )}
                {logs.map(log => (
                    <div key={log.id} style={{
                        padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
                        display: 'flex', gap: 4, alignItems: 'flex-start'
                    }}>
                        <span style={{ opacity: 0.4, minWidth: 48 }}>{log.time}</span>
                        <span>{actionIcons[log.action] || '•'}</span>
                        <span>
                            <strong style={{ color: log.agent === 'Alice' ? '#aaffaa' : '#8ec5ff' }}>{log.agent}</strong>
                            {' '}
                            <span style={{ color: '#aaa' }}>{log.action}</span>
                            {log.thought && <span style={{ color: '#8d86a8', fontStyle: 'italic' }}> — "{log.thought.slice(0, 60)}"</span>}
                        </span>
                    </div>
                ))}
            </div>
        </FloatingPanel>
    );
}
