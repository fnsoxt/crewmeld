import { auditLog, db } from '@crewmeld/db'
import { createLogger } from '@crewmeld/logger'
import { and, count, desc, gte, inArray, lte } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import { AuditAction, AuditResourceType, recordAudit } from '@/lib/audit/log'
import { getSession } from '@/lib/auth'
import { DEFAULT_LOCALE, LOCALES, type Locale, messages } from '@/locales'

const logger = createLogger('AuditExportAPI')

const MAX_EXPORT_RECORDS = 100_000
const MAX_DATE_RANGE_DAYS = 180
const BATCH_SIZE = 1000

const SECURITY_ACTIONS = [
  'api_key.created',
  'api_key.updated',
  'api_key.revoked',
  'personal_api_key.created',
  'personal_api_key.revoked',
  'password.reset',
  'oauth.disconnected',
  'member.invited',
  'member.removed',
  'member.role_changed',
  'system.config_changed',
  'model.config_changed',
  'connector.added',
  'connector.removed',
]

const OPERATIONS_ACTIONS = [
  'employee.created',
  'employee.updated',
  'employee.deleted',
  'employee.started',
  'employee.paused',
  'employee.stopped',
  'employee.error',
  'task.started',
  'task.completed',
  'task.failed',
  'task.approved',
  'task.rejected',
  'template.created',
  'template.updated',
  'template.deleted',
  'template.imported',
  'workflow.created',
  'workflow.deleted',
  'workflow.deployed',
  'workflow.undeployed',
]

function escapeCsv(value: string | null | undefined): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

/** Simple server-side interpolation: replaces {key} placeholders */
function interpolate(template: string, vars: Record<string, string | number>): string {
  let result = template
  for (const [k, v] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
  }
  return result
}

/** Resolve locale from query param */
function resolveLocale(param: string | null): Locale {
  if (param && (LOCALES as string[]).includes(param)) return param as Locale
  return DEFAULT_LOCALE
}

/** Build resource type label map from locale messages */
function buildResourceLabels(l: (typeof messages)['zh-CN']['logs']): Record<string, string> {
  return {
    employee: l.csvResourceEmployee,
    human_employee: l.csvResourceHumanEmployee,
    conversation: l.csvResourceConversation,
    channel: l.csvResourceChannel,
    connector: l.csvResourceConnector,
    model_config: l.csvResourceModelConfig,
    sop: l.csvResourceSop,
    scheduled_task: l.csvResourceScheduledTask,
    task: l.csvResourceTask,
    template: l.csvResourceTemplate,
    skill: l.csvResourceSkill,
    knowledge: l.csvResourceKnowledge,
    workflow: l.csvResourceWorkflow,
    system_config: l.csvResourceSystemConfig,
    user_management: l.csvResourceUserManagement,
    tool: l.csvResourceTool,
    integration: l.csvResourceIntegration,
    workshop: l.csvResourceWorkshop,
    audit_export: l.csvResourceAuditExport,
    chat: l.csvResourceChat,
  }
}

