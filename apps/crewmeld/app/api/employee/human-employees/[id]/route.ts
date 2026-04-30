import { db } from '@crewmeld/db'
import {
  CONTACT_METHOD_TYPES,
  type ContactMethod,
  type ContactMethodType,
  humanEmployees,
  sopPauseStates,
} from '@crewmeld/db/schema'
import { createLogger } from '@crewmeld/logger'
import { and, eq } from 'drizzle-orm'
import type { NextRequest } from 'next/server'
import { apiErr, apiOk } from '@/lib/api/response'
import { withAudit } from '@/lib/audit/with-audit'
import { getSession } from '@/lib/auth'

const logger = createLogger('API:HumanEmployees:Detail')

/**
 * GET /api/employee/human-employees/[id] — Get a single collaborator
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return apiErr('api.common.unauthorized', { status: 401 })
    }

    const { id } = await params

    const rows = await db.select().from(humanEmployees).where(eq(humanEmployees.id, id)).limit(1)

    if (rows.length === 0) {
      return apiErr('api.humanEmployee.notFound', { status: 404 })
    }

    return apiOk(rows[0])
  } catch (error) {
    logger.error('Failed to fetch human employee detail', error)
    return apiErr('api.humanEmployee.fetchDetailFailed', { status: 500 })
  }
}

/**
 * PATCH /api/employee/human-employees/[id] — Partial update
 */
async function _PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return apiErr('api.common.unauthorized', { status: 401 })
    }

    const { id } = await params
    const body = (await request.json()) as {
      name?: string
      title?: string
      department?: string
      contactMethods?: ContactMethod[]
    }

    if (body.name !== undefined) {
      if (body.name.length < 1 || body.name.length > 50) {
        return apiErr('api.humanEmployee.nameLengthInvalid', {
          status: 400,
          params: { min: 1, max: 50 },
        })
      }
    }

    if (body.contactMethods) {
      for (const cm of body.contactMethods) {
        if (!CONTACT_METHOD_TYPES.includes(cm.type as ContactMethodType)) {
          return apiErr('api.humanEmployee.contactTypeInvalid', {
            status: 400,
            params: { type: cm.type },
          })
        }
        if (!cm.value || cm.value.trim().length === 0) {
          return apiErr('api.humanEmployee.contactValueEmpty', { status: 400 })
        }
      }
    }

    const updateFields: Record<string, unknown> = { updatedAt: new Date() }
    if (body.name !== undefined) updateFields.name = body.name
    if (body.title !== undefined) updateFields.title = body.title
    if (body.department !== undefined) updateFields.department = body.department
    if (body.contactMethods !== undefined) updateFields.contactMethods = body.contactMethods

    const result = await db
      .update(humanEmployees)
      .set(updateFields)
      .where(eq(humanEmployees.id, id))
      .returning()

    if (result.length === 0) {
      return apiErr('api.humanEmployee.notFound', { status: 404 })
    }

    logger.info('Human employee updated', { id })

    return apiOk(result[0])
  } catch (error) {
    logger.error('Failed to update human employee', error)
    return apiErr('api.humanEmployee.updateFailed', { status: 500 })
  }
}

/**
 * DELETE /api/employee/human-employees/[id] — Delete
 * Rejects deletion when there are pending (waiting) approvals (409)
 */
async function _DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return apiErr('api.common.unauthorized', { status: 401 })
    }

    const { id } = await params

    const pendingApprovals = await db
      .select({ id: sopPauseStates.id })
      .from(sopPauseStates)
      .where(and(eq(sopPauseStates.assigneeId, id), eq(sopPauseStates.status, 'waiting')))
      .limit(1)

    if (pendingApprovals.length > 0) {
      return apiErr('api.humanEmployee.hasPendingApprovals', { status: 409 })
    }

    const result = await db.delete(humanEmployees).where(eq(humanEmployees.id, id)).returning()

    if (result.length === 0) {
      return apiErr('api.humanEmployee.notFound', { status: 404 })
    }

    logger.info('Human employee deleted', { id })

    return apiOk(null)
  } catch (error) {
    logger.error('Failed to delete human employee', error)
    return apiErr('api.humanEmployee.deleteFailed', { status: 500 })
  }
}

export const PATCH = withAudit(_PATCH)
export const DELETE = withAudit(_DELETE)
