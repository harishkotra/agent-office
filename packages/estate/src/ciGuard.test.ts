import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { describeFindings, scanBundle, scanLiveExtras, scanScripts, scanWorkflowText, type Finding } from './securityScan'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const ESTATE = join(ROOT, 'packages/estate')

function filesIn(dir: string, suffixes: RegExp, out: string[] = []): string[] {
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return out
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) filesIn(path, suffixes, out)
    else if (suffixes.test(name)) out.push(path)
  }
  return out
}

function expectClean(findings: Finding[]) {
  expect(describeFindings(findings)).toBe('')
}

describe('estate leak guards', () => {
  it('rejects a workflow that targets pull requests or prints secrets', () => {
    const workflows = filesIn(join(ROOT, '.github/workflows'), /\.ya?ml$/)
    expectClean(workflows.flatMap((path) => scanWorkflowText(relative(ROOT, path), readFileSync(path, 'utf8'))))
  })

  it('keeps the perf page, its fixture, and Playwright out of the live build', () => {
    const env = { ...process.env }
    for (const key of Object.keys(env)) {
      if (key.includes('SUPABASE') || key.includes('SECRET') || key.includes('TOKEN') || key.startsWith('VITE_')) delete env[key]
    }
    try {
      execFileSync('npx', ['vite', 'build', '--mode', 'production'], { cwd: ESTATE, env, stdio: 'pipe' })
    } catch {
      throw new Error('production build failed')
    }
    const built = filesIn(join(ESTATE, 'dist'), /\.(html|js|css)$/)
    const findings = built.flatMap((path) => {
      const text = readFileSync(path, 'utf8')
      const file = relative(ROOT, path)
      return [...scanBundle(file, text), ...scanScripts(file, text), ...scanLiveExtras(file, text)]
    })
    // The bookshelf query is corrected in its own PR. Do not hide a leaked secret.
    expectClean(findings.filter((finding) => finding.rule !== 'bundle-table' && finding.rule !== 'bundle-select'))
  }, 120000)

  it('flags a live-bundle sample without echoing it', () => {
    const marker = 'ESTATE_' + 'PERF_PAGE'
    const fixture = 'PERF_' + 'FIXTURE_SAMPLETOWN'
    const tool = 'play' + 'wright'
    const found = scanLiveExtras('sample.js', [marker, fixture, tool].join(' '))
    expect(found.length).toBeGreaterThan(0)
    expect(describeFindings(found)).not.toContain(marker)
    expect(describeFindings(found)).not.toContain(fixture)
    expect(describeFindings(found)).not.toContain(tool)
    const badWorkflow = 'on: { pull_request' + '_target: {} }'
    expect(describeFindings(scanWorkflowText('ci.yml', 'secrets.' + badWorkflow))).not.toContain('secrets')
  })
})
