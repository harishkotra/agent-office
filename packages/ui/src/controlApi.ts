/**
 * Block 4 — minimal client for the control REST surface.
 * The control token is a SERVER-side credential the operator supplies;
 * it is kept in sessionStorage (never persisted to disk) and sent on
 * every write. Same-origin relative URLs keep the UI deployable in
 * iframes (the reverse proxy maps /api in any environment).
 */
export function getControlToken(): string {
    try { return sessionStorage.getItem('agentoffice:control-token') || ''; } catch { return ''; }
}

export function setControlToken(token: string): void {
    try { sessionStorage.setItem('agentoffice:control-token', token); } catch { /* ignore */ }
}

export async function controlFetch(path: string, init: RequestInit = {}): Promise<Response> {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(init.headers as Record<string, string> || {})
    };
    const token = getControlToken();
    if (token) headers['X-AgentOffice-Control-Token'] = token;
    return fetch(`/api/control${path}`, { ...init, headers });
}

export async function controlJson<T>(path: string, init: RequestInit = {}): Promise<T & { ok: boolean; error?: string }> {
    const res = await controlFetch(path, init);
    let body: any = null;
    try { body = await res.json(); } catch { /* empty body */ }
    if (!res.ok) {
        return { ok: false, error: (body && body.error) || `HTTP ${res.status}` } as T & { ok: boolean; error?: string };
    }
    return body as T & { ok: boolean; error?: string };
}
