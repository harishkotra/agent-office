import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useRapier } from '@react-three/rapier'
import type { RigidBody } from '@dimforge/rapier3d-compat'
import { Vector3 } from 'three'
import { sim } from '../sim'
import { settings } from '../settings'

export function CameraRig() {
  const { camera } = useThree()
  const { world, rapier } = useRapier()
  const follow = useRef(new Vector3(sim.x, sim.y, sim.z))
  const ball = useRef<InstanceType<typeof rapier.Ball> | null>(null)
  if (!ball.current) ball.current = new rapier.Ball(0.32)

  useFrame((_, dt) => {
    const blend = settings.reducedMotion ? 1 : 1 - Math.pow(0.0008, Math.min(dt, 0.05))
    follow.current.x += (sim.x - follow.current.x) * blend
    follow.current.y += (sim.y - follow.current.y) * blend
    follow.current.z += (sim.z - follow.current.z) * blend
    const distance = 6.5
    const lookY = follow.current.y + 0.42
    const flat = Math.cos(sim.camPitch)
    const wantX = follow.current.x + Math.sin(sim.camYaw) * distance * flat
    const wantY = lookY + Math.sin(sim.camPitch) * distance
    const wantZ = follow.current.z + Math.cos(sim.camYaw) * distance * flat
    let aimX = wantX
    let aimY = wantY
    let aimZ = wantZ
    const origin = { x: follow.current.x, y: follow.current.y + 0.5, z: follow.current.z }
    const dx = wantX - origin.x
    const dy = wantY - origin.y
    const dz = wantZ - origin.z
    const len = Math.hypot(dx, dy, dz)
    if (len > 0.3 && ball.current) {
      const hit = world.castShape(
        origin,
        { w: 1, x: 0, y: 0, z: 0 },
        { x: dx / len, y: dy / len, z: dz / len },
        ball.current,
        0,
        len,
        true,
        undefined,
        undefined,
        undefined,
        (sim.excludeBody as RigidBody | null) ?? undefined,
      ) as { toi?: number; timeOfImpact?: number } | null
      const toi = hit?.toi ?? hit?.timeOfImpact
      if (toi && toi > 0 && toi < len) {
        const pull = Math.max(0.7, toi - 0.15)
        aimX = origin.x + (dx / len) * pull
        aimY = origin.y + (dy / len) * pull
        aimZ = origin.z + (dz / len) * pull
      }
    }
    camera.position.set(aimX, aimY, aimZ)
    camera.lookAt(follow.current.x, lookY, follow.current.z)
  })

  return null
}
