import { createClient, type Session } from '@supabase/supabase-js'
import { FAMILY_SITE, SUPABASE_ANON_KEY, SUPABASE_URL } from './family'
import { accountMessage, profileDisplayName, type ProfileName } from './profileName'

export function requirePhoneVerified(data: unknown, error: unknown) {
  if (error || data !== true) throw new Error(accountMessage('phone'))
}

export type Member = {
  id: string
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
  const { data, error } = await sb()
    .from('profiles')
    .select('first_name,last_name,middle_name,second_last_name,name_prefix,name_suffix')
    .eq('id', user.id)
    .maybeSingle()
  if (error) throw new Error(accountMessage('profile'))
  const name = profileDisplayName(data as ProfileName | null)
  if (!data || !name) throw new Error(data ? accountMessage('name') : accountMessage('profile'))
  const { data: phone, error: phoneError } = await sb().rpc('am_i_phone_verified')
  requirePhoneVerified(phone, phoneError)
  return {
    id: user.id,
    name,
    token: session.access_token,
  }
}

export async function restoreSession(): Promise<Member | null> {
  const { data } = await sb().auth.getSession()
  if (!data.session) return null
  return memberFromSession(data.session)
}

export function familyClient() {
  return sb()
}

export async function currentToken(): Promise<string | undefined> {
  const { data } = await sb().auth.getSession()
  return data.session?.access_token
}

export const FAMILY_ACCOUNT_URL = `${FAMILY_SITE}/account.html`
export const FAMILY_ESTATE_PATH = '/estate/'
