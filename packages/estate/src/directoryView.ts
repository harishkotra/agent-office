import { initials, markerColor, markerInk } from './markers'

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
  color: string
  ink: '#000000' | '#ffffff'
  listed: boolean
  role: string
  bio: string
  city: string
  label: string
}

export const DIRECTORY_LOAD_ERROR = 'The family directory could not be loaded right now.'

function shown(value: string | null | undefined): string {
  return (value || '').trim()
}

export function directoryCards(people: DirectoryPerson[], query: string): DirectoryCard[] {
  const q = query.trim().toLowerCase()
  return [...people]
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name))
    .filter((person) => person.id && person.name && (!q || person.name.toLowerCase().includes(q)))
    .map((person) => {
      const listed = person.contact_listed === true
      const role = listed ? shown(person.role) : ''
      const bio = listed ? shown(person.bio) : ''
      const city = listed ? shown(person.city) : ''
      const letters = initials(person.name)
      const color = markerColor(person.name)
      const label = [letters, person.name, role, bio, city].filter(Boolean).join(', ')
      return {
        id: person.id,
        name: person.name,
        initials: letters,
        color,
        ink: markerInk(color),
        listed,
        role,
        bio,
        city,
        label,
      }
    })
}
