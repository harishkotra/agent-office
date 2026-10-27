import { ServerConfig } from '../config';
import { ClineSessionSource } from './cline/ClineSessionSource';
import { ClineTeamsObserver } from './dsh/ClineTeamsObserver';
import { DshAdapter, UnavailableDshAdapter, HttpDshAdapter } from './dsh/DshAdapter';
import { RealAgentsOrchestrator } from './RealAgentsOrchestrator';
import { OfficeRoom } from '../rooms/OfficeRoom';
import type { ExternalOrchestratorAdapter } from '@agent-office/core';
import type { ClineSessionSnapshot } from './cline/ClineTypes';

export { ClineSessionSource, ClineTeamsObserver, RealAgentsOrchestrator };
export type { DshAdapter, DshTask, DshObservation } from './dsh/DshAdapter';

/** Registry of the running orchestrator (for REST history reporting). */
let activeOrchestrator: RealAgentsOrchestrator | null = null;

/** Access to the running real-agents runtime (may be null). */
export function getRealAgentsRuntime(): RealAgentsOrchestrator | null {
    return activeOrchestrator;
}

/**
 * Builds the Block 2 real-agents orchestrator from the server config.
 * The bridge resolver re-evaluates on every cycle so the orchestrator
 * attaches automatically once the office room is created (and re-attach
 * after a room regeneration).
 */
export function createRealAgentsOrchestrator(
    config: ServerConfig,
    hubObserver?: { listSnapshots(): Promise<ClineSessionSnapshot[]> }
): RealAgentsOrchestrator {
    // DSH source selection (Fase C). 'http' is reserved: if someone sets
    // it, fail fast with a clear message instead of pretending.
    let dsh: DshAdapter;
    if (config.dshSource === 'http') {
        dsh = new HttpDshAdapter(process.env.DSH_URL || '(DSH_URL not set)');
    } else {
        dsh = new UnavailableDshAdapter();
    }

    const source = new ClineSessionSource(config.clineDataDir, {
        maxSessions: config.maxSeats,
        inactivityMs: 120_000
    });
    const teams = new ClineTeamsObserver(config.clineDataDir);

    const bridgeResolver = (): ExternalOrchestratorAdapter | null => {
        const room = OfficeRoom.getActiveRoom();
        const bridge = room?.getExternalBridge() ?? null;
        return bridge;
    };

    const orchestrator = new RealAgentsOrchestrator({ config, source, teams, dsh, bridgeResolver, hubObserver });
    activeOrchestrator = orchestrator;
    return orchestrator;
}
