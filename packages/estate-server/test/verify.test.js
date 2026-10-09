import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { verifyFamilyToken } from '../src/verify.js'

const USER = '11111111-1111-4111-8111-111111111111'
const TOKEN = 'member-token-abcdefghijklmnopqrst'

function json(body, ok = true) {
  return { ok, status: ok ? 200 : 401, json: async () => body }
}

test('the phone check calls public.am_i_phone_verified with the member session', async () => {
  const source = readFileSync(new URL('../src/verify.js', import.meta.url), 'utf8')
  assert.match(source, /rpc\/am_i_phone_verified/)
  assert.equal(source.includes('app_private'), false)
  assert.equal(source.includes('service_role'), false)
  assert.equal(source.includes('SUPABASE_SERVICE'), false)

  const original = global.fetch
  global.fetch = async (url, opts = {}) => {
    const href = String(url)
    if (href.endsWith('/auth/v1/user')) return json({ id: USER })
    if (href.includes('/rest/v1/profiles')) {
      assert.equal(href.includes('phone'), false)
      return json([{ first_name: 'Ada', last_name: 'Example' }])
    }
    if (href.endsWith('/rest/v1/rpc/am_i_phone_verified')) {
      assert.equal(opts.headers.Authorization, `Bearer ${TOKEN}`)
      assert.equal(opts.body, '{}')
      return json(false)
    }
    throw new Error('unexpected presence check')
  }
  try {
    const denied = await verifyFamilyToken(TOKEN)
    assert.match(denied.error, /phone/i)
    global.fetch = async (url, opts = {}) => {
      const href = String(url)
      if (href.endsWith('/auth/v1/user')) return json({ id: USER })
      if (href.includes('/rest/v1/profiles')) return json([{ first_name: 'Ada', last_name: 'Example' }])
      if (href.endsWith('/rest/v1/rpc/am_i_phone_verified')) {
        assert.equal(opts.headers.Authorization, `Bearer ${TOKEN}`)
        return json(true)
      }
      throw new Error('unexpected presence check')
    }
    const allowed = await verifyFamilyToken(TOKEN)
    assert.equal(allowed.id, USER)
    assert.equal(allowed.name, 'Ada Example')
    assert.equal('token' in allowed, false)
  } finally {
    global.fetch = original
  }
})
