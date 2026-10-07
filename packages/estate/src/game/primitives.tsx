import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier'
import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react'
import { BoxGeometry, Euler, Matrix4, Quaternion, Vector3 } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export type BoxItem = {
  position: [number, number, number]
  size: [number, number, number]
  color: string
  rotation?: [number, number, number]
}

const VisualBatch = createContext<BoxItem[] | null>(null)

export function BatchGroup({ children }: { children: ReactNode }) {
  const items: BoxItem[] = []
  return (
    <VisualBatch.Provider value={items}>
      {children}
      <MergedBatch items={items} />
    </VisualBatch.Provider>
  )
}

function MergedBatch({ items }: { items: BoxItem[] }) {
  const key = items.map((item) => `${item.color}:${item.position.join(',')}:${item.size.join(',')}:${item.rotation?.join(',') || ''}`).join('|')
  const groups = useMemo(() => {
    const by = new Map<string, BoxGeometry[]>()
    for (const item of items) {
      const geo = new BoxGeometry(item.size[0], item.size[1], item.size[2])
      const rotation = item.rotation || [0, 0, 0]
      const matrix = new Matrix4().compose(
        new Vector3(item.position[0], item.position[1], item.position[2]),
        new Quaternion().setFromEuler(new Euler(rotation[0], rotation[1], rotation[2])),
        new Vector3(1, 1, 1),
      )
      geo.applyMatrix4(matrix)
      const list = by.get(item.color) || []
      list.push(geo)
      by.set(item.color, list)
    }
    return [...by.entries()].map(([color, geos]) => {
      const geometry = mergeGeometries(geos, false)
      for (const geo of geos) geo.dispose()
      return { color, geometry }
    })
  }, [key])
  useEffect(
    () => () => {
      for (const group of groups) group.geometry?.dispose()
    },
    [groups],
  )
  return (
    <group>
      {groups.map((group) =>
        group.geometry ? (
          <mesh key={group.color} geometry={group.geometry} castShadow receiveShadow>
            <meshStandardMaterial color={group.color} roughness={0.84} />
          </mesh>
        ) : null,
      )}
    </group>
  )
}

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
  const batch = useContext(VisualBatch)
  if (batch) {
    batch.push({ position, size, color, rotation })
    return (
      <RigidBody type="fixed" colliders={false} position={position} rotation={rotation}>
        <CuboidCollider args={[size[0] / 2, size[1] / 2, size[2] / 2]} />
      </RigidBody>
    )
  }
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
  const batch = useContext(VisualBatch)
  if (batch && opacity >= 1) {
    batch.push({ position, size, color, rotation })
    return null
  }
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
