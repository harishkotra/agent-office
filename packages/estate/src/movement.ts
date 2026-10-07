export type Anim = 'idle' | 'walk' | 'run' | 'jump' | 'fall' | 'dive'

export const WALK_SPEED = 3.45
export const RUN_SPEED = 7.85
export const GROUND_ACCEL = 48
export const AIR_ACCEL = 14
export const FRICTION = 16
export const GRAVITY = 26
export const FALL_GRAVITY = 38
export const JUMP_V = [8.6, 10.4, 12.6] as const
export const COYOTE = 0.12
export const JUMP_BUFFER = 0.12
export const CHAIN_WINDOW = 0.32
export const TERMINAL = -30
export const DIVE_SPEED = 12.2
export const DIVE_TIME = 0.48

export type MoveInput = {
  wishX: number
  wishZ: number
  run: boolean
  jumpPressed: boolean
  jumpHeld: boolean
  divePressed: boolean
  dt: number
}

export type MoveState = {
  vx: number
  vy: number
  vz: number
  grounded: boolean
  coyote: number
  jumpBuffer: number
  chain: number
  sinceLand: number
  diveLeft: number
  jumpHeld: boolean
  anim: Anim
  squash: number
}

export function initialMove(): MoveState {
  return {
    vx: 0,
    vy: 0,
    vz: 0,
    grounded: false,
    coyote: 0,
    jumpBuffer: 0,
    chain: 0,
    sinceLand: 999,
    diveLeft: 0,
    jumpHeld: false,
    anim: 'idle',
    squash: 1,
  }
}

export function wishFromKeys(yaw: number, forward: number, strafe: number): { x: number; z: number } {
  const fx = -Math.sin(yaw)
  const fz = -Math.cos(yaw)
  const rx = Math.cos(yaw)
  const rz = -Math.sin(yaw)
  let x = fx * forward + rx * strafe
  let z = fz * forward + rz * strafe
  const len = Math.hypot(x, z)
  if (len > 1) {
    x /= len
    z /= len
  }
  return { x, z }
}

function approach(current: number, target: number, maxDelta: number): number {
  const delta = target - current
  if (Math.abs(delta) <= maxDelta) return target
  return current + Math.sign(delta) * maxDelta
}

export function stepMove(prev: MoveState, input: MoveInput, groundedNow: boolean): MoveState {
  const dt = Math.min(Math.max(input.dt, 0), 0.05)
  const s: MoveState = { ...prev, grounded: groundedNow }

  if (groundedNow) s.coyote = COYOTE
  else s.coyote = Math.max(0, s.coyote - dt)

  if (input.jumpPressed) s.jumpBuffer = JUMP_BUFFER
  else s.jumpBuffer = Math.max(0, s.jumpBuffer - dt)

  if (!groundedNow) s.sinceLand = 999
  else if (!prev.grounded) s.sinceLand = 0
  else s.sinceLand += dt

  const wishLen = Math.hypot(input.wishX, input.wishZ)
  const wx = wishLen > 0 ? input.wishX / wishLen : 0
  const wz = wishLen > 0 ? input.wishZ / wishLen : 0

  if (input.divePressed && s.diveLeft <= 0) {
    const hx = s.vx
    const hz = s.vz
    const h = Math.hypot(hx, hz)
    const dx = h > 0.25 ? hx / h : wx
    const dz = h > 0.25 ? hz / h : wz
    const len = Math.hypot(dx, dz)
    if (len > 0.05) {
      s.vx = (dx / len) * DIVE_SPEED
      s.vz = (dz / len) * DIVE_SPEED
      s.vy = Math.min(s.vy, 2)
      s.diveLeft = DIVE_TIME
    }
  }

  let jumped = false
  const canJump = groundedNow || s.coyote > 0
  if (s.jumpBuffer > 0 && canJump) {
    let level = 1
    if (groundedNow && s.chain > 0 && s.sinceLand <= CHAIN_WINDOW) {
      level = Math.min(3, s.chain + 1)
    }
    s.chain = level
    s.sinceLand = 999
    s.vy = JUMP_V[level - 1]
    if (level === 3 && wishLen > 0.01) {
      s.vx += wx * 3.4
      s.vz += wz * 3.4
    }
    s.jumpBuffer = 0
    s.coyote = 0
    s.diveLeft = 0
    s.grounded = false
    jumped = true
  }

  if (!jumped && prev.jumpHeld && !input.jumpHeld && s.vy > 0) {
    s.vy *= 0.5
  }
  s.jumpHeld = input.jumpHeld
  s.diveLeft = Math.max(0, s.diveLeft - dt)
  const diving = s.diveLeft > 0

  const rising = s.vy > 0
  const gravity = rising ? GRAVITY : FALL_GRAVITY
  if ((!groundedNow || rising) && !jumped) {
    s.vy = Math.max(TERMINAL, s.vy - gravity * dt)
  }
  if (groundedNow && s.vy < 0 && !jumped) s.vy = 0

  const target = input.run ? RUN_SPEED : WALK_SPEED
  if (!diving) {
    if (wishLen > 0.01) {
      const accel = (groundedNow && !jumped ? GROUND_ACCEL : AIR_ACCEL) * dt
      s.vx = approach(s.vx, wx * target, accel)
      s.vz = approach(s.vz, wz * target, accel)
    } else if (groundedNow) {
      const drop = FRICTION * dt
      const h = Math.hypot(s.vx, s.vz)
      if (h <= drop) {
        s.vx = 0
        s.vz = 0
      } else {
        const keep = (h - drop) / h
        s.vx *= keep
        s.vz *= keep
      }
    }
  } else if (groundedNow) {
    const drop = 22 * dt
    const h = Math.hypot(s.vx, s.vz)
    if (h <= drop) {
      s.vx = 0
      s.vz = 0
    } else {
      const keep = (h - drop) / h
      s.vx *= keep
      s.vz *= keep
    }
  }

  const speed = Math.hypot(s.vx, s.vz)
  if (diving) s.anim = 'dive'
  else if (!s.grounded && s.vy > 0.4) s.anim = 'jump'
  else if (!s.grounded) s.anim = 'fall'
  else if (input.run && speed > RUN_SPEED * 0.72) s.anim = 'run'
  else if (speed > 0.4) s.anim = 'walk'
  else s.anim = 'idle'

  let targetSquash = 1
  if (s.anim === 'jump') targetSquash = 1.14
  else if (s.anim === 'fall') targetSquash = 1.06
  else if (s.anim === 'dive') targetSquash = 0.64
  if (groundedNow && prev.vy < -7) s.squash = 0.6
  else s.squash = approach(s.squash, targetSquash, dt * 7)

  return s
}
