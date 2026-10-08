export const OKABE_ITO = ['#e69f00', '#56b4e9', '#009e73', '#f0e442', '#0072b2', '#d55e00', '#cc79a7', '#000000'] as const

const COLOR_RE = /^#[0-9a-f]{6}$/

const INK_ON_LIGHT = new Set(['#e69f00', '#56b4e9', '#009e73', '#f0e442', '#cc79a7', '#d55e00'])

export function markerInk(color: string): '#000000' | '#ffffff' {
  return INK_ON_LIGHT.has(color) || !color ? '#000000' : '#ffffff'
}

export function markerColor(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 33 + id.charCodeAt(i)) >>> 0
  const color = OKABE_ITO[hash % OKABE_ITO.length]
  return COLOR_RE.test(color) ? color : '#0072b2'
}

export function initials(name: string): string {
  const parts = name
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
  const letters = parts.map((part) => part[0]?.toUpperCase() || '').join('')
  return letters || '?'
}
