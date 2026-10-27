import React, { useState, useEffect, useCallback } from 'react';
import { controlJson } from '../controlApi';

/**
 * Block 4 (FASE E) — Instruction panel.
 *
 * Honest by design: an instruction is NEVER shown as sent/executed just
 * because a button was clicked. Pipeline:
 *   draft → pending_approval → approved → dispatched → acknowledged
 * With dispatch unavailable (this machine today), approved instructions
 * stay PENDING with the server-reported cause — never a fake success.
 * No arbitrary shell commands: free-text instructions to a validated
 * real session only.
 */
interface AgentCapability {
    id: string; name: string; status: string;
    kind: 'managed' | 'observed' | 'completed' | 'disconnected';
    controllable: boolean;
}
interface Capabilities {
    controlEnabled: boolean;
    dispatchConfigEnabled: boolean;
    capabilities: {
        sdkLoaded: boolean;
        hubConnected: boolean;
        hubSessions: number;
        dispatchAvailable: boolean;
        dispatchCause: string;
    };
    agents: AgentCapability[];
    dsh: string;
}
interface Instruction {
    requestId: string; sessionId: string; sessionName: string;
    prompt: string; state: string; pendingDispatchCause?: string; error?: string;
    dispatchedAt?: number; completedAt?: number; response?: string;
}

const STATE_LABELS: Record<string, { label: string; color: string }> = {
    draft: { label: 'Borrador', color: '#a29bfe' },
    pending_approval: { label: 'Pendiente de aprobación', color: '#fdcb6e' },
    approved: { label: 'Aprobada (pendiente de envío)', color: '#74b9ff' },
    dispatched: { label: 'Enviada al agente', color: '#55efc4' },
    acknowledged: { label: 'Recibida — ejecutándose', color: '#00cec9' },
    completed: { label: 'Completada (respuesta real)', color: '#00b894' },
    rejected: { label: 'Rechazada', color: '#ff7675' },
    failed: { label: 'Fallida', color: '#ff7675' }
};

const KIND_LABELS: Record<string, string> = {
    managed: '🎮 Gestionada por hub',
    observed: '👁 Observada (solo lectura)',
    completed: '✅ Finalizada',
    disconnected: '💤 Desconectada'
};

