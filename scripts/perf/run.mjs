import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { dirname, extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const ESTATE = join(ROOT, 'packages/estate')
const GROUNDS_DRAW_LIMIT = 300
const HOME_DRAW_LIMIT = 150
const LEAK_TRIPS = 5
const MARKER = 'ESTATE_' + 'PERF_PAGE'
const FIXTURE = 'PERF_' + 'FIXTURE_SAMPLETOWN'
const TOOL = 'play' + 'wright'

function run(command, args, cwd) {
  return new Promise((done, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit', env: cleanEnv() })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) done()
      else reject(new Error(`${command} ${args.join(' ')} exited ${code}`))
    })
  })
}

function cleanEnv() {
  const env = { ...process.env }
  for (const key of Object.keys(env)) {
    if (key.includes('SUPABASE') || key.includes('SECRET') || key.includes('TOKEN') || key.startsWith('VITE_')) delete env[key]
  }
  return env
}

function filesIn(dir, suffixes, out = []) {
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return out
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) filesIn(path, suffixes, out)
    else if (suffixes.test(name)) out.push(path)
  }
  return out
}

function gzipBytes(dir) {
  let total = 0
  for (const path of filesIn(dir, /\.js$/)) total += gzipSync(readFileSync(path)).length
  return total
}

function bundleText(dir) {
  return filesIn(dir, /\.(html|js|css)$/)
    .map((path) => readFileSync(path, 'utf8'))
    .join('\n')
}

function liveLeak(text) {
  return text.includes(MARKER) || text.includes(FIXTURE) || text.toLowerCase().includes(TOOL)
}

function accountLeak(text) {
  return /supabase|createClient|service_role|sb_secret_|sb_publishable_|eyJ[A-Za-z0-9_-]{20,}/i.test(text)
}

function mime(path) {
  const ext = extname(path)
  if (ext === '.html') return 'text/html; charset=utf-8'
  if (ext === '.js') return 'text/javascript; charset=utf-8'
  if (ext === '.css') return 'text/css; charset=utf-8'
  if (ext === '.json') return 'application/json'
  if (ext === '.wasm') return 'application/wasm'
  if (ext === '.svg') return 'image/svg+xml'
  return 'application/octet-stream'
}

function serve(rootDir) {
  const root = resolve(rootDir)
  const server = createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1')
    const requested = decodeURIComponent(url.pathname)
    const path = normalize(join(root, requested))
    if (path !== root && !path.startsWith(root + sep)) {
      res.writeHead(403)
      res.end()
      return
    }
    try {
      const body = readFileSync(path)
      res.writeHead(200, { 'content-type': mime(path) })
      res.end(body)
    } catch {
      res.writeHead(404)
      res.end()
    }
  })
  return new Promise((done) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      done({ server, port })
    })
  })
}

function issuesFor(report) {
  const issues = []
  if (!report || typeof report !== 'object') return ['missing report']
  const grounds = report.grounds?.calls
  const home = report.home?.calls
  if (typeof grounds !== 'number' || grounds >= GROUNDS_DRAW_LIMIT) issues.push('grounds draw calls')
  if (typeof home !== 'number' || home >= HOME_DRAW_LIMIT) issues.push('home draw calls')
  if (report.trips !== LEAK_TRIPS) issues.push('leak trips')
  const start = report.leakStart
  const end = report.leakEnd
  if (!start || !end || start.geometries !== end.geometries || start.textures !== end.textures) issues.push('leak check')
  return issues
}

async function measure() {
  const { server, port } = await serve(join(ESTATE, 'dist-perf'))
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
  })
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(`http://127.0.0.1:${port}/perf.html`, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => {
      const node = document.getElementById('estate-perf-status')
      return node && (node.dataset.state === 'done' || node.dataset.state === 'error')
    }, null, { timeout: 90000 })
    const raw = await page.locator('#estate-perf-status').textContent()
    const state = await page.locator('#estate-perf-status').getAttribute('data-state')
    let report
    try {
      report = JSON.parse(raw || '')
    } catch {
      throw new Error('perf page returned an unreadable report')
    }
    if (state !== 'done') {
      const detail = Array.isArray(report.issues) ? report.issues.join(', ') : 'perf page failed'
      const start = report.leakStart
      const end = report.leakEnd
      throw new Error(`${detail} geometries ${start?.geometries} -> ${end?.geometries}, textures ${start?.textures} -> ${end?.textures}`)
    }
    const issues = issuesFor(report)
    if (issues.length) throw new Error(issues.join(', '))
    if (errors.length) throw new Error('perf page raised a page error')
    return report
  } finally {
    await browser.close()
    await new Promise((done) => server.close(() => done()))
  }
}

await run('npx', ['vite', 'build', '--mode', 'production'], ESTATE)
const liveGzip = gzipBytes(join(ESTATE, 'dist'))
const liveText = bundleText(join(ESTATE, 'dist'))
if (liveLeak(liveText)) throw new Error('live bundle contains the perf page')

await run('npm', ['run', 'build:perf'], ESTATE)
const perfText = bundleText(join(ESTATE, 'dist-perf'))
if (!perfText.includes(MARKER) || !perfText.includes(FIXTURE)) throw new Error('perf bundle is missing its marker')
if (perfText.toLowerCase().includes(TOOL)) throw new Error('perf bundle contains the browser tool')
if (accountLeak(perfText)) throw new Error('perf bundle contains an account client')

const report = await measure()
const summary = {
  liveJsGzip: liveGzip,
  groundsCalls: report.grounds.calls,
  groundsTriangles: report.grounds.triangles,
  homeCalls: report.home.calls,
  homeTriangles: report.home.triangles,
  leakGeometries: [report.leakStart.geometries, report.leakEnd.geometries],
  leakTextures: [report.leakStart.textures, report.leakEnd.textures],
  trips: report.trips,
}
console.log(JSON.stringify(summary))
