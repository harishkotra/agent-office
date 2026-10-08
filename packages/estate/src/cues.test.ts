import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { directionWord, placeCue, walkerCue } from './cues'
import { initials, markerColor } from './markers'

describe('cues', () => {
  it('names a door by direction and a walker by display name only', () => {
    expect(directionWord(0, 0, 0, 0, -5)).toBe('ahead')
    expect(directionWord(0, 0, 0, 5, 0)).toBe('to your right')
    expect(placeCue('door', 'ahead', 'Home 1', 'F')).toBe('Door ahead: Home 1. Press F to open.')
    expect(walkerCue('Ada Example', 'to your left')).toBe('Ada Example is nearby, to your left.')
    expect(walkerCue('Ada Example', 'ahead')).not.toMatch(/@|555/)
  })
})

describe('earcons', () => {
  it('follows the volume setting and not reduced motion', () => {
    const source = readFileSync(new URL('./cues.ts', import.meta.url), 'utf8')
    const blip = source.slice(source.indexOf('export function blip'), source.indexOf('export function announce'))
    expect(blip).toMatch(/settings\.volume/)
    expect(blip).not.toMatch(/reducedMotion/)
  })
})

describe('markers', () => {
  it('uses Okabe-Ito colors and initials', () => {
    expect(markerColor('same')).toBe(markerColor('same'))
    expect(markerColor('same')).toMatch(/^#[0-9a-f]{6}$/)
    expect(initials('Ada Example')).toBe('AE')
    expect(initials('Jo')).toBe('J')
  })
})
