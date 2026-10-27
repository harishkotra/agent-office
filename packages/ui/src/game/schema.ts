import { Schema, MapSchema, type } from '@colyseus/schema';

export class AgentState extends Schema {
    declare id: string;
    declare name: string;
    declare x: number;
    declare y: number;
    declare direction: string;
    declare action: string;
    declare currentTask: string;
    declare thought: string;
    declare mood: number;
    declare reputation: number;
    declare riskLevel: number;
    declare momentum: number;
    // ─── External interface fields (Ciudadan AgentOffice) ───
    declare role: string;
    declare status: string;
    declare error: string;
    declare session: string;
    declare spriteIndex: number;
    // ─── Block 3: real evidence fields (Inspector, FASE E) ───
    declare activeFile: string;
    declare workspace: string;
    declare gitBranch: string;
    declare sessionType: string;
    declare lastTool: string;
    declare updatedAt: number;
}

type("string")(AgentState.prototype, "id");
type("string")(AgentState.prototype, "name");
type("number")(AgentState.prototype, "x");
type("number")(AgentState.prototype, "y");
type("string")(AgentState.prototype, "direction");
type("string")(AgentState.prototype, "action");
type("string")(AgentState.prototype, "currentTask");
type("string")(AgentState.prototype, "thought");
type("number")(AgentState.prototype, "mood");
type("number")(AgentState.prototype, "reputation");
type("number")(AgentState.prototype, "riskLevel");
type("number")(AgentState.prototype, "momentum");
type("string")(AgentState.prototype, "role");
type("string")(AgentState.prototype, "status");
type("string")(AgentState.prototype, "error");
type("string")(AgentState.prototype, "session");
type("number")(AgentState.prototype, "spriteIndex");
type("string")(AgentState.prototype, "activeFile");
type("string")(AgentState.prototype, "workspace");
type("string")(AgentState.prototype, "gitBranch");
type("string")(AgentState.prototype, "sessionType");
type("string")(AgentState.prototype, "lastTool");
type("number")(AgentState.prototype, "updatedAt");


export class OfficeState extends Schema {
    declare agents: MapSchema<AgentState>;
    declare officeTime: string;
    declare timeScale: number;
}

type({ map: AgentState })(OfficeState.prototype, "agents");
type("string")(OfficeState.prototype, "officeTime");
type("number")(OfficeState.prototype, "timeScale");
