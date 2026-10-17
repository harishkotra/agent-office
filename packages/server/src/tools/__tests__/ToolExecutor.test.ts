import { ToolExecutor } from '../ToolExecutor';
import { OfficeRoom } from '../../rooms/OfficeRoom';
import { Agent } from '@agent-office/core';
import { OllamaAdapter } from '@agent-office/adapters';
import { MemoryStore } from '../../memory/MemoryStore';

const mockTavilySearch = jest.fn();
jest.mock('@tavily/core', () => ({ tavily: () => ({ search: mockTavilySearch }) }));

const SOURCE = 'https://www.typescriptlang.org/docs/';
const SEARCH_TEXT = `${SOURCE}\nTypeScript documentation\ngenerics describe relationships between types.`;
const savedEnv = { ...process.env };
const originalFetch = global.fetch;
let requests: { url: string; init?: RequestInit; message?: any }[];
let toolResult: { content: { type: string; text: string }[]; isError?: boolean };
let hangMethod: string | undefined;
let badHttp: boolean;

function installMcpFixture() {
    global.fetch = jest.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        const message = init?.body ? JSON.parse(String(init.body)) : undefined;
        requests.push({ url, init, message });
        if (init?.method === 'GET') return new Response(null, { status: 405 });
        if (hangMethod && message?.method === hangMethod) {
            return new Promise<Response>((_, reject) => {
                const abort = () => reject(new DOMException('Aborted', 'AbortError'));
                init?.signal?.addEventListener('abort', abort, { once: true });
                if (init?.signal?.aborted) abort();
            });
        }
        if (badHttp) return new Response('Service unavailable', { status: 503 });
        if (message?.method === 'notifications/initialized') return new Response(null, { status: 202 });
        const result = message?.method === 'initialize'
            ? { protocolVersion: message.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'fixture', version: '1' } }
            : message?.method === 'tools/list'
                ? { tools: [{ name: 'web_search', inputSchema: { type: 'object', properties: {} } }] }
                : toolResult;
        return new Response(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }), {
            headers: { 'Content-Type': 'application/json' }
        });
    }) as typeof fetch;
}

beforeEach(() => {
    process.env = { ...savedEnv };
    delete process.env.TAVILY_API_KEY;
    delete process.env.WEB_SEARCH_PROVIDER;
    delete process.env.PARALLEL_API_KEY;
    requests = [];
    toolResult = { content: [{ type: 'text', text: JSON.stringify({ search_id: 'fixture', results: [{ url: SOURCE, title: 'TypeScript documentation', excerpts: ['generics describe relationships between types.'] }] }) }] };
    hangMethod = undefined;
    badHttp = false;
    mockTavilySearch.mockReset().mockResolvedValue({ results: [{ title: 'Tavily', content: 'Configured search' }] });
    installMcpFixture();
});

afterEach(() => {
    process.env = savedEnv;
    global.fetch = originalFetch;
    jest.restoreAllMocks();
    jest.useRealTimers();
});

test('fresh no-key configuration keeps DuckDuckGo and configured credentials keep Tavily', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({ Abstract: 'Keyless answer' })));
    expect(await new ToolExecutor().execute('web_search', { query: 'TypeScript' }))
        .toEqual({ success: true, output: 'Result: Keyless answer' });
    expect(String((global.fetch as jest.Mock).mock.calls[0][0])).toContain('https://api.duckduckgo.com/');
    process.env.TAVILY_API_KEY = 'saved-key';
    expect((await new ToolExecutor().execute('web_search', { query: 'TypeScript' })).output).toContain('Configured search');
    expect(mockTavilySearch).toHaveBeenCalledWith('TypeScript', { maxResults: 5 });
});

