import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { Pose } from '../sim'
import { CAPSULE_CENTER } from '../sim'

function shade(hex: string, amount: number): string {
  const value = Number.parseInt(hex.slice(1), 16)
  if (!Number.isFinite(value)) return hex
  const mix = (channel: number) => Math.min(255, Math.max(0, channel + amount)).toString(16).padStart(2, '0')
  return `#${mix(value >> 16)}${mix((value >> 8) & 255)}${mix(value & 255)}`
}

function labelTexture(name: string) {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 128
  const ctx = canvas.getContext('2d')
  if (!ctx) return new THREE.CanvasTexture(canvas)
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = 'rgba(20, 28, 22, 0.72)'
  ctx.fillRect(16, 24, 480, 80)
  ctx.fillStyle = '#f7f1e6'
  ctx.font = '600 48px Georgia, "Liberation Serif", serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(name, 256, 64)
  const texture = new THREE.CanvasTexture(canvas)
  texture.needsUpdate = true
  return texture
}

export function CharacterModel({
  getColor,
  pose,
  name,
}: {
  getColor: () => string
  pose: { current: Pose }
  name: string
}) {
  const visual = useRef<THREE.Group>(null)
  const armL = useRef<THREE.Group>(null)
  const armR = useRef<THREE.Group>(null)
  const body = useRef<THREE.MeshStandardMaterial>(null)
  const belly = useRef<THREE.MeshStandardMaterial>(null)
  const hair = useRef<THREE.MeshStandardMaterial>(null)
  const map = useMemo(() => labelTexture(name), [name])
  const width = Math.min(2.4, 0.9 + name.length * 0.07)

  useFrame(({ clock }) => {
    const sample = pose.current
    const color = getColor()
    body.current?.color.set(color)
    belly.current?.color.set(shade(color, 28))
    hair.current?.color.set(shade(color, -28))
    const moving = sample.anim === 'walk' || sample.anim === 'run'
    const speed = sample.anim === 'run' ? 13 : moving ? 8.5 : 2.2
    const amp = moving ? 0.85 : 0.12
    const swing = Math.sin(clock.elapsedTime * speed) * amp
    if (armL.current) armL.current.rotation.x = swing
    if (armR.current) armR.current.rotation.x = -swing
    if (!visual.current) return
    const squash = sample.squash
    const widen = 1 + (1 - squash) * 0.55
    visual.current.scale.set(widen, squash, widen)
    const wobble = Math.sin(clock.elapsedTime * 2.4) * 0.045
    const dive = sample.anim === 'dive' ? 1.15 : 0
    visual.current.rotation.z = THREE.MathUtils.damp(visual.current.rotation.z, sample.lean + wobble, 7, 1 / 60)
    visual.current.rotation.x = THREE.MathUtils.damp(visual.current.rotation.x, dive, 8, 1 / 60)
    const bob = moving ? Math.abs(Math.sin(clock.elapsedTime * speed)) * (sample.anim === 'run' ? 0.08 : 0.05) : 0
    visual.current.position.y = bob
  })

  return (
    <group>
      <group ref={visual}>
        <mesh position={[0, 0.78 - CAPSULE_CENTER, 0]} castShadow>
          <capsuleGeometry args={[0.36, 0.84, 6, 12]} />
          <meshStandardMaterial ref={body} color="#e15a3a" roughness={0.42} />
        </mesh>
        <mesh position={[0, 0.62 - CAPSULE_CENTER, 0.12]}>
          <sphereGeometry args={[0.28, 14, 12]} />
          <meshStandardMaterial ref={belly} color="#f08a6e" roughness={0.5} />
        </mesh>
        <mesh position={[0, 1.12 - CAPSULE_CENTER, -0.08]} castShadow>
          <sphereGeometry args={[0.24, 12, 10]} />
          <meshStandardMaterial ref={hair} color="#b8452c" roughness={0.55} />
        </mesh>
        <mesh position={[-0.12, 1.02 - CAPSULE_CENTER, 0.28]}>
          <sphereGeometry args={[0.075, 10, 10]} />
          <meshStandardMaterial color="#f7f4ef" roughness={0.3} />
        </mesh>
        <mesh position={[0.12, 1.02 - CAPSULE_CENTER, 0.28]}>
          <sphereGeometry args={[0.075, 10, 10]} />
          <meshStandardMaterial color="#f7f4ef" roughness={0.3} />
        </mesh>
        <mesh position={[-0.12, 1.0 - CAPSULE_CENTER, 0.34]}>
          <sphereGeometry args={[0.035, 8, 8]} />
          <meshStandardMaterial color="#1c1a17" />
        </mesh>
        <mesh position={[0.12, 1.0 - CAPSULE_CENTER, 0.34]}>
          <sphereGeometry args={[0.035, 8, 8]} />
          <meshStandardMaterial color="#1c1a17" />
        </mesh>
        <group ref={armL} position={[-0.42, 0.84 - CAPSULE_CENTER, 0]}>
          <mesh position={[0, -0.22, 0]} castShadow>
            <capsuleGeometry args={[0.09, 0.28, 4, 8]} />
            <meshStandardMaterial color="#f3efe8" roughness={0.45} />
          </mesh>
        </group>
        <group ref={armR} position={[0.42, 0.84 - CAPSULE_CENTER, 0]}>
          <mesh position={[0, -0.22, 0]} castShadow>
            <capsuleGeometry args={[0.09, 0.28, 4, 8]} />
            <meshStandardMaterial color="#f3efe8" roughness={0.45} />
          </mesh>
        </group>
      </group>
      <sprite position={[0, 1.55, 0]} scale={[width, 0.42, 1]}>
        <spriteMaterial map={map} transparent depthWrite={false} />
      </sprite>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -CAPSULE_CENTER + 0.035, 0]}>
        <circleGeometry args={[0.46, 16]} />
        <meshBasicMaterial color="#17301c" transparent opacity={0.22} depthWrite={false} />
      </mesh>
    </group>
  )
}
