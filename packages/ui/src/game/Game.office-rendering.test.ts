const fs = require('node:fs');
const path = require('node:path');

describe('OfficeScene polished office background renderer', () => {
    const source = fs.readFileSync(path.join(__dirname, 'Game.ts'), 'utf8');

    it('uses a responsive single-map camera fit instead of a fixed zoom that can expose empty black viewport', () => {
        expect(source).toContain('private fitCameraToOffice()');
        expect(source).toContain('width / this.gridSize');
        expect(source).toContain('height / this.gridSize');
        expect(source).not.toContain('this.cameras.main.setZoom(2);');
    });

    it('renders a polished continuous office with floor variation, soft zones, shared spaces, and props', () => {
        [
            'drawPolishedOfficeMap',
            'drawOfficeFloor',
            'drawDepartmentZone',
            'drawTeamLabelPlaque',
            'drawSoftDivider',
            'drawDeskCluster',
            'drawSharedMeetingArea',
            'drawCoffeeArea',
            'drawWalkways',
            'drawPixelShadow',
            'drawWhiteboard',
            'drawCabinet',
            'drawShelf',
            'drawPlant',
            'drawTestBench',
            'drawServerRack'
        ].forEach((marker) => expect(source).toContain(marker));
    });


    it('draws a game-grade rest area and teaches the client about leisure actions', () => {
        [
            'drawRestArea',
            'drawPingPongTable',
            'drawArcadeCabinet',
            'drawSofa',
            'play_ping_pong',
            'play_arcade',
            'sit_sofa',
            'coffee_break',
            'activityLabel'
        ].forEach((marker) => expect(source).toContain(marker));
    });

    it('renders custom layout editor props with the same polished pixel-art vocabulary as the main scene', () => {
        [
            'drawCustomLayoutItem',
            'drawMiniPlant',
            'drawMiniDesk',
            'drawMiniBookshelf',
            'drawMiniCoffeeMachine',
            'drawMiniTable',
            'drawMiniChair',
            'drawMiniWhiteboard',
            'drawMiniArcadeCabinet',
            'drawMiniSofa',
            'drawMiniPingPongTable'
        ].forEach((marker) => expect(source).toContain(marker));
    });


    it('registers early server bootstrap messages to avoid Colyseus warning noise', () => {
        expect(source).toContain("onMessage('tasks-sync'");
        expect(source).toContain("new CustomEvent('tasks-sync'");
    });

    it('keeps character sprite loading and agent movement logic intact', () => {
        expect(source).toContain('const CHAR_COUNT = 12');
        expect(source).toContain('this.load.spritesheet(`char_${i}`');
        expect(source).toContain('agentSprites: Map<string, Phaser.GameObjects.Container>');
        expect(source).toContain('agent.onChange(() =>');
        expect(source).toContain('this.tweens.add({');
    });
});
