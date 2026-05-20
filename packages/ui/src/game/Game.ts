import Phaser from 'phaser';
import * as Colyseus from 'colyseus.js';
import { OfficeState, AgentState } from './schema';
import { eventBus } from '../events';

let activeRoom: Colyseus.Room<OfficeState> | undefined;

export function getColyseusRoom() {
    return activeRoom;
}

// Server moves agents every 500ms (5 ticks × 100ms); tween just under that for smooth glide
const MOVE_MS = 460;
const CHAR_COUNT = 12;

type Facing = 'down' | 'up' | 'left' | 'right';

function agentCharIndex(sessionId: string, name: string): number {
    const featuredCast: Record<string, number> = {
        alice: 0,
        bob: 1,
        mika: 6,
        ren: 7,
        sora: 8,
        yuki: 9
    };
    const preferred = featuredCast[name.toLowerCase()];
    if (typeof preferred === 'number') return preferred;
    const s = sessionId + name;
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xffff;
    return h % CHAR_COUNT;
}

type DepartmentZone = {
    name: string;
    x: number;
    y: number;
    w: number;
    h: number;
    accent: number;
    rug: number;
    desk: number;
    screen: number;
    cluster: 'creative' | 'editorial' | 'terminal' | 'review' | 'bench' | 'library';
};

function resolveWsEndpoint(): string {
    if (typeof window !== 'undefined') {
        const queryWs = new URLSearchParams(window.location.search).get('ws');
        if (queryWs && queryWs.trim()) {
            window.localStorage.setItem('agent-office:ws-url', queryWs.trim());
            return queryWs.trim();
        }
        const savedWs = window.localStorage.getItem('agent-office:ws-url');
        if (savedWs && savedWs.trim()) return savedWs.trim();
    }
    const globalEndpoint = typeof window !== 'undefined'
        ? (window as any).__AGENT_OFFICE_WS_URL as string | undefined
        : undefined;
    if (globalEndpoint && globalEndpoint.trim()) return globalEndpoint.trim();
    if (typeof window !== 'undefined') {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        return `${protocol}//${window.location.hostname}:3000`;
    }
    return 'ws://localhost:3000';
}

export class OfficeScene extends Phaser.Scene {
    private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
    private room?: Colyseus.Room;
    private agentSprites: Map<string, Phaser.GameObjects.Container> = new Map();
    private statusText!: Phaser.GameObjects.Text;
    private followTarget: Phaser.GameObjects.Container | null = null;
    private cinematicMode = true;
    private cinematicReleaseAt = 0;
    private customLayoutLayer?: Phaser.GameObjects.Container;
    private layoutItems: Array<{ id: string; type: string; x: number; y: number; label?: string }> = [];
    private layoutEditMode = false;
    private layoutDragItemId: string | null = null;
    private gridSize = 40 * 16;
    private heldMoveKeys: Set<'left' | 'right' | 'up' | 'down'> = new Set();

    constructor() {
        super('OfficeScene');
    }

    preload() {
        for (let i = 0; i < CHAR_COUNT; i++) {
            this.load.spritesheet(`char_${i}`, `/assets/characters/char_${i}.png`, {
                frameWidth: 16,
                frameHeight: 32
            });
        }
    }

    private buildCharAnims(key: string) {
        if (!this.textures.exists(key)) return;
        const a = this.anims;
        // Walk cycles (4-direction)
        a.create({ key: `${key}-walk-down`,  frames: a.generateFrameNumbers(key, { start: 0,  end: 2  }), frameRate: 8, repeat: -1 });
        a.create({ key: `${key}-walk-up`,    frames: a.generateFrameNumbers(key, { start: 7,  end: 9  }), frameRate: 8, repeat: -1 });
        a.create({ key: `${key}-walk-right`, frames: a.generateFrameNumbers(key, { start: 14, end: 16 }), frameRate: 8, repeat: -1 });
        // Idle — one held frame per facing direction
        a.create({ key: `${key}-idle-down`,  frames: [{ key, frame: 1  }], frameRate: 1, repeat: -1 });
        a.create({ key: `${key}-idle-up`,    frames: [{ key, frame: 8  }], frameRate: 1, repeat: -1 });
        a.create({ key: `${key}-idle-right`, frames: [{ key, frame: 15 }], frameRate: 1, repeat: -1 });
        // Work — slow typing bob (facing toward screen = down)
        a.create({ key: `${key}-work`, frames: a.generateFrameNumbers(key, { frames: [1, 0, 1, 2, 1, 1, 0, 1] }), frameRate: 3, repeat: -1 });
        // Talk — moderate gesture loop
        a.create({ key: `${key}-talk`, frames: a.generateFrameNumbers(key, { frames: [0, 1, 2, 1] }), frameRate: 6, repeat: -1 });
    }

    private playAgentAnim(sprite: Phaser.GameObjects.Sprite, charKey: string, action: string, facing: Facing) {
        const s = sprite;
        const safePlay = (animationKey: string, fallbackFrame = 1) => {
            if (this.anims.exists(animationKey)) {
                s.play(animationKey, true);
            } else {
                s.stop();
                s.setFrame(fallbackFrame);
            }
        };
        if (action === 'work' || action === 'use_tool' || action === 'play_arcade' || action === 'coffee_break' || action === 'whiteboard_jam') {
            s.setFlipX(action === 'play_arcade' || action === 'whiteboard_jam');
            safePlay(`${charKey}-work`, 1);
        } else if (action === 'talk' || action === 'play_ping_pong') {
            s.setFlipX(facing === 'left' || action === 'play_ping_pong');
            safePlay(`${charKey}-talk`, 1);
        } else {
            // idle / think / move — show held frame for correct direction
            const idleKey =
                facing === 'up'    ? `${charKey}-idle-up` :
                facing === 'right' ? `${charKey}-idle-right` :
                facing === 'left'  ? `${charKey}-idle-right` :
                                     `${charKey}-idle-down`;
            s.setFlipX(facing === 'left');
            safePlay(idleKey, facing === 'up' ? 8 : facing === 'right' || facing === 'left' ? 15 : 1);
        }
    }

    create() {
        try {
            console.log("Phaser create() started");
            this.statusText = this.add.text(10, 10, 'Colyseus Sync: Connecting...', { color: '#ffffaa', fontSize: '14px' });
            this.statusText.setScrollFactor(0);
            this.statusText.setDepth(100);

            for (let i = 0; i < CHAR_COUNT; i++) this.buildCharAnims(`char_${i}`);
            const hasAnims = this.textures.exists('char_0');
            console.log("Animations created: ", hasAnims);

            this.gridSize = 64 * 16;
            const gridSize = this.gridSize;
            const g = this.add.graphics();
            this.drawPolishedOfficeMap(g, gridSize);

            this.cameras.main.setBackgroundColor('#211d28');
            this.cameras.main.setBounds(0, 0, gridSize, gridSize);
            this.fitCameraToOffice();
            this.scale.on('resize', () => this.fitCameraToOffice());
            this.customLayoutLayer = this.add.container(0, 0);
            this.customLayoutLayer.setDepth(4);

            if (this.input.keyboard) {
                this.cursors = this.input.keyboard.createCursorKeys();
            }

            eventBus.addEventListener('cinematic-toggle', (e: Event) => {
                const detail = (e as CustomEvent).detail as { enabled: boolean };
                this.cinematicMode = Boolean(detail?.enabled);
                if (!this.cinematicMode) {
                    this.cinematicReleaseAt = 0;
                }
            });
            eventBus.addEventListener('layout-preview-update', (e: Event) => {
                const detail = (e as CustomEvent).detail as { items: Array<{ id: string; type: string; x: number; y: number; label?: string }> };
                this.layoutItems = Array.isArray(detail?.items) ? detail.items : [];
                this.renderCustomLayout(this.layoutItems);
            });
            eventBus.addEventListener('layout-edit-mode', (e: Event) => {
                const detail = (e as CustomEvent).detail as { enabled: boolean };
                this.layoutEditMode = Boolean(detail?.enabled);
                if (!this.layoutEditMode) this.layoutDragItemId = null;
            });

            this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
                if (!this.layoutEditMode || !this.layoutDragItemId || !pointer.isDown) return;
                const gx = Phaser.Math.Clamp(Math.round(pointer.worldX / 16), 3, 60);
                const gy = Phaser.Math.Clamp(Math.round(pointer.worldY / 16), 3, 60);
                this.layoutItems = this.layoutItems.map((item) =>
                    item.id === this.layoutDragItemId ? { ...item, x: gx, y: gy } : item
                );
                this.renderCustomLayout(this.layoutItems);
                eventBus.dispatchEvent(new CustomEvent('layout-item-moved', { detail: { items: this.layoutItems } }));
            });
            this.input.on('pointerup', () => {
                this.layoutDragItemId = null;
            });
            this.input.on('wheel', (_pointer: Phaser.Input.Pointer, _objects: Phaser.GameObjects.GameObject[], _deltaX: number, deltaY: number) => {
                const nextZoom = Phaser.Math.Clamp(this.cameras.main.zoom - deltaY * 0.001, this.officeCoverZoom(), 6);
                this.cameras.main.setZoom(nextZoom);
            });

