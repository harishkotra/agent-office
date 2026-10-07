export type DirectoryPerson = {
  id: string
  name: string
  role?: string | null
  parent_id?: string | null
  notes?: string | null
  bio?: string | null
  phone?: string | null
  email?: string | null
  city?: string | null
  state?: string | null
  is_minor?: boolean | null
  location_parent_approved?: boolean | null
}

export type DirectoryCard = {
  id: string
  name: string
  passed: string
  bio: string
  phone: string | null
  email: string | null
  city: string | null
  state: string | null
  spoken: string
}

export function personPassed(person: DirectoryPerson): boolean {
  const role = person.role || ''
  if (/passed/i.test(role)) return true
  return /\bdied\b|passed away/i.test(`${role} ${person.notes || ''} ${person.bio || ''}`)
}

function filled(value: string | null | undefined): string | null {
  const text = (value || '').trim()
  return text || null
}

export function directoryCards(people: DirectoryPerson[], query: string): DirectoryCard[] {
  const q = query.trim().toLowerCase()
  return people
    .filter((person) => person.id && person.name && (!q || person.name.toLowerCase().includes(q)))
    .map((person) => {
      const minor = person.is_minor === true
      const locationOk = !minor || person.location_parent_approved === true
      const passed = personPassed(person)
      const phone = minor || passed ? null : filled(person.phone) || '—'
      const email = minor || passed ? null : filled(person.email) || '—'
      const city = locationOk && !passed ? filled(person.city) : null
      const state = locationOk && !passed ? filled(person.state) : null
      const bio = (person.bio || person.notes || '').trim() || 'No bio yet.'
      const passedText = passed ? 'Passed away. Contact not listed.' : ''
      const place = [city, state].filter((part) => part && part !== '—').join(', ')
      const spoken = [person.name, passedText, bio, place].filter(Boolean).join('. ')
      return {
        id: person.id,
        name: person.name,
        passed: passedText,
        bio,
        phone,
        email,
        city,
        state,
        spoken,
      }
    })
}
