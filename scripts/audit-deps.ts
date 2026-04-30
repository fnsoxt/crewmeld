/**
 * Dependency audit tool — for each package declared in package.json (root or
 * apps/crewmeld), grep the source tree for import/require references. Packages
 * with 0 matches become delete candidates. Output is markdown suitable for
 * user review.
 *
 * Usage: bun run scripts/audit-deps.ts
 * Output: docs/superpowers/reports/image-slimming-dep-audit.md
 */

import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

interface PkgSource {
  label: string
  path: string
}

interface DepRow {
  pkg: string
  source: string
  kind: 'dep' | 'devDep'
  matches: number
  decision: 'KEEP' | 'CANDIDATE_DELETE' | 'NEEDS_REVIEW'
  notes: string
}

const ROOT = process.cwd()

const SOURCES: PkgSource[] = [
  { label: 'root', path: 'package.json' },
  { label: 'app', path: 'apps/crewmeld/package.json' },
]

// Packages kept by config, even if grep shows 0 matches.
// Source: apps/crewmeld/next.config.ts:70-81
const SERVER_EXTERNAL_PACKAGES = new Set([
  '@1password/sdk',
  'unpdf',
  'ffmpeg-static',
  'fluent-ffmpeg',
  'pino',
  'pino-pretty',
  'thread-stream',
  'ws',
  'iconv-lite',
])

// Packages kept by tooling even if grep shows 0 matches (build-time, test-time).
const TOOLING_KEEP = new Set([
  '@biomejs/biome',
  '@playwright/test',
  'playwright',
  'drizzle-kit',
  'typescript',
  'turbo',
  'vitest',
  '@vitest/coverage-v8',
  'husky',
  'msw',
  '@types/node',
  '@types/react',
  '@types/react-dom',
  'concurrently',
  'sharp',
])

const SEARCH_DIRS = ['apps/crewmeld', 'packages', 'scripts', 'tests']

const GREP_FLAGS = [
  '-rE',
  '--exclude-dir=node_modules',
  '--exclude-dir=.next',
  '--exclude-dir=.turbo',
  '--exclude-dir=dist',
  '--exclude-dir=build',
  '--include=*.ts',
  '--include=*.tsx',
  '--include=*.js',
  '--include=*.jsx',
  '--include=*.mjs',
  '--include=*.json',
]

function countMatches(pkg: string): number {
  const escaped = pkg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = `(import|require|from)\\s*\\(?['"]${escaped}(/[^'"]*)?['"]`
  try {
    const out = execFileSync('grep', [...GREP_FLAGS, pattern, ...SEARCH_DIRS], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return out.split('\n').filter((l) => l.length > 0).length
  } catch (err) {
    // grep exits 1 when no matches — that is our target outcome, not an error
    const status = (err as { status?: number }).status
    if (status === 1) return 0
    throw err
  }
}

function classify(
  pkg: string,
  matches: number,
  _kind: 'dep' | 'devDep'
): { decision: DepRow['decision']; notes: string } {
  if (SERVER_EXTERNAL_PACKAGES.has(pkg)) {
    return { decision: 'KEEP', notes: 'serverExternalPackages (runtime load from node_modules)' }
  }
  if (TOOLING_KEEP.has(pkg)) {
    return { decision: 'KEEP', notes: 'tooling / build-time / test-time' }
  }
  if (pkg.startsWith('@types/')) {
    return { decision: 'KEEP', notes: 'TypeScript types' }
  }
  if (pkg.startsWith('@crewmeld/')) {
    return { decision: 'KEEP', notes: 'workspace package' }
  }
  if (matches === 0) {
    return { decision: 'CANDIDATE_DELETE', notes: '0 import/require matches in src' }
  }
  if (matches < 2) {
    return { decision: 'NEEDS_REVIEW', notes: `only ${matches} match(es); verify it is real use` }
  }
  return { decision: 'KEEP', notes: `${matches} matches` }
}

function auditSource(src: PkgSource): DepRow[] {
  const pkg = JSON.parse(readFileSync(join(ROOT, src.path), 'utf8')) as {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  }
  const rows: DepRow[] = []
  for (const [name] of Object.entries(pkg.dependencies ?? {})) {
    const matches = countMatches(name)
    const { decision, notes } = classify(name, matches, 'dep')
    rows.push({ pkg: name, source: src.label, kind: 'dep', matches, decision, notes })
  }
  for (const [name] of Object.entries(pkg.devDependencies ?? {})) {
    const matches = countMatches(name)
    const { decision, notes } = classify(name, matches, 'devDep')
    rows.push({ pkg: name, source: src.label, kind: 'devDep', matches, decision, notes })
  }
  return rows
}

function renderMarkdown(rows: DepRow[]): string {
  const byDecision = {
    CANDIDATE_DELETE: rows.filter((r) => r.decision === 'CANDIDATE_DELETE'),
    NEEDS_REVIEW: rows.filter((r) => r.decision === 'NEEDS_REVIEW'),
    KEEP: rows.filter((r) => r.decision === 'KEEP'),
  }

  let md = `# Image Slimming — Dependency Audit Report\n\n`
  md += `Generated: ${new Date().toISOString()}\n\n`
  md += `Total rows: ${rows.length}\n`
  md += `- CANDIDATE_DELETE: ${byDecision.CANDIDATE_DELETE.length}\n`
  md += `- NEEDS_REVIEW: ${byDecision.NEEDS_REVIEW.length}\n`
  md += `- KEEP: ${byDecision.KEEP.length}\n\n`

  md += `## CANDIDATE_DELETE (0 matches — safe to remove pending user review)\n\n`
  md += `| Source | Kind | Package | Matches | Notes |\n|---|---|---|---|---|\n`
  for (const r of byDecision.CANDIDATE_DELETE) {
    md += `| ${r.source} | ${r.kind} | \`${r.pkg}\` | ${r.matches} | ${r.notes} |\n`
  }

  md += `\n## NEEDS_REVIEW (only 1 match — user decides KEEP or DELETE)\n\n`
  md += `| Source | Kind | Package | Matches | Notes |\n|---|---|---|---|---|\n`
  for (const r of byDecision.NEEDS_REVIEW) {
    md += `| ${r.source} | ${r.kind} | \`${r.pkg}\` | ${r.matches} | ${r.notes} |\n`
  }

  md += `\n## KEEP (>=2 matches or explicit allowlist)\n\n`
  md += `| Source | Kind | Package | Matches | Notes |\n|---|---|---|---|---|\n`
  for (const r of byDecision.KEEP) {
    md += `| ${r.source} | ${r.kind} | \`${r.pkg}\` | ${r.matches} | ${r.notes} |\n`
  }

  return md
}

function main() {
  const allRows: DepRow[] = []
  for (const src of SOURCES) {
    allRows.push(...auditSource(src))
  }
  const md = renderMarkdown(allRows)
  const outDir = join(ROOT, 'docs/superpowers/reports')
  mkdirSync(outDir, { recursive: true })
  const outPath = join(outDir, 'image-slimming-dep-audit.md')
  writeFileSync(outPath, md, 'utf8')
  // biome-ignore lint/suspicious/noConsole: CLI output
  console.log(`[audit-deps] Wrote ${outPath} — ${allRows.length} rows`)
}

main()
