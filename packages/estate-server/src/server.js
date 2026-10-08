import http from 'node:http'
import { WebSocketServer } from 'ws'
import { EstateRoom, dueForRecheck } from './room.js'
import { accountMessage } from './profile.js'
import { tokenExpiry, verifyFamilyToken } from './verify.js'
import { edgeAddress } from './edge.js'

const MAX_PLAYERS = 40
const JOIN_WINDOW_MS = 10_000
const JOIN_MAX = 6
const joinHits = new Map()

export function devMode() {
  return process.env.ESTATE_DEV === '1'
}

export function originAllowed(origin, dev = devMode()) {
  if (!origin) return dev
  let url
  try {
    url = new URL(origin)
  } catch {
    return false
  }
  const host = url.hostname
  if (host === 'localhost' || host === '127.0.0.1') {
    return dev && (url.protocol === 'http:' || url.protocol === 'https:')
  }
  if (host === 'mccowanestate.com' || host === 'www.mccowanestate.com') return url.protocol === 'https:'
  return false
}

export function allowJoin(ip, now = Date.now()) {
  if (!ip) return false
  const hits = (joinHits.get(ip) || []).filter((at) => now - at < JOIN_WINDOW_MS)
  if (hits.length >= JOIN_MAX) {
    joinHits.set(ip, hits)
    return false
  }
  hits.push(now)
  joinHits.set(ip, hits)
  return true
}

export function allowEdgeJoin(headers, socketAddress = '', now = Date.now()) {
  return allowJoin(edgeAddress(headers) || socketAddress, now)
}

function send(socket, message) {
  if (socket.readyState !== 1) return
  socket.send(JSON.stringify(message))
}

function sendToSignedIn(room, message) {
  const raw = JSON.stringify(message)
  for (const socket of room.bySocket.keys()) {
    if (socket.readyState === 1) socket.send(raw)
  }
}

async function acceptJoin(room, socket, msg) {
  if (msg.guest === true || typeof msg.token !== 'string') {
    send(socket, { t: 'auth_error', message: accountMessage('signin') })
    return null
  }
  if (!allowEdgeJoin(socket.clientHeaders, socket.clientAddress || '')) {
    send(socket, { t: 'auth_error', message: 'Too many sign-in attempts. Wait a moment and try again.' })
    return null
  }
  if (room.count() >= MAX_PLAYERS && !room.bySocket.has(socket)) {
    send(socket, { t: 'auth_error', message: 'The grounds are full right now.' })
    return null
  }
  const verified = await verifyFamilyToken(msg.token)
  if (!verified || verified.error || !verified.id) {
    send(socket, { t: 'auth_error', message: verified?.error || accountMessage('auth') })
    return null
  }
  const player = room.join(socket, {
    id: verified.id,
    name: verified.name,
    verified: true,
    tabId: msg.tabId,
    token: msg.token,
    exp: tokenExpiry(msg.token),
  })
  if (player && player.replaced) {
    send(socket, { t: 'replaced', message: 'A newer tab is already on the grounds.' })
    return null
  }
  if (!player) {
    send(socket, { t: 'auth_error', message: accountMessage('signin') })
    return null
  }
  send(socket, {
    t: 'welcome',
    id: player.id,
    name: player.name,
    color: player.color,
    verified: true,
  })
  return player
}

export async function dropExpired(room, verify = verifyFamilyToken, now = Date.now()) {
  let changed = false
  for (const player of [...room.players.values()]) {
    if (!dueForRecheck(player, now)) continue
    let again = null
    try {
      again = await verify(player.token)
    } catch {
      again = { error: accountMessage('auth') }
    }
    const still = again && !again.error && again.id === player.userId
    if (!still) {
      try {
        player.socket.close(4001, 'session ended')
      } catch {
        // The socket may already be gone.
      }
      if (room.leave(player.socket)) changed = true
      continue
    }
    player.checkedAt = now
  }
  return changed
}

export function bindSocket(socket, room, wss) {
  socket.isAlive = true
  socket.on('pong', () => {
    socket.isAlive = true
  })
  socket.on('message', async (buf) => {
    const raw = typeof buf === 'string' ? buf : buf.toString()
    if (raw.length > 8192) return
    let msg
    try {
      msg = JSON.parse(raw)
    } catch {
      return
    }
    if (!msg || typeof msg !== 'object') return
    if (msg.t === 'join') {
      if (room.bySocket.has(socket)) return
      const player = await acceptJoin(room, socket, msg)
      if (player) sendToSignedIn(room, room.snapshot())
      return
    }
    if (msg.t === 'state') room.applyState(socket, msg)
  })
  socket.on('close', () => {
    if (room.leave(socket)) sendToSignedIn(room, room.snapshot())
  })
}

export function startPresence(port = 0) {
  const room = new EstateRoom()
  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: true, players: room.count() }))
      return
    }
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('McCowan estate presence')
  })
  const wss = new WebSocketServer({
    server,
    maxPayload: 8192,
    verifyClient({ origin }, callback) {
      if (!originAllowed(origin)) {
        callback(false, 403, 'Origin not allowed')
        return
      }
      callback(true)
    },
  })
  wss.on('connection', (socket, request) => {
    socket.clientHeaders = request?.headers
    socket.clientAddress = request?.socket?.remoteAddress || socket._socket?.remoteAddress || ''
    bindSocket(socket, room, wss)
  })
  const pulse = setInterval(() => {
    if (room.count() > 0) sendToSignedIn(room, room.snapshot())
    for (const client of wss.clients) {
      if (client.isAlive === false) {
        client.terminate()
        continue
      }
      client.isAlive = false
      client.ping()
    }
  }, 1000 / 15)
  const expiry = setInterval(() => {
    dropExpired(room).then((changed) => {
      if (changed) sendToSignedIn(room, room.snapshot())
    })
  }, 15000)
  pulse.unref?.()
  expiry.unref?.()

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      const address = server.address()
      const listening = typeof address === 'object' && address ? address.port : port
      resolve({
        port: listening,
        url: `ws://127.0.0.1:${listening}`,
        room,
        close() {
          clearInterval(pulse)
          clearInterval(expiry)
          for (const client of wss.clients) client.close()
          wss.close()
          return new Promise((done) => server.close(() => done()))
        },
      })
    })
  })
}