/** Build sub-action verb map from locale messages */
function buildVerbLabels(l: (typeof messages)['zh-CN']['logs']): Record<string, string> {
  return {
    created: l.csvVerbCreated,
    updated: l.csvVerbUpdated,
    deleted: l.csvVerbDeleted,
    status_changed: l.csvVerbStatusChanged,
    toggled: l.csvVerbToggled,
    approved: l.csvVerbApproved,
    rejected: l.csvVerbRejected,
    cancelled: l.csvVerbCancelled,
    executed: l.csvVerbExecuted,
    tested: l.csvVerbTested,
    test_run: l.csvVerbTestRun,
    health_check: l.csvVerbHealthCheck,
    deployed: l.csvVerbDeployed,
    undeployed: l.csvVerbUndeployed,
    instantiated: l.csvVerbInstantiated,
    imported: l.csvVerbImported,
    exported: l.csvVerbExported,
    decided: l.csvVerbDecided,
    quick_decided: l.csvVerbQuickDecided,
    message_sent: l.csvVerbMessageSent,
    notification_bot: l.csvVerbNotificationBot,
    bound: l.csvVerbBound,
    unbound: l.csvVerbUnbound,
    connected: l.csvVerbConnected,
    disconnected: l.csvVerbDisconnected,
    parsed: l.csvVerbParsed,
    uploaded: l.csvVerbUploaded,
    validated: l.csvVerbValidated,
    invoked: l.csvVerbInvoked,
    chatted: l.csvVerbChatted,
    generated: l.csvVerbGenerated,
    started: l.csvVerbStarted,
    paused: l.csvVerbPaused,
    stopped: l.csvVerbStopped,
    error: l.csvVerbError,
    completed: l.csvVerbCompleted,
    failed: l.csvVerbFailed,
    added: l.csvVerbAdded,
    removed: l.csvVerbRemoved,
    revoked: l.csvVerbRevoked,
    invited: l.csvVerbInvited,
    config_changed: l.csvVerbConfigChanged,
    role_updated: l.csvVerbRoleUpdated,
    custom_role_created: l.csvVerbCustomRoleCreated,
    registration_updated: l.csvVerbRegistrationUpdated,
    instances_added: l.csvVerbInstancesAdded,
    instances_updated: l.csvVerbInstancesUpdated,
    instances_removed: l.csvVerbInstancesRemoved,
  }
}

