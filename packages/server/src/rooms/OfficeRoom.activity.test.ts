const fs = require('node:fs');
const path = require('node:path');

describe('OfficeRoom life simulation and office alignment', () => {
    const source = fs.readFileSync(path.join(__dirname, 'OfficeRoom.ts'), 'utf8');

    it('uses the same 64x64 grid as the polished Phaser office map', () => {
        expect(source).toContain('grid: { width: 64, height: 64, tileSize: 16 }');
        expect(source).toContain('const BOUNDS = { minX: 3, maxX: 60, minY: 3, maxY: 60 }');
    });

    it('aligns work and leisure targets to the rendered desks and rest-area assets', () => {
        [
            "'supervisor-0-desk': { x: 8, y: 13",
            "'supervisor-1-desk': { x: 26, y: 12",
            "'ping-pong-left': { x: 26, y: 46",
            "'arcade-cabinet': { x: 39, y: 45",
            "'sofa-seat': { x: 45, y: 49",
            "'snack-bar': { x: 35, y: 48"
        ].forEach((marker) => expect(source).toContain(marker));
    });

    it('plans idle break activities instead of sending every idle agent back to a desk forever', () => {
        [
            'private idleActivityPlans',
            'private chooseIdleActivity',
            'private resolveAgentTarget',
            "action: 'play_ping_pong'",
            "action: 'play_arcade'",
            "action: 'sit_sofa'",
            "action: 'coffee_break'"
        ].forEach((marker) => expect(source).toContain(marker));
    });

    it('starts from Codex Supervisor panes instead of random social AI coworkers', () => {
        [
            'readSupervisorSnapshot',
            'syncSupervisorPanes',
            'General Manager',
            'Validator Lane',
            'Debug Lane',
            'supervisor-state'
        ].forEach((marker) => expect(source).toContain(marker));
        expect(source).not.toContain('Anime-inspired UX Designer');
        expect(source).not.toContain('Cartoon QA Lead');
        expect(source).not.toContain('virtual office. Be social');
    });

});
