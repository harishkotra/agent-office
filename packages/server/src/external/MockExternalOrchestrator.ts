import {
    ExternalOrchestratorAdapter,
    ExternalAgentExecutionStatus
} from '@agent-office/core';

/**
 * ⚠️ DEMO / TEST DATA ONLY — Ciudadan AgentOffice.
 *
 * Generates clearly-identified fake agents and activity so the office UI
 * can be verified WITHOUT any LLM. Disabled by default; enabled with
 * EXTERNAL_DEMO_MODE=true. Every artifact it produces is prefixed with
 * "[DEMO]" so it can never be confused with real agent data.
 */

const DEMO_AGENTS: Array<{ id: string; name: string; role: string }> = [
    { id: 'demo-01', name: '[DEMO] Agente 1', role: 'Backend Developer' },
    { id: 'demo-02', name: '[DEMO] Agente 2', role: 'Frontend Developer' },
    { id: 'demo-03', name: '[DEMO] Agente 3', role: 'QA Engineer' },
    { id: 'demo-04', name: '[DEMO] Agente 4', role: 'DevOps' },
    { id: 'demo-05', name: '[DEMO] Agente 5', role: 'Product Manager' },
    { id: 'demo-06', name: '[DEMO] Agente 6', role: 'Designer' },
    { id: 'demo-07', name: '[DEMO] Agente 7', role: 'Tech Writer' }
];

const DEMO_TASKS = [
    'Refactor del módulo de autenticación',
    'Corregir bug en el panel de tareas',
    'Escribir tests de integración',
    'Preparar el despliegue en Oracle',
    'Actualizar la documentación de la API',
    'Diseñar el dashboard de métricas',
    'Revisar el PR #42'
];

const DEMO_THOUGHTS = [
    'Analizando el error de conexión…',
    'Revisando los cambios del último commit…',
    'Ejecutando la suite de tests…',
    'Esperando la revisión del código…',
    'Documentando los endpoints…'
];

const DEMO_MESSAGES = [
    '¿Alguien revisó el log del servidor?',
    'Termine la refactorización del módulo externo.',
    'Los tests pasan en local, subiendo los cambios.',
    'Necesito permisos para acceder al entorno de pruebas.',
    'Bloqueado esperando la respuesta del revisor.'
];

const DEMO_STATUSES: ExternalAgentExecutionStatus[] = [
    'idle', 'running', 'thinking', 'waiting_input', 'blocked', 'completed', 'error'
];

export class MockExternalOrchestrator {
    private timer: ReturnType<typeof setInterval> | null = null;
    private registered = false;
    private tick = 0;

    constructor(
        private readonly bridge: ExternalOrchestratorAdapter,
        private readonly intervalMs: number = 5000
    ) {}

    /** Registers the 7 demo agents (idempotent). */
    registerAll(): void {
        if (this.registered) return;
        for (const agent of DEMO_AGENTS) {
            const result = this.bridge.registerAgent(agent);
            if (!result.ok) {
                console.warn(`[DEMO] Could not register ${agent.id}: ${result.error}`);
            }
        }
        this.registered = true;
        console.log(
            `[DEMO] Registered ${DEMO_AGENTS.length} demo agents. ` +
            'These are TEST DATA, not real agents. Disable with EXTERNAL_DEMO_MODE=false.'
        );
    }

    start(): void {
        if (this.timer) return;
        this.registerAll();
        this.timer = setInterval(() => this.simulateTick(), this.intervalMs);
        console.log(`[DEMO] Simulation started (every ${this.intervalMs}ms).`);
    }

    stop(): void {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
            console.log('[DEMO] Simulation stopped.');
        }
    }

    private pick<T>(items: T[]): T {
        return items[Math.floor(Math.random() * items.length)];
    }

    private simulateTick(): void {
        this.tick++;
        const status = this.bridge.getStatus();
        const agents = status.agents.filter(a => a.id.startsWith('demo-'));
        if (agents.length === 0) return;

        const agent = this.pick(agents);

        switch (this.tick % 4) {
            case 0: {
                // Status + thought update
                const nextStatus = this.pick(DEMO_STATUSES);
                this.bridge.updateAgentState(agent.id, {
                    status: nextStatus,
                    thought: this.pick(DEMO_THOUGHTS)
                });
                break;
            }
            case 1: {
                // Task announcement
                const task = this.pick(DEMO_TASKS);
                this.bridge.pushTask(agent.id, { title: `[DEMO] ${task}`, status: 'in_progress' });
                break;
            }
            case 2: {
                // Chat message
                this.bridge.pushMessage(agent.id, { content: `[DEMO] ${this.pick(DEMO_MESSAGES)}` });
                break;
            }
            case 3: {
                // Session or issue report (alternating)
                if (this.tick % 8 === 3) {
                    this.bridge.updateSession(agent.id, {
                        state: 'active',
                        sessionId: `demo-session-${this.tick}`,
                        details: '[DEMO] simulated session'
                    });
                } else {
                    this.bridge.reportIssue(agent.id, {
                        severity: 'warning',
                        message: '[DEMO] Simulated warning for UI validation',
                        code: 'DEMO-WARN'
                    });
                }
                break;
            }
        }
    }
}
