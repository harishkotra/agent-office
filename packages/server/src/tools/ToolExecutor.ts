import { exec } from 'child_process';
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

    async execute(toolName: string, params: any): Promise<ToolResult> {
        switch (toolName) {
            case 'code_execute':
                return this.executeCode(params.code, params.language || 'javascript');
            case 'web_search':
                return this.webSearch(params.query);
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

    private async webSearch(query: string): Promise<ToolResult> {
        // When YDC_API_KEY is set, prefer You.com search (keyed or keyless).
        // Falls back to Tavily → DuckDuckGo when the env var is unset.
        const youcomKey = process.env.YDC_API_KEY;
        if (youcomKey !== undefined) {
            return this.webSearchYoucom(query, youcomKey);
        }

        const client = this.getTavilyClient();
        if (client) {
            return this.webSearchTavily(query, client);
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

    private async webSearchYoucom(query: string, apiKey: string): Promise<ToolResult> {
        try {
            const url = new URL('https://api.you.com/v1/search');
            url.searchParams.set('query', query);
            url.searchParams.set('num_web_results', '5');

            const res = await fetch(url.toString(), {
                headers: { 'X-API-Key': apiKey },
            });

            if (!res.ok) {
                const text = await res.text().catch(() => '');
                throw new Error(`You.com search API responded with ${res.status}: ${text.slice(0, 200)}`);
            }

            const data = await res.json();
            const hits: { title?: string; description?: string; url?: string }[] =
                data.results || data.webPages?.value || [];

            const output = hits.length
                ? hits
                    .slice(0, 5)
                    .map((r) => `${r.title || '(no title)'}: ${(r.description || '').slice(0, 300)}`)
                    .join('\n\n')
                : `No results for "${query}".`;

            return { success: true, output };
        } catch (e: any) {
            return { success: false, output: '', error: `You.com search failed: ${e.message}` };
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
