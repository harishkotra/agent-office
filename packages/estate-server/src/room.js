import { randomBytes } from 'node:crypto'
import { clampNum, cleanAnim, cleanName, cleanZone, colorFor } from './names.js'

const RETIRE_MS = 20_000

function tabIdOf(value) {
  return typeof value === 'string' && /^[\w-]{8,64}$/.test(value) ? value : ''
}

function sessionId() {
  return randomBytes(16).toString('hex')
}

export class EstateRoom {
  constructor() {
    this.players = new Map()
    this.bySocket = new Map()
    this.retired = new Map()
  }

  pruneRetired(userId, now = Date.now()) {
    const tabs = this.retired.get(userId)
    if (!tabs) return
    for (const [tabId, until] of tabs) {
      if (until <= now) tabs.delete(tabId)
    }
    if (tabs.size === 0) this.retired.delete(userId)
  }

  join(socket, info, now = Date.now()) {
    if (!info || info.verified !== true || !info.id) return null
    const name = cleanName(info.name)
    if (!name || name === 'Guest') return null
    const userId = String(info.id)
    const tabId = tabIdOf(info.tabId) || `tab-${randomBytes(6).toString('hex')}`
    this.pruneRetired(userId, now)
    const retired = this.retired.get(userId)
    if (retired && retired.has(tabId)) return { replaced: true }
    const existing = this.players.get(userId)
    if (existing && existing.socket !== socket) {
      this.bySocket.delete(existing.socket)
      if (existing.tabId !== tabId) {
        const next = retired || new Map()
        next.set(existing.tabId, now + RETIRE_MS)
        this.retired.set(userId, next)
        try {
          existing.socket.close(4000, 'joined elsewhere')
        } catch {
          // The older socket may already be gone.
        }
      } else {
        try {
          existing.socket.close(4000, 'reconnected')
        } catch {
          // The older socket may already be gone.
        }
      }
    }
    const player = {
      userId,
      id: sessionId(),
      name,
      verified: true,
      color: colorFor(userId),
      x: existing ? existing.x : 0,
      y: existing ? existing.y : 0.82,
      z: existing ? existing.z : 82,
      yaw: existing ? existing.yaw : Math.PI,
      anim: 'idle',
      zone: existing ? existing.zone : 'Front Gate',
      tabId,
      token: typeof info.token === 'string' ? info.token : '',
      exp: typeof info.exp === 'number' && Number.isFinite(info.exp) ? info.exp : null,
      checkedAt: now,
      socket,
    }
    this.players.set(userId, player)
    this.bySocket.set(socket, userId)
    return player
  }

  leave(socket) {
    const userId = this.bySocket.get(socket)
    if (!userId) return false
    this.bySocket.delete(socket)
    const player = this.players.get(userId)
    if (player && player.socket === socket) {
      this.players.delete(userId)
      this.retired.delete(userId)
    }
    return true
  }

  applyState(socket, msg) {
    const userId = this.bySocket.get(socket)
    if (!userId) return false
    const player = this.players.get(userId)
    if (!player) return false
    player.x = clampNum(msg.x, -160, 160, player.x)
    player.y = clampNum(msg.y, -2, 30, player.y)
    player.z = clampNum(msg.z, -140, 140, player.z)
    player.yaw = clampNum(msg.yaw, -20, 20, player.yaw)
    player.anim = cleanAnim(msg.anim)
    player.zone = cleanZone(msg.zone)
    return true
  }

  snapshot() {
    return {
      t: 'snapshot',
      players: [...this.players.values()].map((player) => ({
        id: player.id,
        name: player.name,
        color: player.color,
        x: Number(player.x.toFixed(3)),
        y: Number(player.y.toFixed(3)),
        z: Number(player.z.toFixed(3)),
        yaw: Number(player.yaw.toFixed(3)),
        anim: player.anim,
        zone: player.zone,
      })),
    }
  }

  count() {
    return this.players.size
  }
}

export function dueForRecheck(player, now) {
  if (!player) return false
  if (typeof player.exp === 'number' && now >= player.exp) return true
  if (player.exp == null && now - (player.checkedAt || 0) > 120000) return true
  return false
}
