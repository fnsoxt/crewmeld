import { auditLog, db } from '@crewmeld/db'
import {
  conversations,
  digitalEmployees,
  modelConfigs,
  roles,
  systemConnections,
} from '@crewmeld/db/schema'
import { createLogger } from '@crewmeld/logger'
import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import type { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { ANONYMOUS_USER_ID } from '@/lib/auth/constants'
import { t } from '@/lib/core/server-i18n'
import { makeLogMetadata } from '@/lib/i18n/log-payload'

const logger = createLogger('AuditWrapper')

export type RouteContext = { params: Promise<Record<string, string>> }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RouteHandler = (
  request: NextRequest,
  context: any
) => Promise<Response | NextResponse<any>> | Response | NextResponse<any>

/** Resource type mapping: first URL segment -> audit resource type */
const RESOURCE_TYPE_MAP: Record<string, string> = {
  employees: 'employee',
  'human-employees': 'human_employee',
  conversations: 'conversation',
  channels: 'channel',
  connectors: 'connector',
  models: 'model_config',
  sops: 'sop',
  'scheduled-tasks': 'scheduled_task',
  tasks: 'task',
  templates: 'template',
  skills: 'skill',
  knowledge: 'knowledge',
  workflows: 'workflow',
  settings: 'system_config',
  users: 'user_management',
  tools: 'tool',
  ragflow: 'knowledge',
  dify: 'integration',
  openclaw: 'integration',
  license: 'system_config',
  roles: 'role',
}

/** Path patterns that do not require auditing */
const SKIP_PATTERNS = [
  /\/stats\//,
  /\/health/,
  /\/stream$/,
  /\/auth\//,
  /\/pending-count/,
  /\/pending-list/,
  /\/discover-/,
  /\/api-key$/,
  /\/search-log$/,
  /\/search$/,
  /\/analytics$/,
  /\/history$/,
  /\/runs$/,
]

/** Parse resource info from path */
function parseRoute(pathname: string) {
  const path = pathname.replace(/^\/api\/employee\//, '')
  const segments = path.split('/').filter(Boolean)

  const rawType = segments[0] ?? 'unknown'
  const resourceType = RESOURCE_TYPE_MAP[rawType] ?? rawType
  const resourceId = segments.length >= 2 ? segments[1] : null
  const subAction = segments.length >= 3 ? segments.slice(2).join('/') : null

  return { resourceType, resourceId, subAction }
}

/** Sub-path -> action keyword mapping (match full path first, then last segment) */
const SUB_ACTION_MAP: Record<string, string | ((method: string) => string)> = {
  // Full sub-paths
  'messages/send': 'message_sent',
  'notification-bot': 'notification_bot',
  'health-check': 'health_check',
  'test-run': 'test_run',
  'custom-role': 'custom_role_created',
  'quick-decide': 'quick_decided',
  // Single-segment sub-paths
  status: 'status_changed',
  toggle: 'toggled',
  approve: 'approved',
  reject: 'rejected',
  cancel: 'cancelled',
  execute: 'executed',
  test: 'tested',
  deploy: 'deployed',
  instantiate: 'instantiated',
  import: 'imported',
  export: 'exported',
  decide: 'decided',
  parse: 'parsed',
  upload: 'uploaded',
  validate: 'validated',
  invoke: 'invoked',
  chat: 'chatted',
  generate: 'generated',
  send: 'message_sent',
  bindings: (m) => (m === 'DELETE' ? 'unbound' : 'bound'),
  connections: (m) => (m === 'DELETE' ? 'disconnected' : 'connected'),
}

/** Infer audit action */
function inferAction(method: string, resourceType: string, subAction: string | null): string {
  if (subAction) {
    // Match full sub-path first, e.g. messages/send
    const fullMatch = SUB_ACTION_MAP[subAction]
    if (fullMatch) {
      const verb = typeof fullMatch === 'function' ? fullMatch(method) : fullMatch
      return `${resourceType}.${verb}`
    }
    // Then match the last segment, e.g. send
    const lastSeg = subAction.split('/').pop() ?? subAction
    const segMatch = SUB_ACTION_MAP[lastSeg]
    if (segMatch) {
      const verb = typeof segMatch === 'function' ? segMatch(method) : segMatch
      return `${resourceType}.${verb}`
    }
    // Fallback: construct from HTTP method
    if (method === 'POST') return `${resourceType}.${lastSeg}_added`
    if (method === 'DELETE') return `${resourceType}.${lastSeg}_removed`
    if (method === 'PATCH' || method === 'PUT') return `${resourceType}.${lastSeg}_updated`
  }

  switch (method) {
    case 'POST':
      return `${resourceType}.created`
    case 'PATCH':
    case 'PUT':
      return `${resourceType}.updated`
    case 'DELETE':
      return `${resourceType}.deleted`
    default:
      return `${resourceType}.accessed`
  }
}

const METHOD_LABEL_KEYS: Record<string, string> = {
  POST: 'auditMethodCreate',
  PATCH: 'auditMethodUpdate',
  PUT: 'auditMethodUpdate',
  DELETE: 'auditMethodDelete',
}

/** Get localized HTTP method label */
function getMethodLabel(method: string, lang = 'en'): string {
  const key = METHOD_LABEL_KEYS[method]
  return key ? t(key as Parameters<typeof t>[0], lang) : method
}

/** Resource type -> i18n key mapping */
const RESOURCE_LABEL_KEYS: Record<string, string> = {
  employee: 'auditResEmployee',
  human_employee: 'auditResHumanEmployee',
  conversation: 'auditResConversation',
  channel: 'auditResChannel',
  connector: 'auditResConnector',
  model_config: 'auditResModelConfig',
  sop: 'auditResSop',
  scheduled_task: 'auditResScheduledTask',
  task: 'auditResTask',
  template: 'auditResTemplate',
  skill: 'auditResSkill',
  knowledge: 'auditResKnowledge',
  workflow: 'auditResWorkflow',
  system_config: 'auditResSystemConfig',
  user_management: 'auditResUserManagement',
  tool: 'auditResTool',
  integration: 'auditResIntegration',
  role: 'auditResRole',
}

/** Get localized resource type label */
function getResourceLabel(type: string, lang = 'en'): string {
  const key = RESOURCE_LABEL_KEYS[type]
  return key ? t(key as Parameters<typeof t>[0], lang) : type
}

/** Action keyword -> i18n key mapping */
const SUB_ACTION_LABEL_KEYS: Record<string, string> = {
  created: 'auditActCreated',
  updated: 'auditActUpdated',
  deleted: 'auditActDeleted',
  status_changed: 'auditActStatusChanged',
  toggled: 'auditActToggled',
  approved: 'auditActApproved',
  rejected: 'auditActRejected',
  cancelled: 'auditActCancelled',
  executed: 'auditActExecuted',
  tested: 'auditActTested',
  test_run: 'auditActTestRun',
  health_check: 'auditActHealthCheck',
  deployed: 'auditActDeployed',
  instantiated: 'auditActInstantiated',
  imported: 'auditActImported',
  exported: 'auditActExported',
  decided: 'auditActDecided',
  quick_decided: 'auditActQuickDecided',
  message_sent: 'auditActMessageSent',
  notification_bot: 'auditActNotificationBot',
  bound: 'auditActBound',
  unbound: 'auditActUnbound',
  connected: 'auditActConnected',
  disconnected: 'auditActDisconnected',
  parsed: 'auditActParsed',
  uploaded: 'auditActUploaded',
  validated: 'auditActValidated',
  invoked: 'auditActInvoked',
  chatted: 'auditActChatted',
  generated: 'auditActGenerated',
  custom_role_created: 'auditActCustomRoleCreated',
}

/** Get localized sub-action label */
function getSubActionLabel(action: string, lang = 'en'): string {
  const key = SUB_ACTION_LABEL_KEYS[action]
  return key ? t(key as Parameters<typeof t>[0], lang) : action
}

/**
 * Convert a server-i18n audit key to a frontend `auditLog.*` namespace key.
 * Strips the leading 'audit' prefix and lowercases the first remaining character.
 * Keys without the 'audit' prefix are returned unchanged. Returns null for null input.
 *
 * Examples:
 *   'auditActMessageSent'  -> 'actMessageSent'
 *   'auditResConversation' -> 'resConversation'
 *   'auditMethodCreate'    -> 'methodCreate'
 */
function stripAuditPrefix(k: string | null): string | null {
  if (!k) return null
  if (!k.startsWith('audit')) return k
  const rest = k.slice('audit'.length)
  return rest.charAt(0).toLowerCase() + rest.slice(1)
}

/**
 * Look up a human-readable name from the database by resource type and ID (fire-and-forget style, returns undefined on failure)
 */
async function lookupResourceName(
  resourceType: string,
  resourceId: string | null
): Promise<string | undefined> {
  if (!resourceId) return undefined
  try {
    switch (resourceType) {
      case 'employee': {
        const [row] = await db
          .select({ name: digitalEmployees.name })
          .from(digitalEmployees)
          .where(eq(digitalEmployees.id, resourceId))
          .limit(1)
        return row?.name ?? undefined
      }
      case 'conversation': {
        // Conversation -> look up associated employee name
        const [row] = await db
          .select({ title: conversations.title, empName: digitalEmployees.name })
          .from(conversations)
          .leftJoin(digitalEmployees, eq(conversations.employeeId, digitalEmployees.id))
          .where(eq(conversations.id, resourceId))
          .limit(1)
        return row?.empName ?? row?.title ?? undefined
      }
      case 'model_config': {
        const [row] = await db
          .select({ name: modelConfigs.displayName })
          .from(modelConfigs)
          .where(eq(modelConfigs.id, resourceId))
          .limit(1)
        return row?.name ?? undefined
      }
      case 'connector':
      case 'channel': {
        const [row] = await db
          .select({ name: systemConnections.name })
          .from(systemConnections)
          .where(eq(systemConnections.id, resourceId))
          .limit(1)
        return row?.name ?? undefined
      }
      case 'role': {
        const [row] = await db
          .select({ name: roles.name })
          .from(roles)
          .where(eq(roles.id, resourceId))
          .limit(1)
        return row?.name ?? undefined
      }
      default:
        return undefined
    }
  } catch {
    return undefined
  }
}

/**
 * Wrap a route handler to automatically record audit logs after successful responses.
 *
 * Usage:
 * ```ts
 * import { withAudit } from '@/lib/audit/with-audit'
 * export const POST = withAudit(async (request) => { ... })
 * ```
 */
export function withAudit(handler: RouteHandler): RouteHandler {
  return async (request: NextRequest, context: unknown) => {
    const response = await handler(request, context)

    // Only audit write operations + successful responses
    const method = request.method
    if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) return response
    if (response.status >= 400) return response

    const pathname = request.nextUrl.pathname

    // Skip paths that do not require auditing
    if (SKIP_PATTERNS.some((p) => p.test(pathname))) return response

    // Before returning: pre-fetch sync info + clone (must be done before body is consumed)
    const contentType = response.headers.get('content-type') ?? ''
    const isJson = contentType.includes('application/json')
    const cloned = isJson ? response.clone() : null

    // Get session (still in request context, must be called before return)
    let actorId: string | null = null
    let actorName: string | null = null
    try {
      const session = await getSession()
      actorId = session?.user?.id ?? null
      actorName = session?.user?.name ?? null
    } catch {
      // ignore
    }
    if (actorId === ANONYMOUS_USER_ID) {
      actorId = null
      actorName = actorName ?? 'Anonymous'
    }

    // Execute audit logic asynchronously in the background (non-blocking)
    const auditCtx = { method, pathname, actorId, actorName, cloned }
    logger.info('withAudit triggered', { method, pathname, actorId })
    void runAuditInBackground(auditCtx, request)

    return response
  }
}

/** Execute audit recording in the background without blocking the request */
async function runAuditInBackground(
  ctx: {
    method: string
    pathname: string
    actorId: string | null
    actorName: string | null
    cloned: Response | null
  },
  request: Request
) {
  try {
    const { method, pathname, actorId, actorName, cloned } = ctx
    const { resourceType, resourceId, subAction } = parseRoute(pathname)
    const action = inferAction(method, resourceType, subAction)

    // 1) Extract resource name from JSON response body
    let resourceName: string | undefined
    let responseEmployeeId: string | undefined
    if (cloned) {
      try {
        const body = await cloned.json()
        const data = body?.data ?? body
        resourceName =
          data?.name ??
          data?.title ??
          data?.label ??
          data?.displayName ??
          data?.employeeName ??
          data?.connectionName ??
          data?.modelName ??
          undefined
        // Record employeeId for later lookup of associated employee name
        if (!resourceName && data?.employeeId) {
          responseEmployeeId = data.employeeId
        }
      } catch {
        // Parse failed, ignore
      }
    }

    // 2) Could not extract from response body -> query from database
    if (!resourceName && resourceId) {
      resourceName = await lookupResourceName(resourceType, resourceId)
    }
    // 3) Still not found, but has associated employeeId -> look up employee name
    if (!resourceName && responseEmployeeId) {
      try {
        const [row] = await db
          .select({ name: digitalEmployees.name })
          .from(digitalEmployees)
          .where(eq(digitalEmployees.id, responseEmployeeId))
          .limit(1)
        resourceName = row?.name ?? undefined
      } catch {
        /* ignore */
      }
    }

    // 4) Generate localized description (English fallback) + i18n payload
    const resKey = RESOURCE_LABEL_KEYS[resourceType] ?? null
    const actionParts = action.split('.')
    const verb = actionParts.length >= 2 ? actionParts[actionParts.length - 1] : null
    const verbKey =
      verb && SUB_ACTION_LABEL_KEYS[verb]
        ? SUB_ACTION_LABEL_KEYS[verb]
        : (METHOD_LABEL_KEYS[method] ?? null)
    const resLabelEn = resKey ? t(resKey as Parameters<typeof t>[0], 'en') : resourceType
    const verbLabelEn = verbKey ? t(verbKey as Parameters<typeof t>[0], 'en') : method
    const description = resourceName
      ? t('auditSummaryTemplate', 'en', {
          action: verbLabelEn,
          resource: resLabelEn,
          name: resourceName,
        })
      : `${verbLabelEn} ${resLabelEn}`

    // IMPORTANT: actionKey and resourceKey are i18n KEYS (not rendered strings).
    // The summaryTemplate uses {action}/{resource} placeholders that must be
    // resolved via a two-level lookup. Only the dedicated translateAuditDescription
    // renderer (lib/i18n/translate-audit-description.ts, T5+) handles this.
    // Do NOT render audit descriptions via the generic translateLogPayload — it
    // would produce raw '{action} {resource} ...' output.
    const auditI18nPayload = {
      i18nKey: resourceName ? 'summaryTemplate' : 'summaryShort',
      i18nParams: {
        actionKey: stripAuditPrefix(verbKey) ?? '',
        resourceKey: stripAuditPrefix(resKey) ?? '',
        name: resourceName ?? '',
      },
    }

    const ipAddress =
      request?.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
      request?.headers.get('x-real-ip') ??
      undefined
    const userAgent = request?.headers.get('user-agent') ?? undefined

    logger.info('Writing to DB', { action, description })
    await db.insert(auditLog).values({
      id: nanoid(),
      actorId: actorId || null,
      actorName: actorName ?? (actorId ? undefined : t('auditSystemUser', 'en')),
      action,
      resourceType,
      resourceId: resourceId ?? undefined,
      resourceName,
      description,
      // actorI18nKey is consumed by the audit UI in T6 (resolves to t(`auditLog.${actorI18nKey}`))
      metadata: makeLogMetadata(
        {
          method,
          pathname,
          subAction,
          ...(actorId ? {} : { actorI18nKey: 'systemUser' }),
        },
        auditI18nPayload
      ),
      ipAddress,
      userAgent,
    })
    logger.info('Write succeeded', { action })
  } catch (err) {
    logger.error('Background audit error', {
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
