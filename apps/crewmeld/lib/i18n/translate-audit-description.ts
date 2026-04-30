/**
 * Render audit_log.description with two-level i18n resolution.
 *
 * Two metadata payload shapes are supported:
 *
 * 1. Summary form (written by withAudit):
 *    { i18nKey: 'summaryTemplate' | 'summaryShort',
 *      i18nParams: { actionKey: 'actMessageSent', resourceKey: 'resConversation', name: 'Foo' } }
 *    actionKey and resourceKey are themselves i18n keys; we resolve them first,
 *    then plug into the summary template.
 *
 * 2. Direct template form (written by recordAudit callers that own a dedicated template):
 *    { i18nKey: 'exportAuditDescription',
 *      i18nParams: { start: '...', end: '...', category: '...', total: 1234 } }
 *    Renders auditLog.<i18nKey> directly with the params verbatim.
 */
export function translateAuditDescription(
  fallbackText: string,
  metadata: Record<string, unknown> | null | undefined,
  t: (key: string, vars?: Record<string, string | number>) => string
): string {
  if (!metadata) return fallbackText

  const i18nKey = metadata.i18nKey
  if (typeof i18nKey !== 'string' || i18nKey.length === 0) return fallbackText

  const params = (metadata.i18nParams as Record<string, string | number> | undefined) ?? {}
  const actionKey = typeof params.actionKey === 'string' ? params.actionKey : null
  const resourceKey = typeof params.resourceKey === 'string' ? params.resourceKey : null

  const fullTemplateKey = `auditLog.${i18nKey}`

  // Summary form: resolve nested keys, then render template with action/resource/name.
  if (actionKey && resourceKey) {
    const action = t(`auditLog.${actionKey}`)
    const resource = t(`auditLog.${resourceKey}`)
    if (action === `auditLog.${actionKey}` || resource === `auditLog.${resourceKey}`) {
      return fallbackText
    }
    const rendered = t(fullTemplateKey, { action, resource, name: String(params.name ?? '') })
    if (rendered === fullTemplateKey) return fallbackText
    return rendered
  }

  // Direct template form: render auditLog.<i18nKey> with verbatim params.
  const rendered = t(fullTemplateKey, params)
  if (rendered === fullTemplateKey) return fallbackText
  return rendered
}
