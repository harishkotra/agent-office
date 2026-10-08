import { describe, expect, it } from 'vitest'
import {
  AIR_BRAKE,
  CHAIN_WINDOW,
  COYOTE,
  DIVE_SPEED,
  JUMP_V,
  PHYSICS_DT,
  RUN_SPEED,
  STOP_ACCEL,
  initialMove,
  pressesConsumed,
  smoothYaw,
  stepMove,
  travelDistance,
  wishFromKeys,
  type MoveInput,
  type MoveState,
} from './movement'
import { jumpHeldNow, settings } from './settings'
import { TUNING } from './tuning'

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
      indoors: false,
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
    expect(Math.abs(a - b) / a).toBeLessThan(0.01)
    expect(Math.abs(a - c) / a).toBeLessThan(0.01)
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

  it('reverses a run with stop decel within 0.28 s', () => {
    let s = initialMove()
    for (let i = 0; i < 80; i++) s = frame(s, { wishZ: -1 }, true)
    const started = s.vz
    expect(started).toBeLessThan(0)
    let steps = 0
    while (s.vz < 0 && steps < 60) {
      s = frame(s, { wishZ: 1 }, true)
      steps += 1
    }
    expect(steps * PHYSICS_DT).toBeLessThanOrEqual(TUNING.turnaround)
    const one = frame(initialMove(), { wishZ: 1 }, true)
    one.vz = started
    const slowed = frame({ ...one }, { wishZ: 1 }, true)
    expect(Math.abs(started) - Math.abs(slowed.vz)).toBeGreaterThan(STOP_ACCEL * PHYSICS_DT * 0.5)
  })

  it('brakes in the air when there is no input', () => {
    let s = initialMove()
    s.vx = 10
    s.vz = 0
    s = frame(s, { wishX: 0, wishZ: 0 }, false)
    expect(s.vx).toBeCloseTo(10 - AIR_BRAKE * PHYSICS_DT, 5)
    for (let i = 0; i < 59; i++) s = frame(s, { wishX: 0, wishZ: 0 }, false)
    expect(10 - s.vx).toBeGreaterThanOrEqual(7)
  })

  it('allows a coyote jump at 0.11 s and refuses one at 0.13 s', () => {
    const leave = (delay: number) => {
      let s = frame(initialMove(), {}, true)
      let t = 0
      while (t + 1e-9 < delay) {
        const dt = Math.min(PHYSICS_DT, delay - t)
        const last = t + dt >= delay - 1e-9
        s = frame(s, { wishX: 0, wishZ: 0, jumpPressed: last, jumpHeld: last }, false, dt)
        t += dt
      }
      return s
    }
    expect(leave(0.11).vy).toBeGreaterThan(1)
    expect(leave(0.13).vy).toBeLessThan(1)
    expect(COYOTE).toBe(0.12)
  })

  it('slides no more than 0.45 m after releasing a run', () => {
    let s = initialMove()
    for (let i = 0; i < 80; i++) s = frame(s, { wishZ: -1 }, true)
    let slid = 0
    for (let i = 0; i < 60 && Math.hypot(s.vx, s.vz) > 0.01; i++) {
      s = frame(s, { wishX: 0, wishZ: 0 }, true)
      slid += Math.hypot(s.vx, s.vz) * PHYSICS_DT
    }
    expect(slid).toBeLessThanOrEqual(0.45)
  })

  it('faces a half turn within 0.30 s', () => {
    let yaw = 0
    const frames = Math.round(0.3 / PHYSICS_DT)
    for (let i = 0; i < frames; i++) yaw = smoothYaw(yaw, Math.PI, PHYSICS_DT)
    const gap = Math.abs(Math.PI - yaw)
    expect(gap).toBeLessThan((10 * Math.PI) / 180)
  })

  it('allows one dive until the next jump', () => {
    let s = initialMove()
    s.vx = 0
    s.vz = -4
    s = frame(s, { divePressed: true, wishZ: -1 }, false)
    expect(s.anim).toBe('dive')
    for (let i = 0; i < 40; i++) s = frame(s, { wishZ: -1 }, false)
    const after = Math.hypot(s.vx, s.vz)
    s = frame(s, { divePressed: true, wishZ: -1 }, false)
    expect(Math.hypot(s.vx, s.vz)).toBeLessThan(after + 0.2)
    s = frame(s, { jumpPressed: true, jumpHeld: true }, true)
    s = frame(s, { divePressed: true, wishZ: -1, jumpHeld: true }, false)
    expect(s.anim).toBe('dive')
  })

  it('keeps indoor jumps on the first level under the ceiling', () => {
    let s = initialMove()
    s = frame(s, { jumpPressed: true, jumpHeld: true, indoors: true }, true)
    expect(s.vy).toBeCloseTo(JUMP_V[0])
    for (let i = 0; i < 8; i++) s = frame(s, { jumpHeld: true, indoors: true }, false)
    s = frame(s, { jumpHeld: true, indoors: true }, true)
    s = frame(s, { jumpPressed: true, jumpHeld: true, indoors: true }, true)
    expect(s.vy).toBeCloseTo(JUMP_V[0])
  })

  it('releases into a short hop at or under 0.50 m', () => {
    const peak = (hold: boolean) => {
      let s = initialMove()
      let y = 0
      let top = 0
      s = frame(s, { jumpPressed: true, jumpHeld: true }, true)
      y += s.vy * PHYSICS_DT
      top = Math.max(top, y)
      for (let i = 0; i < 80 && y >= -0.01; i++) {
        s = frame(s, { jumpHeld: hold }, y <= 0.001 ? false : false)
        y += s.vy * PHYSICS_DT
        top = Math.max(top, y)
        if (s.vy < 0 && y < top - 0.2) break
      }
      return top
    }
    expect(peak(false)).toBeLessThanOrEqual(TUNING.shortHop)
    expect(peak(true)).toBeGreaterThan(TUNING.shortHop)
  })

  it('treats J as jump when that binding is held', () => {
    const previous = settings.bindings.jump
    settings.bindings.jump = ['KeyJ']
    expect(jumpHeldNow({ KeyJ: true, Space: false }, false, false)).toBe(true)
    expect(jumpHeldNow({ Space: true }, false, false)).toBe(false)
    expect(jumpHeldNow({}, true, false)).toBe(true)
    expect(jumpHeldNow({}, false, true)).toBe(true)
    settings.bindings.jump = previous
  })

  it('steers less in the air than on the ground', () => {
    const ground = frame(initialMove(), { wishX: 1, wishZ: 0 }, true)
    const air = frame(initialMove(), { wishX: 1, wishZ: 0 }, false)
    expect(Math.abs(ground.vx)).toBeGreaterThan(Math.abs(air.vx))
  })
})
