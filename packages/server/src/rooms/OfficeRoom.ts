import { Room, Client } from 'colyseus';
import { randomUUID } from 'crypto';
import { OfficeState } from '../schema/OfficeState';
import { Agent, Office, OfficeConfig, ConversationMessage } from '@agent-office/core';
import { OllamaAdapter } from '@agent-office/adapters';
import { ToolExecutor } from '../tools/ToolExecutor';
import { MemoryStore } from '../memory/MemoryStore';

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

export class OfficeRoom extends Room<OfficeState> {
    private static activeRoom: OfficeRoom | null = null;

    maxClients = 100;
    private office!: Office;
    private demoTickCount = 0;
    private coreAgents: Map<string, Agent> = new Map();
    private thinkingLocks: Map<string, boolean> = new Map();
    private ollamaAdapter = new OllamaAdapter('http://localhost:11434');
    private hireCount = 0; // Counter for generating unique IDs
    private toolExecutor = new ToolExecutor();
    private taskIds: Map<string, string> = new Map();
    private memoryStore = new MemoryStore();
    private sessionId = `session_${Date.now()}`;
    private currentScenario = 'Free Play';
    private highlights: HighlightEvent[] = [];
    private chaosHistory: Array<{ event: string; label: string; time: string }> = [];
    private relationships: Map<string, RelationshipEdge> = new Map();
    private audienceVotes: Record<string, number> = {};
    private currentLayout: any[] = [];

    // Furniture interaction points: named locations agents can walk to
    private furnitureTargets: Record<string, { x: number; y: number; type: string }> = {
        'alice-desk': { x: 5, y: 18, type: 'desk' },
        'bob-desk': { x: 5, y: 23, type: 'desk' },
        'meeting-table': { x: 10, y: 5, type: 'table' },
        'coffee-machine': { x: 25, y: 25, type: 'appliance' },
        'whiteboard': { x: 17, y: 3, type: 'board' },
        'water-cooler': { x: 28, y: 27, type: 'appliance' },
        'bookshelf': { x: 32, y: 12, type: 'furniture' },
        'beanbag': { x: 28, y: 6, type: 'seating' },
        // Extra desks for dynamically hired agents
        'hire_0-desk': { x: 15, y: 18, type: 'desk' },
        'hire_1-desk': { x: 15, y: 23, type: 'desk' },
        'hire_2-desk': { x: 25, y: 18, type: 'desk' },
        'hire_3-desk': { x: 25, y: 8, type: 'desk' },
        'hire_4-desk': { x: 32, y: 18, type: 'desk' },
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
            grid: { width: 40, height: 40, tileSize: 16 },
            rooms: [],
            furniture: [],
            spawnPoints: [{ x: 10, y: 10 }],
            zones: []
        };
        this.office = new Office(config);

        // Setup Core Agents with AI capabilities
        const setupCoreAgent = async (id: string, name: string, role: string, x: number, y: number) => {
            this.state.createAgent(id, name);
            const state = this.state.agents.get(id);
            if (state) { state.x = x; state.y = y; }

            const coreAgent = new Agent({
                id, name, role, avatar: 'sprite.png',
                inference: {
                    provider: 'ollama',
                    model: 'llama3.2:latest',
                    systemPrompt: `You are ${name}, a ${role} in a virtual office. Be social, do your work, and collaborate with colleagues. Keep thoughts SHORT.`,
                },
                personality: {
                    traits: { openness: 0.8, conscientiousness: 0.9, extraversion: 0.6, agreeableness: 0.7, neuroticism: 0.1 },
                    communicationStyle: role === 'Engineer' ? 'technical' : 'casual',
                    workHours: { start: '09:00', end: '17:00' },
                    breakFrequency: 120
                },
                capabilities: [
                    { name: 'code_execute', description: 'Execute JavaScript code' },
                    { name: 'web_search', description: 'Search the web for information' },
                    { name: 'write_note', description: 'Write a note or memo' },
                    { name: 'create_task', description: 'Create a task and assign it to yourself or another agent' },
                    { name: 'hire_agent', description: 'Hire a new team member (intern, developer, designer). Params: { name: string, role: string }' }
                ],
                memory: { shortTermLimit: 50 }
            });

            coreAgent.setInferenceAdapter(this.ollamaAdapter);
            await coreAgent.initialize();

            // Load persistent memories from previous sessions
            const previousMemories = await this.memoryStore.loadMemories(id, 20);
            if (previousMemories.length > 0) {
                coreAgent.loadMemories(previousMemories);
                console.log(`[${name}] Loaded ${previousMemories.length} memories from previous sessions`);
            }

            this.coreAgents.set(id, coreAgent);
            this.thinkingLocks.set(id, false);
        };

