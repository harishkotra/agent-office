import React, { useState, useEffect } from 'react';
import { eventBus } from '../events';

/**
 * Live panel of the focused agent (click a sprite to focus, click again
 * to unfocus). Block 3 (FASE E): distinguishes explicitly between
 *   🔎 Actividad real observada  — direct evidence from the session
 *   ⚙  Estado derivado           — rule-based, documented (see docs)
 *   —  No disponible             — the source cannot provide it
 * No simulated conversations are ever shown as authentic Cline messages.
 */
const STATUS_LABELS: Record<string, string> = {
    working: 'Trabajando', editing: 'Editando', reading: 'Leyendo',
    testing: 'Ejecutando pruebas', waiting: 'Esperando respuesta',
    waiting_input: 'Esperando respuesta', blocked: 'Bloqueado',
    completed: 'Completado', offline: 'Desconectado', idle: 'Inactivo',
    running: 'Trabajando', thinking: 'Pensando', acting: 'Trabajando'
};

function relTime(updatedAt: number): string {
    if (!updatedAt) return '—';
    const secs = Math.max(0, Math.round((Date.now() - updatedAt) / 1000));
    if (secs < 60) return `hace ${secs}s`;
    return `hace ${Math.round(secs / 60)}min`;
}

function Row({ label, value, muted }: { label: string; value?: string | null; muted?: boolean }) {
    const missing = !value || value === '';
    return (
        <p style={{ margin: '3px 0', fontSize: '11px', color: muted ? '#999' : undefined }}>
            <strong style={{ color: '#b8c0ff' }}>{label}:</strong>{' '}
            {missing
                ? <span style={{ color: '#555', fontStyle: 'italic' }}>no disponible</span>
                : <span style={{ wordBreak: 'break-all' }}>{value}</span>}
        </p>
    );
}

export function AgentInspector() {
    const [agent, setAgent] = useState<any>(null);

    useEffect(() => {
        const handler = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            setAgent(detail || null);
        };
        eventBus.addEventListener('agent-focus', handler);
        return () => eventBus.removeEventListener('agent-focus', handler);
    }, []);

    // Refresh relative times ("hace Xs") while the panel is open.
    const [, forceTick] = useState(0);
    useEffect(() => {
        if (!agent) return;
        const t = setInterval(() => forceTick(n => n + 1), 5000);
        return () => clearInterval(t);
    }, [agent]);

    if (!agent) return null;

    return (
        <div style={{ position: 'absolute', right: 20, top: 90, width: 280, backgroundColor: 'rgba(0,0,0,0.85)', color: 'white', padding: 14, borderRadius: 8, border: '1px solid rgba(108,92,231,0.3)', zIndex: 10, maxHeight: '70vh', overflowY: 'auto' }}>
            <h3 style={{ margin: '0 0 6px 0', fontSize: '13px' }}>🔍 {agent.name}</h3>
            <p style={{ margin: '0 0 8px 0', fontSize: '10px', color: '#888' }}>{agent.role || 'Cline'}</p>

            {/* ⚙ Derived state (rule-based, documented) */}
            <div style={{ padding: '6px 8px', backgroundColor: 'rgba(108,92,231,0.12)', borderRadius: 6, marginBottom: 8 }}>
                <p style={{ margin: 0, fontSize: '11px' }}>
                    <strong>⚙ Estado:</strong> {STATUS_LABELS[agent.status] || agent.status || '—'}
                </p>
                <p style={{ margin: '2px 0 0 0', fontSize: '9px', color: '#777', fontStyle: 'italic' }}>
                    derivado por reglas de evidencia (docs/ciudadan)
                </p>
                <p style={{ margin: '4px 0 0 0', fontSize: '11px' }}>
                    <strong>Tarea:</strong> {agent.currentTask ? (
                        <span style={{ wordBreak: 'break-all' }}>{agent.currentTask}</span>
                    ) : <span style={{ color: '#555', fontStyle: 'italic' }}>no disponible</span>}
                </p>
            </div>

            {/* 🔎 Real observed evidence */}
            <div style={{ padding: '6px 8px', backgroundColor: 'rgba(0,184,148,0.10)', borderRadius: 6, marginBottom: 8 }}>
                <p style={{ margin: 0, fontSize: '10px', color: '#7fcdaa' }}>🔎 Actividad real observada</p>
                <Row label="Última herramienta" value={agent.lastTool} />
                <Row label="Última actividad" value={agent.updatedAt ? relTime(agent.updatedAt) : ''} />
                <Row label="Archivo activo" value={agent.activeFile} />
                <Row label="Sesión" value={agent.sessionType === 'interactive' ? 'Interactiva' : agent.sessionType === 'batch' ? 'Batch' : agent.sessionType} />
                <Row label="Rama Git" value={agent.gitBranch} />
                <Row label="Workspace" value={agent.workspace} />
                <Row label="Equipo/info" value={agent.session} />
            </div>

            {/* Error / blocked evidence */}
            {agent.error ? (
                <p style={{ margin: '0 0 8px 0', padding: '6px 8px', backgroundColor: 'rgba(214,48,49,0.25)', border: '1px solid rgba(214,48,49,0.5)', borderRadius: 6, fontSize: '11px' }}>
                    🚨 {agent.error.slice(0, 200)}
                </p>
            ) : null}

            {/* Allowed actions (Block 4) — honest availability */}
            <div style={{ padding: '6px 8px', backgroundColor: 'rgba(108,92,231,0.08)', borderRadius: 6 }}>
                <p style={{ margin: 0, fontSize: '10px', color: '#b8a9d4' }}>⚙ Acciones permitidas</p>
                <p style={{ margin: '3px 0 0 0', fontSize: '10px', color: '#aaa' }}>
                    📝 Enviar instrucción (requiere aprobación + credencial de control) — usa el Panel de Instrucciones abajo a la derecha.
                </p>
                <p style={{ margin: '3px 0 0 0', fontSize: '9px', color: '#777', fontStyle: 'italic' }}>
                    El envío real solo ocurre con un adaptador validado; nunca se simula.
                </p>
            </div>

            {/* Origin + freshness */}
            <p style={{ margin: 0, fontSize: '9px', color: '#666', borderTop: '1px solid #333', paddingTop: 6 }}>
                Origen: observación read-only de sesiones Cline · actualizado {relTime(agent.updatedAt)}
            </p>
        </div>
    );
}
