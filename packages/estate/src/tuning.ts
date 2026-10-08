export const TUNING = {
  timestep: 1 / 60,
  walkSpeed: 3.45,
  runSpeed: 7.85,
  groundAccel: 50,
  stopAccel: 72,
  airAccel: 14,
  airBrake: 14,
  gravity: 26,
  fallGravity: 38,
  jumpV: [8.6, 10.4, 12.6] as const,
  coyote: 0.12,
  jumpBuffer: 0.12,
  chainWindow: 0.32,
  terminal: -30,
  diveSpeed: 12.2,
  diveTime: 0.48,
  turnaround: 0.28,
  shortHop: 0.5,
  resetHold: 0.5,
  cameraEase: 5,
  cameraLag: 7.1,
  cameraLand: 10,
  cameraBlendTime: 0.4,
  cameraIndoor: 4,
  cameraOutdoor: 6.5,
  pitchMin: 0.18,
  pitchMax: 1.15,
  pitchIndoorMax: 0.9,
  holdRise: 1.5,
  jumpLook: 0.35,
  lookPerPixel: 0.0022,
  lookYawRate: 1.8,
  recenterDelay: 1.5,
  recenterRate: 1.2,
  recenterMove: 1,
  minPull: 0.7,
  pullMargin: 0.15,
  facingEase: 10,
  indoorCeiling: 3.4,
  frameMatch: 0.01,
}

export function resetReady(heldFor: number): boolean {
  return heldFor >= TUNING.resetHold
}

export function cameraBlend(dt: number): number {
  return 1 - Math.exp(-TUNING.cameraEase * Math.max(dt, 0))
}
