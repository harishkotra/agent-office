import { accountMessage, profileDisplayName } from './profile.js'

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://gtpoovodnztuvagirdun.supabase.co'
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_DUv_YgvphJ8_D_L02nKTYQ_uCJZaJxD'
const USER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PROFILE_COLUMNS = 'first_name,last_name,middle_name,second_last_name,name_prefix,name_suffix'

function headers(token) {
  return {
    Authorization: `Bearer ${token}`,
    apikey: SUPABASE_ANON_KEY,
    Accept: 'application/json',
  }
}

export async function verifyFamilyToken(token) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 4096) {
    return { error: accountMessage('auth') }
  }
  if (!/^[\w.-]+$/.test(token)) return { error: accountMessage('auth') }
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 4000)
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: headers(token),
      signal: ctrl.signal,
    })
    if (!res.ok) return { error: accountMessage('auth') }
    const user = await res.json()
    if (!user || typeof user.id !== 'string' || !USER_ID.test(user.id)) return { error: accountMessage('auth') }

    const profileRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&select=${PROFILE_COLUMNS}`,
      { headers: headers(token), signal: ctrl.signal },
    )
    if (!profileRes.ok) return { error: accountMessage('profile') }
    const rows = await profileRes.json()
    const profile = Array.isArray(rows) ? rows[0] : null
    if (!profile) return { error: accountMessage('profile') }
    const name = profileDisplayName(profile)
    if (!name) return { error: accountMessage('name') }
    return { id: user.id, name }
  } catch {
    return { error: accountMessage('auth') }
  } finally {
    clearTimeout(timer)
  }
}
