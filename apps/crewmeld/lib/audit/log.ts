import { auditLog, db } from '@crewmeld/db'
import { createLogger } from '@crewmeld/logger'
import { nanoid } from 'nanoid'

const logger = createLogger('AuditLog')

/**
 * All auditable actions in the platform, grouped by resource type.
 */
export const AuditAction = {
  // API Keys
  API_KEY_CREATED: 'api_key.created',
  API_KEY_UPDATED: 'api_key.updated',
  API_KEY_REVOKED: 'api_key.revoked',
  PERSONAL_API_KEY_CREATED: 'personal_api_key.created',
  PERSONAL_API_KEY_REVOKED: 'personal_api_key.revoked',

  // BYOK Keys
  BYOK_KEY_CREATED: 'byok_key.created',
  BYOK_KEY_DELETED: 'byok_key.deleted',

  // Chat
  CHAT_DEPLOYED: 'chat.deployed',
  CHAT_UPDATED: 'chat.updated',
  CHAT_DELETED: 'chat.deleted',

  // Billing
  CREDIT_PURCHASED: 'credit.purchased',

  // Credential Sets
  CREDENTIAL_SET_CREATED: 'credential_set.created',
  CREDENTIAL_SET_UPDATED: 'credential_set.updated',
  CREDENTIAL_SET_DELETED: 'credential_set.deleted',
  CREDENTIAL_SET_MEMBER_REMOVED: 'credential_set_member.removed',
  CREDENTIAL_SET_MEMBER_LEFT: 'credential_set_member.left',
  CREDENTIAL_SET_INVITATION_CREATED: 'credential_set_invitation.created',
  CREDENTIAL_SET_INVITATION_ACCEPTED: 'credential_set_invitation.accepted',
  CREDENTIAL_SET_INVITATION_RESENT: 'credential_set_invitation.resent',
  CREDENTIAL_SET_INVITATION_REVOKED: 'credential_set_invitation.revoked',

  // Documents
  DOCUMENT_UPLOADED: 'document.uploaded',
  DOCUMENT_UPDATED: 'document.updated',
  DOCUMENT_DELETED: 'document.deleted',

  // Environment
  ENVIRONMENT_UPDATED: 'environment.updated',

  // Files
  FILE_UPLOADED: 'file.uploaded',
  FILE_DELETED: 'file.deleted',

  // Folders
  FOLDER_CREATED: 'folder.created',
  FOLDER_DELETED: 'folder.deleted',
  FOLDER_DUPLICATED: 'folder.duplicated',

  // Forms
  FORM_CREATED: 'form.created',
  FORM_UPDATED: 'form.updated',
  FORM_DELETED: 'form.deleted',

  // Invitations
  INVITATION_ACCEPTED: 'invitation.accepted',
  INVITATION_REVOKED: 'invitation.revoked',

  // Knowledge Bases
  KNOWLEDGE_BASE_CREATED: 'knowledge_base.created',
  KNOWLEDGE_BASE_UPDATED: 'knowledge_base.updated',
  KNOWLEDGE_BASE_DELETED: 'knowledge_base.deleted',

  // MCP Servers
  MCP_SERVER_ADDED: 'mcp_server.added',
  MCP_SERVER_UPDATED: 'mcp_server.updated',
  MCP_SERVER_REMOVED: 'mcp_server.removed',

  // Members
  MEMBER_INVITED: 'member.invited',
  MEMBER_REMOVED: 'member.removed',
  MEMBER_ROLE_CHANGED: 'member.role_changed',

  // Notifications
  NOTIFICATION_CREATED: 'notification.created',
  NOTIFICATION_UPDATED: 'notification.updated',
  NOTIFICATION_DELETED: 'notification.deleted',

  // OAuth
  OAUTH_DISCONNECTED: 'oauth.disconnected',

  // Password
  PASSWORD_RESET: 'password.reset',

  // Organizations
  ORGANIZATION_CREATED: 'organization.created',
  ORGANIZATION_UPDATED: 'organization.updated',
  ORG_MEMBER_ADDED: 'org_member.added',
  ORG_MEMBER_REMOVED: 'org_member.removed',
  ORG_MEMBER_ROLE_CHANGED: 'org_member.role_changed',
  ORG_INVITATION_CREATED: 'org_invitation.created',
  ORG_INVITATION_ACCEPTED: 'org_invitation.accepted',
  ORG_INVITATION_REJECTED: 'org_invitation.rejected',
  ORG_INVITATION_CANCELLED: 'org_invitation.cancelled',
  ORG_INVITATION_REVOKED: 'org_invitation.revoked',

  // Permission Groups
  PERMISSION_GROUP_CREATED: 'permission_group.created',
  PERMISSION_GROUP_UPDATED: 'permission_group.updated',
  PERMISSION_GROUP_DELETED: 'permission_group.deleted',
  PERMISSION_GROUP_MEMBER_ADDED: 'permission_group_member.added',
  PERMISSION_GROUP_MEMBER_REMOVED: 'permission_group_member.removed',

  // Schedules
  SCHEDULE_UPDATED: 'schedule.updated',

  // Templates
  TEMPLATE_CREATED: 'template.created',
  TEMPLATE_UPDATED: 'template.updated',
  TEMPLATE_DELETED: 'template.deleted',

  // Webhooks
  WEBHOOK_CREATED: 'webhook.created',
  WEBHOOK_DELETED: 'webhook.deleted',

  // Workflows
  WORKFLOW_CREATED: 'workflow.created',
  WORKFLOW_DELETED: 'workflow.deleted',
  WORKFLOW_DEPLOYED: 'workflow.deployed',
  WORKFLOW_UNDEPLOYED: 'workflow.undeployed',
  WORKFLOW_DUPLICATED: 'workflow.duplicated',
  WORKFLOW_DEPLOYMENT_ACTIVATED: 'workflow.deployment_activated',
  WORKFLOW_DEPLOYMENT_REVERTED: 'workflow.deployment_reverted',
  WORKFLOW_VARIABLES_UPDATED: 'workflow.variables_updated',

  // Workspaces
  WORKSPACE_CREATED: 'workspace.created',
  WORKSPACE_DELETED: 'workspace.deleted',
  WORKSPACE_DUPLICATED: 'workspace.duplicated',

  // Digital Employees
  EMPLOYEE_CREATED: 'employee.created',
  EMPLOYEE_UPDATED: 'employee.updated',
  EMPLOYEE_DELETED: 'employee.deleted',
  EMPLOYEE_STARTED: 'employee.started',
  EMPLOYEE_PAUSED: 'employee.paused',
  EMPLOYEE_STOPPED: 'employee.stopped',
  EMPLOYEE_ERROR: 'employee.error',

  // Task Executions
  TASK_STARTED: 'task.started',
  TASK_COMPLETED: 'task.completed',
  TASK_FAILED: 'task.failed',
  TASK_APPROVED: 'task.approved',
  TASK_REJECTED: 'task.rejected',

  // Templates (digital employee)
  TEMPLATE_IMPORTED: 'template.imported',

  // Audit
  AUDIT_EXPORTED: 'audit.exported',

  // System Config
  SYSTEM_CONFIG_CHANGED: 'system.config_changed',
  MODEL_CONFIG_CHANGED: 'model.config_changed',
  CONNECTOR_ADDED: 'connector.added',
  CONNECTOR_REMOVED: 'connector.removed',
} as const

