import { describe, expect, it } from 'vitest'
import { TUNING, cameraBlend, resetReady } from './tuning'

describe('tuning', () => {
  it('keeps a fixed physics step and a 1 percent frame match', () => {
    expect(TUNING.timestep).toBeCloseTo(1 / 60)
    expect(TUNING.frameMatch).toBe(0.01)
  })

  it('uses stop decel that can reverse a run within the turnaround budget', () => {
    expect(TUNING.stopAccel).toBeGreaterThan(TUNING.groundAccel)
    expect(TUNING.runSpeed / TUNING.stopAccel).toBeLessThanOrEqual(TUNING.turnaround)
  })

  it('brakes in the air at 14 m/s²', () => {
    expect(TUNING.airBrake).toBe(14)
  })

  it('caps a released jump and a reset hold', () => {
    expect(TUNING.shortHop).toBe(0.5)
    expect(resetReady(0.49)).toBe(false)
    expect(resetReady(0.5)).toBe(true)
  })

  it('eases the camera at 5 per second and moves in to 4 m indoors', () => {
    expect(TUNING.cameraEase).toBe(5)
    expect(TUNING.cameraLag).toBe(7.1)
    expect(TUNING.cameraLand).toBe(10)
    expect(TUNING.cameraBlendTime).toBe(0.4)
    expect(cameraBlend(0)).toBe(0)
    expect(cameraBlend(1)).toBeCloseTo(1 - Math.exp(-5))
    expect(TUNING.cameraIndoor).toBe(4)
    expect(TUNING.cameraOutdoor).toBeGreaterThan(TUNING.cameraIndoor)
    expect(TUNING.pitchMin).toBe(0.18)
    expect(TUNING.pitchMax).toBeGreaterThan(TUNING.pitchIndoorMax)
    expect(TUNING.holdRise).toBe(1.5)
    expect(TUNING.jumpLook).toBe(0.35)
    expect(TUNING.lookPerPixel).toBe(0.0022)
    expect(TUNING.lookYawRate).toBe(1.8)
    expect(TUNING.recenterDelay).toBe(1.5)
    expect(TUNING.recenterRate).toBe(1.2)
    expect(TUNING.recenterMove).toBe(1)
    expect(TUNING.facingEase).toBe(10)
    expect(TUNING.indoorCeiling).toBe(3.4)
  })
})