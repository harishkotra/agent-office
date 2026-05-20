import { Room, Client } from 'colyseus';
import { OfficeState } from '../schema/OfficeState';
import { Office, OfficeConfig } from '@agent-office/core';
import { ToolExecutor } from '../tools/ToolExecutor';
import { MemoryStore } from '../memory/MemoryStore';
import { readSupervisorSnapshot, SupervisorSnapshot } from '../supervisor/SupervisorState';

interface HighlightEvent {
    type: string;
    title: string;
    body: string;
    agentId?: string | null;
    scenario: string;
    time: string;
}

interface RelationshipEdge {
    a: string;
    b: string;
    score: number;
    status: 'alliance' | 'neutral' | 'rivalry';
    updatedAt: string;
}

interface FurnitureTarget {
    x: number;
    y: number;
    type: string;
    label?: string;
}

interface IdleActivityPlan {
    targetKey: string;
    action: 'play_ping_pong' | 'play_arcade' | 'sit_sofa' | 'coffee_break' | 'browse_books' | 'whiteboard_jam';
    thought: string;
    untilTick: number;
}

export class OfficeRoom extends Room<OfficeState> {
    private static activeRoom: OfficeRoom | null = null;

    maxClients = 100;
    private office!: Office;
    private demoTickCount = 0;
    private supervisorSnapshot: SupervisorSnapshot = readSupervisorSnapshot();
    private hireCount = 0; // Counter for generating unique IDs
    private toolExecutor = new ToolExecutor();
    private memoryStore = new MemoryStore();
    private sessionId = `session_${Date.now()}`;
    private currentScenario = 'Free Play';
    private highlights: HighlightEvent[] = [];
    private chaosHistory: Array<{ event: string; label: string; time: string }> = [];
    private relationships: Map<string, RelationshipEdge> = new Map();
    private audienceVotes: Record<string, number> = {};
    private currentLayout: any[] = [];
    private lifeTickCount = 0;
    private supervisorRefreshTick = 0;
    private idleActivityPlans: Map<string, IdleActivityPlan> = new Map();

    // Furniture interaction points are grid cells aligned to Game.ts' 64x64 polished office map.
    // Coordinates represent where an agent's feet should stand next to the rendered prop.
    private furnitureTargets: Record<string, FurnitureTarget> = {
        'supervisor-0-desk': { x: 8, y: 13, type: 'desk', label: 'CEO / operator console' },
        'supervisor-1-desk': { x: 26, y: 12, type: 'desk', label: 'General Manager console' },
        'supervisor-2-desk': { x: 14, y: 13, type: 'desk', label: 'Debug lane console' },
        'supervisor-3-desk': { x: 32, y: 33, type: 'desk', label: 'Validator lane console' },
        'supervisor-4-desk': { x: 43, y: 30, type: 'desk', label: 'Dynamic worker console' },
        'supervisor-5-desk': { x: 10, y: 30, type: 'desk', label: 'TUI pane console' },
        'meeting-table': { x: 24, y: 19, type: 'table', label: 'Lounge table' },
        'coffee-machine': { x: 34, y: 19, type: 'appliance', label: 'Coffee bar' },
        'whiteboard': { x: 18, y: 6, type: 'board', label: 'Whiteboard' },
        'bookshelf': { x: 43, y: 9, type: 'furniture', label: 'Research shelf' },
        'ping-pong-left': { x: 26, y: 46, type: 'game', label: 'Ping-pong table left side' },
        'ping-pong-right': { x: 31, y: 46, type: 'game', label: 'Ping-pong table right side' },
        'arcade-cabinet': { x: 39, y: 45, type: 'game', label: 'Arcade cabinet' },
        'sofa-seat': { x: 45, y: 49, type: 'seating', label: 'Sofa' },
        'snack-bar': { x: 35, y: 48, type: 'appliance', label: 'Snack bar' },
        // Extra desks for dynamically hired agents, aligned to remaining rendered workstation chairs.
        'hire_0-desk': { x: 14, y: 13, type: 'desk', label: 'Art workstation B' },
        'hire_1-desk': { x: 31, y: 12, type: 'desk', label: 'Content workstation B' },
        'hire_2-desk': { x: 26, y: 17, type: 'desk', label: 'Content workstation C' },
        'hire_3-desk': { x: 10, y: 30, type: 'desk', label: 'Polish workstation' },
        'hire_4-desk': { x: 32, y: 33, type: 'desk', label: 'QA workstation' },
    };

