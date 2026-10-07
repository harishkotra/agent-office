import { describe, expect, it } from 'vitest'
import { presenceRejection, PROFILE_MISMATCH_TEXT, SIGN_IN_TEXT } from './wait'

describe('presence waiting copy', () => {
  it('treats a server profile rejection separately from a sign-in failure', () => {
    expect(presenceRejection('This account is not on the site member list.')).toBe('profile')
    expect(presenceRejection('This profile has no name yet.')).toBe('profile')
    expect(presenceRejection('Sign in on the family site to walk the grounds.')).toBe('signin')
    expect(presenceRejection('Family sign-in could not be checked. Sign in again on the family site.')).toBe('signin')
  })

  it('keeps the profile sentence off the sign-in line', () => {
    expect(SIGN_IN_TEXT).not.toMatch(/site profile/)
    expect(PROFILE_MISMATCH_TEXT).toMatch(/site profile/)
  })
})
