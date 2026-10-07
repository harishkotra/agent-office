import { useLayoutEffect, useMemo, useRef } from 'react'
import { CylinderCollider, RigidBody } from '@react-three/rapier'
import { Color, InstancedMesh, Object3D } from 'three'
import { MARK } from '../zones'

export type TreeSpot = { x: number; z: number; s: number; shade: number }

function blocked(x: number, z: number) {
  if (Math.abs(x) < 36 && z > -48 && z < -6) return true
  if (Math.abs(x) < 9 && z > -14 && z < 96) return true
  if (Math.hypot(x - MARK.fountain.x, z - MARK.fountain.z) < 16) return true
  if (Math.hypot(x - MARK.pool.x, z - MARK.pool.z) < 20) return true
  if (Math.hypot(x - MARK.gazebo.x, z - MARK.gazebo.z) < 9) return true
  if (Math.hypot(x - MARK.chapel.x, z - MARK.chapel.z) < 12) return true
  if (Math.hypot(x - MARK.pond.x, z - MARK.pond.z) < 16) return true
  if (Math.hypot(x - MARK.hedge.x, z - MARK.hedge.z) < 16) return true
  if (Math.hypot(x - MARK.spawn.x, z - MARK.spawn.z) < 8) return true
  return false
}

export function treeLayout(): TreeSpot[] {
  const trees: TreeSpot[] = []
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 4; j++) {
      trees.push({ x: 44 + i * 7.2, z: -86 + j * 7.2, s: 0.95 + ((i + j) % 3) * 0.08, shade: (i + j) % 3 })
    }
  }
  for (let i = 0; i < 24; i++) {
    trees.push({
      x: -124 + (i % 6) * 5.5,
      z: -70 + Math.floor(i / 6) * 9,
      s: 1.15 + (i % 4) * 0.05,
      shade: i % 3,
    })
  }
  for (let i = 0; i < 30; i++) {
    trees.push({ x: -128 + i * 8.4, z: -110, s: 1.35, shade: i % 3 })
    trees.push({ x: -128 + i * 8.4, z: 110, s: 1.28, shade: (i + 1) % 3 })
  }
  for (let i = 0; i < 18; i++) {
    trees.push({ x: -128, z: -100 + i * 11, s: 1.4, shade: i % 3 })
    trees.push({ x: 128, z: -100 + i * 11, s: 1.32, shade: (i + 2) % 3 })
  }
  return trees.filter((tree) => !blocked(tree.x, tree.z) && Math.abs(tree.x) < 134 && Math.abs(tree.z) < 114)
}

const GREENS = ['#2f6d38', '#266333', '#3c7c40']

export function Trees() {
  const spots = useMemo(() => treeLayout(), [])
  const trunks = useRef<InstancedMesh>(null)
  const crowns = useRef<InstancedMesh>(null)

  useLayoutEffect(() => {
    const dummy = new Object3D()
    const color = new Color()
    spots.forEach((tree, index) => {
      dummy.position.set(tree.x, 1.15 * tree.s, tree.z)
      dummy.scale.set(tree.s, tree.s, tree.s)
      dummy.rotation.set(0, 0, 0)
      dummy.updateMatrix()
      trunks.current?.setMatrixAt(index, dummy.matrix)
      dummy.position.set(tree.x, 2.85 * tree.s, tree.z)
      dummy.scale.set(tree.s * 1.15, tree.s * 0.95, tree.s * 1.15)
      dummy.updateMatrix()
      crowns.current?.setMatrixAt(index, dummy.matrix)
      crowns.current?.setColorAt(index, color.set(GREENS[tree.shade]))
    })
    if (trunks.current) trunks.current.instanceMatrix.needsUpdate = true
    if (crowns.current) {
      crowns.current.instanceMatrix.needsUpdate = true
      if (crowns.current.instanceColor) crowns.current.instanceColor.needsUpdate = true
    }
  }, [spots])

  return (
    <>
      <instancedMesh ref={trunks} args={[undefined, undefined, spots.length]} castShadow receiveShadow>
        <cylinderGeometry args={[0.22, 0.32, 2.3, 6]} />
        <meshStandardMaterial color="#5c3b24" roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={crowns} args={[undefined, undefined, spots.length]} castShadow receiveShadow>
        <sphereGeometry args={[1.25, 8, 6]} />
        <meshStandardMaterial color="#2f6d38" roughness={0.86} />
      </instancedMesh>
      <RigidBody type="fixed" colliders={false}>
        {spots.map((tree) => (
          <CylinderCollider
            key={`${tree.x.toFixed(1)}-${tree.z.toFixed(1)}`}
            args={[1.05 * tree.s, 0.32 * tree.s]}
            position={[tree.x, 1.05 * tree.s, tree.z]}
          />
        ))}
      </RigidBody>
    </>
  )
}
