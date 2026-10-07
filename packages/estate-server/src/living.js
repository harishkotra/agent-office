function norm(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

// Same living check as the family site directory (personPassed).
// The rows themselves come from tree_people, which Family Manager keeps.
export function personPassed(person) {
  if (!person) return true
  if (person.id === 'evelyn' || person.id === 'vivian') return true
  return /passed/i.test(person.role || '')
}

function named(profile, keys) {
  return norm(
    keys
      .map((key) => profile?.[key])
      .filter((part) => typeof part === 'string' && part.trim())
      .join(' '),
  )
}

export function profileNames(profile) {
  const names = new Set()
  for (const name of [
    named(profile, ['name_prefix', 'first_name', 'middle_name', 'last_name', 'second_last_name', 'name_suffix']),
    named(profile, ['first_name', 'middle_name', 'last_name']),
    named(profile, ['first_name', 'last_name', 'second_last_name']),
    named(profile, ['first_name', 'last_name']),
  ]) {
    if (name) names.add(name)
  }
  return names
}

export function matchLiving({ email, profile, people }) {
  const rows = Array.isArray(people) ? people.filter((person) => person && person.id && person.name) : []
  const mail = norm(email)
  if (mail) {
    const byEmail = rows.filter((person) => norm(person.email) === mail)
    if (byEmail.length > 1) return { error: 'ambiguous' }
    if (byEmail.length === 1) {
      if (personPassed(byEmail[0])) return { error: 'passed' }
      return { person: byEmail[0] }
    }
  }
  const wanted = profileNames(profile || {})
  if (wanted.size === 0) return { error: 'none' }
  const byName = rows.filter((person) => !personPassed(person) && wanted.has(norm(person.name)))
  const unique = [...new Map(byName.map((person) => [person.id, person])).values()]
  if (unique.length === 1) return { person: unique[0] }
  if (unique.length > 1) return { error: 'ambiguous' }
  return { error: 'none' }
}

export function rosterMessage(error) {
  if (error === 'ambiguous') {
    return 'This account matches more than one living family member. Family Manager needs to tie it to one person.'
  }
  if (error === 'passed') return 'This family record is not on the living roster.'
  if (error === 'roster') return 'The living family roster could not be read. Sign in again on the family site.'
  if (error === 'auth') return 'Family sign-in could not be checked. Sign in again on the family site.'
  if (error === 'signin') return 'Sign in on the family site to walk the grounds.'
  return 'This account is not on the living family roster.'
}