    static getActiveRoom(): OfficeRoom | null {
        return OfficeRoom.activeRoom;
    }

    async onCreate(options: any) {
        OfficeRoom.activeRoom = this;
        this.setState(new OfficeState());

        // Initialize memory store
        await this.memoryStore.initialize();

        const config: OfficeConfig = {
            name: options.name || 'Startup HQ',
            grid: { width: 64, height: 64, tileSize: 16 },
            rooms: [],
            furniture: [],
            spawnPoints: [{ x: 31, y: 3 }],
            zones: []
        };
        this.office = new Office(config);

        // Bootstrap from real Codex Supervisor TUI panes, not invented social AI coworkers.
        this.syncSupervisorPanes(readSupervisorSnapshot());
        this.rebuildRelationshipGraph();
        const savedLayout = await this.memoryStore.loadLayout('default');
        this.currentLayout = Array.isArray(savedLayout) ? savedLayout : [];

        // ─── MESSAGE HANDLERS ───

        this.onMessage('command', (client, message) => {
            console.log(`Command from ${client.sessionId}:`, message);
        });

        this.onMessage('chat', (client, message) => {
            console.log(`Chat from ${client.sessionId}: ${message.text}`);
            this.broadcast('chat', { sender: 'User', text: message.text });
        });

        this.onMessage('start-scenario', (client, message) => {
            const scenarioName = String(message?.scenario || 'Free Play');
            this.currentScenario = scenarioName;
            this.applyScenarioKickoff(scenarioName);
        });

        this.onMessage('trigger-chaos', (client, message) => {
            const eventName = String(message?.event || 'minor_outage');
            this.applyChaosEvent(eventName);
        });

        // UI-driven task assignment
        this.onMessage('assign-task', (client, message) => {
            const { title, agentId } = message;
            console.log(`[TaskBoard] Assigning "${title}" to ${agentId || 'auto'}`);

            const targetId = agentId || this.autoAssignAgent();
            const agentState = this.state.agents.get(targetId);

            if (agentState) {
                agentState.currentTask = title;
                agentState.action = 'work';
                agentState.thought = `Manual operator task: ${title}`;

                this.memoryStore.createTask(title, targetId);

                this.broadcast('chat', {
                    sender: 'Supervisor',
                    text: `📋 Operator task "${title}" attached to ${agentState.name}`
                });

                this.broadcast('task-update', {
                    agentId: targetId,
                    agentName: agentState.name,
                    task: title,
                    status: 'in_progress'
                });
            }
        });

        // Save office layout from editor
        this.onMessage('save-layout', async (client, message) => {
            const layoutName = message.name || 'default';
            const layout = Array.isArray(message.layout) ? message.layout : [];
            await this.memoryStore.saveLayout(layoutName, JSON.stringify(layout));
            this.currentLayout = layout;
            this.broadcast('layout-sync', { name: layoutName, layout: this.currentLayout });
            this.broadcast('chat', { sender: 'System', text: '✅ Office layout saved!' });
        });

        // Start Simulation Loop
        this.setSimulationInterval((delta) => this.update(delta), 100);
    }

    private autoAssignAgent(): string {
        for (const [id, agent] of this.state.agents) {
            if (!agent.currentTask) return id;
        }
        return Array.from(this.state.agents.keys())[0] || 'supervisor-0';
    }

