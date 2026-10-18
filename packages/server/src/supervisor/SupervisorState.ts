declare const require: any;
declare const process: any;

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const childProcess = require('node:child_process');

export interface SupervisorPaneSnapshot {
    id: string;
    name: string;
    role: string;
    lane: string;
    project: string;
    session: string;
    host: string;
    index: number;
    state: string;
    action: string;
    currentTask: string;
    thought: string;
    tail: string[];
    x: number;
    y: number;
}

export interface SupervisorSnapshot {
    source: string;
    updatedAt: string;
    sessions: Array<{ session: string; project: string; promptsFile: string; projectRoot: string }>;
    panes: SupervisorPaneSnapshot[];
}

interface StateFileInput {
    name: string;
    text: string;
}

interface TmuxPaneInfo {
    index: number;
    title?: string;
    dead?: boolean;
}

interface TmuxReader {
    listPanes(session: string): TmuxPaneInfo[];
    capturePane(session: string, index: number): string[];
}

const OFFICE_SEATS = [
    { x: 8, y: 13 },
    { x: 26, y: 12 },
    { x: 14, y: 13 },
    { x: 32, y: 33 },
    { x: 43, y: 30 },
    { x: 10, y: 30 },
    { x: 24, y: 19 },
    { x: 18, y: 6 },
];

