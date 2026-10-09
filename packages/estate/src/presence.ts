import { useEffect, useRef } from 'react'
import type { Anim } from './movement'
import { currentToken, type Member } from './auth'
import { colorFor, presenceUrl } from './family'
import { pushSample, type Track } from './netpose'
import { readSnapshot, readWelcome } from './snapshot'
import { sim, type RosterEntry } from './sim'

const pageTab = crypto.randomUUID()

function tabId() {
  return pageTab
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

function applySnapshot(message: unknown) {
  const players = readSnapshot(message, sim.id)
  if (!players) return
  const seen = new Set<string>()
  for (const player of players) {
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
  retry = 0,
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
    let retryTimer = 0
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
      if (stopped) return
      if (!token) {
        rejectRef.current?.('Sign in on the family site to walk the grounds.')
        return
      }
      if (stopped) return
      const ws = new WebSocket(presenceUrl())
      if (stopped) {
        ws.close()
        return
      }
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
          const welcome = readWelcome(message)
          if (!welcome) return
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
          applySnapshot(message)
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
        if (stopped || event.code === 4000 || event.code === 4001) {
          stopped = true
          sim.status = 'offline'
          if (event.code === 4001) {
            rejectRef.current?.('Your session ended. Sign in again on the family site.')
          }
          return
        }
        sim.status = 'offline'
        if (!welcomed) {
          failed = true
          statusRef.current?.('offline')
        }
        const wait = delay + Math.floor(Math.random() * 250)
        retryTimer = window.setTimeout(connect, wait)
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
      window.clearTimeout(retryTimer)
      socket?.close()
      net.remotes.clear()
      sim.roster = []
      sim.status = 'offline'
    }
  }, [member.token, retry])
}
