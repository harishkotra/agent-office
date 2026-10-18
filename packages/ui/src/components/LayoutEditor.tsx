import React, { useEffect, useState } from 'react';
import { getColyseusRoom } from '../game/Game';
import { eventBus } from '../events';
import { FloatingPanel } from './FloatingPanel';

interface FurnitureItem {
    id: string;
    type: 'desk' | 'plant' | 'bookshelf' | 'coffee_machine' | 'table' | 'chair' | 'whiteboard';
    x: number;
    y: number;
    label?: string;
}

const FURNITURE_PALETTE: { type: FurnitureItem['type']; emoji: string; label: string }[] = [
    { type: 'desk', emoji: '🖥️', label: 'Desk' },
    { type: 'plant', emoji: '🌿', label: 'Plant' },
    { type: 'bookshelf', emoji: '📚', label: 'Bookshelf' },
    { type: 'coffee_machine', emoji: '☕', label: 'Coffee' },
    { type: 'table', emoji: '🪑', label: 'Table' },
    { type: 'chair', emoji: '💺', label: 'Chair' },
    { type: 'whiteboard', emoji: '📝', label: 'Board' },
];

export function LayoutEditor() {
    const [items, setItems] = useState<FurnitureItem[]>([]);
    const [selected, setSelected] = useState<FurnitureItem['type']>('desk');
    const [moveMode, setMoveMode] = useState(false);

    useEffect(() => {
        const syncHandler = (e: Event) => {
            const detail = (e as CustomEvent).detail as { items: FurnitureItem[] };
            if (!Array.isArray(detail?.items)) return;
            setItems(detail.items.map((item, idx) => ({
                ...item,
                id: item.id || `item_sync_${idx}`,
                label: item.label || FURNITURE_PALETTE.find((f) => f.type === item.type)?.label
            })));
        };
        const movedHandler = (e: Event) => {
            const detail = (e as CustomEvent).detail as { items: FurnitureItem[] };
            if (!Array.isArray(detail?.items)) return;
            setItems(detail.items as FurnitureItem[]);
        };
        eventBus.addEventListener('layout-sync', syncHandler);
        eventBus.addEventListener('layout-item-moved', movedHandler);
        return () => {
            eventBus.removeEventListener('layout-sync', syncHandler);
            eventBus.removeEventListener('layout-item-moved', movedHandler);
        };
    }, []);

    useEffect(() => {
        eventBus.dispatchEvent(new CustomEvent('layout-preview-update', { detail: { items } }));
    }, [items]);

    useEffect(() => {
        eventBus.dispatchEvent(new CustomEvent('layout-edit-mode', { detail: { enabled: moveMode } }));
    }, [moveMode]);

    const addItem = () => {
        const newItem: FurnitureItem = {
            id: `item_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            type: selected,
            x: Math.floor(Math.random() * 58) + 3,
            y: Math.floor(Math.random() * 58) + 3,
            label: FURNITURE_PALETTE.find(f => f.type === selected)?.label
        };
        setItems(prev => [...prev, newItem]);
    };

    const removeItem = (id: string) => setItems(prev => prev.filter(i => i.id !== id));

    const nudgeItem = (id: string, dx: number, dy: number) => {
        setItems(prev => prev.map((item) => item.id !== id ? item : {
            ...item,
            x: Math.max(3, Math.min(60, item.x + dx)),
            y: Math.max(3, Math.min(60, item.y + dy))
        }));
    };

    const saveLayout = () => {
        const room = getColyseusRoom();
        if (room) room.send('save-layout', { name: 'default', layout: items });
    };

    return (
        <FloatingPanel
            id="layout-editor"
            title="🏗️ Office Layout Editor"
            subtitle="Optional prop placement"
            width={310}
            defaultDock="left"
            defaultY={650}
            bodyMaxHeight={220}
            zIndex={19}
        >
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '11px', marginBottom: 8, color: '#c9cff8' }}>
                <input type="checkbox" checked={moveMode} onChange={(e) => setMoveMode(e.target.checked)} />
                Drag items with mouse on canvas
            </label>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
                {FURNITURE_PALETTE.map(f => (
                    <button
                        key={f.type}
                        onClick={() => setSelected(f.type)}
                        style={{
                            padding: '4px 8px', borderRadius: 6, border: 'none',
                            backgroundColor: selected === f.type ? '#6c5ce7' : '#2d2d4d',
                            color: 'white', cursor: 'pointer', fontSize: '11px'
                        }}
                    >
                        {f.emoji} {f.label}
                    </button>
                ))}
            </div>

            <button onClick={addItem} style={{
                padding: '6px', borderRadius: 6, border: 'none',
                backgroundColor: '#00b894', color: 'white', cursor: 'pointer',
                fontSize: '11px', fontWeight: 'bold', marginBottom: 8
            }}>
                + Add {FURNITURE_PALETTE.find(f => f.type === selected)?.label}
            </button>

            <div style={{ maxHeight: '24vh', overflowY: 'auto', fontSize: '11px', marginBottom: 8 }}>
                {items.length === 0 && (
                    <p style={{ color: '#8f86aa', fontStyle: 'italic', margin: 0 }}>
                        Select furniture type and click Add to place items.
                    </p>
                )}
                {items.map(item => (
                    <div key={item.id} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '4px 6px', marginBottom: 2, borderRadius: 4,
                        backgroundColor: 'rgba(255,255,255,0.05)'
                    }}>
                        <span>{FURNITURE_PALETTE.find(f => f.type === item.type)?.emoji} {item.label} ({Math.round(item.x)},{Math.round(item.y)})</span>
                        <div style={{ display: 'flex', gap: 2 }}>
                            <button onClick={() => nudgeItem(item.id, -1, 0)} style={{ background: 'none', border: 'none', color: '#8ecae6', cursor: 'pointer', fontSize: '11px' }}>◀</button>
                            <button onClick={() => nudgeItem(item.id, 1, 0)} style={{ background: 'none', border: 'none', color: '#8ecae6', cursor: 'pointer', fontSize: '11px' }}>▶</button>
                            <button onClick={() => nudgeItem(item.id, 0, -1)} style={{ background: 'none', border: 'none', color: '#8ecae6', cursor: 'pointer', fontSize: '11px' }}>▲</button>
                            <button onClick={() => nudgeItem(item.id, 0, 1)} style={{ background: 'none', border: 'none', color: '#8ecae6', cursor: 'pointer', fontSize: '11px' }}>▼</button>
                            <button onClick={() => removeItem(item.id)} style={{ background: 'none', border: 'none', color: '#e17055', cursor: 'pointer', fontSize: '12px' }}>🗑</button>
                        </div>
                    </div>
                ))}
            </div>

            <button onClick={saveLayout} style={{
                padding: '8px', borderRadius: 6, border: 'none',
                backgroundColor: '#6c5ce7', color: 'white', cursor: 'pointer',
                fontSize: '12px', fontWeight: 'bold'
            }}>
                💾 Save Layout
            </button>
        </FloatingPanel>
    );
}
