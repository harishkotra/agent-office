import { SeatAllocator } from '../../external/SeatAllocator';

/**
 * Ciudadan AgentOffice — Block 3 (FASES B & C).
 *
 * Independent visual controller: translates EXTERNAL agent states into
 * visual behaviors (destination + animation), consumed by the OfficeRoom
 * movement loop. It works ONLY on the normalized office state — it has
 * no knowledge of Cline, DSH or any adapter (clean separation).
 *
 * State → behavior → destination → animation (existing vocabulary):
 *   working/editing → desk        → 'work'  (💻 at the desk)
 *   testing         → test-station→ 'work'  (🧪 status emote, client-side)
 *   reading         → reading-st. → 'think'(📖 status emote, client-side)
 *   waiting/blocked → stay        → 'idle' (⏳/🚨 status emotes)
 *   idle            → desk (+ occasional ambient coffee break ☕)
 *   completed/offline→ stay       → 'idle' (✅/💤 status emotes; seat
 *                                    release handled by OccupancyPolicy)
 *   unknown         → stay        → 'idle' (NEVER invents activity)
 *
 * Movement rules (FASE C):
 *  - No teleports: the office moves agents one grid cell per tick.
 *  - Equivalent states map to the SAME destination, so consecutive
 *    polls never restart a route (working→editing stays at the desk).
 *  - The target only changes when the behavior destination changes.
 *  - Shared stations apply a small per-agent offset to reduce overlap
 *    (the original system has no inter-agent collision).
 */
export type VisualDestination = 'desk' | 'reading-station' | 'test-station' | 'ambient-break' | 'stay';

export interface VisualBehavior {
    destination: VisualDestination;
    /** Existing animation action vocabulary: work | think | idle | move. */
    action: string;
}

/** Station walk targets (grid coordinates, tile = 16px). */
export interface StationMap {
    reading: { x: number; y: number };
    testing: { x: number; y: number };
    ambient: { x: number; y: number };
}

/** Matches the drawn scene: bookshelf, whiteboard area and coffee area. */
export const DEFAULT_STATIONS: StationMap = {
    reading: { x: 32, y: 12 },  // bookshelf (right wall)
    testing: { x: 17, y: 5 },   // whiteboard (meeting side)
    ambient: { x: 25, y: 25 }   // coffee & pantry area
};

/** States with real work evidence → agent is "active". */
export const ACTIVE_STATES = new Set([
    'working', 'reading', 'editing', 'testing', 'waiting', 'blocked',
    'idle', 'running', 'thinking', 'acting', 'waiting_input'
]);

/** Pure state → behavior mapping (testable, no side effects). */
export function behaviorForStatus(status: string): VisualBehavior {
    switch (status) {
        case 'working':
        case 'editing':
            return { destination: 'desk', action: 'work' };
        case 'testing':
            return { destination: 'test-station', action: 'work' };
        case 'reading':
            return { destination: 'reading-station', action: 'think' };
        case 'waiting':
        case 'blocked':
        case 'completed':
        case 'offline':
            return { destination: 'stay', action: 'idle' };
        case 'idle':
            return { destination: 'desk', action: 'idle' };
        default:
            // Unknown state → do NOT invent activity.
            return { destination: 'stay', action: 'idle' };
    }
}

/** Deterministic small hash for per-agent variety (ambient scheduling). */
function hashId(id: string): number {
    let h = 0;
    for (let i = 0; i < id.length; i++) {
        h = (h * 31 + id.charCodeAt(i)) | 0;
    }
    return Math.abs(h);
}

export interface VisualControllerOptions {
    seats: SeatAllocator;
    stations?: StationMap;
    /** Ambient coffee break every N movement ticks per idle agent (~N×0.5s). */
    ambientEveryNTicks?: number;
    /** Duration of an ambient break in movement ticks. */
    ambientBreakTicks?: number;
}

export class AgentVisualController {
    private readonly stations: StationMap;
    private readonly ambientEveryN: number;
    private readonly ambientDuration: number;
    /** In-flight ambient breaks: agentId → tick when the break ends. */
    private ambientUntil = new Map<string, number>();

    constructor(private readonly opts: VisualControllerOptions) {
        this.stations = opts.stations ?? DEFAULT_STATIONS;
        this.ambientEveryN = opts.ambientEveryNTicks ?? 20;
        this.ambientDuration = opts.ambientBreakTicks ?? 8;
    }

    /** Behavior for an agent, including scheduled ambient breaks. */
    behaviorFor(agentId: string, status: string, tick: number): VisualBehavior {
        const base = behaviorForStatus(status);

        // ANY real activity or non-idle state cancels an ambient break
        // immediately (a working agent never lingers at the coffee area).
        if (status !== 'idle' && this.ambientUntil.has(agentId)) {
            this.ambientUntil.delete(agentId);
        }
        if (base.destination !== 'desk') return base;

        // Idle agents occasionally take a soft ambient break (coffee ☕).
        // Clearly NOT programming work: no 'work' action, low frequency,
        // deterministic per agent (no jitter churn between ticks).
        const onBreak = this.ambientUntil.get(agentId);
        if (onBreak !== undefined) {
            if (tick < onBreak) {
                return { destination: 'ambient-break', action: 'move' };
            }
            this.ambientUntil.delete(agentId);
            return base;
        }
        if (base.action === 'idle'
            && ((tick + hashId(agentId)) % this.ambientEveryN) === 0) {
            this.ambientUntil.set(agentId, tick + this.ambientDuration);
            return { destination: 'ambient-break', action: 'move' };
        }
        return base;
    }

    /**
     * Walk target for the CURRENT behavior. 'stay' keeps the agent at its
     * desk — no teleporting; targets only change when the destination
     * changes, so equivalent consecutive states never restart a route.
     */
    resolveTarget(agentId: string, behavior: VisualBehavior, seatIndex: number | null): { x: number; y: number } {
        const seat = seatIndex !== null ? this.opts.seats.seatTarget(seatIndex) : null;
        const desk = seat ?? { x: 5, y: 18 };
        switch (behavior.destination) {
            case 'reading-station':
                return this.withOffset(this.stations.reading, seatIndex);
            case 'test-station':
                return this.withOffset(this.stations.testing, seatIndex);
            case 'ambient-break':
                return this.withOffset(this.stations.ambient, seatIndex);
            case 'desk':
            case 'stay':
            default:
                return desk;
        }
    }

    /** Small per-agent offset at SHARED stations to reduce overlap. */
    private withOffset(base: { x: number; y: number }, seatIndex: number | null): { x: number; y: number } {
        if (seatIndex === null) return base;
        const spread = ((seatIndex + 6) % 7) - 3; // deterministic -3..+3
        return {
            x: Math.max(2, Math.min(36, base.x + spread)),
            y: Math.max(2, Math.min(36, base.y + ((seatIndex % 2 === 0) ? 1 : -1)))
        };
    }

    /** Clears per-agent bookkeeping (room regeneration / agent removal). */
    forget(agentId: string): void {
        this.ambientUntil.delete(agentId);
    }
}

