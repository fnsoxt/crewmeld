import { db } from '@crewmeld/db'
import { sopDefinitions } from '@crewmeld/db/schema'
import { createLogger } from '@crewmeld/logger'
import { and, desc, eq, ilike, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import type { NextRequest } from 'next/server'
import { apiAuthErr, apiErr, apiOk } from '@/lib/api/response'
import { withAudit } from '@/lib/audit/with-audit'
import { requirePermission } from '@/lib/auth/rbac/check-permission'
import type { SopDefinitionPayload } from '@/types/sop'

const logger = createLogger('API:Sops')

export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission('sop:list')
    if (!auth.authenticated || auth.error) {
      return apiAuthErr(auth)
    }

    const url = new URL(request.url)
    const triggerType = url.searchParams.get('triggerType')
    const isActive = url.searchParams.get('isActive')
    const search = url.searchParams.get('search')
    const page = Math.max(1, Number(url.searchParams.get('page') ?? '1'))
    const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('pageSize') ?? '20')))

    const filters = []
    if (triggerType) {
      filters.push(eq(sopDefinitions.triggerType, triggerType as 'scheduled' | 'event' | 'manual'))
    }
    if (isActive !== null && isActive !== undefined && isActive !== '') {
      filters.push(eq(sopDefinitions.isActive, isActive === 'true'))
    }
    if (search) {
      filters.push(ilike(sopDefinitions.name, `%${search}%`))
    }

    const whereClause = filters.length > 0 ? and(...filters) : undefined

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(sopDefinitions)
      .where(whereClause)

    const total = Number(countResult?.count ?? 0)

    const items = await db
      .select()
      .from(sopDefinitions)
      .where(whereClause)
      .orderBy(desc(sopDefinitions.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize)

    return apiOk({ items, total, page, pageSize })
  } catch (error) {
    logger.error('Failed to fetch SOP list', error)
    return apiErr('api.sop.fetchListFailed', { status: 500 })
  }
}

async function _POST(request: NextRequest) {
  try {
    const auth = await requirePermission('sop:create')
    if (!auth.authenticated || auth.error) {
      return apiAuthErr(auth)
    }

    const body = (await request.json()) as SopDefinitionPayload

    if (!body.name || typeof body.name !== 'string' || body.name.trim().length < 1) {
      return apiErr('api.sop.nameRequired', { status: 400 })
    }

    const VALID_TRIGGER_TYPES = ['scheduled', 'event', 'manual'] as const
    if (
      body.triggerType &&
      !VALID_TRIGGER_TYPES.includes(body.triggerType as (typeof VALID_TRIGGER_TYPES)[number])
    ) {
      return apiErr('api.sop.invalidTriggerType', { status: 400 })
    }

    const sopId = `sop_${nanoid(16)}`

    await db.insert(sopDefinitions).values({
      id: sopId,
      name: body.name.trim(),
      description: body.description ?? null,
      triggerType: (body.triggerType as 'scheduled' | 'event' | 'manual') ?? 'manual',
      triggerConfig: body.triggerConfig ?? {},
      nodes: body.nodes ?? [],
      edges: body.edges ?? [],
      sopTimeoutMinutes: body.sopTimeoutMinutes ?? 1440,
      maxRejectionCycles: body.maxRejectionCycles ?? 3,
      createdBy: auth.userId!,
    })

    logger.info('SOP created', { sopId, name: body.name })

    return apiOk({ id: sopId })
  } catch (error) {
    logger.error('Failed to create SOP', error)
    return apiErr('api.sop.createFailed', { status: 500 })
  }
}

export const POST = withAudit(_POST)
