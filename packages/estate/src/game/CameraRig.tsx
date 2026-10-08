import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useRapier } from '@react-three/rapier'
import type { RigidBody } from '@dimforge/rapier3d-compat'
import { sim } from '../sim'
import { settings } from '../settings'
import { TUNING } from '../tuning'
import { cameraStep, initialCamera, type CameraPose } from '../camera'

export function CameraRig() {
  const { camera } = useThree()
  const { world, rapier } = useRapier()
  const pose = useRef<CameraPose>(initialCamera(sim.x, sim.y, sim.z))
  const ball = useRef<InstanceType<typeof rapier.Ball> | null>(null)
  if (!ball.current) ball.current = new rapier.Ball(0.32)

  useFrame((_, dt) => {
    const span = Math.max((world.timestep || TUNING.timestep) * 1000, 1)
    const alpha = Math.min(1, Math.max(0, (performance.now() - sim.steppedAt) / span))
    const poseX = sim.prevX + (sim.x - sim.prevX) * alpha
    const poseY = sim.prevY + (sim.y - sim.prevY) * alpha
    const poseZ = sim.prevZ + (sim.z - sim.prevZ) * alpha
    const flat = Math.cos(sim.camPitch)
    const distance = pose.current.distance
    const dx = Math.sin(sim.camYaw) * distance * flat
    const dy = 0.42 - 0.5 + Math.sin(sim.camPitch) * distance
    const dz = Math.cos(sim.camYaw) * distance * flat
    const len = Math.hypot(dx, dy, dz)
    let hitDistance: number | null = null
    if (len > 0.3 && ball.current) {
      const origin = { x: pose.current.followX, y: pose.current.followY + 0.5, z: pose.current.followZ }
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
      if (toi && toi > 0) hitDistance = toi
    }
    const aim = cameraStep(pose.current, {
      poseX,
      poseY,
      poseZ,
      anim: sim.anim,
      indoors: sim.indoors,
      yaw: sim.camYaw,
      pitch: sim.camPitch,
      dt,
      reducedMotion: settings.reducedMotion,
      hitDistance,
    })
    pose.current = aim.pose
    sim.camPitch = aim.pitch
    sim.camDist = aim.pose.clearance
    camera.position.set(aim.eyeX, aim.eyeY, aim.eyeZ)
    camera.lookAt(aim.lookX, aim.lookY, aim.lookZ)
  })

  return null
}
