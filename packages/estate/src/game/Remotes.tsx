import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import { CharacterModel } from './CharacterModel'
import { net } from '../presence'
import type { Pose } from '../sim'

function dampAngle(current: number, target: number, amount: number) {
  let delta = target - current
  while (delta > Math.PI) delta -= Math.PI * 2
  while (delta < -Math.PI) delta += Math.PI * 2
  return current + delta * amount
}

function Remote({ id }: { id: string }) {
  const ref = useRef<Group>(null)
  const pose = useRef<Pose>({ anim: 'idle', squash: 1, lean: 0 })
  const initial = net.remotes.get(id)

  useFrame((_, dt) => {
    const body = net.remotes.get(id)
    if (!body || !ref.current) return
    const blend = 1 - Math.pow(0.0015, Math.min(dt, 0.05))
    body.rx += (body.x - body.rx) * blend
    body.ry += (body.y - body.ry) * blend
    body.rz += (body.z - body.rz) * blend
    body.ryaw = dampAngle(body.ryaw, body.yaw, blend)
    ref.current.position.set(body.rx, body.ry, body.rz)
    ref.current.rotation.y = body.ryaw
    pose.current.anim = body.anim
    pose.current.squash = body.anim === 'dive' ? 0.66 : body.anim === 'jump' ? 1.12 : 1
    pose.current.lean = Math.sin(performance.now() / 400) * 0.04
  })

  if (!initial) return null
  return (
    <group ref={ref} position={[initial.x, initial.y, initial.z]}>
      <CharacterModel getColor={() => net.remotes.get(id)?.color || initial.color} pose={pose} name={initial.name} />
    </group>
  )
}

export function RemotePlayers() {
  const [ids, setIds] = useState<string[]>([])
  useFrame(() => {
    const next = [...net.remotes.keys()].sort()
    setIds((prev) => (prev.length === next.length && prev.every((id, index) => id === next[index]) ? prev : next))
  })
  return (
    <>
      {ids.map((id) => (
        <Remote key={id} id={id} />
      ))}
    </>
  )
}
