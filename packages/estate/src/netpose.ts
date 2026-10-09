export type PoseSample = { x: number; y: number; z: number; yaw: number; t: number }

export type Track = { previous: PoseSample | null; latest: PoseSample | null }

export function pushSample(track: Track, sample: PoseSample): Track {
  return { previous: track.latest, latest: sample }
}

function lerpAngle(from: number, to: number, t: number) {
  let delta = to - from
  while (delta > Math.PI) delta -= Math.PI * 2
  while (delta < -Math.PI) delta += Math.PI * 2
  return from + delta * t
}

export function poseAt(track: Track, now: number, delay = 0.12, snap = false): PoseSample | null {
  const latest = track.latest
  if (!latest) return null
  if (snap || !track.previous) return latest
  const previous = track.previous
  const gap = latest.t - previous.t
  const dist = Math.hypot(latest.x - previous.x, latest.z - previous.z)
  if (gap <= 0.001 || gap > 0.45 || dist > 6) return latest
  const u = Math.min(1, Math.max(0, (now - delay - previous.t) / gap))
  return {
    x: previous.x + (latest.x - previous.x) * u,
    y: previous.y + (latest.y - previous.y) * u,
    z: previous.z + (latest.z - previous.z) * u,
    yaw: lerpAngle(previous.yaw, latest.yaw, u),
    t: now,
  }
}
