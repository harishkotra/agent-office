import React, { useState, useEffect, useRef } from 'react';
import { eventBus } from '../events';
import { getColyseusRoom } from '../game/Game';
import { FloatingPanel } from './FloatingPanel';

export function ChatPanel() {
    const [messages, setMessages] = useState<{ sender: string, text: string }[]>([
        { sender: 'Supervisor', text: 'Codex Supervisor activity bridge initialized.' }
    ]);
    const [input, setInput] = useState('');
    const endRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleChat = (e: any) => {
            setMessages(prev => [...prev, e.detail].slice(-40));
        };
        eventBus.addEventListener('chat-message', handleChat);
        return () => eventBus.removeEventListener('chat-message', handleChat);
    }, []);

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const send = () => {
        if (!input.trim()) return;
        const room = getColyseusRoom();
        if (room) {
            room.send('chat', { text: input });
            setInput('');
        } else {
            setMessages(prev => [...prev, { sender: 'System', text: 'Error: Cannot send message, Colyseus not connected.' }]);
        }
    };

    return (
        <FloatingPanel
            id="office-chat"
            title="Supervisor Activity"
            subtitle="Operator messages and lane events"
            width={320}
            defaultDock="right"
            defaultY={560}
            bodyMaxHeight={270}
            zIndex={17}
        >
            <div style={{ height: 220, display: 'flex', flexDirection: 'column' }}>
                <div style={{ flex: 1, overflowY: 'auto', fontSize: '12px', marginBottom: 10, paddingRight: 4 }}>
                    {messages.map((m, i) => (
                        <p key={i} style={{ margin: '6px 0', lineHeight: '1.4' }}>
                            <strong style={{ color: m.sender === 'System' ? '#00eeff' : '#aaffaa' }}>{m.sender}:</strong> {m.text}
                        </p>
                    ))}
                    <div ref={endRef} />
                </div>
                <input
                    type="text"
                    placeholder="Send a message..."
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && send()}
                    style={{ width: '100%', padding: '10px', boxSizing: 'border-box', background: '#1a1a3e', color: 'white', border: '1px solid #444', borderRadius: 6, outline: 'none' }}
                />
            </div>
        </FloatingPanel>
    );
}
