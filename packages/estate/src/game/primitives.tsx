import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier'
import type { ReactNode } from 'react'

export function Solid({
  position,
  size,
  color,
  roughness = 0.82,
  rotation,
  children,
}: {
  position: [number, number, number]
  size: [number, number, number]
  color: string
  roughness?: number
  rotation?: [number, number, number]
  children?: ReactNode
}) {
  return (
    <RigidBody type="fixed" colliders={false} position={position} rotation={rotation}>
      <CuboidCollider args={[size[0] / 2, size[1] / 2, size[2] / 2]} />
      <mesh castShadow receiveShadow>
        <boxGeometry args={size} />
        <meshStandardMaterial color={color} roughness={roughness} />
      </mesh>
      {children}
    </RigidBody>
  )
}

export function Box({
  position,
  size,
  color,
  roughness = 0.8,
  rotation,
  opacity = 1,
}: {
  position: [number, number, number]
  size: [number, number, number]
  color: string
  roughness?: number
  rotation?: [number, number, number]
  opacity?: number
}) {
  return (
    <mesh position={position} rotation={rotation} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial
        color={color}
        roughness={roughness}
        transparent={opacity < 1}
        opacity={opacity}
      />
    </mesh>
  )
}

export function Column({
  position,
  height,
  radius,
  color,
}: {
  position: [number, number, number]
  height: number
  radius: number
  color: string
}) {
  return (
    <RigidBody type="fixed" colliders={false} position={position}>
      <CylinderCollider args={[height / 2, radius]} />
      <mesh castShadow receiveShadow>
        <cylinderGeometry args={[radius, radius * 1.06, height, 12]} />
        <meshStandardMaterial color={color} roughness={0.62} />
      </mesh>
    </RigidBody>
  )
}

export function InvisibleWall({
  position,
  size,
}: {
  position: [number, number, number]
  size: [number, number, number]
}) {
  return (
    <RigidBody type="fixed" colliders={false} position={position}>
      <CuboidCollider args={[size[0] / 2, size[1] / 2, size[2] / 2]} />
    </RigidBody>
  )
}
