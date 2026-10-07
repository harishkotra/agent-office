export const FAMILY_SITE = 'https://mccowanestate.com'

const PUBLISHABLE_KEY = 'sb_publishable_DUv_YgvphJ8_D_L02nKTYQ_uCJZaJxD'

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://gtpoovodnztuvagirdun.supabase.co'
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || PUBLISHABLE_KEY

export const PALETTE = ['#e15a3a', '#3a7bd5', '#f2b134', '#7d5ba6', '#2a9d8f', '#e07a9a', '#d87b2a', '#4c956c'] as const

export function colorFor(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 33 + id.charCodeAt(i)) >>> 0
  return PALETTE[hash % PALETTE.length]
}

export function cleanName(raw: unknown): string {
  const name = String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40)
  return name || 'Guest'
}

export function formatMemberName(
  row:
    | {
        first_name?: string | null
        last_name?: string | null
        name_prefix?: string | null
        name_suffix?: string | null
      }
    | null
    | undefined,
): string {
  if (!row) return ''
  return [row.name_prefix, row.first_name, row.last_name, row.name_suffix]
    .map((part) => (part || '').trim())
    .filter(Boolean)
    .join(' ')
}

export function allowedOrigin(origin: string): boolean {
  if (origin === 'https://mccowanestate.com' || origin === 'https://www.mccowanestate.com') return true
  if (origin === 'https://jerichothewall.github.io') return true
  try {
    const url = new URL(origin)
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  } catch {
    return false
  }
}

export function parentOrigin(): string | null {
  if (typeof window === 'undefined' || window.parent === window) return null
  try {
    const ref = document.referrer
    if (!ref) return null
    const origin = new URL(ref).origin
    return allowedOrigin(origin) ? origin : null
  } catch {
    return null
  }
}

export function presenceUrl(): string {
  const query = new URLSearchParams(window.location.search).get('ws')
  if (query) return query
  if (import.meta.env.VITE_PRESENCE_URL) return import.meta.env.VITE_PRESENCE_URL
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  if (window.location.port === '5174' || window.location.port === '4174') {
    return `${proto}//${window.location.hostname}:8787`
  }
  return `${proto}//${window.location.host}/presence`
}
