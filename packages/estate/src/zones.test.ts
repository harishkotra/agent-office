import { describe, expect, it } from 'vitest'
import { MARK, zoneAt } from './zones'

describe('zoneAt', () => {
  it('names the hall, the gate, and the open lawn', () => {
    expect(zoneAt(0, (MARK.manor.z0 + MARK.manor.z1) / 2)).toBe('Great Hall')
    expect(zoneAt(MARK.spawn.x, MARK.spawn.z)).toBe('Front Gate')
    expect(zoneAt(0, 0)).toBe('The Grounds')
  })

  it('prefers a room over the surrounding porch', () => {
    expect(zoneAt(0, MARK.manor.z1 - 1)).toBe('Great Hall')
    expect(zoneAt(0, MARK.manor.z1 + 2)).toBe('Manor Porch')
  })

  it('covers the wings and the far gardens', () => {
    expect(zoneAt(-20, -28)).toBe('West Wing')
    expect(zoneAt(20, -28)).toBe('East Wing')
    expect(zoneAt(MARK.fountain.x, MARK.fountain.z)).toBe('Fountain Court')
    expect(zoneAt(MARK.pool.x, MARK.pool.z)).toBe('Pool Terrace')
    expect(zoneAt(MARK.chapel.x, MARK.chapel.z)).toBe('Chapel Garden')
    expect(zoneAt(-110, 0)).toBe('West Woods')
  })
})
