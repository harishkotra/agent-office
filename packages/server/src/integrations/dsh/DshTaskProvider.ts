import { OfficeTask, OfficeSprint, TaskProvider } from '../tasks/TaskStore';

/**
 * Block 4 (FASE G) — DSH task provider contract.
 *
 * DSH (DeepSeek Harness) remains the AUTHORITATIVE source for the tasks
 * it administers. This contract lets a future real DSH integration:
 *   - fetch tasks and their dependencies
 *   - submit AgentOffice proposals
 *   - request assignments
 *   - query results
 *   - notify blockers
 *
 * No endpoints are invented: while no real DSH exists, every operation
 * reports `available: false` with a clear explanation. Swapping
 * `UnavailableDshTaskProvider` for a real implementation is the ONLY
 * change required — the office engine never depends on DSH internals.
 */
export interface DshProviderResult<T> {
    available: boolean;
    data?: T;
    reason?: string;
}

export interface DshTaskProvider extends TaskProvider {
    /** Whether a real DSH endpoint is currently reachable. */
    available(): Promise<boolean>;
    /** Human-readable status (no secrets). */
    describe(): string;
    /** Submit an AgentOffice proposal to DSH. */
    proposeToDsh(task: OfficeTask): Promise<DshProviderResult<OfficeTask>>;
    /** Request an assignment for a task DSH administers. */
    requestAssignment(taskId: string, sessionId?: string): Promise<DshProviderResult<OfficeTask>>;
    /** Fetch results reported by DSH for a task. */
    getResults(taskId: string): Promise<DshProviderResult<unknown>>;
    /** Notify DSH that a blocker was observed. */
    notifyBlocker(taskId: string, description: string): Promise<DshProviderResult<null>>;
    /** Remove the DSH goal backing a task (full reversibility of a proposal). */
    removeFromDsh(taskId: string): Promise<DshProviderResult<null>>;
}

export class UnavailableDshTaskProvider implements DshTaskProvider {
    readonly kind = 'dsh' as const;

    private static readonly REASON =
        'DSH no está instalado en esta máquina (verificado en los Bloques 2-4). ' +
        'El contrato está listo; sustituye este proveedor por la implementación real cuando DSH se despliegue.';

    async available(): Promise<boolean> {
        return false;
    }

    describe(): string {
        return 'dsh:task-provider not-installed (contrato listo, sin endpoints inventados)';
    }

    private unavailable<T>(): DshProviderResult<T> {
        return { available: false, reason: UnavailableDshTaskProvider.REASON };
    }

    async listTasks(): Promise<OfficeTask[]> {
        return []; // DSH administers no tasks here — nothing invented
    }

    async createProposal(): Promise<OfficeTask> {
        throw new Error(UnavailableDshTaskProvider.REASON);
    }

    async updateStatus(): Promise<OfficeTask | null> {
        throw new Error(UnavailableDshTaskProvider.REASON);
    }

    async listSprints(): Promise<OfficeSprint[]> {
        return [];
    }

    async createSprint(): Promise<OfficeSprint> {
        throw new Error(UnavailableDshTaskProvider.REASON);
    }

    async assignToSprint(): Promise<OfficeTask | null> {
        throw new Error(UnavailableDshTaskProvider.REASON);
    }

    async proposeToDsh(task: OfficeTask): Promise<DshProviderResult<OfficeTask>> {
        return this.unavailable();
    }

    async requestAssignment(): Promise<DshProviderResult<OfficeTask>> {
        return this.unavailable();
    }

    async getResults(): Promise<DshProviderResult<unknown>> {
        return this.unavailable();
    }

    async notifyBlocker(): Promise<DshProviderResult<null>> {
        return this.unavailable();
    }

    async removeFromDsh(): Promise<DshProviderResult<null>> {
        return this.unavailable();
    }
}