            const toMoveDirection = (event: KeyboardEvent): 'left' | 'right' | 'up' | 'down' | null => {
                const key = (event.key || '').toLowerCase();
                const code = (event.code || '').toLowerCase();
                if (key === 'arrowleft' || key === 'a' || code === 'arrowleft' || code === 'keya') return 'left';
                if (key === 'arrowright' || key === 'd' || code === 'arrowright' || code === 'keyd') return 'right';
                if (key === 'arrowup' || key === 'w' || code === 'arrowup' || code === 'keyw') return 'up';
                if (key === 'arrowdown' || key === 's' || code === 'arrowdown' || code === 'keys') return 'down';
                return null;
            };

            const keyDownHandler = (event: KeyboardEvent) => {
                const dir = toMoveDirection(event);
                if (!dir) return;
                const active = document.activeElement as HTMLElement | null;
                const isEditable = active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA' || active?.isContentEditable;
                if (isEditable) return;
                this.heldMoveKeys.add(dir);
                event.preventDefault();
            };
            const keyUpHandler = (event: KeyboardEvent) => {
                const dir = toMoveDirection(event);
                if (!dir) return;
                this.heldMoveKeys.delete(dir);
            };
            window.addEventListener('keydown', keyDownHandler, { capture: true });
            window.addEventListener('keyup', keyUpHandler, { capture: true });
            document.addEventListener('keydown', keyDownHandler, { capture: true });
            document.addEventListener('keyup', keyUpHandler, { capture: true });
            window.addEventListener('blur', () => this.heldMoveKeys.clear());
            this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
                window.removeEventListener('keydown', keyDownHandler, true);
                window.removeEventListener('keyup', keyUpHandler, true);
                document.removeEventListener('keydown', keyDownHandler, true);
                document.removeEventListener('keyup', keyUpHandler, true);
                this.heldMoveKeys.clear();
            });

            this.connectToServer();
        } catch (e) {
            console.error("CRITICAL PHASER ERROR", e);
        }
    }

    async connectToServer() {
        try {
            console.log("Connecting to Colyseus...");
            const wsEndpoint = resolveWsEndpoint();
            this.statusText.setText(`Colyseus Sync: Connecting to ${wsEndpoint}...`).setColor('#ffffaa');
            const client = new Colyseus.Client(wsEndpoint);
            this.room = await client.joinOrCreate('office');

            console.log("Room joined successfully!", this.room.sessionId);
            this.statusText.setText('Colyseus Sync: Connected (Waiting for state...)').setColor('#aaffaa');

            // Register server bootstrap messages immediately after join so Colyseus never drops them as unhandled.
            this.room.onMessage('tasks-sync', (message: any) => {
                eventBus.dispatchEvent(new CustomEvent('tasks-sync', { detail: message }));
            });
            this.room.onMessage('task-update', (message: any) => {
                eventBus.dispatchEvent(new CustomEvent('task-update', { detail: message }));
            });
            this.room.onMessage('supervisor-state', (message: any) => {
                eventBus.dispatchEvent(new CustomEvent('supervisor-state', { detail: message }));
            });

            // Wait for the first actual state payload from the server before reading
            this.room.onStateChange.once((state: any) => {
                activeRoom = this.room as Colyseus.Room<OfficeState>;
                console.log("First state payload arrived!", state.toJSON());
                console.log("Agents map size:", state.agents?.size);
                this.statusText.setText('Colyseus Sync: Active!').setColor('#00ff00');

                // Bind chat bus
                this.room!.onMessage('chat', (message: any) => {
                    eventBus.dispatchEvent(new CustomEvent('chat-message', { detail: message }));
                });
                this.room!.onMessage('highlight-event', (message: any) => {
                    eventBus.dispatchEvent(new CustomEvent('highlight-event', { detail: message }));
                    if (this.cinematicMode && message?.agentId) {
                        this.focusAgentTemporarily(message.agentId);
                    }
                });
                this.room!.onMessage('scenario-event', (message: any) => {
                    eventBus.dispatchEvent(new CustomEvent('scenario-event', { detail: message }));
                });
                this.room!.onMessage('relationship-update', (message: any) => {
                    eventBus.dispatchEvent(new CustomEvent('relationship-update', { detail: message }));
                });
                this.room!.onMessage('layout-sync', (message: any) => {
                    this.layoutItems = Array.isArray(message?.layout) ? message.layout : [];
                    this.renderCustomLayout(this.layoutItems);
                    eventBus.dispatchEvent(new CustomEvent('layout-sync', { detail: { items: this.layoutItems } }));
                });

                state.agents.onAdd((agent: AgentState, sessionId: string) => {
                    console.log(`[Colyseus] Agent added: ${agent.name} at (${agent.x}, ${agent.y})`);

                    const charKey = `char_${agentCharIndex(sessionId, agent.name)}`;
                    const container = this.add.container(agent.x * 16, agent.y * 16);
                    container.setDepth(5 + agent.y * 0.1);

                    // Ground shadow
                    const shadow = this.add.ellipse(0, 14, 14, 5, 0x000000, 0.28);

                    // Character sprite — start with idle-down pose
                    let sprite: Phaser.GameObjects.Sprite | Phaser.GameObjects.Rectangle;
                    if (this.textures.exists(charKey)) {
                        const s = this.add.sprite(0, -8, charKey, 1);
                        s.play(`${charKey}-idle-down`);
                        sprite = s;
                    } else {
                        sprite = this.add.rectangle(0, -8, 16, 32, 0x3a86ff);
                    }

                    // Speech / thought bubble (Graphics + Text for proper shaped bubble)
                    const bubbleGfx = this.add.graphics();
                    const bubbleText = this.add.text(0, -50, '', {
                        fontSize: '9px',
                        color: '#1a1a2e',
                        wordWrap: { width: 118, useAdvancedWrap: true },
                        align: 'center',
                        padding: { x: 7, y: 5 }
                    }).setOrigin(0.5, 1);
                    bubbleGfx.setVisible(false);
                    bubbleText.setVisible(false);

                    const showBubble = (text: string, isSpeech: boolean, durationMs = 6000) => {
                        bubbleText.setText(text);
                        const tw = Math.min(bubbleText.width + 6, 140);
                        const th = bubbleText.height + 2;
                        const bx = -tw / 2;
                        const by = -th - 46;
                        bubbleText.setPosition(0, by + th);

                        bubbleGfx.clear();
                        // shadow
                        bubbleGfx.fillStyle(0x000000, 0.18);
                        bubbleGfx.fillRoundedRect(bx + 2, by + 2, tw, th, 7);
                        // fill
                        bubbleGfx.fillStyle(isSpeech ? 0xffffff : 0xeeeeff, 0.96);
                        bubbleGfx.fillRoundedRect(bx, by, tw, th, 7);
                        // border
                        bubbleGfx.lineStyle(1, isSpeech ? 0x334466 : 0x8888cc, 0.85);
                        bubbleGfx.strokeRoundedRect(bx, by, tw, th, 7);
                        // tail pointing down to character
                        bubbleGfx.fillStyle(isSpeech ? 0xffffff : 0xeeeeff, 0.96);
                        bubbleGfx.fillTriangle(-5, by + th, 5, by + th, 0, by + th + 9);

                        bubbleGfx.setVisible(true);
                        bubbleText.setVisible(true);
                        this.tweens.killTweensOf(bubbleGfx);
                        this.tweens.killTweensOf(bubbleText);
                        bubbleGfx.setAlpha(0);
                        bubbleText.setAlpha(0);
                        this.tweens.add({ targets: [bubbleGfx, bubbleText], alpha: 1, duration: 180, ease: 'Cubic.easeOut' });

                        this.time.delayedCall(durationMs, () => {
                            this.tweens.add({
                                targets: [bubbleGfx, bubbleText], alpha: 0, duration: 350,
                                onComplete: () => { bubbleGfx.setVisible(false); bubbleText.setVisible(false); }
                            });
                        });
                    };

                    // Emote badge (emoji above head)
                    const emoteBubble = this.add.text(10, -26, '', { fontSize: '13px' }).setOrigin(0.5);
                    emoteBubble.setVisible(false);

                    const activityLabel = this.add.text(0, -28, '', {
                        fontSize: '8px',
                        color: '#fff4bf',
                        backgroundColor: '#2b213399',
                        padding: { x: 4, y: 1 }
                    }).setOrigin(0.5, 1);
                    activityLabel.setVisible(false);

                    // Name label — styled chip
                    const label = this.add.text(0, 15, agent.name, {
                        fontSize: '9px',
                        color: '#e8e8ff',
                        backgroundColor: '#1a183099',
                        padding: { x: 5, y: 2 }
                    }).setOrigin(0.5, 0);

                    // Focus ring (hidden by default)
                    const focusRing = this.add.graphics();
                    focusRing.lineStyle(2, 0x6c5ce7, 0.9);
                    focusRing.strokeCircle(0, 0, 16);
                    focusRing.setVisible(false);
                    container.setData('focusRing', focusRing);

                    container.add([shadow, focusRing, sprite, emoteBubble, activityLabel, bubbleGfx, bubbleText, label]);
                    container.setSize(32, 48);
                    container.setInteractive();
                    this.agentSprites.set(sessionId, container);

                    // Click to follow
                    container.on('pointerdown', () => {
                        if (this.followTarget === container) {
                            this.followTarget = null;
                            focusRing.setVisible(false);
                            eventBus.dispatchEvent(new CustomEvent('agent-focus', { detail: null }));
                        } else {
                            if (this.followTarget) {
                                (this.followTarget.getData('focusRing') as Phaser.GameObjects.Graphics | undefined)?.setVisible(false);
                            }
                            this.followTarget = container;
                            focusRing.setVisible(true);
                            eventBus.dispatchEvent(new CustomEvent('agent-focus', { detail: { name: agent.name, id: sessionId } }));
                        }
                    });

                    let prevX = agent.x;
                    let prevY = agent.y;
                    let lastAction = '';
                    let facing: Facing = 'down';

                    agent.onChange(() => {
                        const dx = agent.x - prevX;
                        const dy = agent.y - prevY;
                        const isMoving = dx !== 0 || dy !== 0;

                        // Update facing from movement direction
                        if (dx > 0)      facing = 'right';
                        else if (dx < 0) facing = 'left';
                        else if (dy > 0) facing = 'down';
                        else if (dy < 0) facing = 'up';

                        // Depth sort — agents lower on screen render in front
                        container.setDepth(5 + agent.y * 0.1);

                        this.tweens.add({
                            targets: container,
                            x: agent.x * 16,
                            y: agent.y * 16,
                            duration: isMoving ? MOVE_MS : 0,
                            ease: 'Sine.easeInOut',
                            onComplete: () => {
                                if (sprite.type === 'Sprite') {
                                    this.playAgentAnim(sprite as Phaser.GameObjects.Sprite, charKey, agent.action, facing);
                                }
                            }
                        });

                        // Play walk animation while moving
                        if (isMoving && sprite.type === 'Sprite') {
                            const s = sprite as Phaser.GameObjects.Sprite;
                            if (facing === 'right') { s.play(`${charKey}-walk-right`, true); s.setFlipX(false); }
                            else if (facing === 'left')  { s.play(`${charKey}-walk-right`, true); s.setFlipX(true); }
                            else if (facing === 'down')  { s.play(`${charKey}-walk-down`, true);  s.setFlipX(false); }
                            else                          { s.play(`${charKey}-walk-up`, true);    s.setFlipX(false); }
                        } else if (!isMoving && agent.action !== lastAction && sprite.type === 'Sprite') {
                            this.playAgentAnim(sprite as Phaser.GameObjects.Sprite, charKey, agent.action, facing);
                        }

                        // Emote pop on action change
                        const emoteMap: Record<string, string> = {
                            'work': '💻', 'talk': '💬', 'idle': '😌',
                            'use_tool': '🔧', 'move': '🚶', 'think': '💭',
                            'play_ping_pong': '🏓', 'play_arcade': '🕹️', 'sit_sofa': '🛋️',
                            'coffee_break': '☕', 'browse_books': '📚', 'whiteboard_jam': '📝'
                        };
                        const activityTextMap: Record<string, string> = {
                            'play_ping_pong': 'PING PONG',
                            'play_arcade': 'ARCADE',
                            'sit_sofa': 'SOFA BREAK',
                            'coffee_break': 'COFFEE',
                            'browse_books': 'READING',
                            'whiteboard_jam': 'WHITEBOARD'
                        };
                        const activityText = activityTextMap[agent.action] || '';
                        activityLabel.setText(activityText);
                        activityLabel.setVisible(Boolean(activityText));
                        const emote = emoteMap[agent.action] || '';
                        if (emote && agent.action !== lastAction) {
                            emoteBubble.setText(emote);
                            emoteBubble.setVisible(true);
                            emoteBubble.setScale(0.6);
                            this.tweens.killTweensOf(emoteBubble);
                            this.tweens.add({ targets: emoteBubble, scaleX: 1, scaleY: 1, duration: 200, ease: 'Back.easeOut' });
                            this.time.delayedCall(3000, () => {
                                this.tweens.add({ targets: emoteBubble, alpha: 0, duration: 300, onComplete: () => { emoteBubble.setVisible(false); emoteBubble.setAlpha(1); } });
                            });
                        }

                        // Speech / thought bubble
                        if (agent.thought && agent.thought !== '') {
                            showBubble(agent.thought, agent.action === 'talk', 6000);
                        }

                        // Event bus
                        if (agent.action !== lastAction || agent.thought !== '') {
                            eventBus.dispatchEvent(new CustomEvent('activity-log', {
                                detail: { agent: agent.name, action: agent.action, thought: agent.thought, time: new Date().toLocaleTimeString() }
                            }));
                        }
                        eventBus.dispatchEvent(new CustomEvent('agent-telemetry', {
                            detail: {
                                id: sessionId, name: agent.name,
                                mood: Number(agent.mood || 0), reputation: Number(agent.reputation || 0),
                                riskLevel: Number(agent.riskLevel || 0), momentum: Number(agent.momentum || 0),
                                action: agent.action
                            }
                        }));

                        lastAction = agent.action;
                        prevX = agent.x;
                        prevY = agent.y;
                    });
                });

                state.agents.onRemove((agent: AgentState, sessionId: string) => {
                    const sprite = this.agentSprites.get(sessionId);
                    if (sprite) {
                        sprite.destroy();
                        this.agentSprites.delete(sessionId);
                    }
                });
            });

        } catch (e) {
            console.error(e);
            const wsEndpoint = resolveWsEndpoint();
            this.statusText.setText(`Colyseus Sync: Failed (${wsEndpoint})`).setColor('#ffaaaa');
        }
    }

    update() {
        if (this.cinematicReleaseAt > 0 && Date.now() > this.cinematicReleaseAt) {
            this.cinematicReleaseAt = 0;
            this.followTarget = null;
        }
        const speed = 5;
        const manualPan =
            this.heldMoveKeys.size > 0 ||
            Boolean(this.cursors?.left.isDown) ||
            Boolean(this.cursors?.right.isDown) ||
            Boolean(this.cursors?.up.isDown) ||
            Boolean(this.cursors?.down.isDown);
        if (manualPan) {
            // User input should always win over cinematic follow.
            this.followTarget = null;
            this.cinematicReleaseAt = 0;
            if (this.cursors?.left.isDown || this.heldMoveKeys.has('left')) this.cameras.main.scrollX -= speed;
            if (this.cursors?.right.isDown || this.heldMoveKeys.has('right')) this.cameras.main.scrollX += speed;
            if (this.cursors?.up.isDown || this.heldMoveKeys.has('up')) this.cameras.main.scrollY -= speed;
            if (this.cursors?.down.isDown || this.heldMoveKeys.has('down')) this.cameras.main.scrollY += speed;
        }
        // If following an agent, smoothly track them
        if (this.followTarget && !manualPan) {
            const cam = this.cameras.main;
            const targetX = this.followTarget.x - cam.width / (2 * cam.zoom);
            const targetY = this.followTarget.y - cam.height / (2 * cam.zoom);
            cam.scrollX += (targetX - cam.scrollX) * 0.08;
            cam.scrollY += (targetY - cam.scrollY) * 0.08;
        }
        const cam = this.cameras.main;
        const maxScrollX = Math.max(0, this.gridSize - cam.width / cam.zoom);
        const maxScrollY = Math.max(0, this.gridSize - cam.height / cam.zoom);
        cam.scrollX = Phaser.Math.Clamp(cam.scrollX, 0, maxScrollX);
        cam.scrollY = Phaser.Math.Clamp(cam.scrollY, 0, maxScrollY);
    }


    private officeCoverZoom() {
        const width = Math.max(1, this.scale.width || window.innerWidth || 1);
        const height = Math.max(1, this.scale.height || window.innerHeight || 1);
        return Math.max(width / this.gridSize, height / this.gridSize, 1.05);
    }

    private fitCameraToOffice() {
        const cam = this.cameras.main;
        const coverZoom = this.officeCoverZoom();
        cam.setZoom(Phaser.Math.Clamp(coverZoom, coverZoom, 6));
        cam.centerOn(this.gridSize / 2, this.gridSize / 2);
        cam.setBounds(0, 0, this.gridSize, this.gridSize);
    }

    private drawPolishedOfficeMap(g: Phaser.GameObjects.Graphics, size: number) {
        this.drawOfficeFloor(g, size);
        this.drawOuterWalls(g, size);
        this.drawWalkways(g);

        const departments: DepartmentZone[] = [
            { name: 'ART', x: 64, y: 72, w: 256, h: 224, accent: 0xd36bff, rug: 0x4b274f, desk: 0x73505f, screen: 0xff83d1, cluster: 'creative' },
            { name: 'CONTENT', x: 352, y: 72, w: 272, h: 224, accent: 0x58d5ff, rug: 0x203f4d, desk: 0x5d4a35, screen: 0x74d8ff, cluster: 'editorial' },
            { name: 'META OPS', x: 672, y: 96, w: 256, h: 200, accent: 0x66e28d, rug: 0x21412f, desk: 0x4d5b43, screen: 0x8aff9b, cluster: 'terminal' },
            { name: 'POLISH', x: 72, y: 384, w: 248, h: 232, accent: 0xffc857, rug: 0x51431f, desk: 0x6d5434, screen: 0xffdf7a, cluster: 'review' },
            { name: 'QA', x: 368, y: 408, w: 240, h: 208, accent: 0x43e0c5, rug: 0x1f4a45, desk: 0x445c5a, screen: 0x61fff0, cluster: 'bench' },
            { name: 'RESEARCH', x: 664, y: 384, w: 280, h: 232, accent: 0x9b83ff, rug: 0x302f59, desk: 0x5c4f6f, screen: 0xb8a6ff, cluster: 'library' }
        ];

        departments.forEach((dept, index) => this.drawDepartmentZone(g, dept, index));
        this.drawSharedMeetingArea(g, 392, 272);
        this.drawCoffeeArea(g, 520, 304);
        this.drawRestArea(g, 392, 704);
        this.drawReceptionStorage(g, 820, 648);
        this.drawSoftDivider(g, 336, 56, 8, 224, 0x483e52);
        this.drawSoftDivider(g, 640, 72, 8, 192, 0x3b4d43);
        this.drawSoftDivider(g, 336, 392, 8, 200, 0x4f4434);
        this.drawSoftDivider(g, 632, 392, 8, 208, 0x3e3b55);

        [
            [48, 336], [296, 344], [632, 328], [952, 336], [336, 648],
            [624, 648], [944, 72], [48, 648], [512, 92], [176, 656]
        ].forEach(([x, y]) => this.drawPlant(g, x, y));
    }

    private drawOfficeFloor(g: Phaser.GameObjects.Graphics, size: number) {
        g.fillStyle(0x242231, 1);
        g.fillRect(0, 0, size, size);
        g.fillStyle(0x3a3441, 1);
        g.fillRect(32, 32, size - 64, size - 64);

        for (let y = 32; y < size - 32; y += 16) {
            for (let x = 32; x < size - 32; x += 16) {
                const seed = (x * 17 + y * 31 + ((x ^ y) << 1)) & 7;
                const color = seed === 0 ? 0x403947 : seed === 1 ? 0x36313d : seed === 2 ? 0x3d3744 : 0x3a3441;
                g.fillStyle(color, 1);
                g.fillRect(x, y, 16, 16);
                if (((x / 16 + y / 16) % 5) === 0) {
                    g.fillStyle(0x4a4250, 0.24);
                    g.fillRect(x + 2, y + 2, 2, 2);
                }
            }
        }

        g.lineStyle(1, 0x2c2834, 0.22);
        g.beginPath();
        for (let i = 32; i <= size - 32; i += 16) {
            g.moveTo(i, 32).lineTo(i, size - 32);
            g.moveTo(32, i).lineTo(size - 32, i);
        }
        g.strokePath();
    }

    private drawOuterWalls(g: Phaser.GameObjects.Graphics, size: number) {
        g.fillStyle(0x171520, 1);
        g.fillRect(0, 0, size, 32);
        g.fillRect(0, size - 32, size, 32);
        g.fillRect(0, 0, 32, size);
        g.fillRect(size - 32, 0, 32, size);
        g.fillStyle(0x54495b, 1);
        g.fillRect(32, 32, size - 64, 8);
        g.fillRect(32, size - 40, size - 64, 8);
        g.fillRect(32, 32, 8, size - 64);
        g.fillRect(size - 40, 32, 8, size - 64);
        g.fillStyle(0x2c2632, 1);
        g.fillRect(40, 48, size - 80, 8);
        g.fillRect(40, size - 56, size - 80, 8);
        g.fillRect(48, 40, 8, size - 80);
        g.fillRect(size - 56, 40, 8, size - 80);
    }

    private drawWalkways(g: Phaser.GameObjects.Graphics) {
        g.fillStyle(0x47404a, 0.52);
        g.fillRect(320, 304, 384, 64);
        g.fillRect(472, 176, 80, 512);
        g.fillRect(112, 320, 824, 48);
        g.lineStyle(1, 0x6a5f69, 0.28);
        g.strokeRect(320, 304, 384, 64);
        g.strokeRect(472, 176, 80, 512);
    }

    private drawDepartmentZone(g: Phaser.GameObjects.Graphics, dept: DepartmentZone, index: number) {
        this.drawRoomShell(g, dept.x, dept.y, dept.w, dept.h, dept.accent, index);
        this.drawRug(g, dept.x + 24, dept.y + 56, dept.w - 48, dept.h - 88, dept.rug, dept.accent);
        this.drawTeamLabelPlaque(dept.name, dept.x + 24, dept.y + 16, dept.accent);

        if (dept.cluster === 'creative') {
            this.drawDeskCluster(g, dept.x + 48, dept.y + 96, dept.desk, dept.screen, dept.accent, 2);
            this.drawWhiteboard(g, dept.x + 168, dept.y + 48, 72, 40, dept.accent, 'ART');
            this.drawCabinet(g, dept.x + 28, dept.y + 160, dept.accent);
        } else if (dept.cluster === 'editorial') {
            this.drawDeskCluster(g, dept.x + 48, dept.y + 88, dept.desk, dept.screen, dept.accent, 3);
            this.drawShelf(g, dept.x + 188, dept.y + 48, 56, 88, dept.accent);
            this.drawWhiteboard(g, dept.x + 24, dept.y + 48, 88, 36, dept.accent, 'DRAFTS');
        } else if (dept.cluster === 'terminal') {
            this.drawDeskCluster(g, dept.x + 40, dept.y + 80, dept.desk, dept.screen, dept.accent, 2);
            this.drawServerRack(g, dept.x + 184, dept.y + 64, dept.accent);
            this.drawCabinet(g, dept.x + 184, dept.y + 144, dept.accent);
        } else if (dept.cluster === 'review') {
            this.drawDeskCluster(g, dept.x + 44, dept.y + 88, dept.desk, dept.screen, dept.accent, 2);
            this.drawWhiteboard(g, dept.x + 144, dept.y + 48, 76, 46, dept.accent, 'POLISH');
            this.drawLamp(g, dept.x + 204, dept.y + 156, dept.accent);
        } else if (dept.cluster === 'bench') {
            this.drawTestBench(g, dept.x + 36, dept.y + 84, dept.accent);
            this.drawDeskCluster(g, dept.x + 120, dept.y + 112, dept.desk, dept.screen, dept.accent, 2);
            this.drawWhiteboard(g, dept.x + 28, dept.y + 48, 84, 36, dept.accent, 'CHECKS');
        } else {
            this.drawShelf(g, dept.x + 28, dept.y + 50, 64, 104, dept.accent);
            this.drawDeskCluster(g, dept.x + 124, dept.y + 96, dept.desk, dept.screen, dept.accent, 2);
            this.drawWhiteboard(g, dept.x + 172, dept.y + 48, 76, 40, dept.accent, 'NOTES');
        }
    }

    private drawRoomShell(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, accent: number, index: number) {
        // Soft room envelope: these are wall strips and baseboards, not isolated panes.
        g.fillStyle(0x1a1720, 0.2);
        g.fillRect(x + 8, y + 10, w - 16, 10);
        g.fillRect(x + 8, y + h - 6, w - 16, 8);
        g.fillStyle(index % 2 === 0 ? 0x514956 : 0x4b4552, 0.34);
        g.fillRect(x + 8, y + 28, w - 16, 16);
        g.fillStyle(accent, 0.16);
        g.fillRect(x + 20, y + 44, w - 40, 10);
        g.fillStyle(0x6b5e68, 0.78);
        g.fillRect(x + 8, y + 28, w - 16, 4);
        g.fillStyle(0x27242d, 0.92);
        g.fillRect(x + 8, y + h - 16, w - 16, 8);
        g.fillStyle(accent, 0.42);
        g.fillRect(x + 24, y + h - 16, w - 48, 2);
        // Partial wall lips: leave broad open corridors instead of boxed team rectangles.
        g.fillStyle(0x5b505b, 0.7);
        g.fillRect(x, y, Math.floor(w * 0.42), 8);
        g.fillRect(x + Math.floor(w * 0.58), y, Math.floor(w * 0.42), 8);
        g.fillRect(x, y, 8, Math.floor(h * 0.28));
        g.fillRect(x + w - 8, y, 8, Math.floor(h * 0.28));
    }

    private drawTeamLabelPlaque(text: string, x: number, y: number, accent: number) {
        const g = this.add.graphics();
        g.fillStyle(0x171520, 0.86);
        g.fillRect(x, y, 88, 20);
        g.fillStyle(accent, 0.86);
        g.fillRect(x, y, 5, 20);
        g.lineStyle(1, accent, 0.8);
        g.strokeRect(x, y, 88, 20);
        this.add.text(x + 48, y + 10, text, {
            fontSize: '9px',
            color: '#f8ecdc',
            fontStyle: 'bold'
        }).setOrigin(0.5);
    }

    private drawRug(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, color: number, accent: number) {
        this.drawPixelShadow(g, x + 4, y + 6, w, h);
        g.fillStyle(color, 0.72);
        g.fillRect(x, y, w, h);
        g.lineStyle(2, accent, 0.38);
        g.strokeRect(x + 4, y + 4, w - 8, h - 8);
        for (let i = x + 16; i < x + w - 16; i += 32) {
            g.fillStyle(accent, 0.12);
            g.fillRect(i, y + 8, 12, h - 16);
        }
    }

    private drawSoftDivider(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, color: number) {
        this.drawPixelShadow(g, x + 2, y + 4, w, h);
        g.fillStyle(color, 0.85);
        g.fillRect(x, y, w, h);
        g.fillStyle(0xb9d7d7, 0.18);
        g.fillRect(x + 1, y + 6, Math.max(1, w - 2), h - 12);
    }

    private drawPixelShadow(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number) {
        g.fillStyle(0x0c0b10, 0.26);
        g.fillRect(x, y, w, h);
    }

    private drawDeskCluster(g: Phaser.GameObjects.Graphics, x: number, y: number, desk: number, screen: number, accent: number, count: number) {
        for (let i = 0; i < count; i++) {
            const dx = x + (i % 2) * 86;
            const dy = y + Math.floor(i / 2) * 70;
            this.drawWorkstation(g, dx, dy, desk, screen, accent, i % 2 === 1);
        }
    }

    private drawWorkstation(g: Phaser.GameObjects.Graphics, x: number, y: number, desk: number, screen: number, accent: number, flipped = false) {
        this.drawPixelShadow(g, x + 4, y + 42, 64, 20);
        g.fillStyle(0x24202a, 1);
        g.fillRect(x + 18, y + 38, 28, 22);
        g.fillStyle(accent, 0.62);
        g.fillRect(x + 20, y + 40, 24, 16);
        this.drawPixelShadow(g, x + 4, y + 5, 72, 36);
        g.fillStyle(0x352719, 1);
        g.fillRect(x, y, 72, 38);
        g.fillStyle(desk, 1);
        g.fillRect(x + 2, y + 2, 68, 30);
        g.fillStyle(0x9f7651, 0.35);
        g.fillRect(x + 4, y + 4, 64, 4);
        g.fillStyle(0x1c1e25, 1);
        g.fillRect(x + (flipped ? 40 : 8), y + 6, 24, 16);
        g.fillStyle(screen, 0.86);
        g.fillRect(x + (flipped ? 43 : 11), y + 9, 18, 10);
        g.fillStyle(0x1a1920, 1);
        g.fillRect(x + (flipped ? 48 : 16), y + 22, 8, 3);
        g.fillRect(x + (flipped ? 44 : 12), y + 25, 16, 2);
        this.drawPaper(g, x + (flipped ? 10 : 42), y + 9);
        this.drawMug(g, x + (flipped ? 28 : 60), y + 25, accent);
        this.drawLamp(g, x + (flipped ? 58 : 8), y + 24, accent);
    }

    private drawPaper(g: Phaser.GameObjects.Graphics, x: number, y: number) {
        g.fillStyle(0xf4e8c8, 1);
        g.fillRect(x, y, 14, 18);
        g.lineStyle(1, 0xc9ad72, 0.8);
        g.beginPath();
        g.moveTo(x + 3, y + 5).lineTo(x + 11, y + 5);
        g.moveTo(x + 3, y + 9).lineTo(x + 12, y + 9);
        g.moveTo(x + 3, y + 13).lineTo(x + 9, y + 13);
        g.strokePath();
    }

    private drawMug(g: Phaser.GameObjects.Graphics, x: number, y: number, color: number) {
        g.fillStyle(color, 1);
        g.fillRect(x, y, 6, 7);
        g.fillStyle(0x241d22, 0.5);
        g.fillRect(x + 2, y + 1, 2, 2);
        g.lineStyle(1, color, 0.8);
        g.strokeRect(x + 5, y + 2, 3, 3);
    }

    private drawLamp(g: Phaser.GameObjects.Graphics, x: number, y: number, color: number) {
        g.fillStyle(0x1c1920, 1);
        g.fillRect(x, y - 10, 3, 12);
        g.fillRect(x - 4, y + 1, 11, 3);
        g.fillStyle(color, 0.86);
        g.fillRect(x - 6, y - 15, 14, 6);
        g.fillStyle(0xfff2a8, 0.18);
        g.fillRect(x - 10, y - 8, 22, 12);
    }

    private drawPlant(g: Phaser.GameObjects.Graphics, px: number, py: number) {
        this.drawPixelShadow(g, px - 8, py + 7, 18, 6);
        g.fillStyle(0x744126, 1);
        g.fillRect(px - 7, py, 14, 10);
        g.fillStyle(0x9b623c, 1);
        g.fillRect(px - 5, py + 2, 10, 7);
        g.fillStyle(0x2f7d4e, 1);
        g.fillRect(px - 2, py - 13, 4, 14);
        g.fillStyle(0x42b06a, 1);
        g.fillRect(px - 10, py - 12, 8, 6);
        g.fillRect(px + 2, py - 15, 8, 6);
        g.fillStyle(0x6ee083, 0.9);
        g.fillRect(px - 6, py - 18, 7, 6);
        g.fillRect(px + 4, py - 8, 8, 5);
    }

    private drawWhiteboard(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, accent: number, label: string) {
        this.drawPixelShadow(g, x + 3, y + 4, w, h);
        g.fillStyle(0xdedbd2, 1);
        g.fillRect(x, y, w, h);
        g.lineStyle(2, 0x6c6670, 1);
        g.strokeRect(x, y, w, h);
        g.lineStyle(1, accent, 0.72);
        g.beginPath();
        g.moveTo(x + 8, y + 12).lineTo(x + 22, y + 8).lineTo(x + 38, y + 17).lineTo(x + w - 12, y + 10);
        g.moveTo(x + 8, y + h - 12).lineTo(x + 26, y + h - 16).lineTo(x + 44, y + h - 10);
        g.strokePath();
        this.add.text(x + w / 2, y + h / 2 + 2, label, { fontSize: '8px', color: '#4c4650' }).setOrigin(0.5);
    }

    private drawCabinet(g: Phaser.GameObjects.Graphics, x: number, y: number, accent: number) {
        this.drawPixelShadow(g, x + 4, y + 5, 42, 54);
        g.fillStyle(0x4b4350, 1);
        g.fillRect(x, y, 40, 52);
        g.fillStyle(0x5d5260, 1);
        g.fillRect(x + 4, y + 4, 32, 20);
        g.fillRect(x + 4, y + 28, 32, 20);
        g.fillStyle(accent, 0.75);
        g.fillRect(x + 30, y + 13, 4, 3);
        g.fillRect(x + 30, y + 37, 4, 3);
    }

    private drawShelf(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, accent: number) {
        this.drawPixelShadow(g, x + 5, y + 6, w, h);
        g.fillStyle(0x4a3223, 1);
        g.fillRect(x, y, w, h);
        for (let row = 0; row < 3; row++) {
            g.fillStyle(0x65452f, 1);
            g.fillRect(x + 4, y + 8 + row * 28, w - 8, 18);
            for (let b = 0; b < Math.floor((w - 12) / 8); b++) {
                const color = b % 4 === 0 ? accent : b % 4 === 1 ? 0xe16d5b : b % 4 === 2 ? 0xe7c66a : 0x69c38f;
                g.fillStyle(color, 0.9);
                g.fillRect(x + 8 + b * 8, y + 10 + row * 28, 5, 14);
            }
        }
    }

    private drawServerRack(g: Phaser.GameObjects.Graphics, x: number, y: number, accent: number) {
        this.drawPixelShadow(g, x + 4, y + 5, 44, 70);
        g.fillStyle(0x1d2028, 1);
        g.fillRect(x, y, 42, 68);
        for (let i = 0; i < 5; i++) {
            g.fillStyle(0x333845, 1);
            g.fillRect(x + 5, y + 6 + i * 12, 32, 8);
            g.fillStyle(i % 2 === 0 ? accent : 0xff5b5b, 1);
            g.fillRect(x + 29, y + 8 + i * 12, 3, 3);
        }
    }

    private drawTestBench(g: Phaser.GameObjects.Graphics, x: number, y: number, accent: number) {
        this.drawPixelShadow(g, x + 4, y + 5, 72, 48);
        g.fillStyle(0x3d3b45, 1);
        g.fillRect(x, y, 76, 38);
        g.fillStyle(0x54515f, 1);
        g.fillRect(x + 4, y + 4, 68, 28);
        for (let i = 0; i < 3; i++) {
            g.fillStyle(0x1a1d22, 1);
            g.fillRect(x + 10 + i * 20, y + 8, 14, 12);
            g.fillStyle(accent, 0.78);
            g.fillRect(x + 12 + i * 20, y + 10, 10, 8);
        }
        this.drawPaper(g, x + 54, y + 12);
    }

    private drawSharedMeetingArea(g: Phaser.GameObjects.Graphics, x: number, y: number) {
        this.drawRug(g, x - 88, y - 48, 184, 104, 0x373052, 0xd8c6ff);
        this.drawTeamLabelPlaque('LOUNGE', x - 40, y - 70, 0xd8c6ff);
        this.drawPixelShadow(g, x - 54, y - 14, 112, 48);
        g.fillStyle(0x6b4c32, 1);
        g.fillRect(x - 56, y - 18, 112, 44);
        g.fillStyle(0x805f3e, 1);
        g.fillRect(x - 52, y - 14, 104, 36);
        [[x - 72, y - 26], [x - 24, y - 40], [x + 24, y - 40], [x + 72, y - 26], [x - 72, y + 30], [x + 72, y + 30]].forEach(([cx, cy]) => {
            g.fillStyle(0x24202a, 1);
            g.fillRect(cx - 10, cy - 8, 20, 16);
            g.fillStyle(0x7c6a87, 1);
            g.fillRect(cx - 8, cy - 6, 16, 12);
        });
        this.drawMug(g, x - 20, y, 0xd8c6ff);
        this.drawPaper(g, x + 12, y - 8);
    }

    private drawCoffeeArea(g: Phaser.GameObjects.Graphics, x: number, y: number) {
        this.drawRug(g, x - 36, y - 24, 128, 80, 0x2e4236, 0x74e0a3);
        this.drawTeamLabelPlaque('COFFEE', x - 22, y - 44, 0x74e0a3);
        this.drawPixelShadow(g, x, y, 92, 28);
        g.fillStyle(0x4d3524, 1);
        g.fillRect(x, y - 4, 92, 24);
        g.fillStyle(0x6b5136, 1);
        g.fillRect(x + 4, y, 84, 16);
        g.fillStyle(0x20242b, 1);
        g.fillRect(x + 12, y - 24, 20, 24);
        g.fillStyle(0xa6b0b8, 1);
        g.fillRect(x + 15, y - 21, 14, 10);
        g.fillStyle(0xff5b5b, 1);
        g.fillRect(x + 23, y - 7, 3, 3);
        g.fillStyle(0xdedbd2, 1);
        g.fillRect(x + 44, y - 20, 24, 16);
        g.fillStyle(0x20242b, 1);
        g.fillRect(x + 47, y - 17, 14, 10);
        this.drawMug(g, x + 74, y + 5, 0x74e0a3);
        this.drawPlant(g, x + 104, y + 40);
    }

    private drawRestArea(g: Phaser.GameObjects.Graphics, x: number, y: number) {
        this.drawRug(g, x - 24, y - 8, 392, 128, 0x2b3354, 0xffcf70);
        this.drawTeamLabelPlaque('REST', x + 120, y - 28, 0xffcf70);
        this.drawPingPongTable(g, x + 32, y + 20);
        this.drawSnackBar(g, x + 152, y + 36);
        this.drawArcadeCabinet(g, x + 216, y - 4);
        this.drawSofa(g, x + 292, y + 60);
        this.drawPlant(g, x + 384, y + 96);
    }

    private drawPingPongTable(g: Phaser.GameObjects.Graphics, x: number, y: number) {
        this.drawPixelShadow(g, x + 5, y + 38, 92, 18);
        g.fillStyle(0x173d52, 1);
        g.fillRect(x, y, 96, 44);
        g.fillStyle(0x1e6d87, 1);
        g.fillRect(x + 4, y + 4, 88, 36);
        g.lineStyle(2, 0xeef7ff, 0.85);
        g.strokeRect(x + 4, y + 4, 88, 36);
        g.beginPath();
        g.moveTo(x + 48, y + 5).lineTo(x + 48, y + 39);
        g.moveTo(x + 6, y + 22).lineTo(x + 90, y + 22);
        g.strokePath();
        g.fillStyle(0xffffff, 1);
        g.fillRect(x + 27, y + 16, 3, 3);
        g.fillStyle(0xff7b7b, 1);
        g.fillRect(x - 8, y + 24, 10, 4);
        g.fillStyle(0x7be0ff, 1);
        g.fillRect(x + 94, y + 12, 10, 4);
    }

    private drawArcadeCabinet(g: Phaser.GameObjects.Graphics, x: number, y: number) {
        this.drawPixelShadow(g, x + 4, y + 44, 40, 14);
        g.fillStyle(0x28172f, 1);
        g.fillRect(x, y, 38, 58);
        g.fillStyle(0xff4fd8, 1);
        g.fillRect(x + 4, y + 4, 30, 8);
        g.fillStyle(0x101922, 1);
        g.fillRect(x + 6, y + 16, 26, 24);
        g.fillStyle(0x7df9ff, 1);
        g.fillRect(x + 9, y + 19, 20, 15);
        g.fillStyle(0xffcf70, 1);
        g.fillRect(x + 10, y + 46, 4, 4);
        g.fillStyle(0xff5b5b, 1);
        g.fillRect(x + 21, y + 46, 4, 4);
    }

    private drawSofa(g: Phaser.GameObjects.Graphics, x: number, y: number) {
        this.drawPixelShadow(g, x + 5, y + 32, 96, 18);
        g.fillStyle(0x36223f, 1);
        g.fillRect(x, y, 100, 42);
        g.fillStyle(0x734a82, 1);
        g.fillRect(x + 4, y + 6, 92, 22);
        g.fillStyle(0x8e5aa0, 1);
        g.fillRect(x + 8, y + 14, 38, 20);
        g.fillRect(x + 54, y + 14, 38, 20);
        g.fillStyle(0xffcf70, 0.86);
        g.fillRect(x + 12, y + 10, 14, 10);
        g.fillStyle(0x201626, 1);
        g.fillRect(x + 2, y + 34, 8, 10);
        g.fillRect(x + 90, y + 34, 8, 10);
    }

    private drawSnackBar(g: Phaser.GameObjects.Graphics, x: number, y: number) {
        this.drawPixelShadow(g, x + 3, y + 24, 64, 16);
        g.fillStyle(0x51331f, 1);
        g.fillRect(x, y, 68, 30);
        g.fillStyle(0x7a5130, 1);
        g.fillRect(x + 4, y + 4, 60, 14);
        this.drawMug(g, x + 12, y + 9, 0xffcf70);
        g.fillStyle(0xffcf70, 1);
        g.fillRect(x + 34, y - 14, 18, 16);
        g.fillStyle(0x20242b, 1);
        g.fillRect(x + 38, y - 10, 10, 8);
    }

    private drawReceptionStorage(g: Phaser.GameObjects.Graphics, x: number, y: number) {
        this.drawTeamLabelPlaque('STORAGE', x - 48, y - 44, 0xf2a65a);
        this.drawCabinet(g, x - 64, y - 12, 0xf2a65a);
        this.drawCabinet(g, x - 16, y - 12, 0xf2a65a);
        this.drawShelf(g, x + 40, y - 32, 56, 72, 0xf2a65a);
    }

    private focusAgentTemporarily(agentId: string) {
        const target = this.agentSprites.get(agentId);
        if (!target) return;
        this.followTarget = target;
        this.cinematicReleaseAt = Date.now() + 7000;
    }

    private renderCustomLayout(items: Array<{ type: string; x: number; y: number; label?: string }>) {
        if (!this.customLayoutLayer) return;
        this.customLayoutLayer.removeAll(true);
        for (let index = 0; index < items.length; index++) {
            const source = items[index] as { id?: string; type: string; x: number; y: number; label?: string };
            const item = {
                ...source,
                id: source.id || `layout_${index}`
            };
            const x = Math.round(item.x) * 16;
            const y = Math.round(item.y) * 16;
            const group = this.add.container(x, y);
            const g = this.add.graphics();
            this.drawCustomLayoutItem(g, item.type);
            group.add(g);
            if (item.label) {
                const label = this.add.text(0, 10, item.label.slice(0, 8), { fontSize: '8px', color: '#dfe6f3' }).setOrigin(0.5, 0);
                group.add(label);
            }
            group.setSize(22, 22);
            group.setInteractive(new Phaser.Geom.Rectangle(-11, -11, 22, 22), Phaser.Geom.Rectangle.Contains);
            group.on('pointerdown', () => {
                if (!this.layoutEditMode) return;
                this.layoutDragItemId = item.id;
            });
            this.customLayoutLayer.add(group);
        }
    }

    private drawCustomLayoutItem(g: Phaser.GameObjects.Graphics, type: string) {
        switch (type) {
            case 'plant':
                this.drawMiniPlant(g);
                break;
            case 'desk':
                this.drawMiniDesk(g);
                break;
            case 'bookshelf':
                this.drawMiniBookshelf(g);
                break;
            case 'coffee_machine':
                this.drawMiniCoffeeMachine(g);
                break;
            case 'table':
                this.drawMiniTable(g);
                break;
            case 'chair':
                this.drawMiniChair(g);
                break;
            case 'whiteboard':
                this.drawMiniWhiteboard(g);
                break;
            case 'arcade':
            case 'arcade_cabinet':
                this.drawMiniArcadeCabinet(g);
                break;
            case 'sofa':
                this.drawMiniSofa(g);
                break;
            case 'ping_pong':
            case 'ping_pong_table':
                this.drawMiniPingPongTable(g);
                break;
            default:
                this.drawMiniUnknownProp(g);
        }
    }

    private drawMiniDropShadow(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number) {
        g.fillStyle(0x09070d, 0.34);
        g.fillRect(x, y, w, h);
    }

    private drawMiniPlant(g: Phaser.GameObjects.Graphics) {
        this.drawMiniDropShadow(g, -8, 6, 18, 5);
        g.fillStyle(0x744126, 1);
        g.fillRect(-6, 0, 12, 9);
        g.fillStyle(0x9b623c, 1);
        g.fillRect(-4, 2, 8, 6);
        g.fillStyle(0x2f7d4e, 1);
        g.fillRect(-1, -9, 3, 10);
        g.fillStyle(0x42b06a, 1);
        g.fillRect(-9, -9, 8, 5);
        g.fillRect(1, -12, 8, 5);
        g.fillStyle(0x6ee083, 0.9);
        g.fillRect(-5, -15, 6, 5);
        g.fillRect(4, -6, 7, 4);
    }

    private drawMiniDesk(g: Phaser.GameObjects.Graphics) {
        this.drawMiniDropShadow(g, -13, 7, 30, 8);
        g.fillStyle(0x332317, 1);
        g.fillRect(-14, -9, 32, 18);
        g.fillStyle(0x805f3e, 1);
        g.fillRect(-12, -7, 28, 13);
        g.fillStyle(0x9f7651, 0.35);
        g.fillRect(-10, -5, 24, 3);
        g.fillStyle(0x1c1e25, 1);
        g.fillRect(-8, -5, 11, 8);
        g.fillStyle(0x7df9ff, 0.9);
        g.fillRect(-6, -3, 7, 4);
        g.fillStyle(0xffcf70, 1);
        g.fillRect(9, 0, 3, 4);
    }

    private drawMiniBookshelf(g: Phaser.GameObjects.Graphics) {
        this.drawMiniDropShadow(g, -8, 9, 21, 7);
        g.fillStyle(0x4a3223, 1);
        g.fillRect(-8, -14, 18, 28);
        for (let row = 0; row < 2; row++) {
            g.fillStyle(0x65452f, 1);
            g.fillRect(-6, -10 + row * 12, 14, 8);
            [0xffcf70, 0x58d5ff, 0xe16d5b, 0x66e28d].forEach((color, idx) => {
                g.fillStyle(color, 0.95);
                g.fillRect(-4 + idx * 3, -9 + row * 12, 2, 6);
            });
        }
    }

    private drawMiniCoffeeMachine(g: Phaser.GameObjects.Graphics) {
        this.drawMiniDropShadow(g, -8, 8, 18, 6);
        g.fillStyle(0x151820, 1);
        g.fillRect(-7, -12, 14, 24);
        g.fillStyle(0xa6b0b8, 1);
        g.fillRect(-4, -9, 8, 7);
        g.fillStyle(0xff5b5b, 1);
        g.fillRect(3, 4, 3, 3);
        g.fillStyle(0xdedbd2, 1);
        g.fillRect(-2, 8, 5, 4);
    }

    private drawMiniTable(g: Phaser.GameObjects.Graphics) {
        this.drawMiniDropShadow(g, -14, 7, 32, 8);
        g.fillStyle(0x6b4c32, 1);
        g.fillRect(-14, -8, 32, 16);
        g.fillStyle(0x805f3e, 1);
        g.fillRect(-12, -6, 28, 12);
        g.fillStyle(0xf4e8c8, 1);
        g.fillRect(2, -4, 7, 9);
    }

    private drawMiniChair(g: Phaser.GameObjects.Graphics) {
        this.drawMiniDropShadow(g, -8, 5, 16, 6);
        g.fillStyle(0x24202a, 1);
        g.fillRect(-8, -5, 16, 11);
        g.fillStyle(0x7c6a87, 1);
        g.fillRect(-6, -3, 12, 8);
        g.fillStyle(0x171520, 1);
        g.fillRect(-6, 5, 3, 5);
        g.fillRect(3, 5, 3, 5);
    }

    private drawMiniWhiteboard(g: Phaser.GameObjects.Graphics) {
        this.drawMiniDropShadow(g, -12, 8, 26, 7);
        g.fillStyle(0xdedbd2, 1);
        g.fillRect(-12, -10, 24, 16);
        g.lineStyle(1, 0x6c6670, 1);
        g.strokeRect(-12, -10, 24, 16);
        g.lineStyle(1, 0x58d5ff, 0.75);
        g.beginPath();
        g.moveTo(-8, -2).lineTo(-3, -6).lineTo(3, -1).lineTo(9, -5);
        g.moveTo(-8, 3).lineTo(-2, 1).lineTo(6, 3);
        g.strokePath();
    }

    private drawMiniArcadeCabinet(g: Phaser.GameObjects.Graphics) {
        this.drawMiniDropShadow(g, -8, 9, 20, 6);
        g.fillStyle(0x28172f, 1);
        g.fillRect(-7, -15, 16, 29);
        g.fillStyle(0xff4fd8, 1);
        g.fillRect(-5, -13, 12, 4);
        g.fillStyle(0x101922, 1);
        g.fillRect(-4, -6, 10, 11);
        g.fillStyle(0x7df9ff, 1);
        g.fillRect(-2, -4, 6, 7);
        g.fillStyle(0xffcf70, 1);
        g.fillRect(-3, 8, 2, 2);
        g.fillStyle(0xff5b5b, 1);
        g.fillRect(3, 8, 2, 2);
    }

    private drawMiniSofa(g: Phaser.GameObjects.Graphics) {
        this.drawMiniDropShadow(g, -15, 8, 34, 8);
        g.fillStyle(0x36223f, 1);
        g.fillRect(-16, -7, 34, 16);
        g.fillStyle(0x734a82, 1);
        g.fillRect(-14, -4, 30, 9);
        g.fillStyle(0x8e5aa0, 1);
        g.fillRect(-12, 0, 12, 8);
        g.fillRect(4, 0, 10, 8);
        g.fillStyle(0xffcf70, 0.86);
        g.fillRect(-11, -3, 5, 4);
    }

    private drawMiniPingPongTable(g: Phaser.GameObjects.Graphics) {
        this.drawMiniDropShadow(g, -15, 8, 36, 7);
        g.fillStyle(0x173d52, 1);
        g.fillRect(-16, -8, 36, 16);
        g.fillStyle(0x1e6d87, 1);
        g.fillRect(-14, -6, 32, 12);
        g.lineStyle(1, 0xeef7ff, 0.85);
        g.strokeRect(-14, -6, 32, 12);
        g.beginPath();
        g.moveTo(2, -5).lineTo(2, 5);
        g.moveTo(-13, 0).lineTo(17, 0);
        g.strokePath();
        g.fillStyle(0xffffff, 1);
        g.fillRect(-5, -2, 2, 2);
    }

    private drawMiniUnknownProp(g: Phaser.GameObjects.Graphics) {
        this.drawMiniDropShadow(g, -8, 7, 18, 6);
        g.fillStyle(0x3d3b45, 1);
        g.fillRect(-7, -7, 14, 14);
        g.lineStyle(1, 0xb2bec3, 0.8);
        g.strokeRect(-7, -7, 14, 14);
    }
}

export function setupPhaser(parentId: string) {
    const config: Phaser.Types.Core.GameConfig = {
        type: Phaser.AUTO,
        parent: parentId,
        width: window.innerWidth,
        height: window.innerHeight,
        scene: [OfficeScene],
        pixelArt: true,
        scale: {
            mode: Phaser.Scale.RESIZE,
        },
        input: {
            keyboard: {
                capture: [] // Don't capture ANY keys globally — let React inputs work
            }
        }
    };

    const game = new Phaser.Game(config);

    // When ANY input/textarea/select is focused, fully disable Phaser keyboard
    // When they blur, re-enable it
    document.addEventListener('focusin', (e) => {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
            game.input.keyboard?.enabled && (game.input.keyboard.enabled = false);
        }
    });
    document.addEventListener('focusout', (e) => {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
            game.input.keyboard && (game.input.keyboard.enabled = true);
        }
    });

    return game;
}