export function InstructionPanel() {
    const [caps, setCaps] = useState<Capabilities | null>(null);
    const [instructions, setInstructions] = useState<Instruction[]>([]);
    const [selected, setSelected] = useState<string>('');
    const [prompt, setPrompt] = useState('');
    const [confirming, setConfirming] = useState<Instruction | null>(null);
    const [message, setMessage] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        const capData = await controlJson<Capabilities>('/capabilities');
        if (capData.ok) setCaps(capData as Capabilities);
        const insData = await controlJson<{ instructions: Instruction[] }>('/instructions');
        if (insData.ok) setInstructions(insData.instructions || []);
    }, []);

    useEffect(() => { void refresh(); const t = setInterval(refresh, 5000); return () => clearInterval(t); }, [refresh]);

    const act = async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
        const result = await fn();
        setMessage(result.ok ? null : `⚠️ ${result.error || 'error'}`);
        void refresh();
    };

    const startDraft = async () => {
        if (!selected || !prompt.trim()) return;
        const requestId = (crypto as any).randomUUID?.() || `req_${Date.now()}`;
        await act(() => controlJson('/instructions', {
            method: 'POST',
            body: JSON.stringify({ requestId, sessionId: selected, prompt: prompt.trim() })
        }));
        setPrompt('');
    };

    const dispatch = caps?.capabilities.dispatchAvailable ?? false;
    const agent = caps?.agents.find(a => a.id === selected);

    // Block 5 (FASE B): only HUB-MANAGED sessions may receive
    // instructions; observed TUI sessions are read-only by nature.
    const controllableAgents = (caps?.agents || []).filter(a => a.controllable);
    const canCreateDraft = Boolean(selected) && Boolean(prompt.trim()) && Boolean(agent?.controllable);

    return (
        <div style={{
            position: 'absolute', right: 20, bottom: 20, width: 330,
            backgroundColor: 'rgba(10,10,30,0.92)', color: 'white',
            padding: 14, borderRadius: 12, border: '1px solid rgba(108,92,231,0.3)',
            maxHeight: '55vh', overflowY: 'auto', zIndex: 10
        }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '13px' }}>🎯 Panel de Instrucciones</h3>

            {/* Dispatch availability — honest, server-reported */}
            <p style={{
                margin: '0 0 8px 0', fontSize: '10px', padding: '5px 8px', borderRadius: 6,
                background: dispatch ? 'rgba(0,184,148,0.12)' : 'rgba(253,203,110,0.10)',
                color: dispatch ? '#55efc4' : '#fdcb6e'
            }}>
                {dispatch
                    ? '✅ Envío validado contra el hub de Cline.'
                    : `🔒 ENVÍO DESHABILITADO — ${caps?.capabilities.dispatchCause || 'verificando capacidades…'}`}
            </p>

            <select value={selected} onChange={(e) => setSelected(e.target.value)}
                style={{ width: '100%', padding: '6px', borderRadius: 6, border: '1px solid #444', background: '#1a1a3e', color: 'white', fontSize: '11px', marginBottom: 6 }}>
                <option value="">— selecciona agente (sesión real) —</option>
                {(caps?.agents || []).map(a => (
                    <option key={a.id} value={a.id} style={{ color: a.controllable ? '#55efc4' : '#888' }}>
                        {a.name} · {KIND_LABELS[a.kind] || a.kind}
                    </option>
                ))}
            </select>
            {agent && !agent.controllable && (
                <p style={{ margin: '0 0 6px 0', fontSize: '9px', color: '#ff7675' }}>
                    ⚠ Esta sesión es {KIND_LABELS[agent.kind] || agent.kind}: NO admite instrucciones. Selecciona una sesión 🎮 gestionada por hub.
                </p>
            )}
            {agent && agent.controllable && (
                <p style={{ margin: '0 0 6px 0', fontSize: '9px', color: '#55efc4' }}>
                    sesión real: {agent.id}
                </p>
            )}
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)}
                placeholder="Instrucción para el agente (solo se envía tras aprobación explícita)…"
                style={{ width: '100%', height: 52, padding: '6px 8px', borderRadius: 6, border: '1px solid #444', background: '#1a1a3e', color: 'white', fontSize: '11px', boxSizing: 'border-box', resize: 'none' }} />
            <button onClick={() => void startDraft()} disabled={!canCreateDraft}
                style={{ width: '100%', marginTop: 4, padding: '6px', borderRadius: 6, border: 'none', background: !canCreateDraft ? '#2d3436' : '#6c5ce7', color: 'white', fontSize: '11px', cursor: 'pointer' }}>
                📝 Guardar borrador {agent && !agent.controllable ? '(solo sesiones 🎮)' : ''}
            </button>

            {message && <p style={{ margin: '6px 0 0 0', fontSize: '10px', color: '#ff7675' }}>{message}</p>}

            <div style={{ marginTop: 10 }}>
                {instructions.length === 0 && (
                    <p style={{ color: '#555', fontSize: '10px', fontStyle: 'italic' }}>sin instrucciones</p>
                )}
                {instructions.slice(0, 8).map(ins => {
                    const meta = STATE_LABELS[ins.state] || { label: ins.state, color: '#888' };
                    return (
                        <div key={ins.requestId} style={{ padding: '6px 8px', marginBottom: 5, borderRadius: 6, background: 'rgba(255,255,255,0.05)', borderLeft: `3px solid ${meta.color}` }}>
                            <div style={{ fontSize: '11px' }}>
                                <strong>{ins.sessionName}</strong>: {ins.prompt.slice(0, 60)}{ins.prompt.length > 60 ? '…' : ''}
                            </div>
                            <div style={{ fontSize: '9px', color: meta.color, marginTop: 2 }}>{meta.label}</div>
                            {ins.pendingDispatchCause && (
                                <div style={{ fontSize: '9px', color: '#888', marginTop: 2 }}>⏸ {ins.pendingDispatchCause.slice(0, 100)}</div>
                            )}
                            {ins.response && (
                                <div style={{ fontSize: '9px', color: '#7fcdaa', marginTop: 2, background: 'rgba(0,184,148,0.08)', padding: '3px 5px', borderRadius: 4 }}>
                                    💬 {ins.response.slice(0, 120)}
                                </div>
                            )}
                            {ins.error && <div style={{ fontSize: '9px', color: '#ff7675', marginTop: 2 }}>⚠ {ins.error.slice(0, 100)}</div>}
                            {ins.state === 'draft' && (
                                <button onClick={() => void act(() => controlJson(`/instructions/${ins.requestId}/submit`, { method: 'POST' }))}
                                    style={{ marginTop: 4, fontSize: '10px', padding: '3px 8px', borderRadius: 4, border: 'none', background: '#6c5ce7', color: 'white', cursor: 'pointer' }}>
                                    Enviar a aprobación
                                </button>
                            )}
                            {ins.state === 'pending_approval' && (
                                <span style={{ display: 'inline-flex', gap: 4, marginTop: 4 }}>
                                    <button onClick={() => setConfirming(ins)}
                                        style={{ fontSize: '10px', padding: '3px 8px', borderRadius: 4, border: 'none', background: '#00b894', color: 'white', cursor: 'pointer' }}>
                                        Revisar y aprobar
                                    </button>
                                    <button onClick={() => void act(() => controlJson(`/instructions/${ins.requestId}/reject`, { method: 'POST', body: JSON.stringify({ reason: 'descartada' }) }))}
                                        style={{ fontSize: '10px', padding: '3px 8px', borderRadius: 4, border: 'none', background: '#d63031', color: 'white', cursor: 'pointer' }}>
                                        Rechazar
                                    </button>
                                </span>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Explicit confirmation modal (UI convenience only — the
                real authorization is the server-side control token) */}
            {confirming && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100
                }}>
                    <div style={{ background: '#16162e', padding: 18, borderRadius: 10, border: '1px solid #6c5ce7', maxWidth: 420 }}>
                        <h4 style={{ margin: '0 0 8px 0', color: 'white' }}>Confirmar instrucción</h4>
                        <p style={{ fontSize: '11px', color: '#ccc', margin: '0 0 4px 0' }}>
                            <strong>Agente:</strong> {confirming.sessionName} <span style={{ color: '#888' }}>({confirming.sessionId})</span>
                        </p>
                        <p style={{ fontSize: '11px', color: '#ccc', margin: '0 0 8px 0' }}>
                            <strong>Instrucción:</strong> {confirming.prompt}
                        </p>
                        <p style={{ fontSize: '10px', color: dispatch ? '#55efc4' : '#fdcb6e', margin: '0 0 10px 0' }}>
                            {dispatch
                                ? 'Se enviará al hub de Cline tras aprobar.'
                                : '⚠ El envío está deshabilitado: la instrucción quedará APROBADA PENDIENTE con la causa documentada (nunca se simulará el envío).'}
                        </p>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button
                                onClick={() => { const target = confirming; setConfirming(null); void act(() => controlJson(`/instructions/${target.requestId}/approve`, { method: 'POST' })); }}
                                style={{ padding: '6px 12px', borderRadius: 6, border: 'none', background: '#00b894', color: 'white', cursor: 'pointer', fontSize: '11px' }}>
                                Aprobar
                            </button>
                            <button onClick={() => setConfirming(null)}
                                style={{ padding: '6px 12px', borderRadius: 6, border: 'none', background: '#2d3436', color: '#ccc', cursor: 'pointer', fontSize: '11px' }}>
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