export type AuditActionType = (typeof AuditAction)[keyof typeof AuditAction]

/**
 * All resource types that can appear in audit log entries.
 */
export const AuditResourceType = {
  API_KEY: 'api_key',
  BILLING: 'billing',
  BYOK_KEY: 'byok_key',
  CHAT: 'chat',
  CREDENTIAL_SET: 'credential_set',
  DOCUMENT: 'document',
  ENVIRONMENT: 'environment',
  FILE: 'file',
  FOLDER: 'folder',
  FORM: 'form',
  KNOWLEDGE_BASE: 'knowledge_base',
  MCP_SERVER: 'mcp_server',
  NOTIFICATION: 'notification',
  OAUTH: 'oauth',
  ORGANIZATION: 'organization',
  PASSWORD: 'password',
  PERMISSION_GROUP: 'permission_group',
  SCHEDULE: 'schedule',
  TEMPLATE: 'template',
  WEBHOOK: 'webhook',
  WORKFLOW: 'workflow',
  WORKSPACE: 'workspace',

  // Digital Employee Platform
  EMPLOYEE: 'employee',
  TASK: 'task',
  CONNECTOR: 'connector',
  MODEL_CONFIG: 'model_config',
  SYSTEM_CONFIG: 'system_config',
  AUDIT_EXPORT: 'audit_export',
} as const

export type AuditResourceTypeValue = (typeof AuditResourceType)[keyof typeof AuditResourceType]

interface AuditLogParams {
  workspaceId?: string | null
  actorId: string | null
  action: AuditActionType | string
  resourceType: AuditResourceTypeValue | string
  resourceId?: string
  actorName?: string | null
  actorEmail?: string | null
  resourceName?: string
  description?: string
  metadata?: Record<string, unknown>
  request?: Request
}

/**
 * Records an audit log entry. Fire-and-forget — never throws or blocks the caller.
 */
export function recordAudit(params: AuditLogParams): void {
  try {
    const ipAddress =
      params.request?.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
      params.request?.headers.get('x-real-ip') ??
      undefined
    const userAgent = params.request?.headers.get('user-agent') ?? undefined

    db.insert(auditLog)
      .values({
        id: nanoid(),
        workspaceId: params.workspaceId || null,
        actorId: params.actorId || null,
        action: params.action,
        resourceType: params.resourceType,
        resourceId: params.resourceId,
        actorName: params.actorName ?? undefined,
        actorEmail: params.actorEmail ?? undefined,
        resourceName: params.resourceName,
        description: params.description,
        metadata: params.metadata ?? {},
        ipAddress,
        userAgent,
      })
      .then(() => {
        logger.debug('Audit log recorded', {
          action: params.action,
          resourceType: params.resourceType,
        })
      })
      .catch((error) => {
        logger.error('Failed to record audit log', { error, action: params.action })
        console.error('[AUDIT] Failed to record:', params.action, error)
      })
  } catch (error) {
    logger.error('Failed to initiate audit log', { error, action: params.action })
  }
}
