import { ServerConfig } from '../../config';
import { ClineControlAdapter } from './ClineControlAdapter';
import { InstructionService } from './InstructionService';
import { AuditLog } from './AuditLog';
import { HubSessionLauncher } from './HubSessionLauncher';
import { HubSessionObserver } from './HubSessionObserver';
import { OfficeRoom } from '../../rooms/OfficeRoom';
import * as path from 'path';

export { ClineControlAdapter } from './ClineControlAdapter';
export type { InstructionRecord, InstructionState } from './InstructionService';
export { InstructionService } from './InstructionService';
export type { AuditEntry } from './AuditLog';
export { AuditLog } from './AuditLog';
export type { ControlCapabilities } from './ControlCapabilities';
export { BLOCKED_DISPATCH_REASONS } from './ControlCapabilities';
export { HubSessionLauncher } from './HubSessionLauncher';
export type { ManagedSessionInfo } from './HubSessionLauncher';
export { HubSessionObserver } from './HubSessionObserver';

/**
 * Block 4/5 — assembles the control runtime (adapter, instruction
 * pipeline, audit, hub session launcher) from the server config.
 * Everything is instantiated once per server process.
 */
export function createControlRuntime(config: ServerConfig) {
    const adapter = new ClineControlAdapter(config);
    const audit = new AuditLog(path.resolve('./data/control-audit.jsonl'));
    const instructions = new InstructionService({
        config,
        adapter,
        audit,
        // Target validation: only currently-registered office agents
        // (real Cline session ids) can receive instructions.
        officeAgents: () => {
            const bridge = OfficeRoom.getActiveRoom()?.getExternalBridge();
            if (!bridge) return [];
            return bridge.getStatus().agents.map(a => ({
                id: a.id, name: a.name, status: String(a.status)
            }));
        }
    });
    const launcher = new HubSessionLauncher(config, adapter, audit);
    const hubObserver = new HubSessionObserver(launcher, adapter);

    // Block 5 (FASE C): lifecycle poller — advances dispatched
    // instructions using REAL hub transcript evidence.
    const lifecycleTimer = setInterval(async () => {
        try {
            const refreshable = instructions.listRefreshable();
            for (const record of refreshable) {
                const transcript = await adapter.readHubTranscript(record.sessionId);
                if (transcript.length > 0) {
                    await instructions.refreshFromHub(record.requestId, transcript);
                }
            }
        } catch {
            // transient hub errors keep the last state — never crash
        }
    }, config.clinePollIntervalMs);
    lifecycleTimer.unref?.();

    return { adapter, audit, instructions, launcher, hubObserver };
}
