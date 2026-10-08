import { cleanName } from './family'

export type ProfileName = {
  first_name?: string | null
  last_name?: string | null
  middle_name?: string | null
  second_last_name?: string | null
  name_prefix?: string | null
  name_suffix?: string | null
}

// Keep this in step with packages/estate-server/src/profile.js.
export function profileDisplayName(row: ProfileName | null | undefined) {
  if (!row) return ''
  const name = [row.name_prefix, row.first_name, row.middle_name, row.last_name, row.second_last_name, row.name_suffix]
    .map((part) => (part || '').trim())
    .filter(Boolean)
    .join(' ')
  const cleaned = cleanName(name)
  return cleaned === 'Guest' ? '' : cleaned
}

export function accountMessage(error?: string) {
  if (error === 'auth') return 'Family sign-in could not be checked. Sign in again on the family site.'
  if (error === 'signin') return 'Sign in on the family site to visit the estate.'
  if (error === 'phone') return 'Confirm your phone on the family site before walking the grounds.'
  if (error === 'name') return 'This profile has no name yet.'
  return 'This account is not on the site member list.'
}
