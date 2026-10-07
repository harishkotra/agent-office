import { familyClient } from './auth'
import { accountMessage } from './profileName'
import type { DirectoryPerson } from './directoryView'

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export async function loadFamilyDirectory(): Promise<DirectoryPerson[]> {
  const { data: session } = await familyClient().auth.getSession()
  if (!session.session) throw new Error(accountMessage('signin'))
  const { data, error } = await familyClient()
    .from('tree_people')
    .select('id, name, role, parent_id, notes, bio, phone, email, city, is_minor, location_parent_approved')
    .order('name')
  if (error || !Array.isArray(data)) throw new Error('The family directory could not be loaded right now.')
  return data
    .map((row) => {
      const item = row as Record<string, unknown>
      return {
        id: text(item.id),
        name: text(item.name),
        role: text(item.role),
        parent_id: text(item.parent_id) || null,
        notes: text(item.notes),
        bio: text(item.bio),
        phone: text(item.phone),
        email: text(item.email),
        city: text(item.city),
        state: text(item.state),
        is_minor: item.is_minor === true,
        location_parent_approved: item.location_parent_approved === true,
      }
    })
    .filter((person) => person.id && person.name)
}
