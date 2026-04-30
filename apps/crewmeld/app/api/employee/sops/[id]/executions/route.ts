import { db } from '@crewmeld/db'
import type { SopExecutionStatus } from '@crewmeld/db/schema'
import { sopExecutions } from '@crewmeld/db/schema'
import { createLogger } from '@crewmeld/logger'
import { and, desc, eq, sql } from 'drizzle-orm'
import type { NextRequest } from 'next/server'
import { apiAuthErr, apiErr, apiOk } from '@/lib/api/response'
import { requirePermission } from '@/lib/auth/rbac/check-permission'

const logger = createLogger('API:Sops:Executions')

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission('sop:list')
    if (!auth.authenticated || auth.error) {
      return apiAuthErr(auth)
    }

    const { id } = await params
    const url = new URL(request.url)
    const status = url.searchParams.get('status') as SopExecutionStatus | null
    const page = Math.max(1, Number(url.searchParams.get('page') ?? '1'))
    const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('pageSize') ?? '20')))

    const filters = [eq(sopExecutions.sopDefinitionId, id)]
    if (status) {
      filters.push(eq(sopExecutions.status, status))
    }

    const whereClause = and(...filters)

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(sopExecutions)
      .where(whereClause)

    const total = Number(countResult?.count ?? 0)

    const items = await db
      .select()
      .from(sopExecutions)
      .where(whereClause)
      .orderBy(desc(sopExecutions.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize)

    return apiOk({ items, total, page, pageSize })
  } catch (error) {
    logger.error('Failed to fetch execution list', error)
    return apiErr('api.sop.fetchExecutionsFailed', { status: 500 })
  }
}
