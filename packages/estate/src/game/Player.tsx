import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CapsuleCollider, RigidBody, useBeforePhysicsStep, useRapier, type RapierRigidBody } from '@react-three/rapier'
import type { Group } from 'three'
import { CharacterModel } from './CharacterModel'
import { clipVelocity, initialMove, notePress, PHYSICS_DT, smoothYaw, stepMove, takePresses, wishFromKeys, type EdgeLatch, type MoveState } from '../movement'
import { CAPSULE_CENTER, CAPSULE_HALF, CAPSULE_R, look, sim, type Pose } from '../sim'
import { MARK, zoneAt } from '../zones'
import { bindingLabel, held, settings } from '../settings'
import { play, publishPlay, transit } from '../play'
import { insideBuilding, nearbyTarget, promptText, stepThrough, syncInteriors } from '../buildings'
import { announce, blip, directionWord, placeCue, stereoPan, walkerCue } from '../cues'
import { touch } from '../touch'

export function LocalPlayer({ name }: { name: string }) {
  const body = useRef<RapierRigidBody>(null)
  const facing = useRef<Group>(null)
  const pose = useRef<Pose>({ anim: 'idle', squash: 1, lean: 0 })
  const move = useRef<MoveState>(initialMove())
  const prev = useRef<EdgeLatch>({ jump: false, dive: false })
  const latch = useRef<EdgeLatch>({ jump: false, dive: false })
  const resetLatch = useRef(false)
  const resetPrev = useRef(false)
  const interactPrev = useRef(false)
  const interactLatch = useRef(false)
  const zoneSeen = useRef(sim.zone)
  const near = useRef(new Set<string>())
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
    const frame = Math.min(dt, 0.05)
    let lookX = look.dx
    let lookY = look.dy
    look.dx = 0
    look.dy = 0
    sim.camYaw -= lookX * 0.0022
    if (held(look.keys, 'lookLeft') || touch.lookLeft) sim.camYaw += 1.8 * frame
    if (held(look.keys, 'lookRight') || touch.lookRight) sim.camYaw -= 1.8 * frame
    sim.camPitch = Math.min(1.15, Math.max(0.18, sim.camPitch + lookY * 0.0022))

    const blocked = settings.paused || play.directory || play.travel
    const jump = !blocked && (held(look.keys, 'jump') || touch.jump)
    const dive = !blocked && (held(look.keys, 'dive') || touch.dive)
    notePress(latch.current, jump, dive, prev.current)
    const interact = !blocked && (held(look.keys, 'interact') || touch.interact)
    if (interact && !interactPrev.current) interactLatch.current = true
    interactPrev.current = interact
    const resetDown = !settings.paused && held(look.keys, 'reset')
    if (resetDown && !resetPrev.current) resetLatch.current = true
    resetPrev.current = resetDown
  })

  useBeforePhysicsStep(() => {
    const rb = body.current
    const ctrl = controller.current
    if (!rb || !ctrl) return
    const collider = rb.collider(0)
    if (!collider) return
    sim.excludeBody = rb

    const blocked = settings.paused || play.directory || play.travel
    const forward = blocked ? 0 : (held(look.keys, 'forward') || touch.y > 0.25 ? 1 : 0) - (held(look.keys, 'back') || touch.y < -0.25 ? 1 : 0)
    const strafe = blocked ? 0 : (held(look.keys, 'right') || touch.x > 0.25 ? 1 : 0) - (held(look.keys, 'left') || touch.x < -0.25 ? 1 : 0)
    const wish = wishFromKeys(sim.camYaw, forward, strafe)
    const presses = takePresses(latch.current)
    const reset = resetLatch.current
    resetLatch.current = false
    const interact = interactLatch.current
    interactLatch.current = false

    const here = rb.translation()
    if (transit.x != null && transit.z != null) {
      const next = { x: transit.x, y: here.y, z: transit.z }
      const zone = transit.zone
      transit.x = null
      transit.z = null
      transit.zone = ''
      move.current = initialMove()
      rb.setTranslation(next, true)
      rb.setNextKinematicTranslation(next)
      sim.x = next.x
      sim.y = next.y
      sim.z = next.z
      sim.zone = zone || zoneAt(next.x, next.z)
      announce(`Traveling to ${sim.zone}.`)
      return
    }
    if (reset || here.y < -2) {
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

    const grounded = ctrl.computedGrounded()
    const nextMove = stepMove(
      move.current,
      {
        wishX: wish.x,
        wishZ: wish.z,
        run: !blocked && held(look.keys, 'run'),
        jumpPressed: presses.jumpPressed,
        jumpHeld: !!look.keys.Space,
        divePressed: presses.divePressed,
        dt: PHYSICS_DT,
      },
      grounded,
    )
    move.current = nextMove
    let stepY = nextMove.vy * PHYSICS_DT
    if (nextMove.vy > 0) {
      stepY = Math.max(stepY, 0.1)
      ctrl.disableSnapToGround()
    } else {
      stepY = Math.min(stepY, -0.05)
      ctrl.enableSnapToGround(0.22)
    }
    const step = { x: nextMove.vx * PHYSICS_DT, y: stepY, z: nextMove.vz * PHYSICS_DT }
    ctrl.computeColliderMovement(collider, step)
    const moved = ctrl.computedMovement()
    const clipped = clipVelocity(nextMove.vx, nextMove.vy, nextMove.vz, step, moved)
    nextMove.vx = clipped.vx
    nextMove.vy = clipped.vy
    nextMove.vz = clipped.vz
    move.current = nextMove
    const pos = rb.translation()
    const target = { x: pos.x + moved.x, y: pos.y + moved.y, z: pos.z + moved.z }
    rb.setNextKinematicTranslation(target)

    sim.x = target.x
    sim.y = target.y
    sim.z = target.z
    const speed = Math.hypot(nextMove.vx, nextMove.vz)
    const face = speed > 0.35 ? Math.atan2(nextMove.vx, nextMove.vz) : forward !== 0 || strafe !== 0 ? Math.atan2(wish.x, wish.z) : sim.facing
    sim.facing = settings.reducedMotion ? face : smoothYaw(sim.facing, face, PHYSICS_DT)
    sim.anim = nextMove.anim
    sim.squash = nextMove.squash
    sim.lean = strafe * 0.28
    sim.zone = zoneAt(target.x, target.z)
    pose.current.anim = nextMove.anim
    pose.current.squash = nextMove.squash
    pose.current.lean = sim.lean
    if (facing.current) facing.current.rotation.y = sim.facing

    const targetHit = nearbyTarget(target.x, target.z, new Set(syncInteriors(target.x, target.z)))
    if (interact && targetHit) {
      if (targetHit.kind === 'bookshelf') {
        publishPlay({ directory: true, feedback: 'Opening the family directory', feedbackUntil: Date.now() + 1600 })
        document.exitPointerLock()
        announce('Family directory open.')
      } else if (targetHit.door) {
        const step = stepThrough(target.x, target.z, targetHit.building, targetHit.door)
        const leaving = insideBuilding(target.x, target.z, targetHit.building)
        rb.setTranslation({ x: step.x, y: target.y, z: step.z }, true)
        rb.setNextKinematicTranslation({ x: step.x, y: target.y, z: step.z })
        sim.x = step.x
        sim.z = step.z
        const feedback = leaving ? 'Stepping outside' : `Entering ${targetHit.label}`
        publishPlay({ feedback, feedbackUntil: Date.now() + 1600 })
        announce(feedback)
      }
    }
    const shown = targetHit ? { id: targetHit.id, kind: targetHit.kind, text: promptText(targetHit.kind, bindingLabel('interact'), targetHit.door ? insideBuilding(target.x, target.z, targetHit.building) : false) } : null
    if ((shown?.id || '') !== (play.prompt?.id || '') || shown?.text !== play.prompt?.text) {
      publishPlay({ prompt: shown })
      if (shown) {
        const dir = directionWord(sim.camYaw, target.x, target.z, shown.kind === 'bookshelf' ? targetHit!.x : targetHit!.x, targetHit!.z)
        announce(placeCue(shown.kind, dir, targetHit!.label))
        blip(stereoPan(sim.camYaw, target.x, target.z, targetHit!.x, targetHit!.z))
      }
    }
    if (sim.zone !== zoneSeen.current) {
      zoneSeen.current = sim.zone
      announce(sim.zone)
    }
    if (sim.status === 'online') {
      for (const person of sim.roster) {
        if (person.self) continue
        const dist = Math.hypot(person.x - target.x, person.z - target.z)
        if (dist < 7 && !near.current.has(person.id)) {
          near.current.add(person.id)
          announce(walkerCue(person.name, directionWord(sim.camYaw, target.x, target.z, person.x, person.z)))
        } else if (dist > 11) near.current.delete(person.id)
      }
    }
  })

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
        <CharacterModel getColor={() => sim.color} pose={pose} name={name} markerId={sim.id || name} />
      </group>
    </RigidBody>
  )
}
