import type { Anim } from './movement'
import { MARK } from './zones'

export type Pose = {
  anim: Anim
  squash: number
  lean: number
}

export type RosterEntry = {
  id: string
  name: string
  zone: string
  guest: boolean
  self: boolean
  color: string
  x: number
  y: number
  z: number
  facing: number
}

export const CAPSULE_R = 0.36
export const CAPSULE_HALF = 0.46
export const CAPSULE_CENTER = CAPSULE_R + CAPSULE_HALF

export const sim = {
  x: MARK.spawn.x,
  y: CAPSULE_CENTER,
  z: MARK.spawn.z,
  facing: Math.PI,
  camYaw: 0,
  camPitch: 0.46,
  anim: 'idle' as Anim,
  squash: 1,
  lean: 0,
  zone: 'Front Gate',
  name: 'Guest',
  id: '',
  color: '#e15a3a',
  guest: false,
  status: 'offline' as 'offline' | 'connecting' | 'online',
  roster: [] as RosterEntry[],
  excludeBody: null as object | null,
}

export const look = {
  dx: 0,
  dy: 0,
  keys: {} as Record<string, boolean>,
}
