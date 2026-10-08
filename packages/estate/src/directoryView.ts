import { initials } from './markers'

export type DirectoryPerson = {
  id: string
  name: string
  role?: string | null
  parent_id?: string | null
  bio?: string | null
  city?: string | null
  sort_order?: number | null
  contact_listed?: boolean | null
}

export type DirectoryCard = {
  id: string
  name: string
  initials: string
  listed: boolean
  role: string
  bio: string
  city: string
  spoken: string
}

function shown(value: string | null | undefined): string {
  return (value || '').trim()
}

export function directoryCards(people: DirectoryPerson[], query: string): DirectoryCard[] {
  const q = query.trim().toLowerCase()
  return people
    .filter((person) => person.id && person.name && (!q || person.name.toLowerCase().includes(q)))
    .map((person) => {
      const listed = person.contact_listed === true
      const role = listed ? shown(person.role) : ''
      const bio = listed ? shown(person.bio) : ''
      const city = listed ? shown(person.city) : ''
      const spoken = [person.name, role, bio, city].filter(Boolean).join('. ')
      return {
        id: person.id,
        name: person.name,
        initials: initials(person.name),
        listed,
        role,
        bio,
        city,
        spoken,
      }
    })
}
