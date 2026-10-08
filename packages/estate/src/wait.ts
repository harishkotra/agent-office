export const SIGN_IN_TEXT = 'Sign in on the family site to visit the estate'
export const PRESENCE_OFFLINE_TEXT = 'Family presence is offline right now.'
export const PROFILE_MISMATCH_TEXT = 'Your family sign-in has to match a site profile before you step onto the grounds.'

export const PHONE_TEXT = 'Confirm your phone on the family site before walking the grounds.'

export function presenceRejection(message: string): 'profile' | 'signin' | 'phone' {
  if (/phone/i.test(message)) return 'phone'
  if (/member list|no name yet/i.test(message)) return 'profile'
  return 'signin'
}

export function nextRetry(seconds: number): number {
  return Math.max(0, seconds - 1)
}