    // Supervisor roles rendered in the office: General Manager, Debug Lane, Validator Lane, Dynamic Worker.
    private syncSupervisorPanes(snapshot: SupervisorSnapshot) {
        this.supervisorSnapshot = snapshot;
        const seen = new Set<string>();
        snapshot.panes.forEach((pane, idx) => {
            const id = `supervisor-${idx}`;
            seen.add(id);
            if (!this.state.agents.has(id)) this.state.createAgent(id, pane.name);
            const agent = this.state.agents.get(id);
            if (!agent) return;
            agent.id = id;
            agent.name = pane.name;
            agent.x = pane.x;
            agent.y = pane.y;
            agent.direction = 'down';
            agent.action = pane.action;
            agent.currentTask = `${pane.role}: ${pane.currentTask}`;
            agent.thought = pane.thought;
            agent.mood = pane.state === 'dead' ? 0.25 : 0.72;
            agent.reputation = pane.role === 'Validator Lane' ? 0.82 : 0.68;
            agent.riskLevel = pane.action === 'debug' || pane.state === 'dead' ? 0.72 : 0.22;
            agent.momentum = pane.action === 'work' || pane.action === 'run_tests' ? 0.78 : 0.58;
        });
        Array.from(this.state.agents.keys()).forEach((id) => {
            if (!seen.has(id)) this.state.removeAgent(id);
        });
        this.broadcast('supervisor-state', snapshot);
    }

    async update(delta: number) {
        if (Math.random() < 0.02) {
            console.log(`[Server] Agents: ${this.state.agents.size} | Session: ${this.sessionId}`);
        }

        this.state.officeTime = new Date().toISOString();

        this.supervisorRefreshTick++;
        if (this.supervisorRefreshTick >= 50) {
            this.supervisorRefreshTick = 0;
            this.syncSupervisorPanes(readSupervisorSnapshot());
        }

        // ─── FURNITURE INTERACTION PATHFINDING ───
        // Office grid boundaries (agents must stay inside the 64x64 rendered map)
        const BOUNDS = { minX: 3, maxX: 60, minY: 3, maxY: 60 };
        const clamp = (agent: any) => {
            agent.x = Math.max(BOUNDS.minX, Math.min(BOUNDS.maxX, agent.x));
            agent.y = Math.max(BOUNDS.minY, Math.min(BOUNDS.maxY, agent.y));
        };

        this.demoTickCount++;
        if (this.demoTickCount >= 5) {
            this.demoTickCount = 0;
            this.lifeTickCount++;
            this.state.agents.forEach((agent, key) => {
                // If agent action is 'talk', move towards the other agent and stay there while conversing.
                if (agent.action === 'talk') {
                    let closest: { x: number; y: number } | null = null;
                    let minDist = Infinity;
                    this.state.agents.forEach((other, otherKey) => {
                        if (otherKey === key) return;
                        const dist = Math.abs(agent.x - other.x) + Math.abs(agent.y - other.y);
                        if (dist < minDist) { minDist = dist; closest = { x: other.x, y: other.y + 2 }; }
                    });
                    if (closest) {
                        if (minDist > 2) {
                            const c = closest as { x: number; y: number };
                            this.stepToward(agent, c);
                            clamp(agent);
                        }
                        this.idleActivityPlans.delete(key);
                        this.updateAgentViralMetrics(key, agent.action);
                        return;
                    }
                }

                const target = this.resolveAgentTarget(key, agent);
                this.stepToward(agent, target);
                clamp(agent);

                if (agent.x === target.x && agent.y === target.y) {
                    const plan = this.idleActivityPlans.get(key);
                    if (plan && target === this.furnitureTargets[plan.targetKey]) {
                        agent.action = plan.action;
                        agent.thought = plan.thought;
                    }
                }

                // Keep viral telemetry alive for UI overlays and highlights.
                this.updateAgentViralMetrics(key, agent.action);
            });
        }
    }

    private stepToward(agent: { x: number; y: number }, target: { x: number; y: number }) {
        if (agent.x < target.x) agent.x += 1;
        else if (agent.x > target.x) agent.x -= 1;
        else if (agent.y < target.y) agent.y += 1;
        else if (agent.y > target.y) agent.y -= 1;
    }

