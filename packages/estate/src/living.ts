export type RosterPerson = {
  id: string
  name: string
  role?: string | null
  email?: string | null
}

function norm(value: unknown) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

// Memorial list from Legacy Bot / the family directory, plus the directory's
// personPassed rule. Keep this in step with packages/estate-server/src/living.js.
const MEMORIAL_IDS = new Set(['evelyn', 'lee', 'vivian', 'sammy', 'jeremiah'])
const MEMORIAL_NAMES = new Set([
  'evelyn rosborough',
  'vivian mccowan',
  'lee rosborough',
  'sammy mccowan iii',
  'jeremiah devon mccowan',
])

export function personPassed(person: RosterPerson | null | undefined) {
  if (!person) return true
  if (MEMORIAL_IDS.has(String(person.id || '').toLowerCase())) return true
  if (MEMORIAL_NAMES.has(norm(person.name))) return true
  return /passed/i.test(person.role || '')
}

// Admission is an email link to one living tree_people row.
// Name matching is not used, so a new account cannot walk as someone else.
export function matchLiving({
  email,
  people,
}: {
  email?: string | null
  people?: RosterPerson[] | null
}): { person?: RosterPerson; error?: 'ambiguous' | 'passed' | 'none' } {
  const rows = Array.isArray(people) ? people.filter((person) => person && person.id && person.name) : []
  const mail = norm(email)
  if (!mail) return { error: 'none' }
  const byEmail = rows.filter((person) => norm(person.email) === mail)
  if (byEmail.length > 1) return { error: 'ambiguous' }
  if (byEmail.length === 1) {
    if (personPassed(byEmail[0])) return { error: 'passed' }
    return { person: byEmail[0] }
  }
  return { error: 'none' }
}

export function rosterMessage(error?: string) {
  if (error === 'ambiguous') {
    return 'This account matches more than one living family member. Family Manager needs to tie it to one person.'
  }
  if (error === 'passed') return 'This family record is not on the living roster.'
  if (error === 'roster') return 'The living family roster could not be read. Sign in again on the family site.'
  if (error === 'auth') return 'Family sign-in could not be checked. Sign in again on the family site.'
  if (error === 'signin') return 'Sign in on the family site to walk the grounds.'
  return 'This account is not on the living family roster.'
}
