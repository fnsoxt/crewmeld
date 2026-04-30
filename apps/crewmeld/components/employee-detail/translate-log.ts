import { translateLogPayload } from '@/lib/i18n/log-payload'

/**
 * Translate log message for display.
 *
 * Priority:
 * 1. metadata.i18nKey — new structured logs: look up key under `employees.${i18nKey}`
 * 2. metadata.action  — legacy management action logs (employee_created, tool_bind, etc.)
 * 3. Fallback to raw message
 */
export function translateLogMessage(
  log: { message: string; metadata?: Record<string, unknown> },
  t: (key: string, vars?: Record<string, string | number>) => string
): string {
  const meta = log.metadata
  if (!meta) return log.message

  // ── Path 1: structured i18nKey (delegated to shared helper) ──
  if (typeof meta.i18nKey === 'string') {
    return translateLogPayload(log.message, meta, t, 'employees')
  }

  // ── Path 2: legacy metadata.action mapping ──
  if (!meta.action) return log.message

  const action = meta.action as string
  const name = (meta.toolName ??
    meta.modelName ??
    meta.kbName ??
    meta.connectionName ??
    meta.templateName ??
    '') as string
  const instance = (meta.instanceName ?? '') as string

  switch (action) {
    case 'employee_created':
      return name
        ? t('employees.logActionEmployeeCreatedWithTemplate', { name })
        : t('employees.logActionEmployeeCreated')
    case 'tool_bind':
      return instance
        ? t('employees.logActionToolBindInstance', { name, instance })
        : t('employees.logActionToolBind', { name })
    case 'tool_unbind':
      return instance
        ? t('employees.logActionToolUnbindInstance', { name, instance })
        : t('employees.logActionToolUnbind', { name })
    case 'model_bind':
      return t('employees.logActionModelBind', { name })
    case 'model_unbind':
      return t('employees.logActionModelUnbind')
    case 'kb_bind':
      return name ? t('employees.logActionKbBind', { name }) : log.message
    case 'kb_unbind':
      return name ? t('employees.logActionKbUnbind', { name }) : log.message
    case 'connection_bind':
      return t('employees.logActionConnectionBind', { name })
    case 'connection_unbind':
      return t('employees.logActionConnectionUnbind', { name })
    case 'status_change':
      return meta.statusKey ? t(`employees.${meta.statusKey as string}`) : log.message
    default:
      return log.message
  }
}
