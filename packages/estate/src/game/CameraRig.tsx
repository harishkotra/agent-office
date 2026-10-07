import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useRapier } from '@react-three/rapier'
import type { RigidBody } from '@dimforge/rapier3d-compat'
import { Vector3 } from 'three'
import { sim } from '../sim'

export function CameraRig() {
  const { camera } = useThree()
  const { world, rapier } = useRapier()
  const pos = useRef(new Vector3(sim.x, sim.y + 4, sim.z + 8))

  useFrame((_, dt) => {
    const distance = 6.5
    const lookY = sim.y + 0.42
    const flat = Math.cos(sim.camPitch)
    const wantX = sim.x + Math.sin(sim.camYaw) * distance * flat
    const wantY = lookY + Math.sin(sim.camPitch) * distance
    const wantZ = sim.z + Math.cos(sim.camYaw) * distance * flat
    let aimX = wantX
    let aimY = wantY
    let aimZ = wantZ
    const origin = { x: sim.x, y: sim.y + 0.5, z: sim.z }
    const dx = wantX - origin.x
    const dy = wantY - origin.y
    const dz = wantZ - origin.z
    const len = Math.hypot(dx, dy, dz)
    if (len > 0.3) {
      const ray = new rapier.Ray(origin, { x: dx / len, y: dy / len, z: dz / len })
      const hit = world.castRay(
        ray,
        len,
        true,
        undefined,
        undefined,
        undefined,
        (sim.excludeBody as RigidBody | null) ?? undefined,
      )
      if (hit && hit.timeOfImpact > 0 && hit.timeOfImpact < len) {
        const pull = Math.max(0.7, hit.timeOfImpact - 0.4)
        aimX = origin.x + (dx / len) * pull
        aimY = origin.y + (dy / len) * pull
        aimZ = origin.z + (dz / len) * pull
      }
    }
    const blend = 1 - Math.pow(0.0006, Math.min(dt, 0.05))
    pos.current.x += (aimX - pos.current.x) * blend
    pos.current.y += (aimY - pos.current.y) * blend
    pos.current.z += (aimZ - pos.current.z) * blend
    camera.position.copy(pos.current)
    camera.lookAt(sim.x, lookY, sim.z)
  }, 1)

  return null
}
