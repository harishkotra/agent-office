export type Prompt = {
  id: string
  kind: 'door' | 'floor' | 'bookshelf'
  text: string
}

export const transit = {
  x: null as number | null,
  z: null as number | null,
  zone: '',
}

export function requestTravel(x: number, z: number, zone: string) {
  transit.x = x
  transit.z = z
  transit.zone = zone
}

export const play = {
  prompt: null as Prompt | null,
  feedback: '',
  feedbackUntil: 0,
  directory: false,
  travel: false,
  cue: '',
  revision: 0,
}

const listeners = new Set<() => void>()

export function subscribePlay(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function publishPlay(patch: Partial<typeof play>) {
  let changed = false
  for (const key of Object.keys(patch) as (keyof typeof play)[]) {
    if (play[key] !== patch[key]) changed = true
  }
  if (!changed) return
  Object.assign(play, patch)
  play.revision += 1
  for (const listener of listeners) listener()
}
