import { clampNum, cleanAnim, cleanName, cleanZone, colorFor } from './names.js'

function tabIdOf(value) {
  return typeof value === 'string' && /^[\w-]{8,64}$/.test(value) ? value : ''
}

export class EstateRoom {
  constructor() {
    this.players = new Map()
    this.bySocket = new Map()
    this.retired = new Map()
  }

  join(socket, info) {
    if (!info || info.verified !== true || !info.id) return null
    const tabId = tabIdOf(info.tabId) || `tab-${Math.random().toString(36).slice(2, 12)}`
    const retired = this.retired.get(info.id)
    if (retired && retired.has(tabId)) return { replaced: true }
    const existing = this.players.get(info.id)
    if (existing && existing.socket !== socket) {
      this.bySocket.delete(existing.socket)
      if (existing.tabId !== tabId) {
        const next = retired || new Set()
        next.add(existing.tabId)
        this.retired.set(info.id, next)
        try {
          existing.socket.close(4000, 'joined elsewhere')
        } catch {
          // The older socket may already be gone.
        }
      } else {
        try {
          existing.socket.close(4001, 'reconnected')
        } catch {
          // The older socket may already be gone.
        }
      }
    }
    const player = {
      id: info.id,
      name: cleanName(info.name),
      verified: true,
      color: colorFor(info.id),
      x: 0,
      y: 0.82,
      z: 82,
      yaw: Math.PI,
      anim: 'idle',
      zone: 'Front Gate',
      tabId,
      socket,
    }
    this.players.set(player.id, player)
    this.bySocket.set(socket, player.id)
    return player
  }

  leave(socket) {
    const id = this.bySocket.get(socket)
    if (!id) return false
    this.bySocket.delete(socket)
    const player = this.players.get(id)
    if (player && player.socket === socket) this.players.delete(id)
    return true
  }

  applyState(socket, msg) {
    const id = this.bySocket.get(socket)
    if (!id) return false
    const player = this.players.get(id)
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
