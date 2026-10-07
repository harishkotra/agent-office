import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CapsuleCollider, RigidBody, useRapier, type RapierRigidBody } from '@react-three/rapier'
import type { Group } from 'three'
import { CharacterModel } from './CharacterModel'
import { initialMove, stepMove, wishFromKeys, type MoveState } from '../movement'
import { CAPSULE_CENTER, CAPSULE_HALF, CAPSULE_R, look, sim, type Pose } from '../sim'
import { MARK, zoneAt } from '../zones'

export function LocalPlayer({ name }: { name: string }) {
  const body = useRef<RapierRigidBody>(null)
  const facing = useRef<Group>(null)
  const pose = useRef<Pose>({ anim: 'idle', squash: 1, lean: 0 })
  const move = useRef<MoveState>(initialMove())
  const prev = useRef({ jump: false, dive: false, reset: false })
  const { world } = useRapier()
  const controller = useRef<ReturnType<typeof world.createCharacterController> | null>(null)

  useEffect(() => {
    const ctrl = world.createCharacterController(0.03)
    ctrl.enableAutostep(0.45, 0.08, true)
    ctrl.enableSnapToGround(0.22)
    ctrl.setSlideEnabled(true)
    ctrl.setMaxSlopeClimbAngle((52 * Math.PI) / 180)
    ctrl.setMinSlopeSlideAngle((58 * Math.PI) / 180)
    controller.current = ctrl
    return () => {
      world.removeCharacterController(ctrl)
      controller.current = null
    }
  }, [world])

  useFrame((_, dt) => {
    const rb = body.current
    const ctrl = controller.current
    if (!rb || !ctrl) return
    const collider = rb.collider(0)
    if (!collider) return
    sim.excludeBody = rb

    const frame = Math.min(dt, 0.05)
    let lookX = look.dx
    let lookY = look.dy
    look.dx = 0
    look.dy = 0
    sim.camYaw -= lookX * 0.0022
    if (look.keys.KeyQ) sim.camYaw += 1.8 * frame
    if (look.keys.KeyE) sim.camYaw -= 1.8 * frame
    sim.camPitch = Math.min(1.15, Math.max(0.18, sim.camPitch + lookY * 0.0022))

    const forward = (look.keys.KeyW || look.keys.ArrowUp ? 1 : 0) - (look.keys.KeyS || look.keys.ArrowDown ? 1 : 0)
    const strafe = (look.keys.KeyD || look.keys.ArrowRight ? 1 : 0) - (look.keys.KeyA || look.keys.ArrowLeft ? 1 : 0)
    const wish = wishFromKeys(sim.camYaw, forward, strafe)
    const jump = !!(look.keys.Space)
    const dive = !!(look.keys.ControlLeft || look.keys.ControlRight || look.keys.KeyC)
    const reset = !!look.keys.KeyR
    const jumpPressed = jump && !prev.current.jump
    const divePressed = dive && !prev.current.dive
    prev.current.jump = jump
    prev.current.dive = dive

    const here = rb.translation()
    if ((reset && !prev.current.reset) || here.y < -2) {
      prev.current.reset = reset
      move.current = initialMove()
      const next = { x: MARK.spawn.x, y: CAPSULE_CENTER, z: MARK.spawn.z }
      rb.setTranslation(next, true)
      rb.setNextKinematicTranslation(next)
      sim.x = next.x
      sim.y = next.y
      sim.z = next.z
      sim.facing = Math.PI
      sim.camYaw = 0
      sim.zone = 'Front Gate'
      pose.current = { anim: 'idle', squash: 1, lean: 0 }
      return
    }
    prev.current.reset = reset

    const grounded = ctrl.computedGrounded()
    const nextMove = stepMove(
      move.current,
      {
        wishX: wish.x,
        wishZ: wish.z,
        run: !!(look.keys.ShiftLeft || look.keys.ShiftRight),
        jumpPressed,
        jumpHeld: jump,
        divePressed,
        dt: frame,
      },
      grounded,
    )
    move.current = nextMove
    let stepY = nextMove.vy * frame
    if (nextMove.vy > 0) {
      stepY = Math.max(stepY, 0.1)
      ctrl.disableSnapToGround()
    } else {
      stepY = Math.min(stepY, -0.05)
      ctrl.enableSnapToGround(0.22)
    }
    const step = { x: nextMove.vx * frame, y: stepY, z: nextMove.vz * frame }
    ctrl.computeColliderMovement(collider, step)
    const moved = ctrl.computedMovement()
    const pos = rb.translation()
    const target = { x: pos.x + moved.x, y: pos.y + moved.y, z: pos.z + moved.z }
    rb.setNextKinematicTranslation(target)

    sim.x = target.x
    sim.y = target.y
    sim.z = target.z
    const speed = Math.hypot(nextMove.vx, nextMove.vz)
    if (speed > 0.35) sim.facing = Math.atan2(nextMove.vx, nextMove.vz)
    else if (forward !== 0 || strafe !== 0) sim.facing = Math.atan2(wish.x, wish.z)
    sim.anim = nextMove.anim
    sim.squash = nextMove.squash
    sim.lean = strafe * 0.28
    sim.zone = zoneAt(target.x, target.z)
    pose.current.anim = nextMove.anim
    pose.current.squash = nextMove.squash
    pose.current.lean = sim.lean
    if (facing.current) facing.current.rotation.y = sim.facing
  }, 2)

  return (
    <RigidBody
      ref={body}
      type="kinematicPosition"
      colliders={false}
      position={[MARK.spawn.x, CAPSULE_CENTER + 0.08, MARK.spawn.z]}
      enabledRotations={[false, false, false]}
    >
      <CapsuleCollider args={[CAPSULE_HALF, CAPSULE_R]} />
      <group ref={facing}>
        <CharacterModel getColor={() => sim.color} pose={pose} name={name} />
      </group>
    </RigidBody>
  )
}
