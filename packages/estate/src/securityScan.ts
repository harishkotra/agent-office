export type Finding = { rule: string; file: string }

const NAME_COLUMNS = new Set([
  'first_name',
  'last_name',
  'middle_name',
  'second_last_name',
  'name_prefix',
  'name_suffix',
])

const SECRET = 'sb_' + 'secret_'
const ROLE = 'service' + '_role'
const JWT = 'ey' + 'J'

function columnsOf(list: string): string[] {
  return list
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
}

function firstArgument(source: string): string {
  let depth = 0
  let quote = ''
  for (let i = 0; i < source.length; i++) {
    const char = source[i]
    if (quote) {
      if (char === '\\') {
        i += 1
        continue
      }
      if (char === quote) quote = ''
      continue
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char
      continue
    }
    if (char === '(' || char === '{' || char === '[') depth += 1
    else if (char === ')' || char === '}' || char === ']') depth = Math.max(0, depth - 1)
    else if (char === ',' && depth === 0) return source.slice(0, i)
  }
  return source
}

function calls(source: string, name: string): string[] {
  const found: string[] = []
  const needle = name + '('
  let from = 0
  while (from < source.length) {
    const at = source.indexOf(needle, from)
    if (at < 0) break
    const start = at + needle.length
    let depth = 1
    let quote = ''
    let i = start
    for (; i < source.length && depth > 0; i++) {
      const char = source[i]
      if (quote) {
        if (char === '\\') {
          i += 1
          continue
        }
        if (char === quote) quote = ''
        continue
      }
      if (char === '"' || char === "'" || char === '`') quote = char
      else if (char === '(') depth += 1
      else if (char === ')') depth -= 1
    }
    found.push(source.slice(start, i - 1))
    from = i
  }
  return found
}

