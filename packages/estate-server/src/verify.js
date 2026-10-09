import { accountMessage, profileDisplayName } from './profile.js'

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://gtpoovodnztuvagirdun.supabase.co'
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_DUv_YgvphJ8_D_L02nKTYQ_uCJZaJxD'
const USER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PROFILE_COLUMNS = 'first_name,last_name,middle_name,second_last_name,name_prefix,name_suffix'

export function tokenExpiry(token) {
  if (typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length < 2) return null
  try {
    const json = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
    if (!json || typeof json.exp !== 'number' || !Number.isFinite(json.exp)) return null
    return json.exp * 1000
  } catch {
    return null
  }
}

function headers(token) {
  return {
    Authorization: `Bearer ${token}`,
    apikey: SUPABASE_ANON_KEY,
    Accept: 'application/json',
  }
}

async function phoneVerified(token, signal) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/am_i_phone_verified`, {
    method: 'POST',
    headers: { ...headers(token), 'Content-Type': 'application/json' },
    body: '{}',
    signal,
  })
  if (!res.ok) return false
  const body = await res.json()
  return body === true
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
    const phone = await phoneVerified(token, ctrl.signal)
    if (!phone) return { error: accountMessage('phone') }
    return { id: user.id, name }
  } catch {
    return { error: accountMessage('auth') }
  } finally {
    clearTimeout(timer)
  }
}
