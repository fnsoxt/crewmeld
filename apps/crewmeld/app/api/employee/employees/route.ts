import { db } from '@crewmeld/db'
import {
  dailyStats,
  digitalEmployees,
  employeeWorkflowBindings,
  modelConfigs,
  roles,
  taskExecutions,
  workLogs,
} from '@crewmeld/db/schema'
import { createLogger } from '@crewmeld/logger'
import { and, eq, ilike, or, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import type { NextRequest } from 'next/server'
import { apiAuthErr, apiErr, apiOk } from '@/lib/api/response'
import { withAudit } from '@/lib/audit/with-audit'
import { requirePermission } from '@/lib/auth/rbac/check-permission'
import { makeLogMetadata } from '@/lib/i18n/log-payload'
import { checkEmployeeQuota } from '@/lib/license/middleware'
import { syncTodayDailyStats } from '@/lib/stats/sync-daily-stats'
import { getBuiltinRole, isBuiltinRoleId } from '@/data/builtin-roles'

const logger = createLogger('EmployeeAPI')

const VALID_STATUSES = ['standby', 'active', 'paused', 'error'] as const

export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission('employee:list')
    if (!auth.authenticated || auth.error) {
      return apiAuthErr(auth)
    }

    const url = new URL(request.url)
    const status = url.searchParams.get('status')
    const search = url.searchParams.get('search')

    if (status && !VALID_STATUSES.includes(status as (typeof VALID_STATUSES)[number])) {
      return apiErr('api.employee.statusInvalid', { status: 400 })
    }

    const filters = []
    if (status) {
      filters.push(eq(digitalEmployees.status, status as (typeof VALID_STATUSES)[number]))
    }
    if (search) {
      filters.push(
        or(
          ilike(digitalEmployees.name, `%${search}%`),
          ilike(digitalEmployees.description, `%${search}%`)
        )!
      )
    }

    // Sync today's data from sopExecutions to dailyStats (throttled: at most once per minute)
    await syncTodayDailyStats()

    const today = new Date().toISOString().slice(0, 10)

    const rows = await db
      .select({
        id: digitalEmployees.id,
        name: digitalEmployees.name,
        avatar: digitalEmployees.avatar,
        description: digitalEmployees.description,
        blockType: digitalEmployees.blockType,
        status: digitalEmployees.status,
        workflowId: digitalEmployees.workflowId,
        config: digitalEmployees.config,
        createdAt: digitalEmployees.createdAt,
        updatedAt: digitalEmployees.updatedAt,
        modelDisplayName: modelConfigs.displayName,
        todayTasks: sql<number>`coalesce(${dailyStats.totalTasks}, 0)`.as('today_tasks'),
        successCount: sql<number>`coalesce(${dailyStats.successCount}, 0)`.as('success_count'),
        workflowBindingCount: sql<number>`(
          SELECT count(*) FROM ${employeeWorkflowBindings}
          WHERE ${employeeWorkflowBindings.employeeId} = ${digitalEmployees.id}
        )`.as('workflow_binding_count'),
        knowledgeBindingCount:
          sql<number>`coalesce(jsonb_array_length(${digitalEmployees.config}->'ragflowDatasetIds'), 0)`.as(
            'knowledge_binding_count'
          ),
      })
      .from(digitalEmployees)
      .leftJoin(
        dailyStats,
        and(eq(dailyStats.employeeId, digitalEmployees.id), eq(dailyStats.statDate, today))
      )
      .leftJoin(modelConfigs, eq(digitalEmployees.modelConfigId, modelConfigs.id))
      .where(filters.length > 0 ? and(...filters) : undefined)

    const data = rows.map((row) => ({
      id: row.id,
      name: row.name,
      avatar: row.avatar,
      description: row.description,
      blockType: row.blockType,
      status: row.status,
      workflowId: row.workflowId,
      config: row.config,
      todayTasks: Number(row.todayTasks),
      successRate:
        Number(row.todayTasks) > 0
          ? Number(((Number(row.successCount) / Number(row.todayTasks)) * 100).toFixed(1))
          : 0,
      blockCount: 0,
      modelDisplayName: row.modelDisplayName ?? null,
      workflowBindingCount: Number(row.workflowBindingCount),
      knowledgeBindingCount: Number(row.knowledgeBindingCount),
      createdAt: row.createdAt?.toISOString() ?? '',
      updatedAt: row.updatedAt?.toISOString() ?? '',
    }))

    return apiOk(data, { extra: { total: data.length } })
  } catch (error) {
    logger.error('Failed to fetch employee list', error)
    return apiErr('api.employee.fetchListFailed', { status: 500 })
  }
}

