export const PALETTE = ['#e15a3a', '#3a7bd5', '#f2b134', '#7d5ba6', '#2a9d8f', '#e07a9a', '#d87b2a', '#4c956c']

export function cleanName(raw) {
  const name = String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40)
  return name || 'Guest'
}

export function cleanZone(raw) {
  const zone = String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 32)
  return zone || 'The Grounds'
}

export function colorFor(id) {
  let hash = 0
  const text = String(id || '')
  for (let i = 0; i < text.length; i++) hash = (hash * 33 + text.charCodeAt(i)) >>> 0
  return PALETTE[hash % PALETTE.length]
}

const ANIMS = new Set(['idle', 'walk', 'run', 'jump', 'fall', 'dive'])

export function cleanAnim(raw) {
  return ANIMS.has(raw) ? raw : 'idle'
}

export function clampNum(value, min, max, fallback) {
  const n = typeof value === 'number' ? value : Number.NaN
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}
