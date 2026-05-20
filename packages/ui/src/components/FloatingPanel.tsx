import React, { useEffect, useMemo, useState } from 'react';

type Position = { x: number; y: number };

const PANEL_LAYOUT_VERSION = 'v7-visible-panes-reset';

interface FloatingPanelProps {
    id: string;
    title: string;
    width: number;
    defaultY?: number;
    defaultDock?: 'left' | 'center' | 'right';
    defaultMinimized?: boolean;
    bodyMaxHeight?: number;
    zIndex?: number;
    children: React.ReactNode;
    subtitle?: string;
}

function clampPosition(pos: Position, width: number): Position {
    if (typeof window === 'undefined') return pos;
    const maxX = Math.max(8, window.innerWidth - width - 8);
    const maxY = Math.max(8, window.innerHeight - 44);
    return {
        x: Math.max(8, Math.min(maxX, pos.x)),
        y: Math.max(8, Math.min(maxY, pos.y))
    };
}

export function FloatingPanel({
    id,
    title,
    width,
    defaultY = 20,
    defaultDock = 'right',
    defaultMinimized = false,
    zIndex = 14,
    subtitle,
    bodyMaxHeight,
    children
}: FloatingPanelProps) {
    const storageKey = useMemo(() => `panel:${id}:state:${PANEL_LAYOUT_VERSION}`, [id]);

    const [position, setPosition] = useState<Position>(() => {
        if (typeof window === 'undefined') return { x: 20, y: defaultY };
        try {
            const raw = window.localStorage.getItem(storageKey);
            if (raw && defaultMinimized) {
                const parsed = JSON.parse(raw) as { x: number; y: number };
                return clampPosition({ x: parsed.x, y: parsed.y }, width);
            }
        } catch {
            // Ignore corrupt state.
        }
        const dockX = defaultDock === 'right'
            ? Math.max(8, window.innerWidth - width - 24)
            : defaultDock === 'center'
                ? Math.max(8, Math.round((window.innerWidth - width) / 2))
                : 24;
        return { x: dockX, y: defaultY };
    });

    const [minimized, setMinimized] = useState<boolean>(() => {
        if (typeof window === 'undefined') return defaultMinimized;
        try {
            const raw = window.localStorage.getItem(storageKey);
            if (raw && defaultMinimized) {
                const parsed = JSON.parse(raw) as { minimized?: boolean };
                if (typeof parsed.minimized === 'boolean') return parsed.minimized;
            }
        } catch {
            // Ignore corrupt state.
        }
        return defaultMinimized;
    });

    const [dragOffset, setDragOffset] = useState<{ dx: number; dy: number } | null>(null);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        window.localStorage.setItem(storageKey, JSON.stringify({ ...position, minimized }));
    }, [position, minimized, storageKey]);

    useEffect(() => {
        if (!dragOffset) return;

        const onMove = (event: MouseEvent) => {
            const next = clampPosition(
                { x: event.clientX - dragOffset.dx, y: event.clientY - dragOffset.dy },
                width
            );
            setPosition(next);
        };

        const onUp = () => setDragOffset(null);

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);

        return () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
    }, [dragOffset, width]);

    return (
        <div style={{
            position: 'absolute',
            left: position.x,
            top: position.y,
            width,
            zIndex,
            borderRadius: 12,
            overflow: 'hidden',
            border: '1px solid rgba(255,255,255,0.2)',
            backgroundColor: 'rgba(7, 10, 20, 0.86)',
            color: '#f4f8ff',
            boxShadow: '0 10px 26px rgba(0,0,0,0.42)',
            backdropFilter: 'blur(6px)'
        }}>
            <div
                onMouseDown={(event) => {
                    const target = event.target as HTMLElement;
                    if (target.closest('button') || target.closest('input') || target.closest('select')) {
                        return;
                    }
                    setDragOffset({
                        dx: event.clientX - position.x,
                        dy: event.clientY - position.y
                    });
                }}
                style={{
                    cursor: 'grab',
                    padding: '9px 10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderBottom: minimized ? 'none' : '1px solid rgba(255,255,255,0.1)',
                    background: 'linear-gradient(90deg, rgba(28,33,71,0.8), rgba(72,31,51,0.65))'
                }}
            >
                <div>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>{title}</div>
                    {subtitle && <div style={{ fontSize: 10, opacity: 0.75 }}>{subtitle}</div>}
                </div>
                <button
                    onClick={() => setMinimized((value) => !value)}
                    style={{
                        border: '1px solid rgba(255,255,255,0.2)',
                        borderRadius: 6,
                        width: 24,
                        height: 22,
                        cursor: 'pointer',
                        color: '#f4f8ff',
                        background: 'rgba(255,255,255,0.08)'
                    }}
                    title={minimized ? 'Expand panel' : 'Minimize panel'}
                >
                    {minimized ? '+' : '-'}
                </button>
            </div>

            {!minimized && (
                <div style={{ padding: 10, maxHeight: bodyMaxHeight, overflowY: bodyMaxHeight ? 'auto' : undefined }}>
                    {children}
                </div>
            )}
        </div>
    );
}
