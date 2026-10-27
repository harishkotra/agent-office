import {
    AgentVisualController,
    behaviorForStatus,
    DEFAULT_STATIONS
} from '../AgentVisualController';
import { SeatAllocator, DEFAULT_SEAT_TARGETS } from '../../../external/SeatAllocator';

describe('behaviorForStatus (FASE B: state → behavior mapping)', () => {
    it('maps every real state to a documented behavior', () => {
        expect(behaviorForStatus('working')).toEqual({ destination: 'desk', action: 'work' });
        expect(behaviorForStatus('editing')).toEqual({ destination: 'desk', action: 'work' });
        expect(behaviorForStatus('testing')).toEqual({ destination: 'test-station', action: 'work' });
        expect(behaviorForStatus('reading')).toEqual({ destination: 'reading-station', action: 'think' });
        expect(behaviorForStatus('waiting')).toEqual({ destination: 'stay', action: 'idle' });
        expect(behaviorForStatus('blocked')).toEqual({ destination: 'stay', action: 'idle' });
        expect(behaviorForStatus('idle')).toEqual({ destination: 'desk', action: 'idle' });
        expect(behaviorForStatus('completed')).toEqual({ destination: 'stay', action: 'idle' });
        expect(behaviorForStatus('offline')).toEqual({ destination: 'stay', action: 'idle' });
    });

    it('NEVER invents activity for unknown states', () => {
        const behavior = behaviorForStatus('something-weird');
        expect(behavior.destination).toBe('stay');
        expect(behavior.action).toBe('idle');
    });
});

describe('AgentVisualController (FASE C: movement rules)', () => {
    function makeController(ambientEveryN = 1000) {
        const seats = new SeatAllocator(DEFAULT_SEAT_TARGETS.slice());
        seats.allocate('a1'); // seat 1
        seats.allocate('a2'); // seat 2
        return new AgentVisualController({ seats, ambientEveryNTicks: ambientEveryN, ambientBreakTicks: 4 });
    }

    it('equivalent consecutive states never restart a route (working→editing same desk)', () => {
        const c = makeController();
        const b1 = c.behaviorFor('a1', 'working', 1);
        const b2 = c.behaviorFor('a1', 'editing', 2);
        expect(b1.destination).toBe('desk');
        expect(b2.destination).toBe('desk');
        const t1 = c.resolveTarget('a1', b1, 1);
        const t2 = c.resolveTarget('a1', b2, 1);
        expect(t1).toEqual(t2); // same target → the agent keeps walking the same route
    });

    it('routes testing to the test station and reading to the reading station', () => {
        const c = makeController();
        const testing = c.resolveTarget('a1', behaviorForStatus('testing'), 1);
        const reading = c.resolveTarget('a1', behaviorForStatus('reading'), 1);
        expect(testing.x).toBeGreaterThanOrEqual(DEFAULT_STATIONS.testing.x - 3);
        expect(testing.x).toBeLessThanOrEqual(DEFAULT_STATIONS.testing.x + 3);
        expect(reading.x).toBeGreaterThanOrEqual(DEFAULT_STATIONS.reading.x - 3);
        expect(reading.x).toBeLessThanOrEqual(DEFAULT_STATIONS.reading.x + 3);
    });

    it('waiting/blocked stay at their desk (no wandering)', () => {
        const c = makeController();
        const desk = c.resolveTarget('a1', behaviorForStatus('working'), 1);
        const waiting = c.resolveTarget('a1', behaviorForStatus('waiting'), 1);
        const blocked = c.resolveTarget('a1', behaviorForStatus('blocked'), 1);
        expect(waiting).toEqual(desk);
        expect(blocked).toEqual(desk);
    });

    it('shared-station offsets differ per seat (reduces overlap)', () => {
        const c = makeController();
        const b = behaviorForStatus('testing');
        const t1 = c.resolveTarget('a1', b, 1);
        const t2 = c.resolveTarget('a2', b, 2);
        expect(`${t1.x},${t1.y}`).not.toBe(`${t2.x},${t2.y}`);
    });

    it('idle agents take deterministic ambient breaks and return (never work emote)', () => {
        const c = new AgentVisualController({
            seats: new SeatAllocator(DEFAULT_SEAT_TARGETS.slice()),
            ambientEveryNTicks: 5,
            ambientBreakTicks: 3
        });
        let sawBreak = false;
        for (let tick = 0; tick <= 40; tick++) {
            const b = c.behaviorFor('idle-agent', 'idle', tick);
            if (b.destination === 'ambient-break') {
                sawBreak = true;
                expect(b.action).not.toBe('work'); // ambient ≠ programming work
            }
        }
        expect(sawBreak).toBe(true); // a break DID happen (deterministic)
        // After the break window, behavior returns to the desk.
        const later = c.behaviorFor('idle-agent', 'idle', 1000);
        expect(later.destination).toBe('desk');
    });

    it('ambient breaks stop immediately when the agent starts working', () => {
        const c = new AgentVisualController({
            seats: new SeatAllocator(DEFAULT_SEAT_TARGETS.slice()),
            ambientEveryNTicks: 1,
            ambientBreakTicks: 50
        });
        // Force a break, then the agent starts working → break is ignored.
        c.behaviorFor('busy', 'idle', 1);
        const working = c.behaviorFor('busy', 'working', 2);
        expect(working.destination).toBe('desk');
        expect(working.action).toBe('work');
    });

    it('forget clears per-agent bookkeeping', () => {
        const c = new AgentVisualController({
            seats: new SeatAllocator(DEFAULT_SEAT_TARGETS.slice()),
            ambientEveryNTicks: 1,
            ambientBreakTicks: 10
        });
        c.behaviorFor('gone', 'idle', 1);
        c.forget('gone');
        // After forget, the next idle tick schedules a fresh break cleanly.
        const b = c.behaviorFor('gone', 'idle', 1);
        expect(['desk', 'ambient-break']).toContain(b.destination);
    });
});
