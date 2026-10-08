import { play, publishPlay } from './play'
import { settings } from './settings'

export function directionWord(yaw: number, x: number, z: number, tx: number, tz: number): string {
  const dx = tx - x
  const dz = tz - z
  const forward = dx * -Math.sin(yaw) + dz * -Math.cos(yaw)
  const right = dx * Math.cos(yaw) + dz * -Math.sin(yaw)
  if (Math.abs(forward) >= Math.abs(right)) return forward >= 0 ? 'ahead' : 'behind'
  return right >= 0 ? 'to your right' : 'to your left'
}

export function stereoPan(yaw: number, x: number, z: number, tx: number, tz: number): number {
  const dx = tx - x
  const dz = tz - z
  const dist = Math.hypot(dx, dz) || 1
  const right = dx * Math.cos(yaw) + dz * -Math.sin(yaw)
  return Math.max(-1, Math.min(1, right / dist))
}

export function placeCue(kind: 'door' | 'floor' | 'bookshelf', dir: string, label: string): string {
  if (kind === 'bookshelf') return `Bookshelf ${dir}. Press to open the family directory.`
  if (kind === 'floor') return `Floor marker ${dir}. Press to enter ${label}.`
  return `Door ${dir}. Press to enter ${label}.`
}

export function walkerCue(name: string, dir: string): string {
  const display = name.replace(/[^\p{L}\p{N} .'-]/gu, '').trim().slice(0, 40)
  return `${display} is nearby, ${dir}.`
}

let audio: AudioContext | null = null

export function blip(pan: number) {
  if (!settings.sound || settings.volume <= 0 || typeof window === 'undefined') return
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctx) return
  try {
    if (!audio) audio = new Ctx()
    void audio.resume()
    const osc = audio.createOscillator()
    const gain = audio.createGain()
    const panner = audio.createStereoPanner()
    osc.frequency.value = 660
    gain.gain.value = 0.04 * settings.volume
    panner.pan.value = pan
    osc.connect(gain)
    gain.connect(panner)
    panner.connect(audio.destination)
    osc.start()
    osc.stop(audio.currentTime + 0.08)
  } catch {
    // Sound is optional.
  }
}

export function announce(text: string) {
  if (!text || play.cue === text) return
  publishPlay({ cue: text })
  if (!settings.spoken || typeof window === 'undefined' || !window.speechSynthesis) return
  const utter = new SpeechSynthesisUtterance(text)
  utter.rate = 1
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(utter)
}
