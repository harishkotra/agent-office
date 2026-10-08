export function edgeAddress(headers) {
  const read = typeof headers?.get === 'function' ? headers.get('CF-Connecting-IP') : headers?.['cf-connecting-ip']
  if (typeof read !== 'string') return null
  const ip = read.trim()
  return ip || null
}
