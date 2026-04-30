import { db } from '@crewmeld/db'
import { employeePlatformRoles, permissions, user, workspace } from '@crewmeld/db/schema'
import { createLogger } from '@crewmeld/logger'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { apiErr, apiOk } from '@/lib/api/response'
import { auth } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const logger = createLogger('SystemSetup')

const setupSchema = z.object({
  adminEmail: z.string().email('Please enter a valid email address'),
  adminPassword: z.string().min(8, 'Password must be at least 8 characters'),
  adminName: z.string().min(1, 'Please enter a name'),
  orgName: z.string().optional(),
})

export async function POST(req: Request) {
  try {
    const superUsers = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.isSuperUser, true))
      .limit(1)

    if (superUsers.length > 0) {
      return apiErr('api.system.alreadyInitialized', { status: 403 })
    }

    const body = await req.json()
    const parsed = setupSchema.safeParse(body)
    if (!parsed.success) {
      return apiErr('api.system.setupValidationFailed', {
        status: 400,
        extra: { details: parsed.error.flatten().fieldErrors },
      })
    }

    const { adminEmail, adminPassword, adminName, orgName } = parsed.data

    const signUpResult = await auth.api.signUpEmail({
      body: {
        email: adminEmail,
        password: adminPassword,
        name: adminName,
      },
    })

    if (!signUpResult?.user?.id) {
      return apiErr('api.system.setupCreateUserFailed', { status: 500 })
    }

    const userId = signUpResult.user.id
    const workspaceId = crypto.randomUUID()
    const now = new Date()

    await db.transaction(async (tx) => {
      await tx.update(user).set({ isSuperUser: true }).where(eq(user.id, userId))

      await tx.insert(employeePlatformRoles).values({
        id: crypto.randomUUID(),
        userId,
        role: 'super_admin',
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      })

      await tx.insert(workspace).values({
        id: workspaceId,
        name: orgName || 'Default Workspace',
        ownerId: userId,
        billedAccountUserId: userId,
        allowPersonalApiKeys: true,
        createdAt: now,
        updatedAt: now,
      })

      await tx.insert(permissions).values({
        id: crypto.randomUUID(),
        entityType: 'workspace' as const,
        entityId: workspaceId,
        userId,
        permissionType: 'admin' as const,
        createdAt: now,
        updatedAt: now,
      })
    })

    logger.info('System initialization complete', { userId, workspaceId })

    return apiOk({ userId, workspaceId })
  } catch (error) {
    logger.error('System initialization failed', { error })
    return apiErr('api.system.setupFailed', { status: 500 })
  }
}