        await setupCoreAgent('alice', 'Alice', 'Engineer', 10, 10);
        await setupCoreAgent('bob', 'Bob', 'Product Manager', 20, 15);
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

            // Pick agent: explicit or auto-assign to least busy
            const targetId = agentId || this.autoAssignAgent();
            const agent = this.coreAgents.get(targetId);
            const agentState = this.state.agents.get(targetId);

            if (agent && agentState) {
                this.taskIds.set(targetId, randomUUID());
                agent.currentTask = title;
                agentState.currentTask = title;
                agentState.action = 'work';

                // Persist task
                this.memoryStore.createTask(title, targetId);

                this.broadcast('chat', {
                    sender: 'System',
                    text: `📋 Task "${title}" assigned to ${agentState.name}`
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
        // Pick the agent with no current task, or the first one
        for (const [id, agent] of this.coreAgents) {
            if (!agent.currentTask) return id;
        }
        return 'alice'; // fallback
    }

    async update(delta: number) {
        if (Math.random() < 0.02) {
            console.log(`[Server] Agents: ${this.state.agents.size} | Session: ${this.sessionId}`);
        }

        this.state.officeTime = new Date().toISOString();

        // ─── AGENT THINK CYCLE ───
        this.coreAgents.forEach((coreAgent, id) => {
            if (!this.thinkingLocks.get(id)) {
                this.thinkingLocks.set(id, true);

                const agentState = this.state.agents.get(id);
                if (!agentState) return;

                // Build nearby agents list
                const nearbyAgents: { name: string; role: string; distance: number }[] = [];
                this.coreAgents.forEach((other, otherId) => {
                    if (otherId === id) return;
                    const otherState = this.state.agents.get(otherId);
                    if (otherState) {
                        const dist = Math.abs(agentState.x - otherState.x) + Math.abs(agentState.y - otherState.y);
                        nearbyAgents.push({ name: other.config.name, role: other.config.role, distance: dist });
                    }
                });

                // Capture the assignment before inference; a new task may arrive while it runs.
                // Unassigned research is scoped to this think cycle rather than the room.
                const taskId = this.taskIds.get(id) ?? randomUUID();
                coreAgent.think({
                    time: this.state.officeTime,
                    location: `${agentState.x},${agentState.y}`,
                    nearbyAgents,
                    currentTask: coreAgent.currentTask || null,
                    recentMessages: coreAgent.getUnreadMessages(),
                    memories: coreAgent.getRecentMemories(5)
                }).then(async (decision) => {
                    agentState.action = decision.action;

                    if (decision.thought) {
                        agentState.thought = decision.thought;
                    }

                    // ─── HANDLE TALK ACTION (Agent-to-Agent) ───
                    if (decision.action === 'talk' && decision.message) {
                        const targetName = decision.target || '';
                        let targetId = '';
                        this.coreAgents.forEach((a, aId) => {
                            if (a.config.name.toLowerCase() === targetName.toLowerCase()) targetId = aId;
                        });

                        const targetAgent = this.coreAgents.get(targetId);
                        if (targetAgent) {
                            const msg: ConversationMessage = {
                                from: coreAgent.config.name,
                                to: targetAgent.config.name,
                                content: decision.message,
                                timestamp: this.state.officeTime
                            };
                            targetAgent.receiveMessage(msg);

                            // Broadcast to UI chat
                            this.broadcast('chat', {
                                sender: coreAgent.config.name,
                                text: `💬 (to ${targetAgent.config.name}): ${decision.message}`
                            });
                            this.emitHighlight(
                                'conversation',
                                `${coreAgent.config.name} pinged ${targetAgent.config.name}`,
                                decision.message.slice(0, 120),
                                id
                            );
                            this.updateRelationship(id, targetId, 0.08);

                            // Save conversation memory
                            await this.memoryStore.saveMemory(id, {
                                content: `Said to ${targetAgent.config.name}: "${decision.message}"`,
                                type: 'conversation',
                                timestamp: this.state.officeTime,
                                importance: 0.7
                            }, this.sessionId);
                        }

                        coreAgent.clearInbox(); // Clear after processing
                    }

                    // ─── HANDLE TOOL EXECUTION ───
                    if (decision.action === 'use_tool' && decision.toolCall) {
                        // Special case: agent-created tasks
                        if (decision.toolCall.name === 'create_task') {
                            const { title, assignee } = decision.toolCall.params;
                            const targetId = assignee?.toLowerCase() || this.autoAssignAgent();
                            const targetAgent = this.coreAgents.get(targetId);
                            const targetState = this.state.agents.get(targetId);

                            if (targetAgent && targetState) {
                                this.taskIds.set(targetId, randomUUID());
                                targetAgent.currentTask = title;
                                targetState.currentTask = title;
                                await this.memoryStore.createTask(title, targetId);

                                this.broadcast('chat', {
                                    sender: coreAgent.config.name,
                                    text: `📋 Created task "${title}" for ${targetAgent.config.name}`
                                });
                                this.broadcast('task-update', {
                                    agentId: targetId,
                                    agentName: targetAgent.config.name,
                                    task: title,
                                    status: 'in_progress'
                                });
                                this.emitHighlight(
                                    'task',
                                    `${coreAgent.config.name} assigned work`,
                                    `"${title}" is now owned by ${targetAgent.config.name}.`,
                                    targetId
                                );
                            }
                        } else if (decision.toolCall.name === 'hire_agent') {
                            // ─── DYNAMIC AGENT HIRING ───
                            const hireParams = decision.toolCall.params;
                            const hireName = hireParams.name || ['Charlie', 'Diana', 'Eve', 'Frank', 'Grace'][this.hireCount % 5];
                            const hireRole = hireParams.role || 'Intern';
                            const hireId = `hire_${this.hireCount}`;

                            if (this.hireCount < 5 && !this.coreAgents.has(hireId)) {
                                // Spawn at office door (top-center), then walk to their desk
                                const spawnX = 20;
                                const spawnY = 2;

                                this.state.createAgent(hireId, hireName);
                                const hireState = this.state.agents.get(hireId);
                                if (hireState) { hireState.x = spawnX; hireState.y = spawnY; }

                                const hireAgent = new Agent({
                                    id: hireId, name: hireName, role: hireRole, avatar: 'sprite.png',
                                    inference: {
                                        provider: 'ollama',
                                        model: 'llama3.2:latest',
                                        systemPrompt: `You are ${hireName}, a ${hireRole} who just joined the team at a virtual office. You were hired by ${coreAgent.config.name}. Be enthusiastic, helpful, and eager to learn. Introduce yourself to your colleagues. Keep thoughts SHORT.`,
                                    },
                                    personality: {
                                        traits: { openness: 0.9, conscientiousness: 0.7, extraversion: 0.8, agreeableness: 0.9, neuroticism: 0.2 },
                                        communicationStyle: hireRole.includes('Design') ? 'creative' : 'casual',
                                        workHours: { start: '09:00', end: '17:00' },
                                        breakFrequency: 90
                                    },
                                    capabilities: [
                                        { name: 'code_execute', description: 'Execute JavaScript code' },
                                        { name: 'web_search', description: 'Search the web' },
                                        { name: 'write_note', description: 'Write a note' },
                                        { name: 'create_task', description: 'Create a task for the team' }
                                    ],
                                    memory: { shortTermLimit: 50 }
                                });

                                hireAgent.setInferenceAdapter(this.ollamaAdapter);
                                await hireAgent.initialize();
                                this.coreAgents.set(hireId, hireAgent);
                                this.thinkingLocks.set(hireId, false);

                                this.hireCount++;
                                this.rebuildRelationshipGraph();

                                this.broadcast('chat', {
                                    sender: '🏢 Office',
                                    text: `🎉 ${coreAgent.config.name} hired ${hireName} as ${hireRole}! Welcome to the team!`
                                });
                                this.emitHighlight(
                                    'hiring',
                                    `${hireName} joined the team`,
                                    `${coreAgent.config.name} hired ${hireName} (${hireRole}).`,
                                    hireId
                                );

                                // Give the hiring agent a memory of the hire
                                coreAgent.addMemory({
                                    content: `I hired ${hireName} as a ${hireRole}. They just joined the team.`,
                                    type: 'achievement',
                                    timestamp: this.state.officeTime,
                                    importance: 0.9
                                });
                            } else if (this.hireCount >= 5) {
                                this.broadcast('chat', {
                                    sender: '🏢 Office',
                                    text: `⚠️ ${coreAgent.config.name} tried to hire but the office is full! (Max 7 agents)`
                                });
                            }
                        } else {
                            const result = await this.toolExecutor.execute(
                                decision.toolCall.name,
                                decision.toolCall.params,
                                { taskId }
                            );

                            this.broadcast('chat', {
                                sender: coreAgent.config.name,
                                text: `🔧 Used tool [${decision.toolCall.name}]: ${result.success ? result.output.slice(0, 100) : result.error}`
                            });
                            this.emitHighlight(
                                'tool',
                                `${coreAgent.config.name} used ${decision.toolCall.name}`,
                                (result.success ? result.output : result.error || 'Tool failed').slice(0, 120),
                                id
                            );

                            coreAgent.addMemory({
                                content: `Tool ${decision.toolCall.name} result: ${result.output.slice(0, 200)}`,
                                type: 'task_result',
                                timestamp: this.state.officeTime,
                                importance: 0.8
                            });
                        }
                    }

                    // ─── PERSIST MEMORIES PERIODICALLY ───
                    if (Math.random() < 0.3) {
                        const recentMemories = coreAgent.memories.slice(-3);
                        await this.memoryStore.saveMemories(id, recentMemories, this.sessionId);
                    }

                    setTimeout(() => this.thinkingLocks.set(id, false), 15000);

                }).catch(err => {
                    console.error(`Agent ${id} think error:`, err);
                    setTimeout(() => this.thinkingLocks.set(id, false), 15000);
                });
            }
        });

        // ─── FURNITURE INTERACTION PATHFINDING ───
        // Office grid boundaries (agents must stay inside)
        const BOUNDS = { minX: 2, maxX: 36, minY: 2, maxY: 36 };
        const clamp = (agent: any) => {
            agent.x = Math.max(BOUNDS.minX, Math.min(BOUNDS.maxX, agent.x));
            agent.y = Math.max(BOUNDS.minY, Math.min(BOUNDS.maxY, agent.y));
        };

        this.demoTickCount++;
        if (this.demoTickCount >= 5) {
            this.demoTickCount = 0;
            this.state.agents.forEach((agent, key) => {
                // Default targets: agent's own desk chair
                const deskKey = `${key}-desk`;
                const target = this.furnitureTargets[deskKey] || { x: 5, y: 18 };

                // If agent action is 'talk', move towards the other agent instead
                if (agent.action === 'talk') {
                    let closest: { x: number; y: number } | null = null;
                    let minDist = Infinity;
                    this.state.agents.forEach((other, otherKey) => {
                        if (otherKey === key) return;
                        const dist = Math.abs(agent.x - other.x) + Math.abs(agent.y - other.y);
                        if (dist < minDist) { minDist = dist; closest = { x: other.x, y: other.y + 2 }; }
                    });
                    if (closest && minDist > 2) {
                        const c = closest as { x: number; y: number };
                        if (agent.x < c.x) agent.x += 1;
                        else if (agent.x > c.x) agent.x -= 1;
                        else if (agent.y < c.y) agent.y += 1;
                        else if (agent.y > c.y) agent.y -= 1;
                        clamp(agent);
                        return;
                    }
                }

                // Walk to desk/furniture target
                if (agent.x < target.x) agent.x += 1;
                else if (agent.x > target.x) agent.x -= 1;
                else if (agent.y < target.y) agent.y += 1;
                else if (agent.y > target.y) agent.y -= 1;
                clamp(agent);

                // Keep viral telemetry alive for UI overlays and highlights.
                this.updateAgentViralMetrics(key, agent.action);
            });
        }
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
                        -0.005;

        state.momentum = this.clamp01(state.momentum + actionBoost + jitter);
        state.riskLevel = this.clamp01(state.riskLevel + (action === 'use_tool' ? 0.02 : -0.004) + jitter);
        state.mood = this.clamp01(state.mood + (action === 'talk' ? 0.02 : -0.002) + jitter);
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
        // Persist all agent memories on shutdown
        for (const [id, agent] of this.coreAgents) {
            await this.memoryStore.saveMemories(id, agent.memories, this.sessionId);
        }
        await this.memoryStore.close();
    }
}