async function _POST(request: NextRequest) {
  try {
    const auth = await requirePermission('employee:create')
    if (!auth.authenticated || auth.error) {
      return apiAuthErr(auth)
    }

    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return apiErr('api.common.invalidBody', { status: 400 })
    }

    const { roleId, name, description, persona, avatar, config, workflowIds, modelConfigId } = body

    if (!name || typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 50) {
      return apiErr('api.employee.nameLengthInvalid', { status: 400 })
    }

    const quota = await checkEmployeeQuota()
    if (!quota.allowed && quota.reason) {
      return apiErr(quota.reason as import('@/lib/api/message-keys').MessageKey, {
        status: 403,
        params: quota.reasonParams,
      })
    }

    // Resolve role if provided — roles are now first-class (no longer embedded in templates)
    let resolvedRole:
      | { id: string; name: string; blockType: string; persona: string | null; icon: string | null }
      | undefined

    if (roleId && typeof roleId === 'string') {
      if (isBuiltinRoleId(roleId)) {
        // Built-in role: read from frontend static data, skip DB lookup
        const builtin = getBuiltinRole(roleId)
        if (!builtin) {
          return apiErr('api.employee.templateNotFound', { status: 404 })
        }
        resolvedRole = {
          id: builtin.id,
          name: builtin.name,
          blockType: builtin.blockType,
          persona: builtin.persona,
          icon: builtin.icon,
        }
      } else {
        const [foundRole] = await db
          .select({
            id: roles.id,
            name: roles.name,
            blockType: roles.blockType,
            persona: roles.persona,
            icon: roles.icon,
          })
          .from(roles)
          .where(eq(roles.id, roleId))
          .limit(1)

        if (!foundRole) {
          return apiErr('api.employee.templateNotFound', { status: 404 })
        }
        resolvedRole = foundRole
      }
    }

    const mergedConfig = {
      ...(typeof config === 'object' && config !== null ? config : {}),
      ...(resolvedRole ? { roleId: resolvedRole.id, roleName: resolvedRole.name } : {}),
    }

    const employeeId = `emp-${nanoid(12)}`

    await db.insert(digitalEmployees).values({
      id: employeeId,
      name: (name as string).trim(),
      avatar: typeof avatar === 'string' ? avatar : (resolvedRole?.icon ?? '🤖'),
      description: typeof description === 'string' ? description.trim() : null,
      persona:
        typeof persona === 'string' && persona.trim()
          ? persona.trim()
          : (resolvedRole?.persona ?? null),
      blockType: resolvedRole?.blockType ?? 'agent',
      status: 'active',
      config: mergedConfig,
      modelConfigId: typeof modelConfigId === 'string' ? modelConfigId : null,
    })

    if (Array.isArray(workflowIds) && workflowIds.length > 0) {
      for (const wfId of workflowIds) {
        if (typeof wfId === 'string') {
          try {
            await db.insert(employeeWorkflowBindings).values({
              id: `ewb-${nanoid(12)}`,
              employeeId,
              workflowId: wfId,
            })
          } catch {
            logger.warn(`Workflow binding failed: employee=${employeeId}, workflow=${wfId}`)
          }
        }
      }
    }

    // Write creation configuration logs
    try {
      const now = new Date()
      const logEntries: Array<{
        content: string
        metadata: Record<string, unknown>
        i18nKey: string
        i18nParams?: Record<string, string | number>
      }> = []

      // Employee onboarded
      logEntries.push({
        content: `Employee onboarded${resolvedRole ? ` (role: ${resolvedRole.name})` : ''}`,
        metadata: {
          action: 'employee_created',
          employeeId,
          roleId: resolvedRole?.id ?? null,
          roleName: resolvedRole?.name ?? null,
        },
        i18nKey: resolvedRole ? 'logActionEmployeeCreatedWithTemplate' : 'logActionEmployeeCreated',
        i18nParams: resolvedRole ? { name: resolvedRole.name } : undefined,
      })

      // Model binding
      if (typeof modelConfigId === 'string' && modelConfigId) {
        const [modelRow] = await db
          .select({ displayName: modelConfigs.displayName })
          .from(modelConfigs)
          .where(eq(modelConfigs.id, modelConfigId))
          .limit(1)
        const modelName = modelRow?.displayName ?? modelConfigId
        logEntries.push({
          content: `Bound model "${modelName}"`,
          metadata: { action: 'model_bind', modelConfigId, modelName },
          i18nKey: 'logActionModelBind',
          i18nParams: { name: modelName },
        })
      }

      for (const entry of logEntries) {
        const taskId = `task_${nanoid()}`
        await db.insert(taskExecutions).values({
          id: taskId,
          employeeId,
          triggerType: 'manual',
          status: 'success',
          input: entry.metadata,
          inputSummary: entry.content,
          outputSummary: entry.content,
          durationMs: 0,
          startedAt: now,
          completedAt: now,
        })
        await db.insert(workLogs).values({
          id: `log_${nanoid()}`,
          taskId,
          employeeId,
          logType: 'action',
          content: entry.content,
          metadata: makeLogMetadata(entry.metadata, {
            i18nKey: entry.i18nKey,
            i18nParams: entry.i18nParams,
          }),
        })
      }
    } catch (logErr) {
      logger.warn('Failed to write employee creation logs', { error: logErr })
    }

    logger.info(`Employee created: ${name} (${employeeId}), role=${resolvedRole?.name ?? 'none'}`)

    return apiOk({
      id: employeeId,
      name: (name as string).trim(),
      status: 'active',
      createdAt: new Date().toISOString(),
    })
  } catch (error) {
    logger.error('Failed to create employee', error)
    return apiErr('api.employee.createFailed', { status: 500 })
  }
}

export const POST = withAudit(_POST)
