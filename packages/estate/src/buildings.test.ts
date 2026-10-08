import { describe, expect, it } from 'vitest'
import { BUILDINGS, HOMES, MANSION, TRAVEL, advanceDoor, doorStep, interiorsFor, nearbyTarget, promptFor, shouldLoadInterior, stepThrough } from './buildings'

describe('interiors', () => {
  it('names the homes and the mansion without a theme', () => {
    expect(HOMES.map((home) => home.label)).toEqual(['Home 1', 'Home 2', 'Home 3', 'Home 4', 'Home 5'])
    expect(MANSION.label).toBe('Mansion')
  })

  it('loads a home on approach and unloads after leaving', () => {
    const rose = HOMES[0]
    const door = rose.doors[0]
    expect(shouldLoadInterior(false, door.x + 10, door.z, rose)).toBe(true)
    expect(shouldLoadInterior(false, door.x + 40, door.z, rose)).toBe(false)
    expect(shouldLoadInterior(true, door.x + 20, door.z, rose)).toBe(true)
    expect(shouldLoadInterior(true, door.x + 40, door.z, rose)).toBe(false)
    const loaded = new Set(interiorsFor(door.x + 2, door.z, new Set()))
    expect(loaded.has('home-1')).toBe(true)
    expect(interiorsFor(0, 82, loaded).includes('home-1')).toBe(false)
  })

  it('asks you to press to enter, then steps through the door', () => {
    const rose = HOMES[0]
    const door = rose.doors[0]
    const outside = nearbyTarget(door.x + 1.2, door.z, new Set(['home-1']))
    expect(outside?.kind).toBe('door')
    expect(promptFor(outside!.kind, 'F', outside!.label, false)).toBe('[F] Open door: Home 1 ●')
    let motion = advanceDoor({ phase: 'prompt', elapsed: 0 }, 1.2, true, 0)
    expect(motion.phase).toBe('opening')
    expect(motion.step).toBe(false)
    motion = advanceDoor(motion, 1.2, false, 0.35)
    expect(motion.phase).toBe('open')
    expect(motion.step).toBe(true)
    const far = advanceDoor({ phase: 'prompt', elapsed: 0 }, 2.8, false, 0)
    expect(far.phase).toBe('prompt')
    expect(advanceDoor({ phase: 'idle', elapsed: 0 }, 2.8, false, 0).phase).toBe('idle')
    const inside = stepThrough(door.x + 1.2, door.z, rose, door)
    expect(inside.x).toBeLessThan(rose.maxX - 0.5)
    const back = stepThrough(inside.x, inside.z, rose, door)
    expect(back.x).toBeGreaterThan(rose.maxX)
    let held = doorStep({ phase: 'open', elapsed: 0 }, 1.2, false, 0.5)
    expect(held.phase).toBe('open')
    held = doorStep({ phase: 'open', elapsed: 0 }, 4, false, 2)
    expect(held.phase).toBe('closing')
    expect(doorStep({ phase: 'closing', elapsed: 0.1 }, 1, false, 0.1).phase).toBe('opening')
  })

  it('offers the mansion bookshelf only while the interior is loaded', () => {
    expect(nearbyTarget(MANSION.shelf!.x, MANSION.shelf!.z, new Set())).toBeNull()
    const hit = nearbyTarget(MANSION.shelf!.x, MANSION.shelf!.z + 1, new Set(['mansion']))
    expect(hit?.kind).toBe('bookshelf')
    expect(promptFor('bookshelf', 'F', 'the mansion', false)).toMatch(/family directory/)
    const doors = BUILDINGS.flatMap((building) => building.doors.map((door) => door.id)).sort()
    const listed = TRAVEL.map((stop) => stop.id).filter((id) => doors.includes(id)).sort()
    expect(listed).toEqual(doors)
    expect(TRAVEL.some((stop) => stop.id === 'bookshelf')).toBe(true)
    expect(TRAVEL.some((stop) => stop.id === 'mansion-hall')).toBe(true)
  })
})