    private resolveAgentTarget(agentId: string, agent: { action: string; currentTask?: string; thought?: string }): FurnitureTarget {
        const deskKey = `${agentId}-desk`;
        const desk = this.furnitureTargets[deskKey] || this.furnitureTargets['supervisor-0-desk'];
        const shouldWork = Boolean(agent.currentTask) || agent.action === 'work' || agent.action === 'use_tool';
        if (shouldWork) {
            this.idleActivityPlans.delete(agentId);
            return desk;
        }

        let plan = this.idleActivityPlans.get(agentId);
        if (!plan || plan.untilTick <= this.lifeTickCount) {
            plan = this.chooseIdleActivity(agentId);
            this.idleActivityPlans.set(agentId, plan);
        }

        const target = this.furnitureTargets[plan.targetKey] || desk;
        agent.action = plan.action;
        if (!agent.thought || Math.random() < 0.08) agent.thought = plan.thought;
        return target;
    }

    private chooseIdleActivity(agentId: string): IdleActivityPlan {
        const options: Array<Omit<IdleActivityPlan, 'untilTick'>> = [
            { targetKey: 'ping-pong-left', action: 'play_ping_pong', thought: 'Quick ping-pong rally in the rest zone.' },
            { targetKey: 'arcade-cabinet', action: 'play_arcade', thought: 'Chasing the office high score.' },
            { targetKey: 'sofa-seat', action: 'sit_sofa', thought: 'Resetting on the sofa before the next task.' },
            { targetKey: 'snack-bar', action: 'coffee_break', thought: 'Refueling at the snack bar.' },
            { targetKey: 'bookshelf', action: 'browse_books', thought: 'Browsing notes for a fresh idea.' },
            { targetKey: 'whiteboard', action: 'whiteboard_jam', thought: 'Sketching the next plan on the board.' }
        ];
        const hash = Array.from(agentId).reduce((sum, char) => sum + char.charCodeAt(0), 0);
        const selected = options[(hash + this.lifeTickCount) % options.length];
        return {
            ...selected,
            untilTick: this.lifeTickCount + 10 + (hash % 8)
        };
    }

    private clamp01(value: number): number {
        return Math.max(0, Math.min(1, value));
    }

    private emitHighlight(type: string, title: string, body: string, agentId?: string) {
        const payload: HighlightEvent = {
            type,
            title,
            body,
            agentId: agentId || null,
            scenario: this.currentScenario,
            time: this.state.officeTime
        };
        this.highlights = [payload, ...this.highlights].slice(0, 200);
        this.broadcast('highlight-event', payload);
    }

    private updateAgentViralMetrics(agentId: string, action: string) {
        const state = this.state.agents.get(agentId);
        if (!state) return;
        const jitter = (Math.random() - 0.5) * 0.03;
        const actionBoost =
            action === 'work' ? 0.015 :
                action === 'talk' ? 0.02 :
                    action === 'use_tool' ? 0.03 :
                        ['play_ping_pong', 'play_arcade', 'sit_sofa', 'coffee_break', 'browse_books', 'whiteboard_jam'].includes(action) ? 0.012 :
                            -0.005;

        state.momentum = this.clamp01(state.momentum + actionBoost + jitter);
        state.riskLevel = this.clamp01(state.riskLevel + (action === 'use_tool' ? 0.02 : -0.004) + jitter);
        const isBreak = ['play_ping_pong', 'play_arcade', 'sit_sofa', 'coffee_break', 'browse_books', 'whiteboard_jam'].includes(action);
        state.mood = this.clamp01(state.mood + (action === 'talk' ? 0.02 : isBreak ? 0.014 : -0.002) + jitter);
        state.reputation = this.clamp01(state.reputation + (action === 'work' ? 0.015 : 0.001) + jitter / 2);
    }

    private applyScenarioKickoff(scenarioName: string) {
        this.broadcast('scenario-event', {
            type: 'scenario-started',
            scenario: scenarioName,
            time: this.state.officeTime
        });

        this.broadcast('chat', {
            sender: '🎬 Producer',
            text: `Scenario loaded: ${scenarioName}. Let the office drama begin.`
        });

        this.emitHighlight(
            'scenario',
            `Scenario: ${scenarioName}`,
            `The office switched into ${scenarioName} mode.`,
        );

        this.state.agents.forEach((agent, id) => {
            agent.momentum = this.clamp01(agent.momentum + 0.15);
            agent.riskLevel = this.clamp01(agent.riskLevel + 0.1);
            if (Math.random() < 0.4) {
                this.emitHighlight(
                    'character_arc',
                    `${agent.name} steps up`,
                    `${agent.name} is pushing hard as ${scenarioName} starts.`,
                    id
                );
            }
        });
    }

