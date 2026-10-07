import { useEffect, useRef } from 'react'
import type { Anim } from './movement'
import { currentToken, type Member } from './auth'
import { colorFor, presenceUrl } from './family'
import { pushSample, type Track } from './netpose'
import { sim, type RosterEntry } from './sim'

const TAB_KEY = 'mccowan-estate-tab'

function tabId() {
  const existing = sessionStorage.getItem(TAB_KEY)
  if (existing && /^[\w-]{8,64}$/.test(existing)) return existing
  const next = crypto.randomUUID()
  sessionStorage.setItem(TAB_KEY, next)
  return next
}

export type RemoteBody = {
  id: string
  name: string
  color: string
  x: number
  y: number
  z: number
  yaw: number
  anim: Anim
  zone: string
  track: Track
}

export const net = {
  remotes: new Map<string, RemoteBody>(),
}

type Welcome = {
  t: 'welcome'
  id: string
  name: string
  color: string
}

type Snapshot = {
  t: 'snapshot'
  players: {
    id: string
    name: string
    color: string
    x: number
    y: number
    z: number
    yaw: number
    anim: Anim
    zone: string
  }[]
}

function publishRoster() {
  const roster: RosterEntry[] = []
  if (sim.id) {
    roster.push({
      id: sim.id,
      name: sim.name,
      zone: sim.zone,
      guest: false,
      self: true,
      color: sim.color,
      x: sim.x,
      y: sim.y,
      z: sim.z,
      facing: sim.facing,
    })
  }
  for (const player of net.remotes.values()) {
    roster.push({
      id: player.id,
      name: player.name,
      zone: player.zone,
      guest: false,
      self: false,
      color: player.color,
      x: player.x,
      y: player.y,
      z: player.z,
      facing: player.yaw,
    })
  }
  roster.sort((a, b) => a.name.localeCompare(b.name))
  sim.roster = roster
}

function applySnapshot(message: Snapshot) {
  const seen = new Set<string>()
  for (const player of message.players) {
    if (player.id === sim.id) continue
    seen.add(player.id)
    const existing = net.remotes.get(player.id)
    const sample = { x: player.x, y: player.y, z: player.z, yaw: player.yaw, t: performance.now() / 1000 }
    if (existing) {
      existing.track = pushSample(existing.track, sample)
      existing.anim = player.anim
      existing.zone = player.zone
      existing.name = player.name
      existing.color = player.color
    } else {
      net.remotes.set(player.id, {
        ...player,
        track: { previous: null, latest: sample },
      })
    }
  }
  for (const id of net.remotes.keys()) {
    if (!seen.has(id)) net.remotes.delete(id)
  }
  publishRoster()
}

export function usePresence(
  member: Member,
  onWelcome: (member: Member) => void,
  onReject?: (message: string) => void,
  onStatus?: (status: 'connecting' | 'offline') => void,
) {
  const memberRef = useRef(member)
  const welcomeRef = useRef(onWelcome)
  const rejectRef = useRef(onReject)
  const statusRef = useRef(onStatus)
  memberRef.current = member
  welcomeRef.current = onWelcome
  rejectRef.current = onReject
  statusRef.current = onStatus

  useEffect(() => {
    let socket: WebSocket | null = null
    let stopped = false
    let welcomed = false
    let failed = false
    let delay = 600
    let sendTimer = 0
    let presenceTimer = 0
    const person = memberRef.current
    sim.name = person.name
    sim.guest = false
    sim.color = person.color || colorFor(person.id || person.name)
    sim.id = ''

    const sendState = () => {
      if (!socket || socket.readyState !== WebSocket.OPEN || !sim.id) return
      socket.send(
        JSON.stringify({
          t: 'state',
          x: sim.x,
          y: sim.y,
          z: sim.z,
          yaw: sim.facing,
          anim: sim.anim,
          zone: sim.zone,
        }),
      )
    }

    const connect = async () => {
      if (stopped) return
      sim.status = 'connecting'
      if (!welcomed) statusRef.current?.(failed ? 'offline' : 'connecting')
      const token = (await currentToken()) || memberRef.current.token
      if (!token) {
        rejectRef.current?.('Sign in on the family site to walk the grounds.')
        return
      }
      const ws = new WebSocket(presenceUrl())
      socket = ws
      ws.onopen = () => {
        delay = 600
        sim.status = 'online'
        ws.send(
          JSON.stringify({
            t: 'join',
            token,
            tabId: tabId(),
          }),
        )
      }
      ws.onmessage = (event) => {
        let message: { t?: string; message?: string } | null = null
        try {
          message = JSON.parse(String(event.data))
        } catch {
          return
        }
        if (!message) return
        if (message.t === 'welcome') {
          const welcome = message as Welcome
          welcomed = true
          failed = false
          sim.id = welcome.id
          sim.name = welcome.name
          sim.color = welcome.color
          sim.guest = false
          welcomeRef.current({
            id: welcome.id,
            name: welcome.name,
            token,
            color: welcome.color,
          })
          publishRoster()
        } else if (message.t === 'snapshot') {
          applySnapshot(message as Snapshot)
        } else if (message.t === 'replaced') {
          stopped = true
          sim.status = 'offline'
          ws.close()
        } else if (message.t === 'auth_error') {
          stopped = true
          sim.status = 'offline'
          rejectRef.current?.(message.message || 'Sign in on the family site to walk the grounds.')
          ws.close()
        }
      }
      ws.onclose = (event) => {
        if (stopped || event.code === 4000) {
          stopped = true
          sim.status = 'offline'
          return
        }
        sim.status = 'offline'
        if (!welcomed) {
          failed = true
          statusRef.current?.('offline')
        }
        window.setTimeout(connect, delay)
        delay = Math.min(8000, delay * 2)
      }
      ws.onerror = () => {
        if (!stopped && !welcomed) {
          failed = true
          statusRef.current?.('offline')
        }
        ws.close()
      }
    }

    void connect()
    sendTimer = window.setInterval(sendState, 80)
    presenceTimer = window.setInterval(publishRoster, 1000)

    return () => {
      stopped = true
      window.clearInterval(sendTimer)
      window.clearInterval(presenceTimer)
      socket?.close()
      net.remotes.clear()
      sim.roster = []
      sim.status = 'offline'
    }
  }, [member.token])
}