export function scanDatabase(file: string, text: string): Finding[] {
  const findings: Finding[] = []
  if (text.includes('app_' + 'private') || text.includes('tree_' + 'people')) {
    findings.push({ rule: 'private-table', file })
  }
  const constants = new Map<string, string>()
  for (const match of text.matchAll(/const\s+([A-Z0-9_]+)\s*=\s*'([^']*)'/g)) constants.set(match[1], match[2])

  const reads: { table: string; columns: string[] }[] = []
  for (const match of text.matchAll(/\.from\(\s*['"]([a-z0-9_]+)['"]\)([\s\S]{0,240}?)(?:\.select\(\s*['"]([^'"]*)['"]\)|;)/g)) {
    reads.push({ table: match[1], columns: columnsOf(match[3] || '') })
  }
  for (const match of text.matchAll(/\/rest\/v1\/([a-z0-9_]+)\?[^`'"]{0,200}/g)) {
    const url = match[0]
    const table = match[1]
    const listed = url.match(/select=([a-z0-9_,]+)/)
    const named = url.match(/select=\$\{([A-Z0-9_]+)\}/)
    const columns = listed ? columnsOf(listed[1]) : named && constants.has(named[1]) ? columnsOf(constants.get(named[1]) || '') : []
    reads.push({ table, columns })
  }

  for (const read of reads) {
    if (read.table === 'profiles') {
      if (read.columns.some((column) => !NAME_COLUMNS.has(column))) findings.push({ rule: 'profile-columns', file })
    }
    if (read.columns.includes('phone')) findings.push({ rule: 'select-phone', file })
    for (const column of ['email', 'city', 'notes']) {
      if (read.columns.includes(column) && read.table !== 'signed_in_directory') findings.push({ rule: 'select-contact', file })
    }
    if (read.table.includes('private') || read.table === 'tree_people') findings.push({ rule: 'private-table', file })
  }
  return findings
}

export function scanLogs(file: string, text: string): Finding[] {
  const findings: Finding[] = []
  const sensitive = /\b(token|access_token|phone|email|event\.data)\b/
  const whole = /^\s*(msg|message|payload|raw|buf)\s*[,)]/
  for (const name of ['console.log', 'console.info', 'console.debug', 'console.warn', 'console.error', 'logger.log', 'logger.info', 'logger.debug', 'logger.warn', 'logger.error']) {
    for (const args of calls(text, name)) {
      if (sensitive.test(args) || whole.test(args)) findings.push({ rule: 'log', file })
    }
  }
  return findings
}

export function scanTokenUrls(file: string, text: string): Finding[] {
  const findings: Finding[] = []
  for (const name of ['new WebSocket', 'fetch', 'new Request']) {
    for (const args of calls(text, name)) {
      const url = firstArgument(args)
      if (/\b(token|access_token)\b/.test(url) || /[?&](token|access_token)=/.test(url)) findings.push({ rule: 'token-url', file })
    }
  }
  if (/[?&](token|access_token)=/.test(text)) findings.push({ rule: 'token-url', file })
  return findings
}

export function scanSecrets(file: string, text: string): Finding[] {
  const findings: Finding[] = []
  const leaked = new RegExp(SECRET + '[A-Za-z0-9_-]{3,}')
  if (leaked.test(text) || text.includes(ROLE)) findings.push({ rule: 'secret', file })
  if (new RegExp(JWT + '[A-Za-z0-9_\\-]{16,}').test(text)) findings.push({ rule: 'secret', file })
  if (text.includes('BEGIN ' + 'PRIVATE KEY')) findings.push({ rule: 'secret', file })
  return findings
}

export function scanBundle(file: string, text: string): Finding[] {
  const findings: Finding[] = []
  const phones = [/\(\d{3}\)\s*\d{3}[-.\s]\d{4}/, /\b\d{3}-\d{3}-\d{4}\b/, /\b\d{3}\.\d{3}\.\d{4}\b/, /tel:\d{3}\.\d{3}\.\d{4}/]
  if (phones.some((pattern) => pattern.test(text))) findings.push({ rule: 'bundle-phone', file })
  for (const match of text.matchAll(/[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g)) {
    if (match[1].toLowerCase() !== 'example.com') findings.push({ rule: 'bundle-email', file })
  }
  findings.push(...scanSecrets(file, text))
  if (text.includes('tree_' + 'people')) findings.push({ rule: 'bundle-table', file })
  if (/select\(\s*['"`][^'"`]*\bnotes\b/.test(text)) findings.push({ rule: 'bundle-select', file })
  return findings
}

export function scanScripts(file: string, html: string): Finding[] {
  const findings: Finding[] = []
  for (const match of html.matchAll(/<script\b([^>]*)>/gi)) {
    const tag = match[1]
    const src = tag.match(/\ssrc\s*=\s*['"]([^'"]+)['"]/i)
    if (!src) continue
    const href = src[1]
    const external = /^(https?:)?\/\//i.test(href)
    if (!external) continue
    if (!/\sintegrity\s*=\s*['"]sha(256|384|512)-/i.test(tag)) findings.push({ rule: 'script-sri', file })
  }
  return findings
}

export function scanTestData(file: string, text: string): Finding[] {
  const findings: Finding[] = []
  const phones = [/\(\d{3}\)\s*\d{3}-\d{4}/g, /\b\d{3}-\d{3}-\d{4}\b/g, /\b\d{3}\.\d{3}\.\d{4}\b/g, /\b\d{3}-\d{4}\b/g]
  for (const pattern of phones) {
    for (const match of text.matchAll(pattern)) {
      if (!/^555-01\d\d$/.test(match[0])) findings.push({ rule: 'test-phone', file })
    }
  }
  for (const match of text.matchAll(/[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g)) {
    if (match[1].toLowerCase() !== 'example.com') findings.push({ rule: 'test-email', file })
  }
  return findings
}

const PERF_PAGE = 'ESTATE_' + 'PERF_PAGE'
const PERF_FIXTURE = 'PERF_' + 'FIXTURE_SAMPLETOWN'
const PLAYWRIGHT = 'play' + 'wright'

export function scanLiveExtras(file: string, text: string): Finding[] {
  const findings: Finding[] = []
  if (text.includes(PERF_PAGE) || text.includes(PERF_FIXTURE) || text.toLowerCase().includes(PLAYWRIGHT)) {
    findings.push({ rule: 'live-extra', file })
  }
  return findings
}

export function scanWorkflowText(file: string, text: string): Finding[] {
  const findings: Finding[] = []
  if (text.includes('pull_request' + '_target')) findings.push({ rule: 'workflow-target', file })
  if (file.endsWith('ci.yml') && text.includes('secrets.')) findings.push({ rule: 'workflow-secret', file })
  return findings
}

export function describeFindings(findings: Finding[]): string {
  return findings.map((finding) => `${finding.rule} in ${finding.file}`).join('\n')
}
