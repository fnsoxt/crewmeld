/**
 * CI guard: verify init.sql applies cleanly to a fresh postgres and
 * emit a schema snapshot covering every table defined in Drizzle.
 *
 * MVP scope: validates SQL applies + captures (table, column, data_type)
 * snapshot into .schema-snapshot.txt. Field-level diff against the Drizzle
 * type definitions is deferred to P3.
 *
 * Runs via `bun run check:schema-drift`. Requires Docker.
 */

import { execSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = process.cwd()
const TEMP_CONTAINER = `crewmeld-drift-${randomUUID().slice(0, 8)}`
const TEMP_PORT = '15432'
const DB_NAME = 'drift_check'
const DB_USER = 'postgres'
const DB_PASS = 'postgres'
const POSTGRES_IMAGE = 'pgvector/pgvector:pg17'
const INIT_SQL_PATH = 'packages/db/init.sql'
const SCHEMA_DIR = 'packages/db/schema'
const SNAPSHOT_PATH = '.schema-snapshot.txt'

interface CmdResult {
  code: number
  stdout: string
  stderr: string
}

/** Run a shell command and return full result without throwing. */
function runCmdSafe(cmd: string): CmdResult {
  try {
    const stdout = execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] })
    return { code: 0, stdout, stderr: '' }
  } catch (e) {
    const err = e as { status?: number; stdout?: Buffer | string; stderr?: Buffer | string }
    return {
      code: err.status ?? 1,
      stdout: err.stdout?.toString() ?? '',
      stderr: err.stderr?.toString() ?? '',
    }
  }
}

/** Run a shell command, throw with combined output on non-zero. */
function runCmd(cmd: string): string {
  const r = runCmdSafe(cmd)
  if (r.code !== 0) {
    throw new Error(
      `cmd failed (exit ${r.code}): ${cmd}\n-- stdout --\n${r.stdout}\n-- stderr --\n${r.stderr}`
    )
  }
  return r.stdout
}

/** Walk the Drizzle schema directory and extract all pgTable('name', ...) declarations. */
function getDrizzleTables(): string[] {
  const abs = join(ROOT, SCHEMA_DIR)
  const files = readdirSync(abs)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => join(abs, f))
    .filter((p) => statSync(p).isFile())

  const tables = new Set<string>()
  for (const f of files) {
    const content = readFileSync(f, 'utf-8')
    const rx = /pgTable\s*\(\s*['"]([a-zA-Z_][a-zA-Z0-9_]*)['"]/g
    let m: RegExpExecArray | null
    while ((m = rx.exec(content)) !== null) {
      tables.add(m[1])
    }
  }
  return Array.from(tables).sort()
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

async function waitForReady(): Promise<void> {
  for (let i = 0; i < 60; i++) {
    const r = runCmdSafe(`docker exec ${TEMP_CONTAINER} pg_isready -U ${DB_USER} -d ${DB_NAME}`)
    if (r.code === 0) return
    await sleep(1000)
  }
  throw new Error(`postgres did not become ready within 60s (container ${TEMP_CONTAINER})`)
}

async function main(): Promise<number> {
  // Preconditions
  if (!existsSync(join(ROOT, INIT_SQL_PATH))) {
    console.error(`[drift] missing ${INIT_SQL_PATH}`)
    return 1
  }
  const dockerVer = runCmdSafe('docker --version')
  if (dockerVer.code !== 0) {
    console.error('[drift] docker not available — this check requires docker')
    return 1
  }

  const drizzleTables = getDrizzleTables()
  console.log(`[drift] Drizzle schema defines ${drizzleTables.length} tables`)
  if (drizzleTables.length === 0) {
    console.error('[drift] no pgTable declarations found — aborting')
    return 1
  }

  // Start temp postgres
  console.log(`[drift] starting temp postgres container: ${TEMP_CONTAINER}`)
  runCmd(
    `docker run -d --name ${TEMP_CONTAINER} ` +
      `-e POSTGRES_USER=${DB_USER} ` +
      `-e POSTGRES_PASSWORD=${DB_PASS} ` +
      `-e POSTGRES_DB=${DB_NAME} ` +
      `-p ${TEMP_PORT}:5432 ` +
      POSTGRES_IMAGE
  )

  try {
    console.log('[drift] waiting for postgres ready...')
    await waitForReady()

    // Apply init.sql
    console.log(`[drift] applying ${INIT_SQL_PATH}...`)
    runCmd(`docker cp "${INIT_SQL_PATH}" ${TEMP_CONTAINER}:/tmp/init.sql`)
    // Use ON_ERROR_STOP so any failed statement surfaces as non-zero exit.
    runCmd(
      `docker exec -e PGPASSWORD=${DB_PASS} ${TEMP_CONTAINER} ` +
        `psql -v ON_ERROR_STOP=1 -U ${DB_USER} -d ${DB_NAME} -f /tmp/init.sql`
    )

    // Extract schema for Drizzle tables only
    const whereClause = drizzleTables.map((t) => `'${t}'`).join(',')
    const query =
      `SELECT table_name || '.' || column_name || ':' || ` +
      `CASE WHEN character_maximum_length IS NOT NULL ` +
      `     THEN data_type || '(' || character_maximum_length || ')' ` +
      `     ELSE data_type END ` +
      `FROM information_schema.columns ` +
      `WHERE table_schema = 'public' AND table_name IN (${whereClause}) ` +
      `ORDER BY table_name, ordinal_position`

    const raw = runCmd(
      `docker exec -e PGPASSWORD=${DB_PASS} ${TEMP_CONTAINER} ` +
        `psql -U ${DB_USER} -d ${DB_NAME} -A -t -c "${query}"`
    )

    const lines = raw
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)

    // Report coverage
    const presentTables = new Set(lines.map((l) => l.split('.')[0]))
    const missingTables = drizzleTables.filter((t) => !presentTables.has(t))

    console.log(
      `[drift] extracted ${lines.length} columns across ${presentTables.size}/${drizzleTables.length} Drizzle tables`
    )
    if (missingTables.length > 0) {
      console.warn(`[drift] WARN ${missingTables.length} Drizzle tables not found in init.sql:`)
      for (const t of missingTables) console.warn(`  - ${t}`)
    }

    // Write snapshot
    const snapshot = [
      `# CrewMeld schema snapshot`,
      `# Generated by scripts/check-schema-drift.ts`,
      `# Source: ${INIT_SQL_PATH} applied to ${POSTGRES_IMAGE}`,
      `# Drizzle tables: ${drizzleTables.length}`,
      `# Present: ${presentTables.size} / Missing: ${missingTables.length}`,
      `# Columns: ${lines.length}`,
      '',
      ...lines,
      '',
    ].join('\n')

    const outPath = join(ROOT, SNAPSHOT_PATH)
    writeFileSync(outPath, snapshot)
    console.log(`[drift] snapshot saved: ${relative(ROOT, outPath).replace(/\\/g, '/')}`)

    return 0
  } finally {
    console.log(`[drift] cleaning up temp container ${TEMP_CONTAINER}`)
    runCmdSafe(`docker rm -f ${TEMP_CONTAINER}`)
  }
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error('[drift] fatal:', e instanceof Error ? e.message : e)
    // Ensure cleanup even on unexpected throw paths
    runCmdSafe(`docker rm -f ${TEMP_CONTAINER}`)
    process.exit(1)
  })
