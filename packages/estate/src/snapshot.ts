import type { Anim } from './movement'
import { cleanName } from './family'

export const COLOR_RE = /^#[0-9a-f]{6}$/
const SESSION_RE = /^[a-f0-9]{32}$/
const ANIMS = new Set<Anim>(['idle', 'walk', 'run', 'jump', 'fall', 'dive'])

export function cssColor(value: unknown, fallback = '#0072b2'): string {
  if (typeof value === 'string' && COLOR_RE.test(value)) return value
  return COLOR_RE.test(fallback) ? fallback : '#0072b2'
}

export type SnapshotPlayer = {
  id: string
  name: string
  color: string
  x: number
  y: number
  z: number
  yaw: number
  anim: Anim
  zone: string
}

function axis(value: unknown, min: number, max: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Math.min(max, Math.max(min, value))
}

function readPlayer(raw: unknown, selfId: string): SnapshotPlayer | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  if ('email' in row || 'phone' in row || 'user_id' in row || 'userId' in row) return null
  if (typeof row.id !== 'string' || !SESSION_RE.test(row.id) || row.id === selfId) return null
  const name = cleanName(row.name)
  if (!name || name === 'Guest') return null
  const x = axis(row.x, -200, 200)
  const y = axis(row.y, -5, 40)
  const z = axis(row.z, -200, 200)
  const yaw = axis(row.yaw, -20, 20)
  if (x === null || y === null || z === null || yaw === null) return null
  const anim = typeof row.anim === 'string' && ANIMS.has(row.anim as Anim) ? (row.anim as Anim) : 'idle'
  const zone = typeof row.zone === 'string' ? row.zone.replace(/[^\w .'-]/g, '').trim().slice(0, 32) || 'The Grounds' : 'The Grounds'
  return { id: row.id, name, color: cssColor(row.color), x, y, z, yaw, anim, zone }
}

export function readSnapshot(message: unknown, selfId: string): SnapshotPlayer[] | null {
  if (!message || typeof message !== 'object') return null
  const body = message as { t?: unknown; players?: unknown }
  if (body.t !== 'snapshot' || !Array.isArray(body.players)) return null
  const players: SnapshotPlayer[] = []
  for (const row of body.players) {
    const player = readPlayer(row, selfId)
    if (player) players.push(player)
  }
  return players
}

export function readWelcome(message: unknown): { id: string; name: string; color: string } | null {
  if (!message || typeof message !== 'object') return null
  const body = message as { t?: unknown; id?: unknown; name?: unknown; color?: unknown }
  if (body.t !== 'welcome') return null
  if (typeof body.id !== 'string' || !SESSION_RE.test(body.id)) return null
  const name = cleanName(body.name)
  if (!name || name === 'Guest') return null
  return { id: body.id, name, color: cssColor(body.color) }
}
