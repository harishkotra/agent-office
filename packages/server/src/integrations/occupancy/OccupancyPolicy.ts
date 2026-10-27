import { ACTIVE_STATES } from '../visual/AgentVisualController';

/**
 * Ciudadan AgentOffice — Block 3 (FASE D): desk occupancy policy.
 *
 * The office shows, with priority, agents that are REALLY available to
 * work. Terminal sessions (completed/offline) are shown only during a
 * short configurable grace period — so viewers can see a completion —
 * and then free their seat. Historical info is preserved (the caller
 * keeps it in a history list exposed via REST), never as an active agent.
 *
 * Selection rules (deterministic, documented for >7 candidates):
 *  1. ACTIVE sessions first (any non-terminal state), ranked by last
 *     activity (most recent first).
 *  2. TERMINAL sessions fill the remaining seats, ranked by recency of
 *     their end, and only while inside the grace window.
 *  3. When actives alone exceed MAX_SEATS, the 7 most recent actives
 *     keep their seats; the rest wait (documented — the office never
 *     expands and never evicts a working agent for a historical one).
 *  4. A terminal that ended LONGER than the grace ago (before the
 *     server ever saw it) is never seated again — no zombie desks.
 *
 * The policy is pure: it never mutates office state by itself.
 */

export interface PolicySession {
    sessionId: string;
    /** Normalized state (working/reading/…/completed/offline). */
    state: string;
    /** Epoch ms of the last observed activity. */
    lastActivityAt: number | null;
    /** Epoch ms of the session end, when known (completed sessions). */
    endedAt: number | null;
}

export interface PolicyDecision {
    /** Session ids that should occupy a seat now (≤ maxSeats). */
    seat: string[];
    /** Terminal sessions still inside the grace window (id → ms left). */
    inGrace: Map<string, number>;
    /** Terminal sessions whose seat must be released now. */
    evict: string[];
}

export class OccupancyPolicy {
    constructor(
        private readonly maxSeats: number,
        private readonly graceMs: number
    ) {}

    isActive(session: PolicySession): boolean {
        return ACTIVE_STATES.has(session.state);
    }

    /**
     * Decides the seat set. `now` is injected for deterministic tests.
     * `firstSeenTerminalAt` maps terminal session ids to the epoch ms
     * when the policy FIRST observed them as terminal (caller-owned so
     * grace survives policy re-instantiations).
     */
    select(
        sessions: PolicySession[],
        now: number,
        firstSeenTerminalAt: Map<string, number>
    ): PolicyDecision {
        const actives = sessions
            .filter(s => this.isActive(s))
            .sort((a, b) => (b.lastActivityAt ?? 0) - (a.lastActivityAt ?? 0));

        const terminals = sessions
            .filter(s => !this.isActive(s))
            .sort((a, b) => (b.endedAt ?? b.lastActivityAt ?? 0) - (a.endedAt ?? a.lastActivityAt ?? 0));

        // Stamp first-seen for terminal sessions (grace starts here,
        // except for sessions that ended long before we ever saw them).
        const inGrace = new Map<string, number>();
        for (const t of terminals) {
            if (!firstSeenTerminalAt.has(t.sessionId)) {
                const endedAt = t.endedAt ?? null;
                // Already-old completions get NO grace: they were not
                // observed completing, so nothing to visualize.
                const endedLongAgo = endedAt !== null && (now - endedAt) > this.graceMs;
                firstSeenTerminalAt.set(t.sessionId, endedLongAgo ? Number.MIN_SAFE_INTEGER : now);
            }
        }

        const seat: string[] = [];
        const evict: string[] = [];

        // 1) Active sessions — always preferred, most recent first.
        for (const a of actives) {
            if (seat.length < this.maxSeats) seat.push(a.sessionId);
        }

        // 2) Terminal sessions — only while inside the grace window.
        for (const t of terminals) {
            const seenAt = firstSeenTerminalAt.get(t.sessionId)!;
            const elapsed = now - seenAt;
            if (elapsed < this.graceMs) {
                if (seat.length < this.maxSeats) {
                    seat.push(t.sessionId);
                    inGrace.set(t.sessionId, this.graceMs - elapsed);
                }
            } else {
                evict.push(t.sessionId);
            }
        }

        return { seat, inGrace, evict };
    }
}
