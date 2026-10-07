import { cleanName } from './names.js'

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://gtpoovodnztuvagirdun.supabase.co'
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_DUv_YgvphJ8_D_L02nKTYQ_uCJZaJxD'
const USER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function memberName(row) {
  if (!row || typeof row !== 'object') return ''
  return cleanName(
    [row.name_prefix, row.first_name, row.last_name, row.name_suffix]
      .filter((part) => typeof part === 'string' && part.trim())
      .join(' '),
  )
}

export async function verifyFamilyToken(token) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 4096) return null
  if (!/^[\w.-]+$/.test(token)) return null
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 4000)
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY },
      signal: ctrl.signal,
    })
    if (!res.ok) return null
    const user = await res.json()
    if (!user || typeof user.id !== 'string' || !USER_ID.test(user.id)) return null
    let name = ''
    const meta = user.user_metadata || {}
    name = memberName(meta)
    if (!name && typeof user.email === 'string') name = cleanName(user.email.split('@')[0])
    try {
      const profile = await fetch(
        `${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&select=first_name,last_name,name_prefix,name_suffix`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            apikey: SUPABASE_ANON_KEY,
            Accept: 'application/json',
          },
          signal: ctrl.signal,
        },
      )
      if (profile.ok) {
        const rows = await profile.json()
        const full = memberName(rows && rows[0])
        if (full && full !== 'Guest') name = full
      }
    } catch {
      // The auth user is enough if the profile read fails.
    }
    return { id: user.id, name: name || 'Family' }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
