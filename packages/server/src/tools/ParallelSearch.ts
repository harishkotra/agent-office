import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const ENDPOINT = 'https://search.parallel.ai/mcp';
const USER_AGENT = 'AgentOffice/1.0.0 (https://github.com/harishkotra/agent-office)';
const TIMEOUT_MS = 15000;

function formatSearchText(text: string): string {
    let data: unknown;
    try { data = JSON.parse(text); } catch { return text; }
    if (!data || typeof data !== 'object' || !('results' in data) || !Array.isArray(data.results)) return text;
    if (!data.results.length) return 'No search results found.';
    return data.results.map((result: unknown) => {
        if (!result || typeof result !== 'object') return '';
        const source = result as Record<string, unknown>;
        if (typeof source.url !== 'string' || !/^https?:\/\//i.test(source.url)) return '';
        const title = typeof source.title === 'string' ? source.title : '';
        const excerpts = Array.isArray(source.excerpts)
            ? source.excerpts.filter((excerpt: unknown): excerpt is string => typeof excerpt === 'string').join('\n')
            : '';
        // Put the source first so it survives OfficeRoom's short memory preview.
        return [source.url, title, excerpts].filter(Boolean).join('\n');
    }).filter(Boolean).join('\n\n');
}

export async function searchParallel(query: string, sessionId: string, signal?: AbortSignal): Promise<string> {
    const controller = new AbortController();
    let timedOut = false;
    const cancel = () => controller.abort();
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) cancel();
    const timeout = setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, TIMEOUT_MS);

    const client = new Client({ name: 'agent-office', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(new URL(ENDPOINT), {
        requestInit: { headers: { 'User-Agent': USER_AGENT } },
        // One deadline covers connection, discovery and reading the tool result.
        // The controller is also aborted on close, including open SSE responses.
        fetch: (input, init) => fetch(input, { ...init, signal: controller.signal })
    });

    try {
        if (controller.signal.aborted) throw new Error('Search cancelled.');
        await client.connect(transport);
        const { tools } = await client.listTools();
        if (!tools.some(tool => tool.name === 'web_search')) {
            throw new Error('The MCP server does not offer web_search.');
        }
        const result = await client.callTool({
            name: 'web_search',
            arguments: { objective: query, search_queries: [query], session_id: sessionId }
        });
        const output = Array.isArray(result.content)
            ? result.content.filter(block => block.type === 'text').map(block => block.text).join('\n\n')
            : '';
        if (result.isError) throw new Error(output || 'The MCP search returned an error.');
        if (!output.trim()) throw new Error('The MCP search returned no text.');
        const formatted = formatSearchText(output);
        if (!formatted.trim()) throw new Error('The MCP search returned no usable sources.');
        return formatted;
    } catch (error: unknown) {
        if (timedOut) throw new Error('Search timed out after 15 seconds.');
        if (signal?.aborted) throw new Error('Search cancelled.');
        throw error;
    } finally {
        clearTimeout(timeout);
        signal?.removeEventListener('abort', cancel);
        controller.abort();
        await client.close().catch(() => undefined);
    }
}
