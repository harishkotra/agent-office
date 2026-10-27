import { SeatAllocator, DEFAULT_SEAT_TARGETS, spriteIndexForSeat } from '../SeatAllocator';

describe('SeatAllocator', () => {
    it('has exactly seven fixed seats by default (no dynamic expansion)', () => {
        const seats = new SeatAllocator();
        expect(seats.capacity).toBe(7);
        expect(DEFAULT_SEAT_TARGETS).toHaveLength(7);
    });

    it('allocates seats in order and reports free/used counts', () => {
        const seats = new SeatAllocator();
        const first = seats.allocate('agent-1');
        expect(first).not.toBeNull();
        expect(first!.index).toBe(1);
        expect(first!.target).toEqual({ x: 5, y: 18 });

        seats.allocate('agent-2');
        expect(seats.usedSeats).toBe(2);
        expect(seats.freeSeats).toBe(5);

        const seatOfAgent1 = seats.seatOf('agent-1');
        expect(seatOfAgent1!.index).toBe(1);
        expect(seats.seatOf('unknown')).toBeNull();
    });

    it('fills all seven seats and rejects the eighth agent', () => {
        const seats = new SeatAllocator();
        for (let i = 1; i <= 7; i++) {
            const seat = seats.allocate(`agent-${i}`);
            expect(seat).not.toBeNull();
            expect(seat!.index).toBe(i);
        }
        expect(seats.isFull()).toBe(true);
        expect(seats.allocate('agent-8')).toBeNull();
        expect(seats.freeSeats).toBe(0);
    });

    it('re-allocates the same seat for an existing agent (idempotent)', () => {
        const seats = new SeatAllocator();
        seats.allocate('agent-1');
        const again = seats.allocate('agent-1');
        expect(again!.index).toBe(1);
        expect(seats.usedSeats).toBe(1);
    });

    it('release frees the seat and the next agent reuses the lowest free seat', () => {
        const seats = new SeatAllocator();
        seats.allocate('a');
        seats.allocate('b');
        seats.allocate('c');

        const released = seats.release('b');
        expect(released!.index).toBe(2);
        expect(seats.usedSeats).toBe(2);

        const newcomer = seats.allocate('d');
        expect(newcomer!.index).toBe(2);
    });

    it('reset clears all assignments', () => {
        const seats = new SeatAllocator();
        seats.allocate('a');
        seats.allocate('b');
        seats.reset();
        expect(seats.usedSeats).toBe(0);
        expect(seats.seatOf('a')).toBeNull();
    });
});

describe('spriteIndexForSeat', () => {
    it('assigns sprites cycling over the 6 available sheets', () => {
        expect(spriteIndexForSeat(1)).toBe(0);
        expect(spriteIndexForSeat(2)).toBe(1);
        expect(spriteIndexForSeat(6)).toBe(5);
        // Seat 7 wraps around to the first sprite.
        expect(spriteIndexForSeat(7)).toBe(0);
    });
});
