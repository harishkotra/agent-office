import http from 'node:http'
import { randomUUID } from 'node:crypto'
import { WebSocketServer } from 'ws'
import { EstateRoom } from './room.js'
import { cleanName } from './names.js'
import { verifyFamilyToken } from './verify.js'

const MAX_PLAYERS = 40

function send(socket, message) {
  if (socket.readyState !== 1) return
  socket.send(JSON.stringify(message))
}

function broadcast(wss, message) {
  const raw = JSON.stringify(message)
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(raw)
  }
}

async function acceptJoin(room, socket, msg) {
  if (room.count() >= MAX_PLAYERS && !room.bySocket.has(socket)) {
    send(socket, { t: 'auth_error', message: 'The grounds are full right now.' })
    return null
  }
  let verified = null
  if (msg.token) verified = await verifyFamilyToken(msg.token)
  if (msg.token && !verified && msg.guest !== true) {
    send(socket, {
      t: 'auth_error',
      message: 'Family sign-in could not be checked. Enter as a guest or try again.',
    })
    return null
  }
  const id = verified?.id || `guest_${randomUUID()}`
  const name = verified?.name || cleanName(msg.name)
  const player = room.join(socket, { id, name, verified: !!verified })
  send(socket, {
    t: 'welcome',
    id: player.id,
    name: player.name,
    color: player.color,
    guest: player.guest,
    verified: player.verified,
  })
  return player
}

export function bindSocket(socket, room, wss) {
  socket.isAlive = true
  socket.on('pong', () => {
    socket.isAlive = true
  })
  socket.on('message', async (buf) => {
    const raw = typeof buf === 'string' ? buf : buf.toString()
    if (raw.length > 8000) return
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
      if (player) broadcast(wss, room.snapshot())
      return
    }
    if (msg.t === 'state') room.applyState(socket, msg)
  })
  socket.on('close', () => {
    if (room.leave(socket)) broadcast(wss, room.snapshot())
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
  const wss = new WebSocketServer({ server })
  wss.on('connection', (socket) => bindSocket(socket, room, wss))
  const pulse = setInterval(() => {
    if (room.count() > 0) broadcast(wss, room.snapshot())
    for (const client of wss.clients) {
      if (client.isAlive === false) {
        client.terminate()
        continue
      }
      client.isAlive = false
      client.ping()
    }
  }, 1000 / 15)
  pulse.unref?.()

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
          for (const client of wss.clients) client.close()
          wss.close()
          return new Promise((done) => server.close(() => done()))
        },
      })
    })
  })
}
