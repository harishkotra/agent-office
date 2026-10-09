import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { accountMessage } from './profileName'
import {
  ACCOUNT_NOT_READY_TEXT,
  CHECKING_HEADING,
  CHECKING_LIMIT_MS,
  FAMILY_SITE_BUTTON,
  GROUNDS_CLOSED_TEXT,
  PRESENCE_OFFLINE_TEXT,
  PROFILE_MISMATCH_TEXT,
  SIGN_IN_BUTTON,
  SIGN_IN_TEXT,
  TRY_NOW_LABEL,
  bootBlock,
  checkingExpired,
  nextRetry,
  presenceRejection,
  releasedVisit,
  retryButtonDisabled,
  retryDelay,
  retryLine,
  waitingAction,
  waitingCopy,
} from './wait'

describe('presence waiting copy', () => {
  it('treats a server profile rejection separately from a sign-in failure', () => {
    expect(presenceRejection('This account is not on the site member list.')).toBe('profile')
    expect(presenceRejection('This profile has no name yet.')).toBe('name')
    expect(presenceRejection('Sign in on the family site to walk the grounds.')).toBe('signin')
    expect(presenceRejection('Family sign-in could not be checked. Sign in again on the family site.')).toBe('signin')
    expect(presenceRejection('Confirm your phone on the family site before walking the grounds.')).toBe('phone')
    expect(presenceRejection('Your session ended. Sign in again on the family site.')).toBe('signin')
    expect(ACCOUNT_NOT_READY_TEXT).toBe("Your account isn't ready for the estate yet. Check the family site.")
    expect(ACCOUNT_NOT_READY_TEXT).not.toMatch(/teen|minor|phone/i)
    expect(ACCOUNT_NOT_READY_TEXT).not.toMatch(/\d{3}[-.\s)]/)
    expect(retryButtonDisabled(true)).toBe(true)
    expect(retryButtonDisabled(false)).toBe(false)
    expect(accountMessage('signin')).toBe(`${SIGN_IN_TEXT}.`)
    expect(nextRetry(8)).toBe(7)
    expect(nextRetry(0)).toBe(0)
  })

  it('keeps the profile sentence off the sign-in line', () => {
    expect(SIGN_IN_TEXT).not.toMatch(/site profile/)
    expect(PROFILE_MISMATCH_TEXT).toMatch(/site profile/)
    expect(SIGN_IN_BUTTON).toBe('Sign in on the family site')
    expect(FAMILY_SITE_BUTTON).toBe('Go to the family site')
    expect(TRY_NOW_LABEL).toBe('Try now')
    expect(GROUNDS_CLOSED_TEXT).toBe('The grounds stay closed until family presence is back.')
  })

  it('holds checking until the session resolves, then stops at 15 seconds', () => {
    expect(CHECKING_LIMIT_MS).toBe(15_000)
    expect(checkingExpired(14_999)).toBe(false)
    expect(checkingExpired(15_000)).toBe(true)
    expect(waitingCopy('checking')).toEqual({ heading: CHECKING_HEADING, role: 'status' })
    expect(CHECKING_HEADING).toBe('Checking your account…')
  })

  it('retries presence at 2, 4, 8, 16, then every 30 seconds', () => {
    expect([0, 1, 2, 3, 4, 5].map(retryDelay)).toEqual([2, 4, 8, 16, 30, 30])
    expect(retryLine(4)).toBe('Trying again in 4 s')
    expect(waitingCopy('offline')).toEqual({ heading: PRESENCE_OFFLINE_TEXT, role: 'status' })
    expect(waitingAction('offline')).toBe('retry')
  })

  it('sends phone, name, and profile failures to the family site', () => {
    expect(bootBlock(accountMessage('phone'))).toBe('phone')
    expect(bootBlock(accountMessage('name'))).toBe('name')
    expect(bootBlock(accountMessage('profile'))).toBe('profile')
    expect(bootBlock(accountMessage('signin'))).toBeNull()
    expect(waitingCopy('phone')).toEqual({ heading: ACCOUNT_NOT_READY_TEXT, role: 'alert' })
    expect(waitingCopy('name')).toEqual({ heading: accountMessage('name'), role: 'alert' })
    expect(waitingCopy('profile')).toEqual({ heading: PROFILE_MISMATCH_TEXT, role: 'alert' })
    expect(waitingAction('phone')).toBe('family-site')
    expect(waitingAction('signed-out')).toBe('sign-in')
    expect(waitingCopy('signed-out').heading).toBe(SIGN_IN_TEXT)
    for (const heading of [ACCOUNT_NOT_READY_TEXT, PROFILE_MISMATCH_TEXT, SIGN_IN_TEXT, accountMessage('name')]) {
      expect(heading).not.toMatch(/@|example\.com|\d{3}[-.\s]\d{3}/)
    }
  })

  it('drops the visit when the session ends', () => {
    expect(releasedVisit()).toEqual({
      name: '',
      id: '',
      color: '#e15a3a',
      guest: false,
      status: 'offline',
      roster: [],
    })
  })

  it('uses the sign-in heading on the gate and the checking limit in the app', () => {
    const gate = readFileSync(new URL('./ui/Gate.tsx', import.meta.url), 'utf8')
    const app = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8')
    expect(gate).toContain('SIGN_IN_TEXT')
    expect(gate).toContain('heading.current?.focus()')
    expect(gate).not.toMatch(/type="password"|type="email"|Walk the grounds together/)
    expect(app).toContain('CHECKING_LIMIT_MS')
    expect(app).toContain('releaseVisit()')
    expect(app).not.toMatch(/type="password"|type="email"/)
  })
})