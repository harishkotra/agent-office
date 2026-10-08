import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CapsuleCollider, RigidBody, useBeforePhysicsStep, useRapier, type RapierRigidBody } from '@react-three/rapier'
import type { Group } from 'three'
import { CharacterModel } from './CharacterModel'
import { clipVelocity, initialMove, notePress, smoothYaw, snapYaw, stepMove, takePresses, wishFromKeys, type EdgeLatch, type MoveState } from '../movement'
import { CAPSULE_CENTER, CAPSULE_HALF, CAPSULE_R, look, sim, type Pose } from '../sim'
import { MARK, zoneAt } from '../zones'
import { bindingLabel, held, jumpHeldNow, setPaused, settings } from '../settings'
import { TUNING } from '../tuning'
import { clampPitch, recenterYaw } from '../camera'
import { play, publishPlay, transit } from '../play'
import { BUILDINGS, advanceDoor, doorMotion, insideBuilding, nearbyTarget, promptFor, stepThrough, syncInteriors, type DoorMotion } from '../buildings'
import { announce, blip, directionWord, placeCue, stereoPan, walkerCue } from '../cues'
import { controlHold, touch } from '../touch'
import { pollGamepad } from '../gamepad'

function stickLooking(): boolean {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return false
  for (const pad of navigator.getGamepads()) {
    if (!pad) continue
    if (Math.hypot(pad.axes[2] || 0, pad.axes[3] || 0) > 0.2) return true
  }
  return false
}

