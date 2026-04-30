/**
 * Dev seed script — ensures the P0 skeleton can boot with a usable admin
 * account, an LLM provider config, and one test digital employee.
 *
 * Idempotent: running the script multiple times is safe — each entity is
 * checked by natural key before being created.
 *
 * Usage: `bun run dev:seed` (from apps/crewmeld)
 */

import { randomUUID } from 'node:crypto'
import {
  account,
  db,
  digitalEmployees,
  employeePlatformRoles,
  modelConfigs,
  user,
} from '@crewmeld/db'
import { createLogger } from '@crewmeld/logger'
import { hashPassword } from 'better-auth/crypto'
import { and, eq } from 'drizzle-orm'
import { encryptSecret } from '@/lib/core/security/encryption'

const logger = createLogger('SeedDev')

const ADMIN_EMAIL = 'admin@crewmeld.local'
const ADMIN_PASSWORD = 'Crewmeld@2026'
const ADMIN_NAME = 'Crewmeld Admin'
const EMPLOYEE_NAME = 'DevTester'

interface ResolvedProvider {
  providerId: 'ollama' | 'deepseek'
  displayName: string
  modelName: string
  apiEndpoint?: string
  apiKeyPlain?: string
}

function resolveProvider(): ResolvedProvider | null {
  const ollamaBase = process.env.OLLAMA_BASE_URL?.trim()
  const deepseekKey = process.env.DEEPSEEK_API_KEY?.trim()

  if (ollamaBase) {
    return {
      providerId: 'ollama',
      displayName: 'Ollama (local)',
      modelName: process.env.OLLAMA_MODEL?.trim() || 'qwen2.5:7b',
      apiEndpoint: ollamaBase.replace(/\/+$/, ''),
    }
  }
  if (deepseekKey) {
    return {
      providerId: 'deepseek',
      displayName: 'DeepSeek',
      modelName: process.env.DEEPSEEK_MODEL?.trim() || 'deepseek-chat',
      apiEndpoint: 'https://api.deepseek.com',
      apiKeyPlain: deepseekKey,
    }
  }
  return null
}

async function ensureAdminUser(): Promise<string> {
  const existing = await db.select().from(user).where(eq(user.email, ADMIN_EMAIL)).limit(1)
  if (existing.length > 0) {
    const existingId = existing[0].id
    logger.info(`Admin user already exists (${ADMIN_EMAIL}), id=${existingId}`)

    // Ensure account row (credential provider) exists for password login.
    await ensureCredentialAccount(existingId)
    await ensureSuperAdminRole(existingId)
    return existingId
  }

  const userId = randomUUID()
  const now = new Date()
  await db.insert(user).values({
    id: userId,
    name: ADMIN_NAME,
    email: ADMIN_EMAIL,
    emailVerified: true,
    isSuperUser: true,
    approvalStatus: 'approved',
    createdAt: now,
    updatedAt: now,
  })
  logger.info(`Created super-admin user ${ADMIN_EMAIL} (id=${userId})`)

  await ensureCredentialAccount(userId)
  await ensureSuperAdminRole(userId)
  return userId
}

async function ensureCredentialAccount(userId: string): Promise<void> {
  const existing = await db
    .select()
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, 'credential')))
    .limit(1)
  if (existing.length > 0) {
    logger.info(`Credential account already present for user ${userId}`)
    return
  }

  const hashed = await hashPassword(ADMIN_PASSWORD)
  const now = new Date()
  await db.insert(account).values({
    id: randomUUID(),
    accountId: userId,
    providerId: 'credential',
    userId,
    password: hashed,
    createdAt: now,
    updatedAt: now,
  })
  logger.info(`Created credential account for user ${userId}`)
}

async function ensureSuperAdminRole(userId: string): Promise<void> {
  const existing = await db
    .select()
    .from(employeePlatformRoles)
    .where(eq(employeePlatformRoles.userId, userId))
    .limit(1)
  if (existing.length > 0) {
    if (existing[0].role !== 'super_admin') {
      await db
        .update(employeePlatformRoles)
        .set({ role: 'super_admin', isDisabled: false, updatedAt: new Date() })
        .where(eq(employeePlatformRoles.userId, userId))
      logger.info(`Promoted user ${userId} to super_admin`)
    } else {
      logger.info(`User ${userId} is already super_admin`)
    }
    return
  }

  const now = new Date()
  await db.insert(employeePlatformRoles).values({
    id: randomUUID(),
    userId,
    role: 'super_admin',
    isDisabled: false,
    createdAt: now,
    updatedAt: now,
  })
  logger.info(`Assigned super_admin role to user ${userId}`)
}

async function ensureModelConfig(): Promise<string | null> {
  const provider = resolveProvider()
  if (!provider) {
    logger.warn(
      'No LLM provider env vars detected (OLLAMA_BASE_URL or DEEPSEEK_API_KEY). ' +
        'Skipping model_configs seed — conversations will not be able to invoke an LLM ' +
        'until one is configured via the UI or re-run with env vars set.'
    )
    return null
  }

  const existing = await db
    .select()
    .from(modelConfigs)
    .where(eq(modelConfigs.providerId, provider.providerId))
    .limit(1)
  if (existing.length > 0) {
    logger.info(`Model config for ${provider.providerId} already exists (id=${existing[0].id})`)
    return existing[0].id
  }

  let apiKeyEncrypted: string | null = null
  if (provider.apiKeyPlain) {
    const { encrypted } = await encryptSecret(provider.apiKeyPlain)
    apiKeyEncrypted = encrypted
  }

  const id = randomUUID()
  const now = new Date()
  await db.insert(modelConfigs).values({
    id,
    providerId: provider.providerId,
    displayName: provider.displayName,
    apiKeyEncrypted,
    apiEndpoint: provider.apiEndpoint ?? null,
    modelName: provider.modelName,
    defaultParams: { temperature: 0.7 },
    isActive: true,
    createdAt: now,
    updatedAt: now,
  })
  logger.info(
    `Created model config ${provider.providerId} (id=${id}, endpoint=${provider.apiEndpoint ?? 'default'}, model=${provider.modelName})`
  )
  return id
}

async function ensureDevEmployee(modelConfigId: string | null): Promise<void> {
  const existing = await db
    .select()
    .from(digitalEmployees)
    .where(eq(digitalEmployees.name, EMPLOYEE_NAME))
    .limit(1)
  if (existing.length > 0) {
    logger.info(`Digital employee '${EMPLOYEE_NAME}' already exists (id=${existing[0].id})`)
    return
  }

  const id = randomUUID()
  const now = new Date()
  await db.insert(digitalEmployees).values({
    id,
    name: EMPLOYEE_NAME,
    avatar: null,
    description: 'Default P0 test employee created by seed-dev',
    blockType: 'agent',
    status: 'standby',
    workflowId: null,
    modelConfigId,
    config: {
      systemPrompt: 'You are DevTester, a helpful assistant used for P0 smoke tests.',
    },
    scheduleConfig: null,
    persona: null,
    activatedAt: null,
    createdAt: now,
    updatedAt: now,
  })
  logger.info(
    `Created digital employee '${EMPLOYEE_NAME}' (id=${id}, modelConfigId=${modelConfigId ?? 'unbound'})`
  )
}

async function main() {
  logger.info('Starting dev seed...')
  await ensureAdminUser()
  const modelConfigId = await ensureModelConfig()
  await ensureDevEmployee(modelConfigId)
  logger.info('Dev seed completed successfully.')
}

main()
  .then(() => {
    process.exit(0)
  })
  .catch((err) => {
    logger.error('Dev seed failed', err)
    process.exit(1)
  })
