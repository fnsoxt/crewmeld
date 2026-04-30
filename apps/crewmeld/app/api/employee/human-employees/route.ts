import { db } from '@crewmeld/db'
import {
  CONTACT_METHOD_TYPES,
  type ContactMethod,
  type ContactMethodType,
  humanEmployees,
} from '@crewmeld/db/schema'
import { createLogger } from '@crewmeld/logger'
import { and, ilike, or, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import type { NextRequest } from 'next/server'
import { apiErr, apiOk } from '@/lib/api/response'
import { withAudit } from '@/lib/audit/with-audit'
import { getSession } from '@/lib/auth'

const logger = createLogger('API:HumanEmployees')

/**
 * GET /api/employee/human-employees — List + search + pagination
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return apiErr('api.common.unauthorized', { status: 401 })
    }

    const url = new URL(request.url)
    const search = url.searchParams.get('search')
    const page = Math.max(1, Number.parseInt(url.searchParams.get('page') ?? '1', 10))
    const pageSize = Math.min(
      100,
      Math.max(1, Number.parseInt(url.searchParams.get('pageSize') ?? '20', 10))
    )
    const offset = (page - 1) * pageSize

    const filters = []
    if (search) {
      filters.push(
        or(ilike(humanEmployees.name, `%${search}%`), ilike(humanEmployees.title, `%${search}%`))!
      )
    }

    const whereClause = filters.length > 0 ? and(...filters) : undefined

    const [rows, countResult] = await Promise.all([
      db
        .select()
        .from(humanEmployees)
        .where(whereClause)
        .orderBy(humanEmployees.createdAt)
        .limit(pageSize)
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(humanEmployees).where(whereClause),
    ])

    return apiOk(rows, {
      extra: {
        pagination: {
          page,
          pageSize,
          total: countResult[0].count,
          totalPages: Math.ceil(countResult[0].count / pageSize),
        },
      },
    })
  } catch (error) {
    logger.error('Failed to fetch human employee list', error)
    return apiErr('api.humanEmployee.fetchListFailed', { status: 500 })
  }
}

/**
 * POST /api/employee/human-employees — Create
 */
async function _POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return apiErr('api.common.unauthorized', { status: 401 })
    }

    const body = (await request.json()) as {
      name?: string
      title?: string
      department?: string
      contactMethods?: ContactMethod[]
    }

    if (!body.name || body.name.length < 1 || body.name.length > 50) {
      return apiErr('api.humanEmployee.nameLengthInvalid', {
        status: 400,
        params: { min: 1, max: 50 },
      })
    }

    if (!body.title) {
      return apiErr('api.humanEmployee.titleRequired', { status: 400 })
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

    const id = `he-${nanoid(12)}`
    const now = new Date()

    const [created] = await db
      .insert(humanEmployees)
      .values({
        id,
        name: body.name,
        title: body.title,
        department: body.department ?? null,
        contactMethods: body.contactMethods ?? [],
        createdAt: now,
        updatedAt: now,
      })
      .returning()

    logger.info('Human employee created', { id, name: body.name })

    return apiOk(created, { status: 201 })
  } catch (error) {
    logger.error('Failed to create human employee', error)
    return apiErr('api.humanEmployee.createFailed', { status: 500 })
  }
}

export const POST = withAudit(_POST)
