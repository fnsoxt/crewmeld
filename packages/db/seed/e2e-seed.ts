/**
 * E2E seed — idempotently inserts 3 RBAC users and sample business rows into
 * the local Postgres database. Callable from Playwright globalSetup or via
 * `bun run --cwd packages/db seed/e2e-seed.ts` standalone.
 *
 * Password hashing uses better-auth's own `hashPassword` so the stored
 * credentials are verifiable by the real sign-in endpoint.
 */

import { randomUUID } from 'node:crypto'
import { hashPassword } from 'better-auth/crypto'
import { sql } from 'drizzle-orm'
import { db } from '../index'

export const SEED_USERS = {
  superAdmin: {
    id: 'seed-user-super-admin',
    email: 'admin@crewmeld.local',
    password: 'Crewmeld@2026',
    name: 'Super Admin',
    role: 'super_admin' as const,
  },
  admin: {
    id: 'seed-user-admin',
    email: 'ops@crewmeld.local',
    password: 'Ops@2026',
    name: 'Ops Admin',
    role: 'admin' as const,
  },
  member: {
    id: 'seed-user-member',
    email: 'viewer@crewmeld.local',
    password: 'Viewer@2026',
    name: 'Viewer',
    role: 'member' as const,
  },
} as const

export type SeedRole = keyof typeof SEED_USERS

async function seedUsers(): Promise<void> {
  for (const u of Object.values(SEED_USERS)) {
    const passwordHash = await hashPassword(u.password)

    // Hard-reset: delete any pre-existing row for this email so the FK targets
    // (account.user_id, employee_platform_roles.user_id) always point at the
    // deterministic seed id. Cascades clean up dependent rows.
    await db.execute(sql`
      DELETE FROM "user" WHERE email = ${u.email} AND id != ${u.id}
    `)

    await db.execute(sql`
      INSERT INTO "user" (id, email, name, email_verified, created_at, updated_at, is_super_user, approval_status)
      VALUES (${u.id}, ${u.email}, ${u.name}, true, NOW(), NOW(), ${u.role === 'super_admin'}, 'approved')
      ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        name = EXCLUDED.name,
        email_verified = EXCLUDED.email_verified,
        is_super_user = EXCLUDED.is_super_user,
        approval_status = EXCLUDED.approval_status,
        updated_at = NOW()
    `)

    // Always reset the credential row so local hash drift never breaks login.
    await db.execute(sql`
      DELETE FROM account WHERE user_id = ${u.id} AND provider_id = 'credential'
    `)
    await db.execute(sql`
      INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at)
      VALUES (${randomUUID()}, ${u.email}, 'credential', ${u.id}, ${passwordHash}, NOW(), NOW())
    `)

    await db.execute(sql`
      INSERT INTO employee_platform_roles (id, user_id, role, is_disabled, created_at, updated_at)
      VALUES (${randomUUID()}, ${u.id}, ${u.role}, false, NOW(), NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        role = EXCLUDED.role,
        is_disabled = false,
        updated_at = NOW()
    `)
  }
}

async function seedEmployees(): Promise<void> {
  const samples = [
    { id: 'seed-employee-active', name: 'E2E Sales Active', status: 'active', blockType: 'agent' },
    {
      id: 'seed-employee-standby',
      name: 'E2E Sales Standby',
      status: 'standby',
      blockType: 'agent',
    },
    { id: 'seed-employee-paused', name: 'E2E Sales Paused', status: 'paused', blockType: 'agent' },
  ]
  for (const e of samples) {
    await db.execute(sql`
      INSERT INTO digital_employees (id, name, block_type, status, config, created_at, updated_at)
      VALUES (${e.id}, ${e.name}, ${e.blockType}, ${e.status}::employee_status, '{}'::jsonb, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        status = EXCLUDED.status,
        updated_at = NOW()
    `)
  }
}

async function seedSops(): Promise<void> {
  await db.execute(sql`
    INSERT INTO sop_definitions (
      id, name, description, trigger_type, trigger_config,
      nodes, edges, sop_timeout_minutes, max_rejection_cycles, max_retries,
      created_by, version, is_active, created_at, updated_at
    )
    VALUES (
      'seed-sop-simple', 'E2E Sample SOP', 'Sample SOP for E2E tests',
      'manual', '{}'::jsonb, '[]'::jsonb, '[]'::jsonb, 1440, 3, 3,
      ${SEED_USERS.superAdmin.id}, 1, true, NOW(), NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      updated_at = NOW()
  `)
}

async function seedConversations(): Promise<void> {
  const convId = 'seed-conv-1'
  await db.execute(sql`
    INSERT INTO conversations (
      id, employee_id, user_id, workspace_id, channel, status,
      title, message_count, total_tokens, metadata, created_at, updated_at
    )
    VALUES (
      ${convId}, 'seed-employee-active', ${SEED_USERS.superAdmin.id}, 'default',
      'web', 'active', 'E2E seed conversation', 1, 0, '{}'::jsonb, NOW(), NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      status = EXCLUDED.status,
      updated_at = NOW()
  `)

  await db.execute(sql`
    INSERT INTO conversation_messages (id, conversation_id, role, content, metadata, created_at)
    SELECT ${randomUUID()}, ${convId}, 'user', '你好', '{}'::jsonb, NOW()
    WHERE NOT EXISTS (
      SELECT 1 FROM conversation_messages WHERE conversation_id = ${convId}
    )
  `)
}

export async function seedAll(): Promise<void> {
  console.log('[e2e-seed] starting...')
  await seedUsers()
  await seedEmployees()
  await seedSops()
  await seedConversations()
  console.log('[e2e-seed] done')
}

// Direct execution entry point.
if (import.meta.main) {
  seedAll()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error('[e2e-seed] failed:', e)
      process.exit(1)
    })
}