    private applyChaosEvent(eventName: string) {
        const chaosMap: Record<string, { label: string; moodDelta: number; riskDelta: number; momentumDelta: number }> = {
            server_outage: { label: 'Server Outage', moodDelta: -0.25, riskDelta: 0.35, momentumDelta: 0.1 },
            funding_cut: { label: 'Funding Cut', moodDelta: -0.2, riskDelta: 0.28, momentumDelta: -0.05 },
            surprise_launch: { label: 'Surprise Launch', moodDelta: 0.12, riskDelta: 0.22, momentumDelta: 0.25 },
            client_escalation: { label: 'Client Escalation', moodDelta: -0.1, riskDelta: 0.3, momentumDelta: 0.08 },
            viral_tweet: { label: 'Viral Tweet', moodDelta: 0.25, riskDelta: 0.12, momentumDelta: 0.3 }
        };

        const selected = chaosMap[eventName] || chaosMap.server_outage;
        this.chaosHistory = [
            { event: eventName, label: selected.label, time: this.state.officeTime },
            ...this.chaosHistory
        ].slice(0, 100);
        this.broadcast('scenario-event', {
            type: 'chaos-triggered',
            event: eventName,
            label: selected.label,
            time: this.state.officeTime
        });

        this.broadcast('chat', {
            sender: '⚠️ Chaos Engine',
            text: `${selected.label} hit the office. Everyone reacts in real-time.`
        });

        this.emitHighlight(
            'chaos',
            selected.label,
            `Chaos event "${selected.label}" changed team mood and risk levels.`
        );

        this.state.agents.forEach((agent, id) => {
            agent.mood = this.clamp01(agent.mood + selected.moodDelta + (Math.random() - 0.5) * 0.08);
            agent.riskLevel = this.clamp01(agent.riskLevel + selected.riskDelta + Math.random() * 0.08);
            agent.momentum = this.clamp01(agent.momentum + selected.momentumDelta + (Math.random() - 0.5) * 0.05);
            if (agent.riskLevel > 0.75) {
                this.emitHighlight(
                    'high_risk',
                    `${agent.name} is under pressure`,
                    `${agent.name}'s risk level spiked after ${selected.label}.`,
                    id
                );
            }
        });

        // Chaos can create alliances or rivalries.
        const ids = Array.from(this.state.agents.keys());
        for (let i = 0; i < ids.length; i++) {
            for (let j = i + 1; j < ids.length; j++) {
                const delta = (Math.random() - 0.5) * 0.35;
                this.updateRelationship(ids[i], ids[j], delta);
            }
        }
    }

    private relationshipKey(a: string, b: string): string {
        return [a, b].sort().join('::');
    }

    private statusFromScore(score: number): RelationshipEdge['status'] {
        if (score > 0.35) return 'alliance';
        if (score < -0.35) return 'rivalry';
        return 'neutral';
    }

    private rebuildRelationshipGraph() {
        const ids = Array.from(this.state.agents.keys());
        for (let i = 0; i < ids.length; i++) {
            for (let j = i + 1; j < ids.length; j++) {
                const key = this.relationshipKey(ids[i], ids[j]);
                if (!this.relationships.has(key)) {
                    this.relationships.set(key, {
                        a: ids[i],
                        b: ids[j],
                        score: 0,
                        status: 'neutral',
                        updatedAt: this.state.officeTime
                    });
                }
            }
        }
        this.emitRelationshipGraph();
    }

    private updateRelationship(a: string, b: string, delta: number) {
        const key = this.relationshipKey(a, b);
        const existing = this.relationships.get(key) || {
            a: [a, b].sort()[0],
            b: [a, b].sort()[1],
            score: 0,
            status: 'neutral' as const,
            updatedAt: this.state.officeTime
        };
        const score = Math.max(-1, Math.min(1, existing.score + delta));
        const updated: RelationshipEdge = {
            ...existing,
            score,
            status: this.statusFromScore(score),
            updatedAt: this.state.officeTime
        };
        this.relationships.set(key, updated);
        this.emitRelationshipGraph();
    }