test('explicit Parallel selection uses real MCP transport, preserves URLs and caller task identity', async () => {
    process.env.WEB_SEARCH_PROVIDER = 'parallel';
    process.env.TAVILY_API_KEY = 'saved-key';
    const executor = new ToolExecutor();
    const taskOptions = { signal: undefined, taskId: 'caller-task-id' };
    for (let i = 0; i < 2; i++) {
        expect(await executor.execute('web_search', { query: 'TypeScript generics guide' }, taskOptions))
            .toEqual({ success: true, output: SEARCH_TEXT });
    }
    const calls = requests.filter(r => r.message?.method === 'tools/call');
    expect(calls).toHaveLength(2);
    expect(calls[0].message.params).toMatchObject({
        name: 'web_search', arguments: { objective: 'TypeScript generics guide', search_queries: ['TypeScript generics guide'] }
    });
    expect(calls[0].message.params.arguments.session_id).toBe('caller-task-id');
    expect(calls[0].message.params.arguments.session_id).toBe(calls[1].message.params.arguments.session_id);
    expect(requests.some(r => r.message?.method === 'tools/list')).toBe(true);
    for (const request of requests) {
        expect(request.url).toBe('https://search.parallel.ai/mcp');
        const headers = new Headers(request.init?.headers);
        expect(headers.get('User-Agent')).toBe('AgentOffice/1.0.0 (https://github.com/harishkotra/agent-office)');
        expect(headers.has('Authorization')).toBe(false);
    }
    expect(mockTavilySearch).not.toHaveBeenCalled();
});

test('explicit DuckDuckGo overrides saved Tavily credentials', async () => {
    process.env.WEB_SEARCH_PROVIDER = 'duckduckgo';
    process.env.TAVILY_API_KEY = 'saved-key';
    global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({ Abstract: 'Explicit answer' })));
    expect((await new ToolExecutor().execute('web_search', { query: 'query' })).output).toBe('Result: Explicit answer');
    expect(mockTavilySearch).not.toHaveBeenCalled();
});

test.each(['none', 'unknown', 'tavily'])('selection %s blocks unavailable or disabled search without fallback', async provider => {
    process.env.WEB_SEARCH_PROVIDER = provider;
    expect((await new ToolExecutor().execute('web_search', { query: 'query' })).success).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
});

test.each([undefined, '', '   ', 3])('rejects invalid query %s before network access', async query => {
    process.env.WEB_SEARCH_PROVIDER = 'parallel';
    expect((await new ToolExecutor().execute('web_search', { query })).success).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
});

test('MCP tool errors retain a useful error and do not fall back to another provider', async () => {
    process.env.WEB_SEARCH_PROVIDER = 'parallel';
    toolResult = { isError: true, content: [{ type: 'text', text: 'Search service rejected query' }] };
    const result = await new ToolExecutor().execute('web_search', { query: 'query' });
    expect(result).toEqual({ success: false, output: '', error: 'Parallel search failed: Search service rejected query' });
    expect(requests.every(r => r.url === 'https://search.parallel.ai/mcp')).toBe(true);
});

test('HTTP and malformed result failures are returned as tool errors', async () => {
    process.env.WEB_SEARCH_PROVIDER = 'parallel';
    badHttp = true;
    expect((await new ToolExecutor().execute('web_search', { query: 'query' })).success).toBe(false);
    badHttp = false;
    toolResult = { content: [] };
    expect((await new ToolExecutor().execute('web_search', { query: 'query' })).error).toContain('returned no text');
});

test.each(['initialize', 'tools/call'])('the deadline aborts %s and returns an error', async method => {
    jest.useFakeTimers();
    process.env.WEB_SEARCH_PROVIDER = 'parallel';
    hangMethod = method;
    const pending = new ToolExecutor().execute('web_search', { query: 'query' });
    await jest.advanceTimersByTimeAsync(15000);
    expect((await pending).error).toContain('timed out after 15 seconds');
    expect(requests.find(r => r.message?.method === method)?.init?.signal?.aborted).toBe(true);
});

test.each(['initialize', 'tools/call'])('cancellation aborts %s and pre-cancelled calls make no requests', async method => {
    process.env.WEB_SEARCH_PROVIDER = 'parallel';
    hangMethod = method;
    const controller = new AbortController();
    const executor = new ToolExecutor();
    const pending = executor.execute('web_search', { query: 'query' }, { signal: controller.signal });
    for (let i = 0; i < 20 && !requests.some(r => r.message?.method === method); i++) {
        await new Promise(resolve => setImmediate(resolve));
    }
    expect(requests.some(r => r.message?.method === method)).toBe(true);
    controller.abort();
    expect((await pending).error).toContain('cancelled');
    const count = requests.length;
    expect((await executor.execute('web_search', { query: 'query' }, { signal: controller.signal })).error).toContain('cancelled');
    expect(requests).toHaveLength(count);
});

