import { describe, expect, it } from 'vitest'
import { LOOK_YAW, readPad, stickLook, stickMove } from './gamepad'

function pad(axes: number[], pressed: number[] = []): { buttons: { pressed: boolean }[]; axes: number[] } {
  const buttons = Array.from({ length: 16 }, (_, index) => ({ pressed: pressed.includes(index) }))
  return { buttons, axes }
}

describe('gamepad sticks', () => {
  it('ignores a stick inside the deadzone and runs at 0.85', () => {
    expect(stickMove(0.1, 0)).toEqual({ x: 0, y: 0, run: false })
    const walk = stickMove(0.5, 0)
    expect(walk.run).toBe(false)
    expect(walk.x).toBeGreaterThan(0)
    expect(walk.x).toBeLessThan(1)
    const run = stickMove(0.9, 0)
    expect(run.run).toBe(true)
    expect(run.x).toBeCloseTo(1)
  })

  it('squares look deflection and caps the yaw rate', () => {
    expect(stickLook(0.1, 0)).toEqual({ yaw: 0, pitch: 0 })
    const full = stickLook(1, 0)
    expect(full.yaw).toBeCloseTo(-LOOK_YAW)
    expect(Math.abs(full.yaw)).toBeLessThanOrEqual(LOOK_YAW)
    const half = stickLook(0.5, 0)
    expect(Math.abs(half.yaw)).toBeLessThan(Math.abs(full.yaw))
  })

  it('maps the face buttons and shoulders', () => {
    const reading = readPad(pad([0, 0, 0, 0], [0, 1, 2, 3, 8, 9, 11]))
    expect(reading.jump).toBe(true)
    expect(reading.dive).toBe(true)
    expect(reading.interact).toBe(true)
    expect(reading.travel).toBe(true)
    expect(reading.reset).toBe(true)
    expect(reading.pause).toBe(true)
    expect(reading.recenter).toBe(true)
  })
})