export function LocalPlayer({ name }: { name: string }) {
  const body = useRef<RapierRigidBody>(null)
  const facing = useRef<Group>(null)
  const pose = useRef<Pose>({ anim: 'idle', squash: 1, lean: 0 })
  const move = useRef<MoveState>(initialMove())
  const prev = useRef<EdgeLatch>({ jump: false, dive: false })
  const latch = useRef<EdgeLatch>({ jump: false, dive: false })
  const resetHeld = useRef(0)
  const lookIdle = useRef(0)
  const lookDevice = useRef<'mouse' | 'pad'>('mouse')
  const speedRef = useRef(0)
  const interactPrev = useRef(false)
  const interactLatch = useRef(false)
  const travelPrev = useRef(false)
  const pausePrev = useRef(false)
  const zoneSeen = useRef(sim.zone)
  const near = useRef(new Set<string>())
  const doorMove = useRef<DoorMotion>({ phase: 'idle', elapsed: 0 })
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
    const pad = pollGamepad()
    const indoorsNow = BUILDINGS.some((building) => insideBuilding(sim.x, sim.z, building))
    const touchYaw = touch.lookYaw
    const touchPitch = touch.lookPitch
    sim.camYaw -= lookX * TUNING.lookPerPixel
    sim.camYaw += touchYaw + pad.lookYaw * frame
    touch.lookYaw = 0
    if (held(look.keys, 'lookLeft') || touch.lookLeft) sim.camYaw += TUNING.lookYawRate * frame
    if (held(look.keys, 'lookRight') || touch.lookRight) sim.camYaw -= TUNING.lookYawRate * frame
    const pitchInvert = settings.invertY ? -1 : 1
    sim.camPitch = clampPitch(
      sim.camPitch + lookY * TUNING.lookPerPixel + touchPitch + pad.lookPitch * frame * pitchInvert,
      indoorsNow,
    )
    touch.lookPitch = 0
    const looking =
      Math.abs(lookX) + Math.abs(lookY) > 0 ||
      Math.abs(touchYaw) + Math.abs(touchPitch) > 0 ||
      Math.abs(pad.lookYaw) + Math.abs(pad.lookPitch) > 0 ||
      held(look.keys, 'lookLeft') ||
      held(look.keys, 'lookRight') ||
      touch.lookLeft ||
      touch.lookRight ||
      stickLooking()
    if (looking) lookIdle.current = 0
    else lookIdle.current += frame
    if (Math.abs(lookX) + Math.abs(lookY) > 0) lookDevice.current = 'mouse'
    if (Math.hypot(touch.x, touch.y) > 0.2 || stickLooking()) lookDevice.current = 'pad'
    if (
      lookDevice.current === 'pad' &&
      !settings.reducedMotion &&
      lookIdle.current >= TUNING.recenterDelay &&
      speedRef.current > TUNING.recenterMove
    ) {
      sim.camYaw = recenterYaw(sim.camYaw, sim.facing, frame)
    }
    if ((pad.recenter || touch.recenter || held(look.keys, 'recenter')) && !settings.reducedMotion) {
      sim.camYaw = snapYaw(sim.camYaw, sim.facing, frame)
    } else if (pad.recenter || touch.recenter || held(look.keys, 'recenter')) {
      sim.camYaw = sim.facing
    }

    const blocked = settings.paused || play.directory || play.travel
    const jump = !blocked && (held(look.keys, 'jump') || touch.jump || pad.jump)
    const dive = !blocked && (held(look.keys, 'dive') || touch.dive || pad.dive)
    notePress(latch.current, jump, dive, prev.current)
    const interact = !blocked && (held(look.keys, 'interact') || touch.interact || pad.interact)
    if (interact && !interactPrev.current) interactLatch.current = true
    interactPrev.current = interact
    if (pad.travel && !travelPrev.current) publishPlay({ travel: !play.travel })
    travelPrev.current = pad.travel
    if (pad.pause && !pausePrev.current) setPaused(!settings.paused)
    pausePrev.current = pad.pause
    const resetDown = !settings.paused && (held(look.keys, 'reset') || pad.reset)
    if (resetDown && resetHeld.current === 0) announce('Returning to the gate')
    resetHeld.current = resetDown ? resetHeld.current + frame : 0
    controlHold.reset = resetDown ? Math.min(1, resetHeld.current / TUNING.resetHold) : 0
  })

  useBeforePhysicsStep(() => {
    const rb = body.current
    const ctrl = controller.current
    if (!rb || !ctrl) return
    const collider = rb.collider(0)
    if (!collider) return
    sim.excludeBody = rb

    const blocked = settings.paused || play.directory || play.travel
    const padMove = pollGamepad()
    const keyForward = held(look.keys, 'forward') ? 1 : 0
    const keyBack = held(look.keys, 'back') ? 1 : 0
    const keyRight = held(look.keys, 'right') ? 1 : 0
    const keyLeft = held(look.keys, 'left') ? 1 : 0
    let forward = keyForward - keyBack
    let strafe = keyRight - keyLeft
    const finger = Math.hypot(touch.x, touch.y) > 0.05
    if (forward === 0 && strafe === 0) {
      forward = finger ? touch.y : padMove.y
      strafe = finger ? touch.x : padMove.x
    }
    if (blocked) {
      forward = 0
      strafe = 0
    }
    const wish = wishFromKeys(sim.camYaw, forward, strafe)
    const presses = takePresses(latch.current)
    const reset = resetHeld.current >= TUNING.resetHold
    if (reset) resetHeld.current = 0
    const interact = interactLatch.current
    interactLatch.current = false

    const here = rb.translation()
    if (transit.x != null && transit.z != null) {
      const next = { x: transit.x, y: CAPSULE_CENTER, z: transit.z }
      const zone = transit.zone
      const yaw = transit.yaw
      transit.x = null
      transit.z = null
      transit.yaw = Math.PI
      transit.zone = ''
      move.current = initialMove()
      rb.setTranslation(next, true)
      rb.setNextKinematicTranslation(next)
      sim.prevX = next.x
      sim.prevY = next.y
      sim.prevZ = next.z
      sim.x = next.x
      sim.y = next.y
      sim.z = next.z
      sim.facing = yaw
      sim.prevFacing = yaw
      sim.camYaw = yaw
      sim.camHoldY = next.y
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
    const indoors = BUILDINGS.some((building) => insideBuilding(here.x, here.z, building))
    const nextMove = stepMove(
      move.current,
      {
        wishX: wish.x,
        wishZ: wish.z,
        run: !blocked && (settings.runToggle ? settings.running : held(look.keys, 'run') || Math.hypot(touch.x, touch.y) >= 0.85 || padMove.run),
        jumpPressed: presses.jumpPressed,
        jumpHeld: jumpHeldNow(look.keys, touch.jump, padMove.jump),
        divePressed: presses.divePressed,
        indoors,
        dt: world.timestep || TUNING.timestep,
      },
      grounded,
    )
    move.current = nextMove
    const stepDt = world.timestep || TUNING.timestep
    let stepY = nextMove.vy * stepDt
    if (nextMove.vy > 0) {
      stepY = Math.max(stepY, 0.1)
      ctrl.disableSnapToGround()
    } else {
      stepY = Math.min(stepY, -0.05)
      ctrl.enableSnapToGround(0.22)
    }
    const step = { x: nextMove.vx * stepDt, y: stepY, z: nextMove.vz * stepDt }
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

    sim.prevX = sim.x
    sim.prevY = sim.y
    sim.prevZ = sim.z
    sim.prevFacing = sim.facing
    sim.steppedAt = performance.now()
    sim.x = target.x
    sim.y = target.y
    sim.z = target.z
    sim.indoors = indoors
    if (nextMove.anim === 'idle' || nextMove.anim === 'walk' || nextMove.anim === 'run') sim.camHoldY = target.y
    const speed = Math.hypot(nextMove.vx, nextMove.vz)
    speedRef.current = speed
    const face = speed > 0.35 ? Math.atan2(nextMove.vx, nextMove.vz) : forward !== 0 || strafe !== 0 ? Math.atan2(wish.x, wish.z) : sim.facing
    sim.facing = settings.reducedMotion ? face : smoothYaw(sim.facing, face, world.timestep || TUNING.timestep)
    sim.anim = nextMove.anim
    sim.squash = nextMove.squash
    sim.lean = strafe * 0.28
    sim.zone = zoneAt(target.x, target.z)
    pose.current.anim = nextMove.anim
    pose.current.squash = nextMove.squash
    pose.current.lean = sim.lean
    const targetHit = nearbyTarget(target.x, target.z, new Set(syncInteriors(target.x, target.z)))
    let stepped = false
    if (targetHit?.kind === 'door' && targetHit.door) {
      const distance = Math.hypot(target.x - targetHit.x, target.z - targetHit.z)
      const motion = advanceDoor(doorMove.current, distance, interact, world.timestep || TUNING.timestep)
      doorMove.current = motion
      doorMotion.set(targetHit.id, motion.phase)
      stepped = motion.step
      if (motion.step) {
        const step = stepThrough(target.x, target.z, targetHit.building, targetHit.door)
        const leaving = insideBuilding(target.x, target.z, targetHit.building)
        rb.setTranslation({ x: step.x, y: target.y, z: step.z }, true)
        rb.setNextKinematicTranslation({ x: step.x, y: target.y, z: step.z })
        sim.x = step.x
        sim.z = step.z
        const feedback = leaving ? `Outside ${targetHit.label}.` : `Door open. ${targetHit.label}, ground floor.`
        publishPlay({ feedback, feedbackUntil: Date.now() + 1600 })
        announce(feedback)
        blip(0)
      }
    } else {
      doorMove.current = { phase: 'idle', elapsed: 0 }
      if (interact && targetHit?.kind === 'bookshelf') {
        publishPlay({ directory: true, feedback: 'Opening the family directory', feedbackUntil: Date.now() + 1600 })
        document.exitPointerLock()
      }
    }
    const shown = targetHit && !stepped ? { id: targetHit.id, kind: targetHit.kind, text: promptFor(targetHit.kind, bindingLabel('interact'), targetHit.label, targetHit.door ? insideBuilding(target.x, target.z, targetHit.building) : false) } : null
    if ((shown?.id || '') !== (play.prompt?.id || '') || shown?.text !== play.prompt?.text) {
      publishPlay({ prompt: shown })
      if (shown) {
        const dir = directionWord(sim.camYaw, target.x, target.z, shown.kind === 'bookshelf' ? targetHit!.x : targetHit!.x, targetHit!.z)
        announce(placeCue(shown.kind, dir, targetHit!.label, bindingLabel('interact')))
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

  useFrame(() => {
    const span = Math.max((world.timestep || TUNING.timestep) * 1000, 1)
    const alpha = Math.min(1, Math.max(0, (performance.now() - sim.steppedAt) / span))
    const turn = sim.facing - sim.prevFacing
    const wrapped = Math.atan2(Math.sin(turn), Math.cos(turn))
    if (facing.current) {
      facing.current.rotation.y = sim.prevFacing + wrapped * alpha
      facing.current.position.set(
        sim.prevX + (sim.x - sim.prevX) * alpha - sim.x,
        sim.prevY + (sim.y - sim.prevY) * alpha - sim.y,
        sim.prevZ + (sim.z - sim.prevZ) * alpha - sim.z,
      )
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
        <CharacterModel getColor={() => sim.color} pose={pose} name={name} />
      </group>
    </RigidBody>
  )
}
