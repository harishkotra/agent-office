import test from 'node:test'
import assert from 'node:assert/strict'
import { edgeAddress } from '../src/edge.js'
import { allowEdgeJoin, originAllowed } from '../src/server.js'

test('cloudflare joins use CF-Connecting-IP and fall back to the socket address', () => {
  const now = 5_000_000_000
  assert.equal(edgeAddress(new Headers({ 'CF-Connecting-IP': '198.51.100.8' })), '198.51.100.8')
  assert.equal(edgeAddress(new Headers()), null)
  assert.equal(allowEdgeJoin(new Headers({ 'CF-Connecting-IP': '198.51.100.8' }), '203.0.113.1', now), true)
  assert.equal(allowEdgeJoin(new Headers({ 'CF-Connecting-IP': '198.51.100.9' }), '203.0.113.1', now), true)
  for (let i = 0; i < 5; i++) allowEdgeJoin(new Headers({ 'CF-Connecting-IP': '198.51.100.8' }), `203.0.113.${i}`, now)
  assert.equal(allowEdgeJoin(new Headers({ 'CF-Connecting-IP': '198.51.100.8' }), '203.0.113.99', now), false)
  assert.equal(allowEdgeJoin(new Headers(), '203.0.113.77', now), true)
  for (let i = 0; i < 5; i++) allowEdgeJoin(new Headers(), '203.0.113.77', now)
  assert.equal(allowEdgeJoin(new Headers(), '203.0.113.77', now), false)
  assert.equal(allowEdgeJoin(new Headers(), '203.0.113.78', now), true)
})

test('localhost and missing origins are allowed only with ESTATE_DEV=1', () => {
  const previous = process.env.ESTATE_DEV
  delete process.env.ESTATE_DEV
  assert.equal(originAllowed('http://localhost:5174'), false)
  assert.equal(originAllowed('http://127.0.0.1:8787'), false)
  assert.equal(originAllowed(''), false)
  assert.equal(originAllowed('https://mccowanestate.com'), true)
  process.env.ESTATE_DEV = '1'
  assert.equal(originAllowed('http://localhost:5174'), true)
  assert.equal(originAllowed(''), true)
  if (previous === undefined) delete process.env.ESTATE_DEV
  else process.env.ESTATE_DEV = previous
})
