import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { directoryCards } from './directoryView'

describe('directory cards', () => {
  it('shows a name and initials when contact is not listed, and only returned fields when it is', () => {
    const [hidden, listed, blank] = directoryCards(
      [
        {
          id: 'h',
          name: 'River Example',
          role: 'Member',
          bio: 'A bio that stays hidden.',
          city: 'Sampletown',
          contact_listed: false,
        },
        {
          id: 'l',
          name: 'Cedar Example',
          role: 'Member',
          bio: 'A listed bio.',
          city: 'Sampletown',
          contact_listed: true,
        },
        {
          id: 'b',
          name: 'Wren Example',
          role: ' ',
          bio: '',
          city: '',
          contact_listed: true,
        },
      ],
      '',
    )
    expect(hidden.listed).toBe(false)
    expect(hidden.initials).toBe('RE')
    expect(hidden.role).toBe('')
    expect(hidden.bio).toBe('')
    expect(hidden.city).toBe('')
    expect(hidden.spoken).toBe('River Example')
    expect(listed.role).toBe('Member')
    expect(listed.bio).toBe('A listed bio.')
    expect(listed.city).toBe('Sampletown')
    expect(listed.spoken).not.toMatch(/teen|minor|age|@|555/i)
    expect(blank.role).toBe('')
    expect(blank.bio).toBe('')
    expect(blank.city).toBe('')
    expect(blank.spoken).toBe('Wren Example')
  })

  it('selects only the signed-in directory columns', () => {
    const source = readFileSync(new URL('./directory.ts', import.meta.url), 'utf8')
    expect(source).toContain("from('signed_in_directory')")
    expect(source).toContain(".select('id, name, role, parent_id, bio, sort_order, city, contact_listed')")
    expect(source).not.toMatch(/select\s*\(\s*['"]\*['"]/)
    expect(source).not.toMatch(/tree_people|email|phone|notes/)
  })
})