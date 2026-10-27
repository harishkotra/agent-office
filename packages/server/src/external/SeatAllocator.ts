/**
 * Fixed seat allocation for the external office (Ciudadan AgentOffice).
 *
 * The office has EXACTLY seven seats. Their walk targets match the
 * workstations drawn in the Phaser scene (packages/ui/src/game/Game.ts):
 * three original desks on the left column plus four static workstations.
 * No dynamic office expansion is supported (by design).
 */

export interface SeatTarget {
    x: number;
    y: number;
}

export interface Seat {
    /** 1-based seat number (Puesto 1..7). */
    index: number;
    /** Grid coordinates the agent walks to when idle. */
    target: SeatTarget;
}

/**
 * Default seat targets (grid coordinates, tile = 16px).
 * Desk pixel origins are target*16 - (16, 48):
 *   Puesto 1 (64,240)  Puesto 2 (64,320)  Puesto 3 (64,400)
 *   Puesto 4 (224,240) Puesto 5 (224,320)
 *   Puesto 6 (384,240) Puesto 7 (496,240)
 */
export const DEFAULT_SEAT_TARGETS: SeatTarget[] = [
    { x: 5, y: 18 },
    { x: 5, y: 23 },
    { x: 5, y: 27 },
    { x: 15, y: 18 },
    { x: 15, y: 23 },
    { x: 25, y: 18 },
    { x: 32, y: 18 }
];

/** Sprites available: char_0..char_5 (6 sheets). Seat 7 wraps to char_0. */
export function spriteIndexForSeat(seatIndex1Based: number, spriteCount = 6): number {
    return ((seatIndex1Based - 1) % spriteCount + spriteCount) % spriteCount;
}

export class SeatAllocator {
    private seatByAgent = new Map<string, number>();
    private agentBySeat = new Map<number, string>();

    constructor(private readonly targets: SeatTarget[] = DEFAULT_SEAT_TARGETS.slice()) {}

    /** Total seat capacity (fixed). */
    get capacity(): number {
        return this.targets.length;
    }

    get usedSeats(): number {
        return this.seatByAgent.size;
    }

    get freeSeats(): number {
        return this.capacity - this.usedSeats;
    }

    isFull(): boolean {
        return this.usedSeats >= this.capacity;
    }

    /** Assigns the lowest free seat to the agent. Returns null when full. */
    allocate(agentId: string): Seat | null {
        if (this.seatByAgent.has(agentId)) {
            return this.seatOf(agentId);
        }
        for (let i = 0; i < this.targets.length; i++) {
            const seatNumber = i + 1;
            if (!this.agentBySeat.has(seatNumber)) {
                this.seatByAgent.set(agentId, seatNumber);
                this.agentBySeat.set(seatNumber, agentId);
                return { index: seatNumber, target: this.targets[i] };
            }
        }
        return null;
    }

    /** Frees the agent's seat, if any. Returns the released seat or null. */
    release(agentId: string): Seat | null {
        const seat = this.seatOf(agentId);
        if (!seat) return null;
        this.seatByAgent.delete(agentId);
        this.agentBySeat.delete(seat.index);
        return seat;
    }

    /** Current seat of an agent, or null when not seated. */
    seatOf(agentId: string): Seat | null {
        const seatNumber = this.seatByAgent.get(agentId);
        if (seatNumber === undefined) return null;
        const target = this.targets[seatNumber - 1];
        if (!target) return null;
        return { index: seatNumber, target };
    }

    /** Walk target of a seat number (1-based), or null when out of range. */
    seatTarget(index: number): SeatTarget | null {
        return this.targets[index - 1] ?? null;
    }

    /** Clears all assignments (used on room dispose). */
    reset(): void {
        this.seatByAgent.clear();
        this.agentBySeat.clear();
    }
}