test('unscoped ToolExecutor calls receive independent execution identities', async () => {
    process.env.WEB_SEARCH_PROVIDER = 'parallel';
    const executor = new ToolExecutor();
    await executor.execute('web_search', { query: 'TypeScript' });
    await executor.execute('web_search', { query: 'TypeScript' });
    const ids = searchCalls().map(call => call.message.params.arguments.session_id);
    expect(ids).toHaveLength(2);
    expect(ids[0]).not.toBe(ids[1]);
});

function searchCalls() {
    return requests.filter(request => request.message?.method === 'tools/call');
}

const searchDecision = (query: string) => ({
    content: JSON.stringify({ thought: 'Find a source', action: 'use_tool', toolCall: { name: 'web_search', params: { query } } })
});
const idleDecision = { content: JSON.stringify({ action: 'idle' }) };

async function flushCaller() {
    // update launches each agent's asynchronous model/tool chain without awaiting it.
    for (let i = 0; i < 30; i++) await new Promise(resolve => setImmediate(resolve));
}

async function createOfficeFixture() {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    process.env.WEB_SEARCH_PROVIDER = 'parallel';
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    jest.spyOn(MemoryStore.prototype, 'initialize').mockResolvedValue();
    jest.spyOn(MemoryStore.prototype, 'loadMemories').mockResolvedValue([]);
    jest.spyOn(MemoryStore.prototype, 'loadLayout').mockResolvedValue(null);
    const createTask = jest.spyOn(MemoryStore.prototype, 'createTask').mockResolvedValue(1);
    const complete = jest.spyOn(OllamaAdapter.prototype, 'complete').mockResolvedValue(idleDecision);
    const room = new OfficeRoom();
    room.autoDispose = false;
    const messages = jest.spyOn(room, 'onMessage');
    jest.spyOn(room, 'setSimulationInterval').mockImplementation(() => {});
    jest.spyOn(room, 'broadcast').mockImplementation(() => {});
    await room.onCreate({});
    const assignHandler = messages.mock.calls.find(([name]) => name === 'assign-task')![1]!;
    return {
        room, complete, createTask,
        assign: (title: string, agentId = 'alice') => assignHandler({} as never, { title, agentId })
    };
}

async function nextCycle(room: OfficeRoom) {
    await jest.advanceTimersByTimeAsync(15001);
    await room.update(0);
    await flushCaller();
}

test('OfficeRoom UI assignments distinguish sequential same-title tasks and keep related calls stable', async () => {
    const { room, complete, assign, createTask } = await createOfficeFixture();
    complete.mockImplementation(async request => request.messages[0].content.startsWith('You are Alice,')
        ? searchDecision('TypeScript generics guide') : idleDecision);
    const memories = jest.spyOn(Agent.prototype, 'addMemory');
    assign('Research TypeScript');
    await room.update(0);
    await flushCaller();
    await nextCycle(room);
    assign('Research TypeScript');
    await nextCycle(room);
    await nextCycle(room);
    const calls = searchCalls();
    expect(calls).toHaveLength(4);
    const ids = calls.map(call => call.message.params.arguments.session_id);
    ids.forEach(id => expect(id).toMatch(/^[a-f0-9-]{36}$/));
    expect(ids[0]).toBe(ids[1]);
    expect(ids[2]).toBe(ids[3]);
    expect(ids[0]).not.toBe(ids[2]);
    expect(complete.mock.calls.some(([request]) => request.messages[0].content.includes(SOURCE))).toBe(true);
    expect(createTask).toHaveBeenNthCalledWith(1, 'Research TypeScript', 'alice');
    expect(createTask).toHaveBeenNthCalledWith(2, 'Research TypeScript', 'alice');
    expect(memories.mock.calls.filter(([memory]) => memory.type === 'task_result')).toHaveLength(4);
    expect(memories).toHaveBeenCalledWith(expect.objectContaining({
        type: 'task_result', content: expect.stringContaining(SEARCH_TEXT)
    }));
    expect(room.broadcast).toHaveBeenCalledWith('chat', expect.objectContaining({ text: expect.stringContaining('Used tool [web_search]') }));
    jest.clearAllTimers();
});

