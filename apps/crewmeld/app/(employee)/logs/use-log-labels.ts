'use client'

import { useMemo } from 'react'
import { useTranslation } from '@/hooks/use-translation'

/**
 * Shared lookup maps used by both the audit log list (operations-tab) and the
 * detail drawer. Keeping them here ensures both surfaces resolve the same
 * action/resource codes to the same localized labels — the historical mismatch
 * caused by two separate maps drifting out of sync was the primary source of
 * mixed-language descriptions in the detail panel.
 */

export function useActionLabels(): Record<string, string> {
  const { t } = useTranslation()
  return useMemo(
    () => ({
      // Digital employees
      'employee.created': t('logs.actionEmployeeCreated'),
      'employee.updated': t('logs.actionEmployeeUpdated'),
      'employee.deleted': t('logs.actionEmployeeDeleted'),
      'employee.started': t('logs.actionEmployeeStarted'),
      'employee.paused': t('logs.actionEmployeePaused'),
      'employee.stopped': t('logs.actionEmployeeStopped'),
      'employee.error': t('logs.actionEmployeeError'),
      'employee.status_changed': t('logs.actionEmployeeStatusChanged'),
      'employee.test_run': t('logs.actionEmployeeTestRun'),
      'employee.connected': t('logs.actionEmployeeConnected'),
      'employee.disconnected': t('logs.actionEmployeeDisconnected'),
      // Human employees
      'human_employee.created': t('logs.actionHumanCreated'),
      'human_employee.updated': t('logs.actionHumanUpdated'),
      'human_employee.deleted': t('logs.actionHumanDeleted'),
      // Tasks
      'task.started': t('logs.actionTaskStarted'),
      'task.completed': t('logs.actionTaskCompleted'),
      'task.failed': t('logs.actionTaskFailed'),
      'task.approved': t('logs.actionTaskApproved'),
      'task.rejected': t('logs.actionTaskRejected'),
      // Scheduled tasks
      'scheduled_task.created': t('logs.actionScheduledCreated'),
      'scheduled_task.updated': t('logs.actionScheduledUpdated'),
      'scheduled_task.deleted': t('logs.actionScheduledDeleted'),
      'scheduled_task.toggled': t('logs.actionScheduledToggled'),
      'scheduled_task.executed': t('logs.actionScheduledExecuted'),
      // Connectors
      'connector.created': t('logs.actionConnectorCreated'),
      'connector.updated': t('logs.actionConnectorUpdated'),
      'connector.deleted': t('logs.actionConnectorDeleted'),
      'connector.added': t('logs.actionConnectorAdded'),
      'connector.removed': t('logs.actionConnectorRemoved'),
      'connector.tested': t('logs.actionConnectorTested'),
      'connector.health_check': t('logs.actionConnectorHealthCheck'),
      // Channels
      'channel.created': t('logs.actionChannelCreated'),
      'channel.updated': t('logs.actionChannelUpdated'),
      'channel.deleted': t('logs.actionChannelDeleted'),
      'channel.tested': t('logs.actionChannelTested'),
      'channel.notification_bot': t('logs.actionChannelNotificationBot'),
      // Model configs
      'model_config.created': t('logs.actionModelConfigAdded'),
      'model_config.updated': t('logs.actionModelConfigUpdated'),
      'model_config.deleted': t('logs.actionModelConfigDeleted'),
      'model_config.tested': t('logs.actionModelConfigTested'),
      'model_config.chatted': t('logs.actionModelConfigChatted'),
      // SOP
      'sop.created': t('logs.actionSopCreated'),
      'sop.updated': t('logs.actionSopUpdated'),
      'sop.deleted': t('logs.actionSopDeleted'),
      'sop.executed': t('logs.actionSopExecuted'),
      'sop.cancelled': t('logs.actionSopCancelled'),
      'sop.decided': t('logs.actionSopDecided'),
      'sop.quick_decided': t('logs.actionSopQuickDecided'),
      // Skills
      'skill.created': t('logs.actionSkillCreated'),
      'skill.updated': t('logs.actionSkillUpdated'),
      'skill.deleted': t('logs.actionSkillDeleted'),
      'skill.deployed': t('logs.actionSkillDeployed'),
      'skill.bound': t('logs.actionSkillBound'),
      'skill.unbound': t('logs.actionSkillUnbound'),
      'skill.instances_added': t('logs.actionSkillInstancesAdded'),
      'skill.instances_updated': t('logs.actionSkillInstancesUpdated'),
      'skill.instances_removed': t('logs.actionSkillInstancesRemoved'),
      // Knowledge bases
      'knowledge.bound': t('logs.actionKnowledgeBound'),
      'knowledge.unbound': t('logs.actionKnowledgeUnbound'),
      'knowledge.created': t('logs.actionKnowledgeCreated'),
      'knowledge.deleted': t('logs.actionKnowledgeDeleted'),
      'knowledge.parsed': t('logs.actionKnowledgeParsed'),
      'knowledge.uploaded': t('logs.actionKnowledgeUploaded'),
      'knowledge.updated': t('logs.actionKnowledgeUpdated'),
      // Templates
      'template.created': t('logs.actionTemplateCreated'),
      'template.updated': t('logs.actionTemplateUpdated'),
      'template.deleted': t('logs.actionTemplateDeleted'),
      'template.imported': t('logs.actionTemplateImported'),
      'template.instantiated': t('logs.actionTemplateInstantiated'),
      'template.custom-role_added': t('logs.actionTemplateCustomRoleAdded'),
      // Workflows
      'workflow.created': t('logs.actionWorkflowCreated'),
      'workflow.updated': t('logs.actionWorkflowUpdated'),
      'workflow.deleted': t('logs.actionWorkflowDeleted'),
      'workflow.deployed': t('logs.actionWorkflowDeployed'),
      'workflow.undeployed': t('logs.actionWorkflowUndeployed'),
      'workflow.bound': t('logs.actionWorkflowBound'),
      'workflow.unbound': t('logs.actionWorkflowUnbound'),
      // Tools
      'tool.executed': t('logs.actionToolExecuted'),
      'tool.created': t('logs.actionToolCreated'),
      'tool.deleted': t('logs.actionToolDeleted'),
      'tool.chatted': t('logs.actionToolChatted'),
      'tool.generated': t('logs.actionToolGenerated'),
      // Conversations
      'conversation.created': t('logs.actionConversationCreated'),
      'conversation.deleted': t('logs.actionConversationDeleted'),
      'conversation.message_sent': t('logs.actionConversationMessageSent'),
      // Integrations
      'integration.created': t('logs.actionIntegrationCreated'),
      'integration.updated': t('logs.actionIntegrationUpdated'),
      'integration.invoked': t('logs.actionIntegrationInvoked'),
      'integration.chatted': t('logs.actionIntegrationChatted'),
      // System configs
      'system.config_changed': t('logs.actionSystemConfigChanged'),
      'model.config_changed': t('logs.actionModelConfigChanged'),
      'system_config.updated': t('logs.actionSystemConfigUpdated'),
      'system_config.health_check': t('logs.actionSystemConfigHealthCheck'),
      'system_config.uploaded': t('logs.actionSystemConfigUploaded'),
      'system_config.validated': t('logs.actionSystemConfigValidated'),
      'system_config.registration_updated': t('logs.actionRegistrationUpdated'),
      // User management
      'user_management.status_changed': t('logs.actionUserStatusChanged'),
      'user_management.approved': t('logs.actionUserApproved'),
      'user_management.role_updated': t('logs.actionUserRoleUpdated'),
      // Audit
      'audit.exported': t('logs.actionAuditExported'),
      // API Key
      'api_key.created': t('logs.actionApiKeyCreated'),
      'api_key.revoked': t('logs.actionApiKeyRevoked'),
      // Members
      'member.invited': t('logs.actionMemberInvited'),
      'member.removed': t('logs.actionMemberRemoved'),
    }),
    [t]
  )
}

export function useResourceTypeLabels(): Record<string, string> {
  const { t } = useTranslation()
  return useMemo(
    () => ({
      employee: t('logs.resourceEmployee'),
      human_employee: t('logs.resourceHumanEmployee'),
      conversation: t('logs.resourceConversation'),
      channel: t('logs.resourceChannel'),
      connector: t('logs.resourceConnector'),
      model_config: t('logs.resourceModelConfig'),
      sop: t('logs.resourceSop'),
      scheduled_task: t('logs.resourceScheduledTask'),
      task: t('logs.resourceTask'),
      template: t('logs.resourceTemplate'),
      skill: t('logs.resourceSkill'),
      knowledge: t('logs.resourceKnowledge'),
      workflow: t('logs.resourceWorkflow'),
      system_config: t('logs.resourceSystemConfig'),
      user_management: t('logs.resourceUserManagement'),
      tool: t('logs.resourceTool'),
      integration: t('logs.resourceIntegration'),
      workshop: t('logs.resourceWorkshop'),
      audit_export: t('logs.resourceAuditExport'),
      role: t('logs.resourceRole'),
      chat: 'Chat',
    }),
    [t]
  )
}
