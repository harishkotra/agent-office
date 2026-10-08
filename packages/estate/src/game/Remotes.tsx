import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import { CharacterModel } from './CharacterModel'
import { net } from '../presence'
import { poseAt } from '../netpose'
import { settings } from '../settings'
import type { Pose } from '../sim'

function Remote({ id }: { id: string }) {
  const ref = useRef<Group>(null)
  const pose = useRef<Pose>({ anim: 'idle', squash: 1, lean: 0 })
  const initial = net.remotes.get(id)

  useFrame(() => {
    const body = net.remotes.get(id)
    if (!body || !ref.current) return
    const poseNow = poseAt(body.track, performance.now() / 1000, 0.12, settings.reducedMotion)
    if (!poseNow) return
    body.x = poseNow.x
    body.y = poseNow.y
    body.z = poseNow.z
    body.yaw = poseNow.yaw
    ref.current.position.set(poseNow.x, poseNow.y, poseNow.z)
    ref.current.rotation.y = poseNow.yaw
    pose.current.anim = body.anim
    pose.current.squash = body.anim === 'dive' ? 0.66 : body.anim === 'jump' ? 1.12 : 1
    pose.current.lean = settings.reducedMotion ? 0 : Math.sin(performance.now() / 400) * 0.04
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
