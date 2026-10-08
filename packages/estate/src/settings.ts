export type Action =
  | 'forward'
  | 'back'
  | 'left'
  | 'right'
  | 'run'
  | 'jump'
  | 'dive'
  | 'lookLeft'
  | 'lookRight'
  | 'reset'
  | 'interact'

export const ACTION_LABELS: { id: Action; label: string }[] = [
  { id: 'forward', label: 'Walk forward' },
  { id: 'back', label: 'Walk back' },
  { id: 'left', label: 'Strafe left' },
  { id: 'right', label: 'Strafe right' },
  { id: 'run', label: 'Run' },
  { id: 'jump', label: 'Jump' },
  { id: 'dive', label: 'Dive' },
  { id: 'lookLeft', label: 'Look left' },
  { id: 'lookRight', label: 'Look right' },
  { id: 'reset', label: 'Return to the gate' },
  { id: 'interact', label: 'Interact' },
]

export type FontSize = 'small' | 'medium' | 'large'

const DEFAULT_BINDINGS: Record<Action, string[]> = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  run: ['ShiftLeft', 'ShiftRight'],
  jump: ['Space'],
  dive: ['KeyC', 'KeyV'],
  lookLeft: ['KeyQ'],
  lookRight: ['KeyE'],
  reset: ['KeyR'],
  interact: ['KeyF'],
}

const STORAGE_KEY = 'mccowan-estate-play'

export const settings = {
  bindings: structuredClone(DEFAULT_BINDINGS),
  font: 'medium' as FontSize,
  reducedMotion: false,
  colorblind: false,
  spoken: false,
  sound: true,
  sensitivity: 1,
  invertY: false,
  volume: 0.7,
  runToggle: false,
  running: false,
  bindingWarning: '',
  paused: false,
  listening: null as Action | null,
  revision: 0,
}

const listeners = new Set<() => void>()

function prefersReduced() {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

function emit() {
  settings.revision += 1
  applyDom()
  for (const listener of listeners) listener()
}

export function subscribeSettings(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function codeLabel(code: string): string {
  if (code === 'Space') return 'Space'
  if (code.startsWith('Key')) return code.slice(3)
  if (code.startsWith('Arrow')) return code.slice(5)
  if (code.startsWith('Shift')) return 'Shift'
  if (code.startsWith('Control')) return 'Ctrl'
  return code
}

export function bindingLabel(action: Action): string {
  const keys = settings.bindings[action]
  return keys.length ? keys.map(codeLabel).join(' / ') : 'Unbound'
}

export function held(keys: Record<string, boolean>, action: Action): boolean {
  return settings.bindings[action].some((code) => keys[code])
}

export function gamepadPressed(button: number): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return false
  for (const pad of navigator.getGamepads()) {
    if (pad?.buttons[button]?.pressed) return true
  }
  return false
}

export function jumpHeldNow(keys: Record<string, boolean>, touchJump: boolean, padJump: boolean): boolean {
  return held(keys, 'jump') || touchJump || padJump
}

function applyDom() {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.font = settings.font
  document.documentElement.dataset.motion = settings.reducedMotion ? 'reduce' : 'full'
  document.documentElement.dataset.markers = settings.colorblind ? 'safe' : 'color'
}

export function loadSettings() {
  settings.reducedMotion = prefersReduced()
  if (typeof localStorage === 'undefined') {
    applyDom()
    return
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      applyDom()
      return
    }
    const data = JSON.parse(raw) as Partial<typeof settings>
    if (data.font === 'small' || data.font === 'medium' || data.font === 'large') settings.font = data.font
    if (typeof data.reducedMotion === 'boolean') settings.reducedMotion = data.reducedMotion
    if (typeof data.colorblind === 'boolean') settings.colorblind = data.colorblind
    if (typeof data.spoken === 'boolean') settings.spoken = data.spoken
    if (typeof data.sound === 'boolean') settings.sound = data.sound
    if (typeof data.invertY === 'boolean') settings.invertY = data.invertY
    if (typeof data.runToggle === 'boolean') settings.runToggle = data.runToggle
    if (typeof data.sensitivity === 'number' && data.sensitivity >= 0.2 && data.sensitivity <= 3) settings.sensitivity = data.sensitivity
    if (typeof data.volume === 'number' && data.volume >= 0 && data.volume <= 1) settings.volume = data.volume
    if (data.bindings && typeof data.bindings === 'object') {
      for (const action of ACTION_LABELS) {
        const next = data.bindings[action.id]
        if (Array.isArray(next) && next.every((code) => typeof code === 'string' && code.length < 32)) {
          settings.bindings[action.id] = next.filter((code) => code !== 'ControlLeft' && code !== 'ControlRight')
        }
      }
    }
  } catch {
    settings.bindings = structuredClone(DEFAULT_BINDINGS)
  }
  applyDom()
}

function persist() {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        bindings: settings.bindings,
        font: settings.font,
        reducedMotion: settings.reducedMotion,
        colorblind: settings.colorblind,
        spoken: settings.spoken,
        sound: settings.sound,
        sensitivity: settings.sensitivity,
        invertY: settings.invertY,
        volume: settings.volume,
        runToggle: settings.runToggle,
      }),
    )
  } catch {
    // Private browsing can refuse storage.
  }
}

export function controlLines(): string[] {
  return [
    `${bindingLabel('forward')} to walk`,
    `${bindingLabel('run')} to run`,
    `${bindingLabel('jump')} to jump`,
    `${bindingLabel('dive')} to dive`,
    `${bindingLabel('lookLeft')} and ${bindingLabel('lookRight')} to look`,
    `${bindingLabel('interact')} to use a door`,
    `${bindingLabel('reset')} to return to the gate`,
  ]
}

export function setPaused(paused: boolean) {
  settings.paused = paused
  settings.listening = null
  emit()
}

export function patchOptions(
  patch: Partial<Pick<typeof settings, 'font' | 'reducedMotion' | 'colorblind' | 'spoken' | 'sound' | 'sensitivity' | 'invertY' | 'volume' | 'runToggle'>>,
) {
  Object.assign(settings, patch)
  persist()
  emit()
}

export function listenFor(action: Action) {
  settings.listening = action
  emit()
}

export function assignBinding(action: Action, code: string) {
  if (code === 'Escape' || code === 'Tab' || code.startsWith('Control')) {
    settings.listening = null
    emit()
    return
  }
  let warning = ''
  for (const item of ACTION_LABELS) {
    if (item.id === action || !settings.bindings[item.id].includes(code)) continue
    warning = `${codeLabel(code)} is already ${item.label}. It moved.`
    settings.bindings[item.id] = settings.bindings[item.id].filter((bound) => bound !== code)
  }
  const kept = settings.bindings[action].filter((bound) => bound !== code)
  settings.bindings[action] = [...kept, code].slice(-2)
  settings.bindingWarning = warning
  settings.listening = null
  persist()
  emit()
}

export function resetSettings() {
  const paused = settings.paused
  settings.bindings = structuredClone(DEFAULT_BINDINGS)
  settings.font = 'medium'
  settings.reducedMotion = prefersReduced()
  settings.colorblind = false
  settings.spoken = false
  settings.sound = true
  settings.sensitivity = 1
  settings.invertY = false
  settings.volume = 0.7
  settings.runToggle = false
  settings.running = false
  settings.bindingWarning = ''
  settings.paused = paused
  settings.listening = null
  persist()
  emit()
}
