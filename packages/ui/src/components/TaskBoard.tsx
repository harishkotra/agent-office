import React, { useState, useEffect } from 'react';
import { getColyseusRoom } from '../game/Game';
import { eventBus } from '../events';
import { FloatingPanel } from './FloatingPanel';

interface TaskItem {
    id: number;
    title: string;
    assigned_to: string;
    status: string;
}

const AGENT_OPTIONS = [
    { id: 'supervisor-0', label: 'CEO / Operator' },
    { id: 'supervisor-1', label: 'General Manager' },
    { id: 'supervisor-2', label: 'Debug Lane' },
    { id: 'supervisor-3', label: 'Validator Lane' },
    { id: 'supervisor-4', label: 'Dynamic Worker' },
    { id: 'supervisor-5', label: 'TUI Pane' },
];

export function TaskBoard() {
    const [tasks, setTasks] = useState<TaskItem[]>([]);
    const [newTask, setNewTask] = useState('');
    const [targetAgent, setTargetAgent] = useState('auto');

    useEffect(() => {
        const handleTaskUpdate = (event: Event) => {
            const data = (event as CustomEvent).detail;
            setTasks(prev => {
                const existing = prev.find(t => t.title === data.task);
                if (existing) {
                    return prev.map(t => t.title === data.task ? { ...t, status: data.status, assigned_to: data.agentId } : t);
                }
                return [...prev, { id: Date.now(), title: data.task, assigned_to: data.agentId, status: data.status }];
            });
        };
        const handleTasksSync = (event: Event) => {
            const serverTasks = (event as CustomEvent).detail as any[];
            setTasks(serverTasks.map(t => ({
                id: t.id,
                title: t.title,
                assigned_to: t.assigned_to || '',
                status: t.status
            })));
        };
        eventBus.addEventListener('task-update', handleTaskUpdate);
        eventBus.addEventListener('tasks-sync', handleTasksSync);
        return () => {
            eventBus.removeEventListener('task-update', handleTaskUpdate);
            eventBus.removeEventListener('tasks-sync', handleTasksSync);
        };
    }, []);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTask.trim()) return;
        const room = getColyseusRoom();
        if (room) {
            room.send('assign-task', { title: newTask, agentId: targetAgent === 'auto' ? undefined : targetAgent });
            setNewTask('');
        }
    };

    const statusColor = (s: string) => {
        if (s === 'completed') return '#00b894';
        if (s === 'in_progress') return '#fdcb6e';
        return '#dfe6e9';
    };

    const statusIcon = (s: string) => {
        if (s === 'completed') return '✅';
        if (s === 'in_progress') return '🔄';
        return '⏳';
    };

    return (
        <FloatingPanel
            id="task-board"
            title="📋 Task Board"
            subtitle="Assignments and production work"
            width={300}
            defaultDock="left"
            defaultY={430}
            bodyMaxHeight={220}
            zIndex={20}
        >
            <form onSubmit={handleSubmit} style={{ marginBottom: 10 }}>
                <input
                    type="text"
                    value={newTask}
                    onChange={(e) => setNewTask(e.target.value)}
                    placeholder="Assign a task..."
                    style={{
                        width: '100%', padding: '8px 10px', borderRadius: 6,
                        border: '1px solid #444', backgroundColor: '#1a1a3e',
                        color: 'white', fontSize: '12px', outline: 'none',
                        boxSizing: 'border-box', marginBottom: 6
                    }}
                />
                <div style={{ display: 'flex', gap: 6 }}>
                    <select
                        value={targetAgent}
                        onChange={(e) => setTargetAgent(e.target.value)}
                        style={{
                            flex: 1, padding: '6px', borderRadius: 6,
                            border: '1px solid #444', backgroundColor: '#1a1a3e',
                            color: '#aaa', fontSize: '11px'
                        }}
                    >
                        <option value="auto">🤖 Auto-assign</option>
                        {AGENT_OPTIONS.map((agent) => (
                            <option key={agent.id} value={agent.id}>{agent.label}</option>
                        ))}
                    </select>
                    <button type="submit" style={{
                        padding: '6px 14px', borderRadius: 6, border: 'none',
                        backgroundColor: '#6c5ce7', color: 'white', fontSize: '11px',
                        cursor: 'pointer', fontWeight: 'bold'
                    }}>
                        Assign
                    </button>
                </div>
            </form>

            <div style={{ maxHeight: '30vh', overflowY: 'auto', fontSize: '12px' }}>
                {tasks.length === 0 && (
                    <p style={{ color: '#8f86aa', fontStyle: 'italic', margin: 0, fontSize: '11px' }}>
                        No tasks yet. Type above to assign work to agents!
                    </p>
                )}
                {tasks.map(task => (
                    <div key={task.id} style={{
                        padding: '6px 8px', marginBottom: 4, borderRadius: 6,
                        backgroundColor: 'rgba(255,255,255,0.05)',
                        borderLeft: `3px solid ${statusColor(task.status)}`
                    }}>
                        <div style={{ fontWeight: 'bold', fontSize: '11px' }}>
                            {statusIcon(task.status)} {task.title}
                        </div>
                        <div style={{ fontSize: '10px', color: '#888', marginTop: 2 }}>
                            → {task.assigned_to || 'Unassigned'}
                        </div>
                    </div>
                ))}
            </div>

            <div style={{ marginTop: 8, fontSize: '10px', color: '#77718c', borderTop: '1px solid #333', paddingTop: 6 }}>
                🧭 Source: csup state files • 🖥️ tmux TUI panes
            </div>
        </FloatingPanel>
    );
}