    private emitRelationshipGraph() {
        this.broadcast('relationship-update', this.buildRelationshipPayload());
    }

    private buildRelationshipPayload() {
        const idToName: Record<string, string> = {};
        this.state.agents.forEach((agent, id) => {
            idToName[id] = agent.name;
        });
        return {
            edges: Array.from(this.relationships.values()).map((edge) => ({
                ...edge,
                aName: idToName[edge.a] || edge.a,
                bName: idToName[edge.b] || edge.b
            })),
            time: this.state.officeTime
        };
    }

    public registerAudienceVote(eventName: string, voterId?: string) {
        const normalized = String(eventName || 'server_outage');
        this.audienceVotes[normalized] = (this.audienceVotes[normalized] || 0) + 1;
        const totalVotes = Object.values(this.audienceVotes).reduce((sum, value) => sum + value, 0);
        const shouldTrigger = this.audienceVotes[normalized] >= 3 || totalVotes % 5 === 0;

        if (shouldTrigger) {
            this.applyChaosEvent(normalized);
            this.emitHighlight(
                'audience_vote',
                `Audience triggered ${normalized}`,
                `Viewers forced a ${normalized} chaos event.`
            );
            this.audienceVotes[normalized] = 0;
        }

        return {
            accepted: true,
            event: normalized,
            voterId: voterId || null,
            tally: this.audienceVotes[normalized] || 0,
            triggered: shouldTrigger
        };
    }

    public getEpisodeRecap() {
        const topHighlights = [...this.highlights].slice(0, 10);
        const leaderboard = Array.from(this.state.agents.entries()).map(([id, agent]) => {
            const impact = (
                agent.momentum * 0.35 +
                agent.reputation * 0.3 +
                agent.mood * 0.2 +
                (1 - agent.riskLevel) * 0.15
            );
            return {
                id,
                name: agent.name,
                action: agent.action,
                mood: agent.mood,
                reputation: agent.reputation,
                riskLevel: agent.riskLevel,
                momentum: agent.momentum,
                impact: Number(impact.toFixed(3))
            };
        }).sort((a, b) => b.impact - a.impact);

        const avgMomentum = leaderboard.length
            ? leaderboard.reduce((sum, item) => sum + item.momentum, 0) / leaderboard.length
            : 0;
        const avgRisk = leaderboard.length
            ? leaderboard.reduce((sum, item) => sum + item.riskLevel, 0) / leaderboard.length
            : 0;
        const outcome = avgMomentum > 0.65 && avgRisk < 0.5
            ? 'Launch trajectory: team executed under pressure and came out stronger.'
            : avgRisk > 0.65
                ? 'High volatility: chaos dominated this episode.'
                : 'Mixed outcome: strong moments with unresolved tensions.';

        return {
            generatedAt: this.state.officeTime,
            scenario: this.currentScenario,
            topHighlights,
            leaderboard: leaderboard.slice(0, 10),
            outcomeCard: {
                title: `${this.currentScenario} Outcome`,
                summary: outcome,
                chaosEvents: this.chaosHistory.slice(0, 10),
                activeRelationships: Array.from(this.relationships.values()).filter((edge) => edge.status !== 'neutral').length
            }
        };
    }

    onJoin(client: Client, options: any) {
        console.log(client.sessionId, "joined the office room!");
        // Send existing tasks to newly joined client
        this.memoryStore.getTasks().then(tasks => {
            client.send('tasks-sync', tasks);
        });
        client.send('relationship-update', this.buildRelationshipPayload());
        client.send('layout-sync', { name: 'default', layout: this.currentLayout });
    }

    onLeave(client: Client, consented: boolean) {
        console.log(client.sessionId, "left the office room!");
    }

    async onDispose() {
        console.log("room", this.roomId, "disposing... saving memories");
        OfficeRoom.activeRoom = null;
        await this.memoryStore.close();
    }
}
