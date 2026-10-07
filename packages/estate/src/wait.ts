export const SIGN_IN_TEXT = 'Sign in on the family site to visit the estate'
export const PRESENCE_OFFLINE_TEXT = 'Family presence is offline right now.'
export const PROFILE_MISMATCH_TEXT = 'Your family sign-in has to match a site profile before you step onto the grounds.'

export function presenceRejection(message: string): 'profile' | 'signin' {
  if (/member list|no name yet/i.test(message)) return 'profile'
  return 'signin'
}
