import test from 'node:test'
import assert from 'node:assert/strict'
import { WebSocket } from 'ws'
import { EstateRoom } from '../src/room.js'
import { startPresence } from '../src/server.js'
import { cleanName, colorFor } from '../src/names.js'

function once(socket, pred, timeout = 2000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('message', onMessage)
      reject(new Error('timed out waiting for a presence message'))
    }, timeout)
    function onMessage(buf) {
      const msg = JSON.parse(buf.toString())
      if (!pred(msg)) return
      clearTimeout(timer)
      socket.off('message', onMessage)
      resolve(msg)
    }
    socket.on('message', onMessage)
  })
}

function opened(socket) {
  return new Promise((resolve, reject) => {
    socket.once('open', resolve)
    socket.once('error', reject)
  })
}

test('names and colors stay stable and safe', () => {
  assert.equal(cleanName('  Ada\nMcCowan  '), 'Ada McCowan')
  assert.equal(cleanName(''), 'Guest')
  assert.equal(cleanName('x'.repeat(80)).length, 40)
  assert.equal(colorFor('same-person'), colorFor('same-person'))
  assert.notEqual(colorFor('same-person'), colorFor('other-person'))
})

test('a room keeps the latest place for each person', () => {
  const room = new EstateRoom()
  const socket = { readyState: 1, close() {}, send() {} }
  room.join(socket, { id: 'abc', name: 'Ada', verified: true })
  assert.equal(room.applyState(socket, { x: 12, y: 1, z: -4, yaw: 1.2, anim: 'run', zone: 'Orchard' }), true)
  const snap = room.snapshot()
  assert.equal(snap.players[0].zone, 'Orchard')
  assert.equal(snap.players[0].guest, false)
  assert.equal(snap.players[0].anim, 'run')
  assert.equal(room.leave(socket), true)
  assert.equal(room.snapshot().players.length, 0)
})

test('two guests see each other on the grounds', async () => {
  const presence = await startPresence(0)
  const ada = new WebSocket(presence.url)
  const bea = new WebSocket(presence.url)
  try {
    await Promise.all([opened(ada), opened(bea)])
    const welcomePromise = once(ada, (msg) => msg.t === 'welcome')
    ada.send(JSON.stringify({ t: 'join', name: 'Ada', guest: true }))
    bea.send(JSON.stringify({ t: 'join', name: 'Bea', guest: true }))
    const welcome = await welcomePromise
    assert.equal(welcome.name, 'Ada')
    assert.equal(welcome.guest, true)
    const seenPromise = once(
      bea,
      (msg) => msg.t === 'snapshot' && msg.players.some((player) => player.name === 'Ada' && player.zone === 'Fountain Court'),
    )
    ada.send(JSON.stringify({ t: 'state', x: 4, y: 1, z: 30, yaw: 0.4, anim: 'walk', zone: 'Fountain Court' }))
    const seen = await seenPromise
    assert.equal(seen.players.some((player) => player.name === 'Bea'), true)
  } finally {
    ada.close()
    bea.close()
    await presence.close()
  }
})

test('a bad family token does not enter as that member', async () => {
  const presence = await startPresence(0)
  const socket = new WebSocket(presence.url)
  try {
    await opened(socket)
    const errorPromise = once(socket, (item) => item.t === 'auth_error')
    socket.send(JSON.stringify({ t: 'join', name: 'Pat', token: 'nope', guest: false }))
    const msg = await errorPromise
    assert.match(msg.message, /sign-in/i)
    assert.equal(presence.room.count(), 0)
  } finally {
    socket.close()
    await presence.close()
  }
})
