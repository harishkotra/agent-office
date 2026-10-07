import { homeZone } from './buildings'

export const WORLD = {
  halfX: 140,
  halfZ: 120,
}

export const MARK = {
  spawn: { x: 0, z: 82 },
  gateZ: 70,
  fountain: { x: 0, z: 30, r: 5.4 },
  manor: { x0: -13, x1: 13, z0: -40, z1: -16 },
  westWing: { x0: -30, x1: -13, z0: -36, z1: -20 },
  eastWing: { x0: 13, x1: 30, z0: -36, z1: -20 },
  pool: { x: 66, z: 8, w: 24, d: 16 },
  gazebo: { x: -58, z: 16 },
  chapel: { x: -78, z: -54 },
  pond: { x: 58, z: 56, r: 12 },
  orchard: { x: 52, z: -70 },
  hedge: { x: -50, z: 54 },
}

export type ZoneRect = {
  name: string
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

const hall = MARK.manor
const west = MARK.westWing
const east = MARK.eastWing

export const ZONES: ZoneRect[] = [
  { name: 'Great Hall', minX: hall.x0 + 0.6, maxX: hall.x1 - 0.6, minZ: hall.z0 + 0.6, maxZ: hall.z1 - 0.6 },
  { name: 'West Wing', minX: west.x0 + 0.6, maxX: west.x1 - 0.4, minZ: west.z0 + 0.6, maxZ: west.z1 - 0.6 },
  { name: 'East Wing', minX: east.x0 + 0.4, maxX: east.x1 - 0.6, minZ: east.z0 + 0.6, maxZ: east.z1 - 0.6 },
  { name: 'Manor Porch', minX: -14, maxX: 14, minZ: hall.z1 - 0.2, maxZ: hall.z1 + 8 },
  { name: 'Back Terrace', minX: -18, maxX: 18, minZ: hall.z0 - 12, maxZ: hall.z0 + 0.4 },
  { name: 'Fountain Court', minX: -16, maxX: 16, minZ: 18, maxZ: 44 },
  { name: 'Front Gate', minX: -18, maxX: 18, minZ: 64, maxZ: 98 },
  { name: 'Pool Terrace', minX: 50, maxX: 84, minZ: -6, maxZ: 24 },
  { name: 'Gazebo Lawn', minX: -78, maxX: -40, minZ: -2, maxZ: 34 },
  { name: 'Chapel Garden', minX: -98, maxX: -60, minZ: -74, maxZ: -36 },
  { name: 'Pond Bridge', minX: 40, maxX: 80, minZ: 40, maxZ: 74 },
  { name: 'Orchard', minX: 36, maxX: 92, minZ: -96, maxZ: -46 },
  { name: 'Hedge Garden', minX: -66, maxX: -34, minZ: 40, maxZ: 70 },
  { name: 'West Woods', minX: -140, maxX: -96, minZ: -120, maxZ: 120 },
  { name: 'North Pasture', minX: -96, maxX: 140, minZ: -120, maxZ: -96 },
  { name: 'South Meadow', minX: -140, maxX: 140, minZ: 98, maxZ: 120 },
]

export function zoneAt(x: number, z: number): string {
  const home = homeZone(x, z)
  if (home) return home
  for (const zone of ZONES) {
    if (x >= zone.minX && x <= zone.maxX && z >= zone.minZ && z <= zone.maxZ) return zone.name
  }
  return 'The Grounds'
}
