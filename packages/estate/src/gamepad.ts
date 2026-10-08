export const STICK_DEAD = 0.15
export const STICK_RUN = 0.85
export const LOOK_YAW = 3
export const LOOK_PITCH = 1.8

export type PadLike = {
  buttons: readonly { pressed: boolean }[]
  axes: readonly number[]
}

export type PadRead = {
  x: number
  y: number
  run: boolean
  lookYaw: number
  lookPitch: number
  jump: boolean
  dive: boolean
  interact: boolean
  travel: boolean
  pause: boolean
  reset: boolean
  recenter: boolean
}

function pressed(pad: PadLike, index: number): boolean {
  return !!pad.buttons[index]?.pressed
}

export function stickMove(x: number, y: number): { x: number; y: number; run: boolean } {
  const mag = Math.hypot(x, y)
  if (mag < STICK_DEAD) return { x: 0, y: 0, run: false }
  const run = mag >= STICK_RUN
  const scale = run ? 1 : (mag - STICK_DEAD) / (STICK_RUN - STICK_DEAD)
  return { x: (x / mag) * scale, y: (y / mag) * scale, run }
}

export function stickLook(x: number, y: number): { yaw: number; pitch: number } {
  const mag = Math.hypot(x, y)
  if (mag < STICK_DEAD) return { yaw: 0, pitch: 0 }
  const scaled = Math.min(1, (mag - STICK_DEAD) / (1 - STICK_DEAD))
  const shaped = scaled * scaled
  return { yaw: -(x / mag) * shaped * LOOK_YAW, pitch: (y / mag) * shaped * LOOK_PITCH }
}

export function readPad(pad: PadLike | null): PadRead {
  const empty: PadRead = {
    x: 0,
    y: 0,
    run: false,
    lookYaw: 0,
    lookPitch: 0,
    jump: false,
    dive: false,
    interact: false,
    travel: false,
    pause: false,
    reset: false,
    recenter: false,
  }
  if (!pad) return empty
  const move = stickMove(pad.axes[0] || 0, -(pad.axes[1] || 0))
  const look = stickLook(pad.axes[2] || 0, pad.axes[3] || 0)
  const runHeld = pressed(pad, 5) || pressed(pad, 7)
  return {
    x: move.x,
    y: move.y,
    run: move.run || runHeld,
    lookYaw: look.yaw,
    lookPitch: look.pitch,
    jump: pressed(pad, 0),
    dive: pressed(pad, 1),
    interact: pressed(pad, 2),
    travel: pressed(pad, 3),
    pause: pressed(pad, 9),
    reset: pressed(pad, 8),
    recenter: pressed(pad, 11),
  }
}

export function pollGamepad(): PadRead {
  if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return readPad(null)
  for (const pad of navigator.getGamepads()) {
    if (pad) return readPad(pad)
  }
  return readPad(null)
}
