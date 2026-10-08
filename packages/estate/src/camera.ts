import { TUNING } from './tuning'

export type CameraPose = {
  followX: number
  followY: number
  followZ: number
  holdY: number
  distance: number
  clearance: number
}

export type CameraSample = {
  poseX: number
  poseY: number
  poseZ: number
  anim: string
  indoors: boolean
  yaw: number
  pitch: number
  dt: number
  reducedMotion: boolean
  hitDistance: number | null
}

export type CameraAim = {
  pose: CameraPose
  pitch: number
  eyeX: number
  eyeY: number
  eyeZ: number
  lookX: number
  lookY: number
  lookZ: number
}

function damp(rate: number, dt: number, reduced: boolean): number {
  if (reduced) return 1
  return 1 - Math.exp(-rate * Math.max(dt, 0))
}

function approach(current: number, target: number, maxDelta: number): number {
  const delta = target - current
  if (Math.abs(delta) <= maxDelta) return target
  return current + Math.sign(delta) * maxDelta
}

export function clampPitch(pitch: number, indoors: boolean): number {
  const max = indoors ? TUNING.pitchIndoorMax : TUNING.pitchMax
  return Math.min(max, Math.max(TUNING.pitchMin, pitch))
}

export function initialCamera(x: number, y: number, z: number): CameraPose {
  return {
    followX: x,
    followY: y,
    followZ: z,
    holdY: y,
    distance: TUNING.cameraOutdoor,
    clearance: TUNING.cameraOutdoor,
  }
}

export function recenterYaw(yaw: number, facing: number, dt: number): number {
  let delta = facing - yaw
  while (delta > Math.PI) delta -= Math.PI * 2
  while (delta < -Math.PI) delta += Math.PI * 2
  const max = TUNING.recenterRate * Math.max(dt, 0)
  if (Math.abs(delta) <= max) return facing
  return yaw + Math.sign(delta) * max
}

export function cameraStep(prev: CameraPose, sample: CameraSample): CameraAim {
  const dt = Math.min(Math.max(sample.dt, 0), 0.05)
  const pitch = clampPitch(sample.pitch, sample.indoors)
  const targetDist = sample.indoors ? TUNING.cameraIndoor : TUNING.cameraOutdoor
  const span = Math.abs(TUNING.cameraOutdoor - TUNING.cameraIndoor)
  const distance = approach(prev.distance, targetDist, sample.reducedMotion ? span : (span / TUNING.cameraBlendTime) * dt)
  const lag = damp(TUNING.cameraLag, dt, sample.reducedMotion)
  const followX = prev.followX + (sample.poseX - prev.followX) * lag
  const followZ = prev.followZ + (sample.poseZ - prev.followZ) * lag
  const airborne = sample.anim === 'jump' || sample.anim === 'fall' || sample.anim === 'dive'
  let holdY = prev.holdY
  let followY = prev.followY
  if (airborne) {
    const rise = sample.poseY - holdY
    followY = rise > TUNING.holdRise || sample.poseY < holdY ? sample.poseY : holdY
  } else {
    holdY = sample.poseY
    const land = damp(TUNING.cameraLand, dt, sample.reducedMotion)
    followY = prev.followY + (sample.poseY - prev.followY) * land
  }
  const lookY = followY + 0.42
  const flat = Math.cos(pitch)
  const wantX = followX + Math.sin(sample.yaw) * distance * flat
  const wantY = lookY + Math.sin(pitch) * distance
  const wantZ = followZ + Math.cos(sample.yaw) * distance * flat
  const originY = followY + 0.5
  const dx = wantX - followX
  const dy = wantY - originY
  const dz = wantZ - followZ
  const len = Math.hypot(dx, dy, dz)
  let desired = len
  if (sample.hitDistance != null && sample.hitDistance > 0 && sample.hitDistance < len) {
    desired = Math.max(TUNING.minPull, sample.hitDistance - TUNING.pullMargin)
  }
  const clearance = desired < prev.clearance ? desired : prev.clearance + (desired - prev.clearance) * damp(TUNING.cameraEase, dt, sample.reducedMotion)
  const placed = len > 0.001 ? clearance / len : 0
  return {
    pose: { followX, followY, followZ, holdY, distance, clearance },
    pitch,
    eyeX: followX + dx * placed,
    eyeY: originY + dy * placed,
    eyeZ: followZ + dz * placed,
    lookX: followX,
    lookY,
    lookZ: followZ,
  }
}
