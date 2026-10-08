import { describe, expect, it } from 'vitest'
import { assignBinding, controlLines, resetSettings, settings } from './settings'

describe('settings', () => {
  it('keeps two keys and warns when a key is taken', () => {
    resetSettings()
    assignBinding('jump', 'KeyJ')
    assignBinding('jump', 'KeyU')
    expect(settings.bindings.jump).toEqual(['KeyJ', 'KeyU'])
    assignBinding('dive', 'KeyJ')
    expect(settings.bindingWarning).toMatch(/already/i)
    expect(settings.bindings.jump).toEqual(['KeyU'])
    expect(settings.bindings.dive).toContain('KeyJ')
    expect(settings.spoken).toBe(false)
    expect(settings.sound).toBe(true)
  })

  it('builds hints from the bindings', () => {
    resetSettings()
    const lines = controlLines().join(' ')
    expect(lines).toMatch(/Space/)
    expect(lines).toMatch(/C/)
    expect(lines).not.toMatch(/Ctrl/)
  })
})