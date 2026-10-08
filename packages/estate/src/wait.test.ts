import { describe, expect, it } from 'vitest'
import { ACCOUNT_NOT_READY_TEXT, nextRetry, presenceRejection, PROFILE_MISMATCH_TEXT, retryButtonDisabled, SIGN_IN_TEXT } from './wait'
import { accountMessage } from './profileName'

describe('presence waiting copy', () => {
  it('treats a server profile rejection separately from a sign-in failure', () => {
    expect(presenceRejection('This account is not on the site member list.')).toBe('profile')
    expect(presenceRejection('This profile has no name yet.')).toBe('profile')
    expect(presenceRejection('Sign in on the family site to walk the grounds.')).toBe('signin')
    expect(presenceRejection('Family sign-in could not be checked. Sign in again on the family site.')).toBe('signin')
    expect(presenceRejection('Confirm your phone on the family site before walking the grounds.')).toBe('phone')
    expect(ACCOUNT_NOT_READY_TEXT).toBe("Your account isn't ready for the estate yet. Check the family site.")
    expect(ACCOUNT_NOT_READY_TEXT).not.toMatch(/teen|minor|phone/i)
    expect(retryButtonDisabled(true)).toBe(true)
    expect(retryButtonDisabled(false)).toBe(false)
    expect(accountMessage('signin').endsWith('to visit the estate.')).toBe(true)
    expect(nextRetry(8)).toBe(7)
    expect(nextRetry(0)).toBe(0)
  })

  it('keeps the profile sentence off the sign-in line', () => {
    expect(SIGN_IN_TEXT).not.toMatch(/site profile/)
    expect(PROFILE_MISMATCH_TEXT).toMatch(/site profile/)
  })
})
