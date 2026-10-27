/**
 * Ciudadan AgentOffice — Block 2: DSH (DeepSeek Harness) observation
 * adapter slot (FASE C).
 *
 * ⚠️ IMPEDIMENT VERIFIED DURING BLOCK 2 INSPECTION (2026-10-10):
 * DSH is NOT installed on this Oracle machine. Verified through:
 *   - No process matching dsh/deepseek/harness (ps aux)
 *   - No package in the global npm registry (only cline, corepack, npm)
 *   - No candidate directory in /, /opt, /srv, /usr/local, /home, /workspace
 *   - No Docker available (no containers at all)
 *
 * Per the block instructions ("documentar el impedimento y completar
 * las partes independientes. No introducir soluciones invasivas"), the
 * DSH adapter interface is implemented and ready, but the concrete
 * HTTP source is left RESERVED until a real DSH endpoint exists.
 * DSH_SOURCE=http will fail fast with a clear message instead of
 * pretending to work.
 *
 * DSH remains the source of truth for the tasks it administers; this
 * adapter is strictly read-only observation — it never creates, assigns
 * or executes tasks, and AgentOffice never becomes a second
 * orchestrator.
 */

/** A task administered by an orchestrator (DSH). */
export interface DshTask {
    id: string;
    title: string;
    status: string;
    assigneeId?: string | null;
    assigneeName?: string | null;
    dependsOn?: string[];
    summary?: string | null;
    updatedAt?: string | null;
}

/** Result of one DSH observation cycle. */
export interface DshObservation {
    /** Whether a real DSH endpoint is currently observable. */
    available: boolean;
    /** Machine-readable source id. */
    source: 'not-installed' | 'http' | 'none';
    /** Human-readable explanation (shown in logs, never secrets). */
    description: string;
    /** Tasks administered by DSH (empty while unavailable). */
    tasks: DshTask[];
}

/** Read-only observation contract for DSH (FASE C). */
export interface DshAdapter {
    observe(): Promise<DshObservation>;
    describe(): string;
}

/** Adapter used while no real DSH exists (documents the impediment). */
export class UnavailableDshAdapter implements DshAdapter {
    async observe(): Promise<DshObservation> {
        return {
            available: false,
            source: 'not-installed',
            description:
                'DSH (DeepSeek Harness) no está instalado en esta máquina ' +
                '(verificado en la inspección del Bloque 2). El adaptador queda ' +
                'listo; configura DSH_SOURCE=http + DSH_URL cuando exista un ' +
                'endpoint real. DSH seguirá siendo la fuente de verdad de sus tareas.',
            tasks: []
        };
    }

    describe(): string {
        return 'dsh:not-installed (slot ready, endpoint pending)';
    }
}

/**
 * RESERVED for Block 3+: an HTTP-based read-only DSH adapter.
 * Instantiating it today is a configuration error (fail fast, never
 * pretend).
 */
export class HttpDshAdapter implements DshAdapter {
    constructor(private readonly baseUrl: string) {
        throw new Error(
            `[DSH] DSH_SOURCE=http está reservado pero aún no hay un endpoint DSH real. ` +
            `Se recibió DSH_URL=${baseUrl}. Despliega DSH primero; el adaptador ` +
            `de observación se completará entonces. Usa DSH_SOURCE=none mientras tanto.`
        );
    }

    async observe(): Promise<DshObservation> {
        return { available: false, source: 'http', description: 'unavailable', tasks: [] };
    }

    describe(): string {
        return 'dsh:http (reserved)';
    }
}
