import { describe, expect, it } from 'vitest'
import {
  CHAIN_WINDOW,
  DIVE_SPEED,
  JUMP_V,
  RUN_SPEED,
  initialMove,
  pressesConsumed,
  stepMove,
  travelDistance,
  wishFromKeys,
  type MoveInput,
  type MoveState,
} from './movement'

function frame(state: MoveState, patch: Partial<MoveInput>, grounded: boolean, dt = 1 / 60): MoveState {
  return stepMove(
    state,
    {
      wishX: 0,
      wishZ: -1,
      run: true,
      jumpPressed: false,
      jumpHeld: false,
      divePressed: false,
      dt,
      ...patch,
    },
    grounded,
  )
}

describe('wishFromKeys', () => {
  it('moves north when the camera sits south of the player', () => {
    const wish = wishFromKeys(0, 1, 0)
    expect(wish.x).toBeCloseTo(0)
    expect(wish.z).toBeCloseTo(-1)
  })

  it('strafes east on D while facing north', () => {
    const wish = wishFromKeys(0, 0, 1)
    expect(wish.x).toBeCloseTo(1)
    expect(wish.z).toBeCloseTo(0)
  })
})

describe('fixed step', () => {
  it('covers the same distance at 60, 120, and 144 Hz', () => {
    const a = travelDistance(60, 2)
    const b = travelDistance(120, 2)
    const c = travelDistance(144, 2)
    expect(Math.abs(a - b)).toBeLessThan(0.05)
    expect(Math.abs(a - c)).toBeLessThan(0.05)
    expect(a).toBeGreaterThan(8)
  })

  it('holds a jump press until one physics step uses it', () => {
    expect(pressesConsumed(60, 3)).toBe(1)
    expect(pressesConsumed(120, 3)).toBe(1)
    expect(pressesConsumed(144, 1)).toBe(1)
  })
})

describe('stepMove', () => {
  it('builds up to a run instead of snapping to full speed', () => {
    let s = initialMove()
    s = frame(s, {}, true)
    const early = Math.hypot(s.vx, s.vz)
    for (let i = 0; i < 40; i++) s = frame(s, {}, true)
    const later = Math.hypot(s.vx, s.vz)
    expect(early).toBeGreaterThan(0.4)
    expect(early).toBeLessThan(RUN_SPEED * 0.8)
    expect(later).toBeGreaterThan(RUN_SPEED * 0.9)
  })

  it('coasts to a stop on the ground', () => {
    let s = initialMove()
    for (let i = 0; i < 40; i++) s = frame(s, {}, true)
    for (let i = 0; i < 90; i++) s = frame(s, { wishX: 0, wishZ: 0 }, true)
    expect(Math.hypot(s.vx, s.vz)).toBeLessThan(0.05)
  })

  it('chains three jumps when you leave the ground and jump again quickly', () => {
    let s = initialMove()
    s = frame(s, { jumpPressed: true, jumpHeld: true }, true)
    expect(s.vy).toBeCloseTo(JUMP_V[0])
    for (let i = 0; i < 8; i++) s = frame(s, { jumpHeld: true }, false)
    s = frame(s, { jumpHeld: true }, true)
    expect(s.sinceLand).toBe(0)
    s = frame(s, { jumpPressed: true, jumpHeld: true }, true)
    expect(s.vy).toBeCloseTo(JUMP_V[1])
    for (let i = 0; i < 8; i++) s = frame(s, { jumpHeld: true }, false)
    s = frame(s, { jumpHeld: true }, true)
    s = frame(s, { jumpPressed: true, jumpHeld: true }, true)
    expect(s.vy).toBeCloseTo(JUMP_V[2])
    expect(Math.hypot(s.vx, s.vz)).toBeGreaterThan(1)
  })

  it('starts the chain over if you wait on the ground', () => {
    let s = initialMove()
    s = frame(s, { jumpPressed: true, jumpHeld: true }, true)
    s = frame(s, { jumpHeld: true }, false)
    s = frame(s, {}, true)
    const waits = Math.ceil((CHAIN_WINDOW + 0.05) / (1 / 60))
    for (let i = 0; i < waits; i++) s = frame(s, {}, true)
    s = frame(s, { jumpPressed: true, jumpHeld: true }, true)
    expect(s.vy).toBeCloseTo(JUMP_V[0])
  })

  it('shortens the jump when space is released', () => {
    let held = initialMove()
    held = frame(held, { jumpPressed: true, jumpHeld: true }, true)
    held = frame(held, { jumpHeld: true }, false)
    let tapped = initialMove()
    tapped = frame(tapped, { jumpPressed: true, jumpHeld: true }, true)
    tapped = frame(tapped, { jumpHeld: false }, false)
    expect(tapped.vy).toBeLessThan(held.vy)
  })

  it('dives in the direction you are already moving', () => {
    let s = initialMove()
    for (let i = 0; i < 30; i++) s = frame(s, {}, true)
    s = frame(s, { divePressed: true }, false)
    expect(s.anim).toBe('dive')
    expect(Math.hypot(s.vx, s.vz)).toBeGreaterThan(DIVE_SPEED * 0.9)
    expect(s.vz).toBeLessThan(0)
  })

  it('steers less in the air than on the ground', () => {
    const ground = frame(initialMove(), { wishX: 1, wishZ: 0 }, true)
    const air = frame(initialMove(), { wishX: 1, wishZ: 0 }, false)
    expect(Math.abs(ground.vx)).toBeGreaterThan(Math.abs(air.vx))
  })
})
