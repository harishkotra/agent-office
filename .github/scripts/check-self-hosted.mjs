import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const root = process.argv[2]
if (!root) {
  console.error('missing estate path')
  process.exit(1)
}

const trackers = ['googletagmanager', 'google-analytics', 'fonts.googleapis', 'cdn.jsdelivr', 'unpkg.com', 'cdnjs']
const attr = /<(script|link|img|audio|source)\b([^>]*?)>/gi
const srcAttr = /\s(?:src|href)\s*=\s*['"]([^'"]+)['"]/i
const cssUrl = /(?:url\(\s*['"]?|@import\s+['"])([^'")\s]+)/gi
const dynamicImport = /import\(\s*['"]([^'"]+)['"]\s*\)/g

function external(value) {
  return /^(https?:)?\/\//i.test(value)
}

function walk(dir, out = []) {
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return out
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path, out)
    else if (/\.(html|js|css)$/.test(name)) out.push(path)
  }
  return out
}

const files = [join(root, 'index.html'), ...walk(join(root, 'dist'))]
let failed = false

for (const file of files) {
  let text = ''
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    continue
  }
  for (const host of trackers) {
    if (text.includes(host)) {
      console.error(`tracker host in ${file}`)
      failed = true
    }
  }
  for (const match of text.matchAll(attr)) {
    const source = match[2].match(srcAttr)
    if (!source || !external(source[1])) continue
    console.error(`external asset in ${file}`)
    failed = true
  }
  for (const pattern of [cssUrl, dynamicImport]) {
    for (const match of text.matchAll(pattern)) {
      if (external(match[1])) {
        console.error(`external asset in ${file}`)
        failed = true
      }
    }
  }
}

if (failed) process.exit(1)
