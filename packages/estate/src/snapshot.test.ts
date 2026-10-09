import { describe, expect, it } from 'vitest'
import { cssColor, readSnapshot, readWelcome } from './snapshot'

const self = 'a'.repeat(32)
const other = 'b'.repeat(32)

describe('cssColor', () => {
  it('accepts only lowercase hex before it can be used in CSS', () => {
    expect(cssColor('#0072b2')).toBe('#0072b2')
    expect(cssColor('#0072B2')).toBe('#0072b2')
    expect(cssColor('red')).toBe('#0072b2')
    expect(cssColor('#0072b2;background:url(javascript:alert(1))')).toBe('#0072b2')
  })
})

describe('readSnapshot', () => {
  it('keeps display name, avatar color, and position, and drops anything else', () => {
    const players = readSnapshot(
      {
        t: 'snapshot',
        players: [
          {
            id: other,
            name: 'Ada Example',
            color: '#e69f00',
            x: 1,
            y: 2,
            z: 3,
            yaw: 0.2,
            anim: 'walk',
            zone: 'Rose House',
          },
          { id: self, name: 'You', color: '#0072b2', x: 0, y: 0, z: 0, yaw: 0, anim: 'idle', zone: 'Front Gate' },
        ],
      },
      self,
    )
    expect(players).toEqual([
      {
        id: other,
        name: 'Ada Example',
        color: '#e69f00',
        x: 1,
        y: 2,
        z: 3,
        yaw: 0.2,
        anim: 'walk',
        zone: 'Rose House',
      },
    ])
  })

  it('refuses a player row that carries contact fields or a raw account id', () => {
    const players = readSnapshot(
      {
        t: 'snapshot',
        players: [
          { id: other, name: 'Ada', color: '#112233', x: 0, y: 0, z: 0, yaw: 0, anim: 'idle', zone: 'Gate', email: 'ada@example.com' },
          { id: '11111111-1111-4111-8111-111111111111', name: 'Ada', color: '#112233', x: 0, y: 0, z: 0, yaw: 0, anim: 'idle', zone: 'Gate' },
          { id: other, name: 'Guest', color: 'not-a-color', x: 0, y: 0, z: 0, yaw: 0, anim: 'idle', zone: 'Gate' },
        ],
      },
      self,
    )
    expect(players).toEqual([])
  })
})

describe('readWelcome', () => {
  it('accepts a session id and a safe color', () => {
    expect(readWelcome({ t: 'welcome', id: other, name: 'Ada Example', color: '#009e73' })).toEqual({
      id: other,
      name: 'Ada Example',
      color: '#009e73',
    })
    expect(readWelcome({ t: 'welcome', id: '11111111-1111-4111-8111-111111111111', name: 'Ada', color: '#009e73' })).toBeNull()
  })
})
