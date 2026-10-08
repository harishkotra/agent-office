export const SIGN_IN_TEXT = 'Sign in on the family site to visit the estate'
export const PRESENCE_OFFLINE_TEXT = 'Family presence is offline right now.'
export const PROFILE_MISMATCH_TEXT = 'Your family sign-in has to match a site profile before you step onto the grounds.'

export const ACCOUNT_NOT_READY_TEXT = "Your account isn't ready for the estate yet. Check the family site."

export function retryButtonDisabled(attempting: boolean): boolean {
  return attempting
}

export function presenceRejection(message: string): 'profile' | 'signin' | 'phone' {
  if (/phone/i.test(message)) return 'phone'
  if (/member list|no name yet/i.test(message)) return 'profile'
  return 'signin'
}

export function nextRetry(seconds: number): number {
  return Math.max(0, seconds - 1)
}
