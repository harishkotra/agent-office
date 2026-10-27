import { Schema, MapSchema, type } from '@colyseus/schema';

export class AgentState extends Schema {
    @type('string') id: string;
    @type('string') name: string;
    @type('number') x: number;
    @type('number') y: number;
    @type('string') direction: 'up' | 'down' | 'left' | 'right';
    @type('string') action: string;
    @type('string') currentTask: string;
    @type('string') thought: string;
    @type('number') mood: number;
    @type('number') reputation: number;
    @type('number') riskLevel: number;
    @type('number') momentum: number;
    // ─── External interface fields (Ciudadan AgentOffice) ───
    /** Display role (e.g. "Backend Developer"). */
    @type('string') role: string;
    /** External execution status (idle/running/blocked/...). */
    @type('string') status: string;
    /** Last reported error/blocker, if any. */
    @type('string') error: string;
    /** External session state summary. */
    @type('string') session: string;
    /** Sprite sheet index (char_0..char_5) for visual variety. */
    @type('number') spriteIndex: number;
    // ─── Block 3: real evidence fields (Inspector, FASE E) ───
    /** Active file being edited, when observable. */
    @type('string') activeFile: string;
    /** Workspace root of the session. */
    @type('string') workspace: string;
    /** Active Git branch. */
    @type('string') gitBranch: string;
    /** Session type: "interactive" | "batch". */
    @type('string') sessionType: string;
    /** Last observed tool name (real evidence). */
    @type('string') lastTool: string;
    /** Epoch ms of the last external update. */
    @type('number') updatedAt: number;

    constructor(id: string, name: string, opts?: { role?: string; spriteIndex?: number }) {
        super();
        this.id = id;
        this.name = name;
        this.x = 0;
        this.y = 0;
        this.direction = 'down';
        this.action = 'idle';
        this.currentTask = '';
        this.thought = '';
        this.mood = 0.6;
        this.reputation = 0.5;
        this.riskLevel = 0.2;
        this.momentum = 0.4;
        this.role = opts?.role || '';
        this.status = 'idle';
        this.error = '';
        this.session = '';
        this.spriteIndex = opts?.spriteIndex ?? 0;
        this.activeFile = '';
        this.workspace = '';
        this.gitBranch = '';
        this.sessionType = '';
        this.lastTool = '';
        this.updatedAt = 0;
    }
}

export class OfficeState extends Schema {
    @type({ map: AgentState }) agents = new MapSchema<AgentState>();
    @type('string') officeTime: string = new Date().toISOString();
    @type('number') timeScale: number = 1;

    createAgent(id: string, name: string, opts?: { role?: string; spriteIndex?: number }) {
        this.agents.set(id, new AgentState(id, name, opts));
    }

    removeAgent(id: string) {
        this.agents.delete(id);
    }
}