/** Build i18n description from action + resourceType + resourceName */
function buildDescription(
  action: string,
  resourceType: string,
  resourceName: string | null,
  dbDescription: string | null,
  l: (typeof messages)['zh-CN']['logs'],
  resourceLabels: Record<string, string>,
  verbLabels: Record<string, string>
): string {
  const parts = action.split('.')
  const verb = parts.length >= 2 ? parts[parts.length - 1] : null
  const verbLabel = verb ? verbLabels[verb] : undefined
  const resLabel = resourceLabels[resourceType]

  if (!verbLabel || !resLabel) return dbDescription ?? action

  if (resourceName) {
    return interpolate(l.csvDescriptionWithName, {
      action: verbLabel,
      resource: resLabel,
      name: resourceName,
    })
  }
  return interpolate(l.csvDescriptionNoName, { action: verbLabel, resource: resLabel })
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const locale = resolveLocale(searchParams.get('locale'))
  const l = messages[locale].logs

  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: l.exportErrorUnauthorized },
        { status: 401 }
      )
    }

    const startDateStr = searchParams.get('startDate')
    const endDateStr = searchParams.get('endDate')
    const category = searchParams.get('category') ?? 'all'
    const preview = searchParams.get('preview') === 'true'

    if (!startDateStr || !endDateStr) {
      return NextResponse.json(
        { success: false, error: l.exportErrorDateRequired },
        { status: 400 }
      )
    }

    const startDate = new Date(startDateStr)
    const endDate = new Date(endDateStr)

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return NextResponse.json({ success: false, error: l.exportErrorDateInvalid }, { status: 400 })
    }

    if (endDate <= startDate) {
      return NextResponse.json({ success: false, error: l.exportErrorDateOrder }, { status: 400 })
    }

    const daysDiff = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
    if (daysDiff > MAX_DATE_RANGE_DAYS) {
      return NextResponse.json(
        {
          success: false,
          error: interpolate(l.exportErrorDateRange, { days: MAX_DATE_RANGE_DAYS }),
        },
        { status: 400 }
      )
    }

    const conditions = [gte(auditLog.createdAt, startDate), lte(auditLog.createdAt, endDate)]

    if (category === 'security') {
      conditions.push(inArray(auditLog.action, SECURITY_ACTIONS))
    } else if (category === 'operations') {
      conditions.push(inArray(auditLog.action, OPERATIONS_ACTIONS))
    }

    const whereClause = and(...conditions)

    if (preview) {
      const [totalResult, breakdownResult] = await Promise.all([
        db.select({ total: count() }).from(auditLog).where(whereClause),
        db
          .select({
            category: auditLog.resourceType,
            count: count(),
          })
          .from(auditLog)
          .where(whereClause)
          .groupBy(auditLog.resourceType),
      ])

      return NextResponse.json({
        success: true,
        data: {
          totalRecords: totalResult[0]?.total ?? 0,
          dateRange: {
            start: startDate.toISOString(),
            end: endDate.toISOString(),
          },
          breakdown: breakdownResult.map((row) => ({
            category: row.category,
            count: row.count,
          })),
        },
      })
    }

    const totalResult = await db.select({ total: count() }).from(auditLog).where(whereClause)

    const total = totalResult[0]?.total ?? 0

    if (total > MAX_EXPORT_RECORDS) {
      return NextResponse.json(
        {
          success: false,
          error: interpolate(l.exportErrorTooMany, { total, max: MAX_EXPORT_RECORDS }),
        },
        { status: 400 }
      )
    }

    const resourceLabels = buildResourceLabels(l)
    const verbLabels = buildVerbLabels(l)

    // Build CSV header from i18n
    const csvHeader = `\uFEFF${[
      l.csvHeaderId,
      l.csvHeaderTime,
      l.csvHeaderOperator,
      l.csvHeaderEmail,
      l.csvHeaderAction,
      l.csvHeaderResourceType,
      l.csvHeaderResourceId,
      l.csvHeaderResourceName,
      l.csvHeaderDescription,
      l.csvHeaderIp,
      l.csvHeaderUserAgent,
      l.csvHeaderResult,
    ].join(',')}\n`

    let csvContent = csvHeader
    let offset = 0

    while (offset < total) {
      const batch = await db
        .select()
        .from(auditLog)
        .where(whereClause)
        .orderBy(desc(auditLog.createdAt))
        .limit(BATCH_SIZE)
        .offset(offset)

      for (const row of batch) {
        // Extract sub-action verb for action label
        const actionParts = row.action.split('.')
        const verb = actionParts.length >= 2 ? actionParts[actionParts.length - 1] : null
        const actionLabel =
          verb && verbLabels[verb]
            ? `${verbLabels[verb]}${resourceLabels[row.resourceType] ?? row.resourceType}`
            : row.action

        const description = buildDescription(
          row.action,
          row.resourceType,
          row.resourceName,
          row.description,
          l,
          resourceLabels,
          verbLabels
        )

        csvContent += `${[
          escapeCsv(row.id),
          escapeCsv(row.createdAt.toISOString()),
          escapeCsv(row.actorName),
          escapeCsv(row.actorEmail),
          escapeCsv(actionLabel),
          escapeCsv(resourceLabels[row.resourceType] ?? row.resourceType),
          escapeCsv(row.resourceId),
          escapeCsv(row.resourceName),
          escapeCsv(description),
          escapeCsv(row.ipAddress),
          escapeCsv(row.userAgent),
          l.csvResultSuccess,
        ].join(',')}\n`
      }

      offset += BATCH_SIZE
    }

    const startStr = startDateStr.replace(/[-:T]/g, '').slice(0, 8)
    const endStr = endDateStr.replace(/[-:T]/g, '').slice(0, 8)
    const filename = `audit_export_${startStr}_${endStr}.csv`

    // Store a language-neutral English fallback in `description`, and rely on
    // `metadata.i18nKey + i18nParams` so the audit detail UI can re-render the
    // sentence in the viewer's current locale instead of the writer's.
    recordAudit({
      actorId: session.user.id,
      actorName: session.user.name ?? undefined,
      actorEmail: session.user.email ?? undefined,
      action: AuditAction.AUDIT_EXPORTED,
      resourceType: AuditResourceType.AUDIT_EXPORT,
      description: `Exported audit logs (${startDateStr} to ${endDateStr}, category: ${category}, ${total} records total)`,
      metadata: {
        startDate: startDateStr,
        endDate: endDateStr,
        category,
        totalRecords: total,
        i18nKey: 'exportAuditDescription',
        i18nParams: {
          start: startDateStr,
          end: endDateStr,
          category,
          total,
        },
      },
      request,
    })

    return new Response(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    logger.error('Failed to export audit logs', { error })
    return NextResponse.json({ success: false, error: l.exportErrorFailed }, { status: 500 })
  }
}
