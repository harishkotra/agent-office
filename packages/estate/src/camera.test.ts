import { describe, expect, it } from 'vitest'
import { cameraStep, clampPitch, initialCamera, recenterYaw, type CameraSample } from './camera'
import { TUNING } from './tuning'

function sample(patch: Partial<CameraSample> = {}): CameraSample {
  return {
    poseX: 0,
    poseY: 1,
    poseZ: 0,
    anim: 'idle',
    indoors: false,
    yaw: 0,
    pitch: 0.46,
    dt: 1 / 60,
    reducedMotion: false,
    hitDistance: null,
    ...patch,
  }
}

describe('cameraStep', () => {
  it('blends to 4 m indoors over 0.4 s and back outdoors', () => {
    let pose = initialCamera(0, 1, 0)
    const steps = Math.round(TUNING.cameraBlendTime / (1 / 60))
    for (let i = 0; i < steps; i++) pose = cameraStep(pose, sample({ indoors: true })).pose
    expect(pose.distance).toBeCloseTo(TUNING.cameraIndoor, 1)
    for (let i = 0; i < steps; i++) pose = cameraStep(pose, sample({ indoors: false })).pose
    expect(pose.distance).toBeCloseTo(TUNING.cameraOutdoor, 1)
  })

  it('holds look height on a normal jump and follows a high rise', () => {
    const start = initialCamera(0, 1, 0)
    const hop = cameraStep(start, sample({ anim: 'jump', poseY: 2.2 }))
    expect(Math.abs(hop.pose.followY - start.followY)).toBeLessThanOrEqual(TUNING.jumpLook)
    const high = cameraStep(start, sample({ anim: 'jump', poseY: start.holdY + TUNING.holdRise + 0.2 }))
    expect(high.pose.followY).toBeGreaterThan(start.followY + TUNING.holdRise)
    const dropped = cameraStep(start, sample({ anim: 'fall', poseY: start.holdY - 0.4 }))
    expect(dropped.pose.followY).toBeCloseTo(start.holdY - 0.4)
  })

  it('lags behind a run and settles within 0.45 s of a stop', () => {
    let pose = initialCamera(0, 1, 0)
    let z = 0
    for (let i = 0; i < 60; i++) {
      z -= TUNING.runSpeed / 60
      pose = cameraStep(pose, sample({ poseZ: z, anim: 'run' })).pose
    }
    expect(Math.abs(pose.followZ - z)).toBeLessThanOrEqual(1.2)
    for (let i = 0; i < Math.round(0.45 * 60); i++) pose = cameraStep(pose, sample({ poseZ: z, anim: 'idle' })).pose
    expect(Math.abs(pose.followZ - z)).toBeLessThanOrEqual(0.05)
  })

  it('pulls in on the same frame and eases back out', () => {
    const start = initialCamera(0, 1, 0)
    const pulled = cameraStep(start, sample({ hitDistance: 1.2 }))
    expect(pulled.pose.clearance).toBeLessThan(2)
    const released = cameraStep(pulled.pose, sample({ hitDistance: null }))
    const jump = released.pose.clearance - pulled.pose.clearance
    expect(jump).toBeGreaterThan(0)
    expect(jump).toBeLessThan(1)
    expect(released.pose.clearance).toBeLessThan(start.clearance)
  })

  it('clamps pitch lower indoors', () => {
    expect(clampPitch(2, false)).toBe(TUNING.pitchMax)
    expect(clampPitch(2, true)).toBe(TUNING.pitchIndoorMax)
    expect(clampPitch(0, false)).toBe(TUNING.pitchMin)
  })

  it('turns the camera toward facing no faster than the recenter rate', () => {
    const step = recenterYaw(0, Math.PI, 1 / 60)
    expect(step).toBeCloseTo(TUNING.recenterRate / 60)
    expect(Math.abs(step)).toBeLessThanOrEqual(TUNING.recenterRate / 60 + 1e-9)
  })
})
