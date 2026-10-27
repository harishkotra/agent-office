import { OccupancyPolicy, PolicySession } from '../OccupancyPolicy';

const NOW = 1_800_000_000_000;

function s(id: string, state: string, last: number, endedAt: number | null = null): PolicySession {
    return { sessionId: id, state, lastActivityAt: last, endedAt };
}

describe('OccupancyPolicy (FASE D: desk occupancy)', () => {
    it('prioritizes active sessions over terminal ones', () => {
        const policy = new OccupancyPolicy(7, 60_000);
        const seen = new Map<string, number>();
        const decision = policy.select(
            // Ended 1 hour ago — long before this server ever saw it.
            [s('done-old', 'completed', NOW - 3_600_000, NOW - 3_600_000), s('live', 'working', NOW)],
            NOW, seen
        );
        expect(decision.seat).toContain('live');
        // A completion that ended LONG ago is never seated again.
        expect(decision.seat).not.toContain('done-old');
        expect(decision.evict).toContain('done-old');
    });

    it('shows a FRESH completion during the grace window, then evicts it', () => {
        const policy = new OccupancyPolicy(7, 60_000);
        const seen = new Map<string, number>();
        const justEnded = s('just-done', 'completed', NOW - 5_000, NOW - 5_000);
        const first = policy.select([justEnded], NOW, seen);
        expect(first.seat).toContain('just-done');
        expect(first.inGrace.get('just-done')).toBeGreaterThan(55_000);

        const later = policy.select([justEnded], NOW + 61_000, seen);
        expect(later.seat).not.toContain('just-done');
        expect(later.evict).toContain('just-done');
    });

    it('caps seats at the maximum even with more active sessions', () => {
        const policy = new OccupancyPolicy(3, 60_000);
        const seen = new Map<string, number>();
        const sessions = [1, 2, 3, 4, 5].map(i => s(`a${i}`, 'working', NOW - i * 1000));
        const decision = policy.select(sessions, NOW, seen);
        expect(decision.seat).toHaveLength(3);
        // The 3 MOST RECENT actives keep their seats.
        expect(decision.seat).toEqual(['a1', 'a2', 'a3']);
        expect(decision.evict).toEqual([]);
    });

    it('terminal sessions only fill seats left by absent actives', () => {
        const policy = new OccupancyPolicy(3, 60_000);
        const seen = new Map<string, number>();
        const sessions = [
            s('live1', 'working', NOW),
            s('fresh-done', 'completed', NOW - 1000, NOW - 1000)
        ];
        const decision = policy.select(sessions, NOW, seen);
        expect(decision.seat).toEqual(['live1', 'fresh-done']);
    });

    it('offline sessions are terminal too (stale pid ≠ active)', () => {
        const policy = new OccupancyPolicy(7, 30_000);
        const seen = new Map<string, number>();
        const decision = policy.select([s('off', 'offline', NOW - 100)], NOW, seen);
        expect(decision.seat).toContain('off'); // inside grace
        const later = policy.select([s('off', 'offline', NOW - 100)], NOW + 31_000, seen);
        expect(later.evict).toContain('off');
    });

    it('keeps stable seat sets when the eligible set does not change', () => {
        const policy = new OccupancyPolicy(7, 60_000);
        const seen = new Map<string, number>();
        const sessions = [s('a', 'working', NOW), s('b', 'reading', NOW - 1000)];
        const first = policy.select(sessions, NOW, seen);
        const second = policy.select(sessions, NOW + 5_000, seen);
        const third = policy.select(sessions, NOW + 10_000, seen);
        expect(first.seat).toEqual(second.seat);
        expect(second.seat).toEqual(third.seat);
    });

    it('an already-old completion gets NO grace (no zombie desks at startup)', () => {
        const policy = new OccupancyPolicy(7, 60_000);
        const seen = new Map<string, number>();
        const old = s('old', 'completed', NOW - 3_600_000, NOW - 3_600_000);
        const decision = policy.select([old], NOW, seen);
        expect(decision.seat).not.toContain('old');
        expect(decision.evict).toContain('old');
    });

    it('grace timestamps persist across selections (caller-owned map)', () => {
        const policy = new OccupancyPolicy(7, 60_000);
        const seen = new Map<string, number>();
        const fresh = s('f', 'completed', NOW, NOW);
        policy.select([fresh], NOW, seen);
        expect(seen.has('f')).toBe(true);
        // 30s later still in grace.
        const mid = policy.select([fresh], NOW + 30_000, seen);
        expect(mid.seat).toContain('f');
        expect(mid.inGrace.get('f')).toBeLessThanOrEqual(30_000);
    });
});
