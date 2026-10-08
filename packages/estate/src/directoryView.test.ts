import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { directoryCards } from './directoryView'

describe('directory cards', () => {
  it('shows a name and initials when contact is not listed, and only returned fields when it is', () => {
    const cards = directoryCards(
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
    const hidden = cards.find((card) => card.name === 'River Example')
    const listed = cards.find((card) => card.name === 'Cedar Example')
    const blank = cards.find((card) => card.name === 'Wren Example')
    expect(hidden).toBeTruthy()
    expect(listed).toBeTruthy()
    expect(blank).toBeTruthy()
    if (!hidden || !listed || !blank) return
    expect(hidden.listed).toBe(false)
    expect(hidden.initials).toBe('RE')
    expect(hidden.role).toBe('')
    expect(hidden.bio).toBe('')
    expect(hidden.city).toBe('')
    expect(hidden.label).toBe('RE, River Example')
    expect(listed.role).toBe('Member')
    expect(listed.bio).toBe('A listed bio.')
    expect(listed.city).toBe('Sampletown')
    expect(listed.initials).toBe('CE')
    expect(listed.label).toBe('CE, Cedar Example, Member, A listed bio., Sampletown')
    expect(listed.label).not.toMatch(/teen|minor|age|@|555/i)
    expect(blank.role).toBe('')
    expect(blank.bio).toBe('')
    expect(blank.city).toBe('')
    expect(blank.label).toBe('WE, Wren Example')
    expect(hidden.color).toMatch(/^#[0-9a-f]{6}$/)
    expect(hidden.ink === '#000000' || hidden.ink === '#ffffff').toBe(true)
  })

  it('leaves out empty fields, ids, and contact columns that are not on the card', () => {
    const [card] = directoryCards(
      [
        {
          id: 'row-hidden',
          name: 'Ash Example',
          parent_id: 'row-parent',
          role: 'Member',
          bio: '',
          city: '',
          contact_listed: true,
          sort_order: 2,
        },
      ],
      '',
    )
    expect(card.label).toBe('AE, Ash Example, Member')
    expect(card.label).not.toContain('row-hidden')
    expect(card.label).not.toContain('row-parent')
    expect(card.label).not.toMatch(/—|teen|minor/)
  })

  it('orders cards by sort_order and hides a missing contact flag', () => {
    const cards = directoryCards(
      [
        { id: 'b', name: 'Bea Example', contact_listed: null, sort_order: 2 },
        { id: 'a', name: 'Ada Example', contact_listed: true, sort_order: 1, role: 'Member' },
      ],
      '',
    )
    expect(cards.map((card) => card.name)).toEqual(['Ada Example', 'Bea Example'])
    expect(cards[1].role).toBe('')
    expect(cards[1].label).toBe('BE, Bea Example')
  })

  it('seeds the marker from the display name and announces the directory', () => {
    const hud = readFileSync(new URL('./ui/Hud.tsx', import.meta.url), 'utf8')
    const model = readFileSync(new URL('./game/CharacterModel.tsx', import.meta.url), 'utf8')
    const menu = readFileSync(new URL('./ui/PlayMenus.tsx', import.meta.url), 'utf8')
    const player = readFileSync(new URL('./game/Player.tsx', import.meta.url), 'utf8')
    expect(hud).toContain('markerColor(person.name)')
    expect(hud).not.toContain('markerColor(person.id)')
    expect(model).toContain('markerColor(name)')
    expect(model).not.toContain('markerId')
    expect(menu).toContain("announce('Family directory open.')")
    expect(menu).toContain("announce('Back in the Great Hall')")
    expect(menu).toContain('role="status"')
    expect(menu).toContain('role="alert"')
    expect(menu).not.toContain('err.message')
    expect(player).not.toContain('Family directory open.')
  })

  it('selects only the signed-in directory columns', () => {
    const source = readFileSync(new URL('./directory.ts', import.meta.url), 'utf8')
    expect(source).toContain("from('signed_in_directory')")
    expect(source).toContain(".select('id, name, role, parent_id, bio, sort_order, city, contact_listed')")
    expect(source).not.toMatch(/select\s*\(\s*['"]\*['"]/)
    expect(source).not.toMatch(/tree_people|email|phone|notes/)
  })
})