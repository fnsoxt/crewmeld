#!/usr/bin/env bun
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

type Generator = () => string

const SECRETS: Record<string, Generator> = {
  POSTGRES_PASSWORD: () => randomBytes(24).toString('base64url'),
  BETTER_AUTH_SECRET: () => randomBytes(32).toString('hex'),
  ENCRYPTION_KEY: () => randomBytes(32).toString('hex'),
  INTERNAL_API_SECRET: () => randomBytes(32).toString('hex'),
}

export function ensureSecrets(envPath: string): { generated: string[] } {
  const contents = existsSync(envPath) ? readFileSync(envPath, 'utf8') : ''
  const lines = contents.length === 0 ? [] : contents.split('\n')

  const getVal = (key: string): string | undefined => {
    for (const line of lines) {
      const m = line.match(new RegExp(`^${key}=(.*)$`))
      if (m) return m[1]
    }
    return undefined
  }

  const generated: string[] = []
  for (const [key, gen] of Object.entries(SECRETS)) {
    const existing = getVal(key)
    if (existing !== undefined && existing.trim() !== '') continue

    const value = gen()
    const prefix = `${key}=`
    const newLine = `${prefix}${value}`

    const idx = lines.findIndex((l) => l.startsWith(prefix))
    if (idx >= 0) {
      lines[idx] = newLine
    } else {
      if (lines.length > 0 && lines[lines.length - 1] !== '') {
        lines.push('')
      }
      lines.push(newLine)
    }
    generated.push(key)
  }

  if (generated.length > 0) {
    writeFileSync(envPath, lines.join('\n'))
  }
  return { generated }
}

const isMain =
  (typeof import.meta !== 'undefined' &&
    (import.meta as ImportMeta & { main?: boolean }).main === true) ||
  process.argv[1]?.includes('ensure-secrets')

if (isMain) {
  const envPath = process.env.ENV_PATH || '/app/.env'
  console.log(`🔑 Ensuring secrets at ${envPath}`)
  const { generated } = ensureSecrets(envPath)
  if (generated.length === 0) {
    console.log('✅ All secrets present, no changes.')
  } else {
    console.log(`✨ Generated: ${generated.join(', ')}`)
    console.log(`✅ Wrote secrets to ${envPath}`)
  }
}
