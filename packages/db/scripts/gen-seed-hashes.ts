/**
 * Generate better-auth password hashes for the 3 development seed accounts.
 *
 * Run once (manually) whenever:
 *   - Creating init.sql for the first time
 *   - better-auth is bumped to a major version (hash algorithm may change)
 *
 * Usage:
 *   bun run packages/db/scripts/gen-seed-hashes.ts
 *
 * Output: prints 3 lines of `EMAIL=HASH` to stdout. Paste each HASH into
 * the corresponding INSERT ... INTO account row in init.sql.
 */
import { hashPassword } from 'better-auth/crypto'

const SEED = [
  { email: 'admin@crewmeld.local', password: 'Crewmeld@2026' },
  { email: 'ops@crewmeld.local', password: 'Ops@2026' },
  { email: 'viewer@crewmeld.local', password: 'Viewer@2026' },
]

async function main() {
  for (const { email, password } of SEED) {
    const hash = await hashPassword(password)
    console.log(`${email}=${hash}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
