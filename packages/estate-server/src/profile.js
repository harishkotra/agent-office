import { cleanName } from './names.js'

export function profileDisplayName(row) {
  if (!row || typeof row !== 'object') return ''
  const name = [row.name_prefix, row.first_name, row.middle_name, row.last_name, row.second_last_name, row.name_suffix]
    .filter((part) => typeof part === 'string' && part.trim())
    .join(' ')
  const cleaned = cleanName(name)
  return cleaned === 'Guest' ? '' : cleaned
}

export function accountMessage(error) {
  if (error === 'auth') return 'Family sign-in could not be checked. Sign in again on the family site.'
  if (error === 'signin') return 'Sign in on the family site to walk the grounds.'
  if (error === 'name') return 'This profile has no name yet.'
  return 'This account is not on the site member list.'
}
