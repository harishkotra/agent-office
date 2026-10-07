import { createClient, type Session } from '@supabase/supabase-js'
import { FAMILY_SITE, SUPABASE_ANON_KEY, SUPABASE_URL } from './family'
import { matchLiving, rosterMessage, type RosterPerson } from './living'

export type Member = {
  id: string
  personId: string
  name: string
  token: string
  color?: string
}

let client: ReturnType<typeof createClient> | null = null

function sb() {
  if (!client) client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  return client
}

async function memberFromSession(session: Session): Promise<Member> {
  const user = session.user
  const { data: people, error } = await sb().from('tree_people').select('id,name,role,email')
  if (error || !Array.isArray(people)) throw new Error(rosterMessage('roster'))
  const match = matchLiving({
    email: user.email,
    people: people as RosterPerson[],
  })
  if (!match.person) throw new Error(rosterMessage(match.error))
  return {
    id: match.person.id,
    personId: match.person.id,
    name: match.person.name.trim(),
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
  if (error || !data.session) throw new Error(error?.message || rosterMessage('auth'))
  return memberFromSession(data.session)
}

export async function currentToken(): Promise<string | undefined> {
  const { data } = await sb().auth.getSession()
  return data.session?.access_token
}

export const FAMILY_ACCOUNT_URL = `${FAMILY_SITE}/account.html`
export const FAMILY_ESTATE_PATH = '/estate/'
