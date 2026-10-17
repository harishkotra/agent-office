import { exec } from 'child_process';
import { randomUUID } from 'crypto';
import { searchParallel } from './ParallelSearch';
import { tavily, type TavilyClient, type TavilySearchResponse } from '@tavily/core';

export interface ToolResult {
    success: boolean;
    output: string;
    error?: string;
}

export class ToolExecutor {
    private tavilyClient: TavilyClient | null = null;

    private getTavilyClient(): TavilyClient | null {
        if (this.tavilyClient) return this.tavilyClient;
        const apiKey = process.env.TAVILY_API_KEY;
        if (apiKey) {
            this.tavilyClient = tavily({ apiKey });
            return this.tavilyClient;
        }
        return null;
    }

    async execute(toolName: string, params: any, options: { signal?: AbortSignal; taskId?: string } = {}): Promise<ToolResult> {
        switch (toolName) {
            case 'code_execute':
                return this.executeCode(params.code, params.language || 'javascript');
            case 'web_search':
                return this.webSearch(params?.query, options.signal, options.taskId);
            case 'write_note':
                return this.writeNote(params.content);
            case 'read_file':
                return this.readFile(params.path);
            default:
                return { success: false, output: '', error: `Unknown tool: ${toolName}` };
        }
    }

    private executeCode(code: string, language: string): Promise<ToolResult> {
        return new Promise((resolve) => {
            // Sandbox: only allow JS/TS, with timeout
            if (language !== 'javascript' && language !== 'js') {
                resolve({ success: false, output: '', error: `Only JavaScript is supported for sandboxed execution.` });
                return;
            }

            // Wrap in a timeout to prevent infinite loops
            const wrappedCode = `
                const __timeout = setTimeout(() => { process.exit(1); }, 5000);
                try {
                    const result = (function() { ${code} })();
                    if (result !== undefined) console.log(JSON.stringify(result));
                    clearTimeout(__timeout);
                } catch(e) {
                    console.error(e.message);
                    clearTimeout(__timeout);
                    process.exit(1);
                }
            `;

            exec(`node -e "${wrappedCode.replace(/"/g, '\\"')}"`, { timeout: 6000 }, (error, stdout, stderr) => {
                if (error) {
                    resolve({ success: false, output: stderr || error.message, error: error.message });
                } else {
                    resolve({ success: true, output: stdout.trim() });
                }
            });
        });
    }

    private async webSearch(query: string, signal?: AbortSignal, taskId?: string): Promise<ToolResult> {
        const provider = process.env.WEB_SEARCH_PROVIDER?.trim().toLowerCase();
        if (provider === 'none') {
            return { success: false, output: '', error: 'Web search is disabled.' };
        }
        if (typeof query !== 'string' || !query.trim()) {
            return { success: false, output: '', error: 'A non-empty search query is required.' };
        }
        if (signal?.aborted) {
            return { success: false, output: '', error: 'Search cancelled.' };
        }
        if (provider === 'parallel') {
            try {
                return { success: true, output: await searchParallel(query, taskId ?? randomUUID(), signal) };
            } catch (error: unknown) {
                return { success: false, output: '', error: `Parallel search failed: ${error instanceof Error ? error.message : String(error)}` };
            }
        }
        if (provider === 'duckduckgo') return this.webSearchDuckDuckGo(query);
        if (provider && provider !== 'tavily') {
            return { success: false, output: '', error: `Unknown WEB_SEARCH_PROVIDER: ${provider}` };
        }
        const client = this.getTavilyClient();
        if (client) return this.webSearchTavily(query, client);
        if (provider === 'tavily') {
            return { success: false, output: '', error: 'Tavily requires TAVILY_API_KEY.' };
        }
        return this.webSearchDuckDuckGo(query);
    }

    private async webSearchTavily(query: string, client: TavilyClient): Promise<ToolResult> {
        try {
            const response = await client.search(query, { maxResults: 5 });

            const results = (response.results || [])
                .map((r: TavilySearchResponse['results'][number]) => `${r.title}: ${r.content}`)
                .join('\n\n');

            const output = results
                ? `Results:\n${results}`
                : `No results for "${query}".`;

            return { success: true, output };
        } catch (e: any) {
            return { success: false, output: '', error: `Tavily search failed: ${e.message}` };
        }
    }

    private async webSearchDuckDuckGo(query: string): Promise<ToolResult> {
        try {
            // Use a simple fetch to DuckDuckGo Instant Answer API (no API key needed)
            const encoded = encodeURIComponent(query);
            const res = await fetch(`https://api.duckduckgo.com/?q=${encoded}&format=json&no_html=1`);
            const data = await res.json();

            const abstract = data.Abstract || data.AbstractText || '';
            const relatedTopics = (data.RelatedTopics || []).slice(0, 3).map((t: any) => t.Text || '').join('; ');

            const output = abstract
                ? `Result: ${abstract}`
                : relatedTopics
                    ? `Related: ${relatedTopics}`
                    : `No direct results for "${query}".`;

            return { success: true, output };
        } catch (e: any) {
            return { success: false, output: '', error: `Search failed: ${e.message}` };
        }
    }

    private async writeNote(content: string): Promise<ToolResult> {
        // Simple in-memory note (could be extended to file I/O)
        console.log(`[ToolExecutor] Note: ${content}`);
        return { success: true, output: `Note saved: "${content.slice(0, 50)}..."` };
    }

    private async readFile(path: string): Promise<ToolResult> {
        // Sandboxed: only allow reading from a safe directory
        const { readFile } = await import('fs/promises');
        try {
            if (path.includes('..') || path.startsWith('/')) {
                return { success: false, output: '', error: 'Path traversal not allowed.' };
            }
            const content = await readFile(path, 'utf-8');
            return { success: true, output: content.slice(0, 500) };
        } catch (e: any) {
            return { success: false, output: '', error: e.message };
        }
    }
}
