import { describe, expect, it } from 'vitest'
import { HOMES, MANSION, interiorsFor, nearbyTarget, promptText, shouldLoadInterior, stepThrough } from './buildings'

describe('interiors', () => {
  it('loads a home on approach and unloads after leaving', () => {
    const rose = HOMES[0]
    const door = rose.doors[0]
    expect(shouldLoadInterior(false, door.x + 10, door.z, rose)).toBe(true)
    expect(shouldLoadInterior(false, door.x + 40, door.z, rose)).toBe(false)
    expect(shouldLoadInterior(true, door.x + 20, door.z, rose)).toBe(true)
    expect(shouldLoadInterior(true, door.x + 40, door.z, rose)).toBe(false)
    const loaded = new Set(interiorsFor(door.x + 2, door.z, new Set()))
    expect(loaded.has('rose')).toBe(true)
    expect(interiorsFor(0, 82, loaded).includes('rose')).toBe(false)
  })

  it('asks you to press to enter, then steps through the door', () => {
    const rose = HOMES[0]
    const door = rose.doors[0]
    const outside = nearbyTarget(door.x + 1.2, door.z, new Set(['rose']))
    expect(outside?.kind).toBe('floor')
    expect(promptText(outside!.kind, 'F', false)).toBe('Press F to enter')
    const inside = stepThrough(door.x + 1.2, door.z, rose, door)
    expect(inside.x).toBeLessThan(rose.maxX - 0.5)
    const back = stepThrough(inside.x, inside.z, rose, door)
    expect(back.x).toBeGreaterThan(rose.maxX)
  })

  it('offers the mansion bookshelf only while the interior is loaded', () => {
    expect(nearbyTarget(MANSION.shelf!.x, MANSION.shelf!.z, new Set())).toBeNull()
    const hit = nearbyTarget(MANSION.shelf!.x, MANSION.shelf!.z + 1, new Set(['mansion']))
    expect(hit?.kind).toBe('bookshelf')
    expect(promptText('bookshelf', 'F', false)).toMatch(/family directory/)
  })
})
