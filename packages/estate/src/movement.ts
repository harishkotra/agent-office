import { TUNING } from './tuning'

export type Anim = 'idle' | 'walk' | 'run' | 'jump' | 'fall' | 'dive'

export const WALK_SPEED = TUNING.walkSpeed
export const RUN_SPEED = TUNING.runSpeed
export const GROUND_ACCEL = TUNING.groundAccel
export const STOP_ACCEL = TUNING.stopAccel
export const AIR_ACCEL = TUNING.airAccel
export const AIR_BRAKE = TUNING.airBrake
export const FRICTION = STOP_ACCEL
export const GRAVITY = TUNING.gravity
export const FALL_GRAVITY = TUNING.fallGravity
export const JUMP_V = TUNING.jumpV
export const COYOTE = TUNING.coyote
export const JUMP_BUFFER = TUNING.jumpBuffer
export const CHAIN_WINDOW = TUNING.chainWindow
export const TERMINAL = TUNING.terminal
export const DIVE_SPEED = TUNING.diveSpeed
export const DIVE_TIME = TUNING.diveTime
export const PHYSICS_DT = TUNING.timestep

export type EdgeLatch = {
  jump: boolean
  dive: boolean
}

export function notePress(
  latch: EdgeLatch,
  jumpDown: boolean,
  diveDown: boolean,
  prev: EdgeLatch,
) {
  if (jumpDown && !prev.jump) latch.jump = true
  if (diveDown && !prev.dive) latch.dive = true
  prev.jump = jumpDown
  prev.dive = diveDown
}

export function takePresses(latch: EdgeLatch): { jumpPressed: boolean; divePressed: boolean } {
  const jumpPressed = latch.jump
  const divePressed = latch.dive
  latch.jump = false
  latch.dive = false
  return { jumpPressed, divePressed }
}

export function travelDistance(hz: number, seconds: number): number {
  const frame = 1 / hz
  let accumulator = 0
  let state = initialMove()
  let distance = 0
  const latch: EdgeLatch = { jump: false, dive: false }
  const prev: EdgeLatch = { jump: false, dive: false }
  const frames = Math.round(seconds * hz)
  for (let i = 0; i < frames; i++) {
    notePress(latch, false, false, prev)
    accumulator += frame
    let guard = 0
    while (accumulator + 1e-9 >= PHYSICS_DT && guard < 8) {
      guard += 1
      const presses = takePresses(latch)
      state = stepMove(
        state,
        {
          wishX: 0,
          wishZ: -1,
          run: true,
          jumpPressed: presses.jumpPressed,
          jumpHeld: false,
          divePressed: presses.divePressed,
          indoors: false,
          dt: PHYSICS_DT,
        },
        true,
      )
      distance += Math.hypot(state.vx, state.vz) * PHYSICS_DT
      accumulator -= PHYSICS_DT
    }
  }
  return distance
}

export function pressesConsumed(hz: number, pressFrame: number): number {
  const frame = 1 / hz
  let accumulator = 0
  const latch: EdgeLatch = { jump: false, dive: false }
  const prev: EdgeLatch = { jump: false, dive: false }
  let consumed = 0
  const frames = Math.round(hz)
  for (let i = 0; i < frames; i++) {
    notePress(latch, i === pressFrame, false, prev)
    accumulator += frame
    let guard = 0
    while (accumulator + 1e-9 >= PHYSICS_DT && guard < 8) {
      guard += 1
      if (takePresses(latch).jumpPressed) consumed += 1
      accumulator -= PHYSICS_DT
    }
  }
  return consumed
}

export type MoveInput = {
  wishX: number
  wishZ: number
  run: boolean
  jumpPressed: boolean
  jumpHeld: boolean
  divePressed: boolean
  indoors: boolean
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
  diveUsed: boolean
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
    diveUsed: false,
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

function steer(state: MoveState, tx: number, tz: number, maxDelta: number, stop: boolean) {
  if (stop && !state.grounded) return
  let dx = tx - state.vx
  let dz = tz - state.vz
  const delta = Math.hypot(dx, dz)
  if (delta <= maxDelta || delta < 1e-6) {
    state.vx = tx
    state.vz = tz
    return
  }
  state.vx += (dx / delta) * maxDelta
  state.vz += (dz / delta) * maxDelta
}

export function smoothYaw(current: number, target: number, dt: number): number {
  let delta = target - current
  while (delta > Math.PI) delta -= Math.PI * 2
  while (delta < -Math.PI) delta += Math.PI * 2
  const blend = 1 - Math.exp(-10 * Math.max(dt, 0))
  return current + delta * blend
}

export function clipVelocity(
  vx: number,
  vy: number,
  vz: number,
  desired: { x: number; y: number; z: number },
  moved: { x: number; y: number; z: number },
): { vx: number; vy: number; vz: number } {
  let nx = vx
  let ny = vy
  let nz = vz
  if (desired.y > 0.02 && moved.y < desired.y * 0.35) ny = Math.min(ny, 0)
  const wanted = Math.hypot(desired.x, desired.z)
  const got = Math.hypot(moved.x, moved.z)
  if (wanted > 0.002 && got < wanted * 0.45) {
    if (got < 0.001) {
      nx = 0
      nz = 0
    } else {
      const scale = got / wanted
      nx *= scale
      nz *= scale
    }
  }
  return { vx: nx, vy: ny, vz: nz }
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

  if (input.divePressed && s.diveLeft <= 0 && !s.diveUsed) {
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
      s.diveUsed = true
    }
  }

  let jumped = false
  const canJump = groundedNow || s.coyote > 0
  if (s.jumpBuffer > 0 && canJump) {
    let level = 1
    if (!input.indoors && groundedNow && s.chain > 0 && s.sinceLand <= CHAIN_WINDOW) {
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
    s.diveUsed = false
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
  if (!diving && !groundedNow && wishLen <= 0.01) {
    const speed = Math.hypot(s.vx, s.vz)
    const drop = AIR_BRAKE * dt
    if (speed <= drop) {
      s.vx = 0
      s.vz = 0
    } else {
      const keep = (speed - drop) / speed
      s.vx *= keep
      s.vz *= keep
    }
  } else if (!diving) {
    const opposing = wishLen > 0.01 && s.vx * wx + s.vz * wz < 0
    const rate = groundedNow && !jumped ? (wishLen <= 0.01 || opposing ? STOP_ACCEL : GROUND_ACCEL) : AIR_ACCEL
    steer(s, wx * (wishLen > 0.01 ? target : 0), wz * (wishLen > 0.01 ? target : 0), rate * dt, groundedNow && wishLen <= 0.01)
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
