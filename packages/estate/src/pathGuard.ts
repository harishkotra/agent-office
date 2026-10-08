export function globToRegExp(glob: string): RegExp {
  const source = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*\//g, '\u0000')
    .replace(/\*\*/g, '\u0001')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/\u0000/g, '(?:.*/)?')
    .replace(/\u0001/g, '.*')
  return new RegExp(`^${source}$`)
}

export function matchesGlob(path: string, glob: string): boolean {
  return globToRegExp(glob).test(path)
}

export function isProtectedPath(path: string, globs: string[]): boolean {
  return globs.some((glob) => matchesGlob(path, glob))
}

export type FilePatch = {
  status: string
  additions: number
  deletions: number
  patch?: string
}

export function checkboxOnly(file: FilePatch): boolean {
  if (file.status !== 'modified' || !file.patch) return false
  if (file.additions !== 1 || file.deletions !== 1) return false
  const body = file.patch.split('\n').filter((line) => !line.startsWith('@@') && !line.startsWith('\\'))
  const minus = body.filter((line) => line.startsWith('-')).map((line) => line.slice(1))
  const plus = body.filter((line) => line.startsWith('+')).map((line) => line.slice(1))
  if (minus.length !== 1 || plus.length !== 1) return false
  const [before, after] = [minus[0], plus[0]]
  if (!before.startsWith('- [ ] ') || before.length !== after.length) return false
  const diffs = [...before].reduce((count, char, index) => count + (char !== after[index] ? 1 : 0), 0)
  return diffs === 1 && after.startsWith('- [x] ')
}