function parseKeyValueState(text: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim();
        if (!line || line.startsWith('#') || !line.includes('=')) continue;
        const idx = line.indexOf('=');
        out[line.slice(0, idx)] = line.slice(idx + 1).replace(/^['"]|['"]$/g, '');
    }
    return out;
}

function sessionFromStateFile(name: string): string {
    return path.basename(name).replace(/^\.codex-supervisor-/, '').replace(/\.state$/, '');
}

function projectName(projectRoot: string, session: string): string {
    if (projectRoot) return path.basename(projectRoot);
    return session.replace(/-(batch|session|supervisor).*$/, '') || 'codex-supervisor';
}

function promptLaneForIndex(prompts: string, index: number): string {
    const lines = prompts.split(/\r?\n/).filter((line) => line.trim().startsWith('/goal'));
    const line = lines[index] || '';
    const explicit = line.match(/PANE\s+\d+,\s*lane\s+([A-Za-z0-9_.-]+)/i);
    if (explicit) return explicit[1].toUpperCase();
    const loose = line.match(/\blane\s+([A-Za-z0-9_.-]+)/i);
    if (loose) return loose[1].toUpperCase();
    if (index === 0) return 'GENERAL_MANAGER';
    if (index === 1) return 'DEBUG';
    if (index === 2) return 'VALIDATOR';
    return `WORKER_${index}`;
}

export function supervisorRoleForLane(lane: string): string {
    const normalized = lane.toUpperCase();
    if (normalized.includes('CEO')) return 'CEO / Operator';
    if (normalized.includes('GENERAL_MANAGER') || normalized.includes('MANAGER') || normalized === 'GM') return 'General Manager';
    if (normalized.includes('DEBUG') || normalized.includes('BUG')) return 'Debug Lane';
    if (normalized.includes('VALIDATOR') || normalized.includes('VALIDATE') || normalized.includes('TEST')) return 'Validator Lane';
    return 'Dynamic Worker';
}

function actionForPane(lane: string, state: string, tail: string[]): string {
    const text = `${state}\n${tail.join('\n')}`.toLowerCase();
    if (text.includes('failed') || text.includes('error') || lane.includes('DEBUG')) return 'debug';
    if (text.includes('review') || text.includes('validate') || lane.includes('VALIDATOR')) return 'validate';
    if (text.includes('submit') || text.includes('handoff')) return 'handoff';
    if (text.includes('test') || text.includes('build')) return 'run_tests';
    if (lane.includes('GENERAL_MANAGER') || lane === 'GM') return 'plan';
    return 'work';
}

function summarizeTail(tail: string[]): string {
    for (let i = tail.length - 1; i >= 0; i--) {
        const clean = tail[i].replace(/\s+/g, ' ').trim();
        if (clean) return clean.slice(0, 140);
    }
    return 'Waiting for TUI output from supervised Codex pane.';
}

export function fallbackSupervisorSnapshot(reason: string): SupervisorSnapshot {
    const lanes = ['CEO', 'GENERAL_MANAGER', 'DEBUG', 'VALIDATOR', 'WORKER'];
    return {
        source: `codex-supervisor fallback: ${reason}`,
        updatedAt: new Date().toISOString(),
        sessions: [],
        panes: lanes.map((lane, index) => {
            const seat = OFFICE_SEATS[index % OFFICE_SEATS.length];
            const role = supervisorRoleForLane(lane);
            return {
                id: `fallback-${lane.toLowerCase()}`,
                name: `${role} · no live pane`,
                role,
                lane,
                project: 'codex-supervisor',
                session: 'no-active-session',
                host: 'local',
                index,
                state: 'waiting',
                action: actionForPane(lane, 'waiting', []),
                currentTask: 'No active supervisor tmux session discovered.',
                thought: 'Start or attach codex-supervisor to stream real TUI activity here.',
                tail: ['No active supervisor tmux session discovered.'],
                x: seat.x,
                y: seat.y,
            };
        })
    };
}

export function buildSupervisorSnapshotFromStateFiles(
    files: StateFileInput[],
    promptFiles: Map<string, string>,
    tmux: TmuxReader
): SupervisorSnapshot {
    const sessions: SupervisorSnapshot['sessions'] = [];
    const panes: SupervisorPaneSnapshot[] = [];
    for (const file of files) {
        const state = parseKeyValueState(file.text);
        const session = sessionFromStateFile(file.name);
        const promptsFile = state.PROMPTS_FILE || '';
        const projectRoot = state.PROJECT_ROOT || '';
        const project = projectName(projectRoot, session);
        const prompts = promptFiles.get(promptsFile) || '';
        sessions.push({ session, project, promptsFile, projectRoot });
        const tmuxPanes = tmux.listPanes(session);
        const paneInputs = tmuxPanes.length
            ? tmuxPanes
            : [0, 1, 2, 3].map((index) => ({ index, title: 'state-file', dead: false }));
        for (const pane of paneInputs) {
            const lane = promptLaneForIndex(prompts, pane.index);
            const tail = tmuxPanes.length
                ? tmux.capturePane(session, pane.index).slice(-12)
                : [`${session} state file present; tmux pane P${pane.index} is not currently attached.`];
            const seat = OFFICE_SEATS[panes.length % OFFICE_SEATS.length];
            const role = supervisorRoleForLane(lane);
            const paneState = pane.dead ? 'dead' : 'running';
            panes.push({
                id: `${session}-${pane.index}`,
                name: `${project} · P${pane.index} · ${lane}`,
                role,
                lane,
                project,
                session,
                host: 'local',
                index: pane.index,
                state: paneState,
                action: actionForPane(lane, paneState, tail),
                currentTask: summarizeTail(tail),
                thought: summarizeTail(tail),
                tail,
                x: seat.x,
                y: seat.y,
            });
        }
    }
    if (!panes.length) return fallbackSupervisorSnapshot('state files found but no supervisor panes inferred');
    return {
        source: files.length ? 'local codex-supervisor state files + tmux capture-pane' : 'codex-supervisor fallback',
        updatedAt: new Date().toISOString(),
        sessions,
        panes,
    };
}

function readTextIfExists(filePath: string): string {
    try {
        return fs.readFileSync(filePath, 'utf8');
    } catch {
        return '';
    }
}

function realTmuxReader(): TmuxReader {
    return {
        listPanes(session: string): TmuxPaneInfo[] {
            try {
                const out = childProcess.execFileSync('tmux', [
                    'list-panes', '-t', `=${session}`, '-F',
                    '#{pane_index}\t#{pane_dead}\t#{pane_title}'
                ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
                return out.split(/\r?\n/).filter(Boolean).map((line: string) => {
                    const [idx, dead, title] = line.split('\t');
                    return { index: Number(idx), dead: dead === '1', title };
                }).filter((pane: TmuxPaneInfo) => Number.isFinite(pane.index));
            } catch {
                return [];
            }
        },
        capturePane(session: string, index: number): string[] {
            try {
                const out = childProcess.execFileSync('tmux', [
                    'capture-pane', '-e', '-t', `=${session}:.${index}`, '-p', '-S', '-12'
                ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
                return out.split(/\r?\n/).map((line: string) => line.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, ''));
            } catch {
                return [];
            }
        }
    };
}

export function readSupervisorSnapshot(): SupervisorSnapshot {
    const home = os.homedir ? os.homedir() : process.env.HOME;
    const stateDir = home || '/Users/billy';
    let names: string[] = [];
    try {
        names = fs.readdirSync(stateDir).filter((name: string) => /^\.codex-supervisor-.*\.state$/.test(name));
    } catch {
        return fallbackSupervisorSnapshot(`cannot read ${stateDir}`);
    }
    if (!names.length) return fallbackSupervisorSnapshot(`no .codex-supervisor-*.state files in ${stateDir}`);
    const files = names.map((name) => ({ name, text: readTextIfExists(path.join(stateDir, name)) }));
    const promptFiles = new Map<string, string>();
    for (const file of files) {
        const state = parseKeyValueState(file.text);
        if (state.PROMPTS_FILE && !promptFiles.has(state.PROMPTS_FILE)) {
            promptFiles.set(state.PROMPTS_FILE, readTextIfExists(state.PROMPTS_FILE));
        }
    }
    return buildSupervisorSnapshotFromStateFiles(files, promptFiles, realTmuxReader());
}
