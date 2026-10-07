import { createClient, type Session } from '@supabase/supabase-js'
import {
  FAMILY_SITE,
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
  allowedOrigin,
  cleanName,
  formatMemberName,
  parentOrigin,
} from './family'

export type Member = {
  id: string
  name: string
  guest: boolean
  token?: string
  color?: string
}

let client: ReturnType<typeof createClient> | null = null

function sb() {
  if (!client) client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  return client
}

async function memberFromSession(session: Session): Promise<Member> {
  const user = session.user
  const meta = (user.user_metadata || {}) as {
    first_name?: string
    last_name?: string
    name_prefix?: string
    name_suffix?: string
  }
  let name = formatMemberName(meta)
  if (!name && user.email) name = user.email.split('@')[0] || ''
  const { data } = await sb()
    .from('profiles')
    .select('first_name,last_name,name_prefix,name_suffix')
    .eq('id', user.id)
    .maybeSingle()
  const profile = data as {
    first_name?: string | null
    last_name?: string | null
    name_prefix?: string | null
    name_suffix?: string | null
  } | null
  const full = formatMemberName(profile)
  if (full) name = full
  return {
    id: user.id,
    name: cleanName(name || 'Family'),
    guest: false,
    token: session.access_token,
  }
}

export async function restoreSession(): Promise<Member | null> {
  const { data } = await sb().auth.getSession()
  if (!data.session) return null
  return memberFromSession(data.session)
}

export async function signIn(email: string, password: string): Promise<Member> {
  const { data, error } = await sb().auth.signInWithPassword({ email: email.trim(), password })
  if (error || !data.session) throw new Error(error?.message || 'Could not sign in')
  return memberFromSession(data.session)
}

export async function currentToken(): Promise<string | undefined> {
  const { data } = await sb().auth.getSession()
  return data.session?.access_token
}

export function announceReady() {
  const origin = parentOrigin()
  if (!origin) return
  window.parent.postMessage({ type: 'mccowan-estate:ready' }, origin)
}

export function postPresence(
  players: { id: string; name: string; zone: string; x: number; y: number; z: number; guest: boolean }[],
) {
  const origin = parentOrigin()
  if (!origin) return
  window.parent.postMessage({ type: 'mccowan-estate:presence', players }, origin)
}

export function listenForSiteSession(onMember: (member: Member) => void) {
  const onMessage = async (event: MessageEvent) => {
    if (!allowedOrigin(event.origin)) return
    const data = event.data as { type?: string; accessToken?: string; refreshToken?: string } | null
    if (!data || data.type !== 'mccowan-estate:session' || typeof data.accessToken !== 'string') return
    if (typeof data.refreshToken === 'string') {
      const { error } = await sb().auth.setSession({
        access_token: data.accessToken,
        refresh_token: data.refreshToken,
      })
      if (error) return
      const { data: sessionData } = await sb().auth.getSession()
      if (sessionData.session) onMember(await memberFromSession(sessionData.session))
      return
    }
    const { data: userData, error } = await sb().auth.getUser(data.accessToken)
    if (error || !userData.user) return
    const meta = (userData.user.user_metadata || {}) as {
      first_name?: string
      last_name?: string
      name_prefix?: string
      name_suffix?: string
    }
    onMember({
      id: userData.user.id,
      name: cleanName(formatMemberName(meta) || userData.user.email?.split('@')[0] || 'Family'),
      guest: false,
      token: data.accessToken,
    })
  }
  window.addEventListener('message', onMessage)
  return () => window.removeEventListener('message', onMessage)
}

export const FAMILY_ACCOUNT_URL = `${FAMILY_SITE}/account.html`
