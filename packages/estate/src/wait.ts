import { accountMessage } from './profileName'

export const SIGN_IN_TEXT = 'Sign in on the family site to visit the estate'
export const SIGN_IN_BUTTON = 'Sign in on the family site'
export const PRESENCE_OFFLINE_TEXT = 'Family presence is offline right now.'
export const PROFILE_MISMATCH_TEXT = 'Your family sign-in has to match a site profile before you step onto the grounds.'
export const GROUNDS_CLOSED_TEXT = 'The grounds stay closed until family presence is back.'
export const FAMILY_SITE_BUTTON = 'Go to the family site'
export const TRY_NOW_LABEL = 'Try now'
export const CHECKING_HEADING = 'Checking your account…'
export const CHECKING_LIMIT_MS = 15_000

export const ACCOUNT_NOT_READY_TEXT = "Your account isn't ready for the estate yet. Check the family site."

const RETRY_STEPS_S = [2, 4, 8, 16, 30] as const

export type WaitingMode = 'checking' | 'connecting' | 'signed-out' | 'offline' | 'profile' | 'phone' | 'name'

export function retryButtonDisabled(attempting: boolean): boolean {
  return attempting
}

export function presenceRejection(message: string): 'profile' | 'signin' | 'phone' | 'name' {
  if (/phone/i.test(message)) return 'phone'
  if (/no name yet/i.test(message)) return 'name'
  if (/member list/i.test(message)) return 'profile'
  return 'signin'
}

export function bootBlock(message: string): 'phone' | 'profile' | 'name' | null {
  if (message === accountMessage('phone')) return 'phone'
  if (message === accountMessage('name')) return 'name'
  if (message === accountMessage('profile')) return 'profile'
  return null
}

export function checkingExpired(elapsedMs: number): boolean {
  return elapsedMs >= CHECKING_LIMIT_MS
}

export function retryDelay(attempt: number): number {
  const index = Math.min(Math.max(0, Math.floor(attempt)), RETRY_STEPS_S.length - 1)
  return RETRY_STEPS_S[index]
}

export function nextRetry(seconds: number): number {
  return Math.max(0, seconds - 1)
}

export function retryLine(seconds: number): string {
  return `Trying again in ${seconds} s`
}

export function waitingCopy(mode: WaitingMode): { heading: string; role: 'status' | 'alert' | null } {
  if (mode === 'checking' || mode === 'connecting') return { heading: CHECKING_HEADING, role: 'status' }
  if (mode === 'signed-out') return { heading: SIGN_IN_TEXT, role: null }
  if (mode === 'phone') return { heading: ACCOUNT_NOT_READY_TEXT, role: 'alert' }
  if (mode === 'name') return { heading: accountMessage('name'), role: 'alert' }
  if (mode === 'profile') return { heading: PROFILE_MISMATCH_TEXT, role: 'alert' }
  return { heading: PRESENCE_OFFLINE_TEXT, role: 'status' }
}

export function waitingAction(mode: WaitingMode): 'sign-in' | 'family-site' | 'retry' | null {
  if (mode === 'signed-out') return 'sign-in'
  if (mode === 'phone' || mode === 'profile' || mode === 'name') return 'family-site'
  if (mode === 'offline') return 'retry'
  return null
}

export function releasedVisit() {
  return {
    name: '',
    id: '',
    color: '#e15a3a',
    guest: false,
    status: 'offline' as const,
    roster: [] as [],
  }
}
