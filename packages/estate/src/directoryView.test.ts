import { describe, expect, it } from 'vitest'
import { directoryCards } from './directoryView'

describe('directory cards', () => {
  it('hides phone and email for ages 13 to 17, and city until a parent approves', () => {
    const [minor, approved, adult] = directoryCards(
      [
        {
          id: 'm',
          name: 'Minor Example',
          role: 'Child',
          bio: 'A test bio.',
          phone: '555-0100',
          email: 'minor@example.com',
          city: 'Town',
          state: 'CA',
          is_minor: true,
          location_parent_approved: false,
        },
        {
          id: 'a',
          name: 'Approved Example',
          role: 'Child',
          bio: 'Another bio.',
          phone: '555-0101',
          email: 'approved@example.com',
          city: 'Town',
          state: 'CA',
          is_minor: true,
          location_parent_approved: true,
        },
        {
          id: 'g',
          name: 'Adult Example',
          role: 'Parent',
          bio: 'Adult bio.',
          phone: '555-0102',
          email: 'adult@example.com',
          city: 'Town',
          state: 'CA',
          is_minor: false,
        },
      ],
      '',
    )
    expect(minor.phone).toBeNull()
    expect(minor.email).toBeNull()
    expect(minor.city).toBeNull()
    expect(minor.state).toBeNull()
    expect(minor.spoken).not.toMatch(/555|@/)
    expect(approved.phone).toBeNull()
    expect(approved.email).toBeNull()
    expect(approved.city).toBe('Town')
    expect(approved.state).toBe('CA')
    expect(approved.spoken).toMatch(/Town/)
    expect(approved.spoken).not.toMatch(/555|@/)
    expect(adult.phone).toBe('555-0102')
    expect(adult.email).toBe('adult@example.com')
  })
})
