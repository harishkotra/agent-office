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
    .from('signed_in_directory')
    .select('id, name, role, parent_id, bio, sort_order, city, contact_listed')
    .order('sort_order')
  if (error || !Array.isArray(data)) throw new Error('The family directory could not be loaded right now.')
  return data
    .map((row) => {
      const item = row as Record<string, unknown>
      return {
        id: text(item.id),
        name: text(item.name),
        role: text(item.role),
        parent_id: text(item.parent_id),
        bio: text(item.bio),
        city: text(item.city),
        sort_order: typeof item.sort_order === 'number' ? item.sort_order : 0,
        contact_listed: item.contact_listed === true,
      }
    })
    .filter((person) => person.id && person.name)
}
