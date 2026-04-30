#!/usr/bin/env bun
import { readFileSync } from 'node:fs'
import postgres from 'postgres'

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is not set.')
  process.exit(1)
}

const INIT_SQL_PATH = process.env.INIT_SQL_PATH || './packages/db/init.sql'

async function countPublicTables(client: ReturnType<typeof postgres>): Promise<number> {
  const rows = await client<{ count: string }[]>`
    SELECT COUNT(*)::text AS count
    FROM pg_tables
    WHERE schemaname = 'public'
  `
  return Number(rows[0]?.count ?? 0)
}

function loadInitSql(path: string): string {
  const raw = readFileSync(path, 'utf8')
  // Strip psql-only metacommands (\restrict, \unrestrict, \connect, etc.) —
  // postgres.js does not understand them; they are advisory-only.
  return raw
    .split('\n')
    .filter((line) => !line.startsWith('\\'))
    .join('\n')
}

async function main() {
  console.log('🔗 Connecting to database...')
  const client = postgres(DATABASE_URL, { max: 1, onnotice: () => {} })

  try {
    const tableCount = await countPublicTables(client)

    if (tableCount > 0) {
      console.log(`✅ Database already initialized (${tableCount} tables in public). Skipping.`)
      return
    }

    console.log(`📦 Fresh database detected. Loading ${INIT_SQL_PATH}...`)
    const sql = loadInitSql(INIT_SQL_PATH)
    const start = Date.now()
    await client.unsafe(sql)
    console.log(`✅ Schema initialized from init.sql in ${Date.now() - start}ms`)
  } finally {
    await client.end({ timeout: 5 })
  }
}

main().catch((err) => {
  console.error('❌ Migration failed:', err)
  process.exit(1)
})
