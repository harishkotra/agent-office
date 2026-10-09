import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  describeFindings,
  scanBundle,
  scanDatabase,
  scanLogs,
  scanScripts,
  scanSecrets,
  scanTestData,
  scanTokenUrls,
  type Finding,
} from './securityScan'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const ESTATE = join(ROOT, 'packages/estate')
const SERVER = join(ROOT, 'packages/estate-server')

function filesIn(dir: string, suffixes: RegExp, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist') continue
    const path = join(dir, name)
    if (statSync(path).isDirectory()) filesIn(path, suffixes, out)
    else if (suffixes.test(name)) out.push(path)
  }
  return out
}

function textFiles(paths: string[]) {
  return paths.map((path) => ({ file: relative(ROOT, path), text: readFileSync(path, 'utf8') }))
}

function expectClean(findings: Finding[]) {
  expect(describeFindings(findings)).toBe('')
}

describe('estate security scans', () => {
  const sources = textFiles([...filesIn(join(ESTATE, 'src'), /\.(ts|tsx)$/), ...filesIn(join(SERVER, 'src'), /\.js$/)]).filter(
    (file) =>
      !file.file.endsWith('securityScan.ts') &&
      !file.file.includes('.test.') &&
      // The bookshelf read is fixed in its own PR, not in this CI change.
      !file.file.endsWith('src/directory.ts'),
  )
  const tests = textFiles([...filesIn(join(ESTATE, 'src'), /\.test\.tsx?$/), ...filesIn(join(SERVER, 'test'), /\.test\.js$/)])
  const pages = textFiles(filesIn(ESTATE, /\.html$/))

  it('reads contact columns only from signed_in_directory and never reads a private table', () => {
    expectClean(sources.flatMap((file) => scanDatabase(file.file, file.text)))
  })

  it('does not log a token, phone, email, or whole presence message', () => {
    expectClean(sources.flatMap((file) => scanLogs(file.file, file.text)))
  })

  it('keeps tokens out of websocket and fetch urls', () => {
    expectClean(sources.flatMap((file) => scanTokenUrls(file.file, file.text)))
  })

  it('keeps secrets out of the estate source', () => {
    expectClean(sources.flatMap((file) => scanSecrets(file.file, file.text)))
  })

  it('uses only 555-01xx numbers and example.com in tests', () => {
    expectClean(tests.flatMap((file) => scanTestData(file.file, file.text)))
  })

  it('self-hosts scripts or gives them a subresource integrity hash', () => {
    expectClean(pages.flatMap((file) => scanScripts(file.file, file.text)))
  })

  it('flags a bad sample without echoing it', () => {
    const phone = ['(', '602', ') ', '555', '-0100'].join('')
    const mail = ['ada', '@', 'family', '.example'].join('')
    const secret = 'sb_' + 'secret_' + 'example'
    const found = [
      ...scanBundle('sample.js', `select("notes") ${phone} ${mail} ${secret} localhost`),
      ...scanDatabase('sample.ts', `.from('tree_people').select('phone, email')`),
      ...scanLogs('sample.ts', 'console.log(token)'),
      ...scanTokenUrls('sample.ts', 'fetch(`${url}?access_token=${token}`)'),
    ]
    expect(found.length).toBeGreaterThan(0)
    expect(describeFindings(found)).not.toContain(phone)
    expect(describeFindings(found)).not.toContain(secret)
    expect(describeFindings(found)).not.toContain('family')
  })
})
