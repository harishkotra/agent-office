import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { GROUNDS_DRAW_LIMIT, HOME_DRAW_LIMIT, LEAK_TRIPS, budgetIssues, leakMatches, reportIssues, type PerfReport } from './report'

const here = dirname(fileURLToPath(import.meta.url))

function sample(calls: number, triangles: number): PerfReport['grounds'] {
  return { calls, triangles, geometries: 10, textures: 4 }
}

describe('perf report', () => {
  it('accepts a leak check that returns to the same counts', () => {
    expect(leakMatches({ geometries: 12, textures: 5 }, { geometries: 12, textures: 5 })).toBe(true)
    expect(leakMatches({ geometries: 12, textures: 5 }, { geometries: 13, textures: 5 })).toBe(false)
    expect(leakMatches({ geometries: 12, textures: 5 }, { geometries: 12, textures: 6 })).toBe(false)
  })

  it('flags draw calls at the grounds and home limits', () => {
    expect(GROUNDS_DRAW_LIMIT).toBe(300)
    expect(HOME_DRAW_LIMIT).toBe(150)
    expect(LEAK_TRIPS).toBe(5)
    const ok = budgetIssues({ grounds: sample(299, 1000), home: sample(149, 100) })
    const over = budgetIssues({ grounds: sample(300, 1000), home: sample(150, 100) })
    expect(ok).toEqual([])
    expect(over).toEqual(['grounds draw calls', 'home draw calls'])
  })

  it('requires five trips and a clean leak check', () => {
    const report: PerfReport = {
      grounds: sample(40, 1000),
      home: sample(48, 1200),
      leakStart: { geometries: 20, textures: 6 },
      leakEnd: { geometries: 21, textures: 6 },
      trips: 4,
    }
    expect(reportIssues(report)).toEqual(['leak trips', 'leak check'])
    report.trips = 5
    report.leakEnd = { geometries: 20, textures: 6 }
    expect(reportIssues(report)).toEqual([])
  })

  it('keeps the perf page off the account client', () => {
    const banned = [/supabase/i, /createClient/, /from ['"]\.\.\/auth['"]/, /from ['"]\.\.\/presence['"]/, /from ['"]\.\.\/directory['"]/, /access_token/, /signInWithPassword/]
    const files = readdirSync(here).filter((name) => name.endsWith('.ts') || name.endsWith('.tsx'))
    expect(files.length).toBeGreaterThan(0)
    for (const name of files) {
      if (name.endsWith('.test.ts')) continue
      const text = readFileSync(join(here, name), 'utf8')
      for (const pattern of banned) expect(text).not.toMatch(pattern)
    }
  })
})
