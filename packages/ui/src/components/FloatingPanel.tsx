import React, { useEffect, useMemo, useState } from 'react';

type Position = { x: number; y: number };

const PANEL_LAYOUT_VERSION = 'v7-visible-panes-reset';
const HUD_ACCENT_COLORS = ['#58d5ff', '#d36bff', '#66e28d', '#ffcf70', '#43e0c5', '#ff83d1'];

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

function accentForPanel(id: string): string {
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = (hash * 33 + id.charCodeAt(i)) >>> 0;
    return HUD_ACCENT_COLORS[hash % HUD_ACCENT_COLORS.length];
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
    const accent = useMemo(() => accentForPanel(id), [id]);

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
            borderRadius: 16,
            overflow: 'hidden',
            border: `1px solid ${accent}66`,
            background: `
                radial-gradient(circle at 18% 0%, ${accent}2e, transparent 42%),
                linear-gradient(135deg, rgba(6,8,18,0.96), rgba(19,19,38,0.91) 48%, rgba(8,10,22,0.96))
            `,
            color: '#f4f8ff',
            boxShadow: `0 18px 44px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.18), 0 0 28px ${accent}22`,
            backdropFilter: 'blur(10px) saturate(1.25)',
            fontFamily: '"Avenir Next", "Trebuchet MS", system-ui, sans-serif'
        }} data-testid={`hud-panel-${id}`}>
            <div style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: 0,
                height: 3,
                background: `linear-gradient(90deg, transparent, ${accent}, transparent)`,
                opacity: 0.92,
                pointerEvents: 'none'
            }} />
            <div style={{
                position: 'absolute',
                inset: 1,
                borderRadius: 15,
                border: '1px solid rgba(255,255,255,0.06)',
                pointerEvents: 'none'
            }} />
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
                    padding: '10px 11px 9px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    borderBottom: minimized ? 'none' : `1px solid ${accent}33`,
                    background: `linear-gradient(90deg, rgba(255,255,255,0.075), ${accent}1f 46%, rgba(255,255,255,0.03))`,
                    boxShadow: 'inset 0 -1px 0 rgba(0,0,0,0.24)'
                }}
            >
                <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 9 }}>
                    <div style={{
                        width: 8,
                        height: 8,
                        borderRadius: 999,
                        flex: '0 0 auto',
                        background: accent,
                        boxShadow: `0 0 16px ${accent}88`
                    }} />
                    <div style={{ minWidth: 0 }}>
                        <div style={{
                            fontSize: 12,
                            fontWeight: 800,
                            letterSpacing: '0.06em',
                            textTransform: 'uppercase',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                        }}>{title}</div>
                        {subtitle && <div style={{
                            fontSize: 10,
                            color: 'rgba(230,238,255,0.68)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                        }}>{subtitle}</div>}
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: '0 0 auto' }}>
                    <span style={{
                        border: `1px solid ${accent}55`,
                        color: accent,
                        borderRadius: 999,
                        padding: '2px 6px',
                        fontSize: 9,
                        fontWeight: 800,
                        letterSpacing: '0.08em',
                        background: `${accent}14`
                    }}>LIVE</span>
                    <button
                        onClick={() => setMinimized((value) => !value)}
                        style={{
                            border: `1px solid ${accent}55`,
                            borderRadius: 8,
                            width: 26,
                            height: 24,
                            cursor: 'pointer',
                            color: '#f4f8ff',
                            background: 'rgba(255,255,255,0.08)',
                            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12)'
                        }}
                        title={minimized ? 'Expand panel' : 'Minimize panel'}
                    >
                        {minimized ? '+' : '-'}
                    </button>
                </div>
            </div>

            {!minimized && (
                <div style={{
                    padding: 11,
                    maxHeight: bodyMaxHeight,
                    overflowY: bodyMaxHeight ? 'auto' : undefined,
                    background: 'linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.015))'
                }}>
                    {children}
                </div>
            )}
        </div>
    );
}
