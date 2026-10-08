export type Door = {
  id: string
  x: number
  z: number
  inwardX: number
  inwardZ: number
  label: string
}

export type Building = {
  id: string
  label: string
  kind: 'home' | 'mansion'
  minX: number
  maxX: number
  minZ: number
  maxZ: number
  approach: number
  leave: number
  zone: string
  doors: Door[]
  shelf?: { x: number; z: number }
}

export type TravelStop = {
  id: string
  label: string
  x: number
  z: number
  zone: string
}

function home(id: string, label: string, cx: number, cz: number, facing: 'east' | 'west'): Building {
  const minX = cx - 5
  const maxX = cx + 5
  const minZ = cz - 4
  const maxZ = cz + 4
  const door: Door =
    facing === 'east'
      ? { id: `${id}-door`, x: maxX, z: cz, inwardX: -1, inwardZ: 0, label }
      : { id: `${id}-door`, x: minX, z: cz, inwardX: 1, inwardZ: 0, label }
  return {
    id,
    label,
    kind: 'home',
    minX,
    maxX,
    minZ,
    maxZ,
    approach: 14,
    leave: 24,
    zone: label,
    doors: [door],
  }
}

export const HOMES: Building[] = [
  home('home-1', 'Home 1', -108, 78, 'east'),
  home('home-2', 'Home 2', 108, 78, 'west'),
  home('home-3', 'Home 3', 108, 48, 'west'),
  home('home-4', 'Home 4', 108, -72, 'west'),
  home('home-5', 'Home 5', -108, 36, 'east'),
]

export const MANSION: Building = {
  id: 'mansion',
  label: 'Mansion',
  kind: 'mansion',
  minX: -30,
  maxX: 30,
  minZ: -40,
  maxZ: -16,
  approach: 18,
  leave: 32,
  zone: 'Great Hall',
  doors: [
    { id: 'mansion-main', x: 0, z: -16, inwardX: 0, inwardZ: -1, label: 'Mansion' },
    { id: 'mansion-west', x: -22.4, z: -20, inwardX: 0, inwardZ: -1, label: 'the west wing' },
    { id: 'mansion-east', x: 22.4, z: -20, inwardX: 0, inwardZ: -1, label: 'the east wing' },
  ],
  shelf: { x: -2.2, z: -36.2 },
}

export const BUILDINGS: Building[] = [...HOMES, MANSION]

export function insideBuilding(x: number, z: number, building: Building): boolean {
  return x > building.minX + 0.45 && x < building.maxX - 0.45 && z > building.minZ + 0.45 && z < building.maxZ - 0.45
}

export function distanceToBuilding(x: number, z: number, building: Building): number {
  const cx = Math.min(Math.max(x, building.minX), building.maxX)
  const cz = Math.min(Math.max(z, building.minZ), building.maxZ)
  return Math.hypot(x - cx, z - cz)
}

export function shouldLoadInterior(loaded: boolean, x: number, z: number, building: Building): boolean {
  if (insideBuilding(x, z, building)) return true
  const distance = distanceToBuilding(x, z, building)
  return distance < (loaded ? building.leave : building.approach)
}

export const loadedInteriors = new Set<string>()

export function syncInteriors(x: number, z: number): string[] {
  const next = interiorsFor(x, z, loadedInteriors)
  loadedInteriors.clear()
  for (const id of next) loadedInteriors.add(id)
  return next
}

export function interiorsFor(x: number, z: number, loaded: ReadonlySet<string>): string[] {
  return BUILDINGS.filter((building) => shouldLoadInterior(loaded.has(building.id), x, z, building)).map((building) => building.id)
}

export function homeZone(x: number, z: number): string | null {
  for (const building of HOMES) {
    if (insideBuilding(x, z, building)) return building.zone
  }
  return null
}

export type Nearby = {
  id: string
  kind: 'door' | 'floor' | 'bookshelf'
  label: string
  building: Building
  door?: Door
  x: number
  z: number
}

export function nearbyTarget(x: number, z: number, loaded: ReadonlySet<string>): Nearby | null {
  let best: Nearby | null = null
  let bestDist = Infinity
  for (const building of BUILDINGS) {
    if (building.shelf && loaded.has(building.id)) {
      const dist = Math.hypot(x - building.shelf.x, z - building.shelf.z)
      if (dist < 2.2 && dist < bestDist) {
        bestDist = dist
        best = { id: `${building.id}-shelf`, kind: 'bookshelf', label: building.label, building, x: building.shelf.x, z: building.shelf.z }
      }
    }
    for (const door of building.doors) {
      const dist = Math.hypot(x - door.x, z - door.z)
      if (dist < 2.6 && dist < bestDist) {
        bestDist = dist
        best = { id: door.id, kind: dist < 1.35 ? 'floor' : 'door', label: door.label, building, door, x: door.x, z: door.z }
      }
    }
  }
  return best
}

export function stepThrough(x: number, z: number, building: Building, door: Door): { x: number; z: number } {
  const inside = insideBuilding(x, z, building)
  const step = 1.7
  if (inside) return { x: door.x - door.inwardX * step, z: door.z - door.inwardZ * step }
  return { x: door.x + door.inwardX * step, z: door.z + door.inwardZ * step }
}

export function promptText(kind: Nearby['kind'], key: string, inside: boolean): string {
  if (kind === 'bookshelf') return `Press ${key} to open the family directory`
  if (inside) return `Press ${key} to step outside`
  return `Press ${key} to enter`
}

export const TRAVEL: TravelStop[] = [
  { id: 'gate', label: 'Front gate', x: 0, z: 82, zone: 'Front Gate' },
  { id: 'mansion', label: 'Mansion door', x: 0, z: -14.2, zone: 'Manor Porch' },
  ...HOMES.map((building) => {
    const door = building.doors[0]
    return {
      id: building.id,
      label: building.label,
      x: door.x - door.inwardX * 2.2,
      z: door.z - door.inwardZ * 2.2,
      zone: building.label,
    }
  }),
]
