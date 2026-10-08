import { useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { BUILDINGS, HOMES, syncInteriors } from '../buildings'
import { sim } from '../sim'
import { Box, Solid } from './primitives'

const LOOKS = ['#efe4d2', '#e7d7c4', '#efe8dc', '#e4d2b8', '#f3eee4']
const ROOFS = ['#6d3838', '#3e4f62', '#4e5d3c', '#6a4030', '#3f4f55']

function same(a: string[], b: string[]) {
  return a.length === b.length && a.every((id, index) => id === b[index])
}

export function Homes() {
  const [open, setOpen] = useState<string[]>([])
  useFrame(() => {
    const next = syncInteriors(sim.x, sim.z)
    setOpen((prev) => (same(prev, next) ? prev : next))
  })
  const loaded = new Set(open)
  return (
    <group>
      {HOMES.map((building, index) => (
        <House key={building.id} index={index} buildingId={building.id} interior={loaded.has(building.id)} />
      ))}
      {loaded.has('mansion') ? <MansionInterior /> : null}
      {BUILDINGS.flatMap((building) =>
        building.doors.map((door) => (
          <Box
            key={door.id}
            position={[door.x - door.inwardX * 1.15, 0.05, door.z - door.inwardZ * 1.15]}
            size={[1.4, 0.06, 1.4]}
            color="#f4ead8"
          />
        )),
      )}
    </group>
  )
}

function House({ index, buildingId, interior }: { index: number; buildingId: string; interior: boolean }) {
  const building = HOMES[index]
  if (!building || building.id !== buildingId) return null
  const { minX, maxX, minZ, maxZ } = building
  const door = building.doors[0]
  const h = 3.4
  const cx = (minX + maxX) / 2
  const cz = (minZ + maxZ) / 2
  const wall = LOOKS[index % LOOKS.length]
  const roof = ROOFS[index % ROOFS.length]
  const east = door.inwardX < 0
  const doorZ0 = cz - 0.8
  const doorZ1 = cz + 0.8
  return (
    <group>
      <Solid position={[cx, h / 2, minZ]} size={[maxX - minX, h, 0.4]} color={wall} />
      <Solid position={[cx, h / 2, maxZ]} size={[maxX - minX, h, 0.4]} color={wall} />
      <Solid position={[east ? minX : maxX, h / 2, cz]} size={[0.4, h, maxZ - minZ]} color={wall} />
      <Solid position={[door.x, h / 2, (minZ + doorZ0) / 2]} size={[0.4, h, doorZ0 - minZ]} color={wall} />
      <Solid position={[door.x, h / 2, (doorZ1 + maxZ) / 2]} size={[0.4, h, maxZ - doorZ1]} color={wall} />
      <Solid position={[door.x, 2.9, cz]} size={[0.4, h - 2.4, 1.6]} color={wall} />
      <Solid position={[cx, h + 0.2, cz]} size={[maxX - minX + 0.8, 0.35, maxZ - minZ + 0.8]} color={roof} />
      {interior ? (
        <>
          <Box position={[cx, 0.04, cz]} size={[8.2, 0.05, 6.2]} color="#c4a27a" />
          <Solid position={[cx, 0.4, cz]} size={[1.6, 0.8, 1]} color="#7a4e30" />
        </>
      ) : null}
    </group>
  )
}

function MansionInterior() {
  return (
    <group>
      <Solid position={[-2.2, 1.15, -37.7]} size={[2.6, 2.3, 0.45]} color="#6a3a28" />
      <Box position={[-2.2, 1.4, -37.4]} size={[2.2, 1.5, 0.08]} color="#8d4b32" />
    </group>
  )
}
