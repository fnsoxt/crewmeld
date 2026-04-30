#!/usr/bin/env bun
import { Glob } from 'bun'
/**
 * Scan source for metadata.i18nKey / errorI18nKey / actorI18nKey / descI18nKey
 * literal usages, and verify each key exists in both zh-CN and en locales.
 *
 * Usage: bun run apps/crewmeld/scripts/check-log-i18n-keys.ts
 * Exits 1 if any key is missing in any locale.
 */
import { messages } from '../locales'

const NAMESPACE_HINTS: Record<string, string> = {
  i18nKey: 'employees', // most generic work_logs namespace
  errorI18nKey: 'errSop',
  actorI18nKey: 'auditLog',
  descI18nKey: 'alerts',
}

const ROOT = `${import.meta.dir}/..`
const SELF_BASENAME = 'check-log-i18n-keys.ts'

async function* sourceFiles(): AsyncGenerator<string> {
  const glob = new Glob('**/*.ts')
  for await (const file of glob.scan({ cwd: ROOT, absolute: true })) {
    if (file.includes('/node_modules/') || file.includes('/.next/') || file.endsWith('.test.ts'))
      continue
    // Skip this script itself to avoid self-match false positives from NAMESPACE_HINTS literal
    if (file.endsWith(SELF_BASENAME)) continue
    yield file
  }
}

function getNested(obj: Record<string, unknown>, path: string): string | undefined {
  const parts = path.split('.')
  let cur: unknown = obj
  for (const p of parts) {
    if (typeof cur !== 'object' || cur === null) return undefined
    cur = (cur as Record<string, unknown>)[p]
  }
  return typeof cur === 'string' ? cur : undefined
}

const missing: string[] = []

/**
 * Strip single-line (//) and block (/* ... *\/) comments from source text
 * to avoid matching i18n keys that appear only in documentation comments.
 */
function stripComments(src: string): string {
  // Remove block comments (including JSDoc /** ... *\/)
  let out = src.replace(/\/\*[\s\S]*?\*\//g, '')
  // Remove single-line comments
  out = out.replace(/\/\/[^\n]*/g, '')
  return out
}

for await (const file of sourceFiles()) {
  const raw = await Bun.file(file).text()
  const text = stripComments(raw)
  for (const [field, namespace] of Object.entries(NAMESPACE_HINTS)) {
    const re = new RegExp(`${field}:\\s*['"\`]([\\w.]+)['"\`]`, 'g')
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      const rawKey = m[1]
      const fullKey = rawKey.includes('.') ? rawKey : `${namespace}.${rawKey}`
      const zhVal = getNested(messages['zh-CN'] as Record<string, unknown>, fullKey)
      const enVal = getNested(messages.en as Record<string, unknown>, fullKey)
      if (!zhVal)
        missing.push(`${file}: zh-CN missing '${fullKey}' (raw: '${rawKey}', via ${field})`)
      if (!enVal) missing.push(`${file}: en missing '${fullKey}' (raw: '${rawKey}', via ${field})`)
    }
  }
}

if (missing.length > 0) {
  console.error('Missing i18n keys:')
  for (const m of missing) console.error(`  ${m}`)
  process.exit(1)
}
console.log('All log/audit i18n keys present in both locales.')
