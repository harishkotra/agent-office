import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { requirePhoneVerified } from './auth'
import { accountMessage } from './profileName'

describe('phone verification', () => {
  it('accepts only a true result from the member session', () => {
    expect(() => requirePhoneVerified(true, null)).not.toThrow()
    expect(() => requirePhoneVerified(false, null)).toThrow(accountMessage('phone'))
    expect(() => requirePhoneVerified(null, null)).toThrow(accountMessage('phone'))
    expect(() => requirePhoneVerified(true, { message: 'denied' })).toThrow(accountMessage('phone'))
  })

  it('calls am_i_phone_verified and does not use a service key or app_private', () => {
    const source = readFileSync(new URL('./auth.ts', import.meta.url), 'utf8')
    const gate = readFileSync(new URL('./ui/Gate.tsx', import.meta.url), 'utf8')
    expect(source).toContain("rpc('am_i_phone_verified')")
    expect(source).not.toMatch(/app_private|service_role|signInWithPassword/)
    expect(source).not.toMatch(/select\([^)]*phone/)
    expect(gate).not.toMatch(/type="password"|signIn\(/)
    expect(gate).toContain('/estate/')
    expect(gate).toContain('estate-return')
    expect(gate).not.toContain('mccowan-estate-return')
  })
})
