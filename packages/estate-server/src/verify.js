import { matchLiving, rosterMessage } from './living.js'
import { cleanName } from './names.js'

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://gtpoovodnztuvagirdun.supabase.co'
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_DUv_YgvphJ8_D_L02nKTYQ_uCJZaJxD'
const USER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function headers(token) {
  return {
    Authorization: `Bearer ${token}`,
    apikey: SUPABASE_ANON_KEY,
    Accept: 'application/json',
  }
}

export async function verifyFamilyToken(token) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 4096) {
    return { error: rosterMessage('auth') }
  }
  if (!/^[\w.-]+$/.test(token)) return { error: rosterMessage('auth') }
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 4000)
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: headers(token),
      signal: ctrl.signal,
    })
    if (!res.ok) return { error: rosterMessage('auth') }
    const user = await res.json()
    if (!user || typeof user.id !== 'string' || !USER_ID.test(user.id)) return { error: rosterMessage('auth') }

    let profile = user.user_metadata || {}
    const profileRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&select=first_name,last_name,middle_name,second_last_name,name_prefix,name_suffix`,
      { headers: headers(token), signal: ctrl.signal },
    )
    if (profileRes.ok) {
      const rows = await profileRes.json()
      if (rows && rows[0]) profile = { ...profile, ...rows[0] }
    }

    const treeRes = await fetch(`${SUPABASE_URL}/rest/v1/tree_people?select=id,name,role,email`, {
      headers: headers(token),
      signal: ctrl.signal,
    })
    if (!treeRes.ok) return { error: rosterMessage('roster') }
    const people = await treeRes.json()
    if (!Array.isArray(people)) return { error: rosterMessage('roster') }

    const match = matchLiving({ email: user.email, profile, people })
    if (!match.person) return { error: rosterMessage(match.error) }
    const name = cleanName(match.person.name)
    if (!name || name === 'Guest') return { error: rosterMessage('none') }
    return { id: user.id, personId: match.person.id, name }
  } catch {
    return { error: rosterMessage('auth') }
  } finally {
    clearTimeout(timer)
  }
}