test('OfficeRoom concurrent agents retain different task identities and stable follow-up searches', async () => {
    const { room, complete, assign } = await createOfficeFixture();
    assign('Research TypeScript', 'alice');
    assign('Research TypeScript', 'bob');
    complete.mockImplementation(async request => searchDecision(request.messages[0].content.startsWith('You are Alice,') ? 'Alice query' : 'Bob query'));
    hangMethod = 'tools/call';
    await room.update(0);
    await flushCaller();
    const pending = searchCalls();
    expect(pending).toHaveLength(2);
    const ids = new Map(pending.map(call => [call.message.params.arguments.objective, call.message.params.arguments.session_id]));
    expect(ids.get('Alice query')).not.toBe(ids.get('Bob query'));
    // Both real transports are in flight at once. Let their deadlines release the locks.
    hangMethod = undefined;
    await jest.advanceTimersByTimeAsync(15001);
    await flushCaller();
    await nextCycle(room);
    expect(searchCalls()).toHaveLength(4);
    for (const call of searchCalls()) {
        expect(call.message.params.arguments.session_id).toBe(ids.get(call.message.params.arguments.objective));
    }
    jest.clearAllTimers();
});

test('OfficeRoom model create_task gives same-title assignments new identities', async () => {
    const { room, complete, createTask } = await createOfficeFixture();
    const assignDecision = { content: JSON.stringify({ action: 'use_tool', toolCall: {
        name: 'create_task', params: { title: 'Research TypeScript', assignee: 'bob' }
    } }) };
    complete.mockImplementation(async request => request.messages[0].content.startsWith('You are Alice,') ? assignDecision : idleDecision);
    await room.update(0);
    await flushCaller();
    complete.mockImplementation(async request => request.messages[0].content.startsWith('You are Bob,') ? searchDecision('Bob research') : idleDecision);
    await nextCycle(room);
    await nextCycle(room);
    complete.mockImplementation(async request => request.messages[0].content.startsWith('You are Alice,') ? assignDecision : idleDecision);
    await nextCycle(room);
    complete.mockImplementation(async request => request.messages[0].content.startsWith('You are Bob,') ? searchDecision('Bob research') : idleDecision);
    await nextCycle(room);
    const ids = searchCalls().map(call => call.message.params.arguments.session_id);
    expect(ids).toHaveLength(3);
    expect(ids[0]).toBe(ids[1]);
    expect(ids[0]).not.toBe(ids[2]);
    expect(createTask).toHaveBeenCalledTimes(2);
    expect(createTask).toHaveBeenNthCalledWith(2, 'Research TypeScript', 'bob');
    jest.clearAllTimers();
});

test('OfficeRoom captures task identity before inference while a same-title task is reassigned', async () => {
    const { room, complete, assign } = await createOfficeFixture();
    assign('Research TypeScript');
    let resolveInference!: (value: ReturnType<typeof searchDecision>) => void;
    complete.mockImplementation(request => request.messages[0].content.startsWith('You are Alice,')
        ? new Promise(resolve => { resolveInference = resolve; }) : Promise.resolve(idleDecision));
    await room.update(0);
    assign('Research TypeScript');
    resolveInference(searchDecision('In-flight research'));
    await flushCaller();
    complete.mockImplementation(async request => request.messages[0].content.startsWith('You are Alice,') ? searchDecision('New task research') : idleDecision);
    await nextCycle(room);
    const ids = searchCalls().map(call => call.message.params.arguments.session_id);
    expect(ids).toHaveLength(2);
    expect(ids[0]).not.toBe(ids[1]);
    jest.clearAllTimers();
});

test('OfficeRoom unassigned research executions use independent identities', async () => {
    const { room, complete } = await createOfficeFixture();
    complete.mockResolvedValue(searchDecision('Independent research'));
    await room.update(0);
    await flushCaller();
    await nextCycle(room);
    const ids = searchCalls().map(call => call.message.params.arguments.session_id);
    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(4);
    jest.clearAllTimers();
});
