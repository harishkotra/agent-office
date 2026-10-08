import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { checkboxOnly, isProtectedPath } from './pathGuard'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..')

function globs(): string[] {
  return readFileSync(join(ROOT, '.github/auto-merge/protected-paths.txt'), 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
}

describe('protected path globs', () => {
  const list = globs()

  it('matches the paths from the auto-merge spec', () => {
    expect(isProtectedPath('packages/estate/src/auth.ts', list)).toBe(true)
    expect(isProtectedPath('auth.ts', list)).toBe(true)
    expect(isProtectedPath('packages/estate/tsconfig.json', list)).toBe(true)
    expect(isProtectedPath('packages/estate/index.html', list)).toBe(true)
    expect(isProtectedPath('wrangler.toml', list)).toBe(true)
    expect(isProtectedPath('packages/estate/src/leak-fixtures/rows.ts', list)).toBe(true)
    expect(isProtectedPath('packages/estate/src/securityScan.ts', list)).toBe(true)
    expect(isProtectedPath('packages/estate/src/securityScan.test.ts', list)).toBe(true)
    expect(isProtectedPath('packages/estate/src/pathGuard.ts', list)).toBe(true)
    expect(isProtectedPath('packages/estate/src/pathGuard.test.ts', list)).toBe(true)
    expect(isProtectedPath('.gitleaks.toml', list)).toBe(true)
    expect(isProtectedPath('packages/estate/vite.config.ts', list)).toBe(true)
    expect(isProtectedPath('packages/estate/vite.perf.config.ts', list)).toBe(true)
    expect(isProtectedPath('.gitignore', list)).toBe(true)
    expect(isProtectedPath('.env', list)).toBe(true)
    expect(isProtectedPath('.env.local', list)).toBe(true)
    expect(isProtectedPath('packages/estate/.env.example', list)).toBe(true)
    expect(isProtectedPath('packages/estate/src/movement.ts', list)).toBe(false)
    expect(isProtectedPath('packages/estate/src/game/Homes.tsx', list)).toBe(false)
  })

  it('allows only a one-character checkbox tick', () => {
    const line = '- [ ] **0. Example task**'
    const ticked = '- [x] **0. Example task**'
    expect(
      checkboxOnly({
        status: 'modified',
        additions: 1,
        deletions: 1,
        patch: `@@ -1 +1 @@\n-${line}\n+${ticked}`,
      }),
    ).toBe(true)
    expect(
      checkboxOnly({
        status: 'modified',
        additions: 1,
        deletions: 1,
        patch: `@@ -1 +1 @@\n-${line}\n+- [x] **0. Example task** extra`,
      }),
    ).toBe(false)
    expect(
      checkboxOnly({
        status: 'modified',
        additions: 2,
        deletions: 1,
        patch: `@@ -1 +1 @@\n-${line}\n+${ticked}`,
      }),
    ).toBe(false)
  })
})
