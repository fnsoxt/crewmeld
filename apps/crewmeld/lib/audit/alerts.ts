import type { AlertCategory, AlertSeverity } from '@crewmeld/db'
import { anomalyAlerts, db } from '@crewmeld/db'
import { createLogger } from '@crewmeld/logger'
import { nanoid } from 'nanoid'
import { t } from '@/lib/core/server-i18n'

const logger = createLogger('AuditAlerts')

export interface AlertI18nPayload {
  titleKey?: Parameters<typeof t>[0]
  titleParams?: Record<string, string>
  descKey?: Parameters<typeof t>[0]
  descParams?: Record<string, string>
  errorKey?: Parameters<typeof t>[0]
  errorParams?: Record<string, string>
}

interface CreateAlertParams {
  severity: AlertSeverity
  category: AlertCategory
  title: string
  description?: string
  employeeId?: string
  employeeName?: string
  taskExecutionId?: string
  errorMessage?: string
  errorStack?: string
  metadata?: Record<string, unknown>
  /**
   * Optional structured i18n payload — when provided, the english-rendered text
   * from these keys overrides the `title`/`description`/`errorMessage` strings,
   * and the keys are persisted into metadata for UI re-rendering.
   *
   * Caller contract: every key passed here MUST exist in BOTH:
   *   1. `apps/crewmeld/lib/core/server-i18n.ts` messages map (for write-time
   *      English fallback rendering)
   *   2. `apps/crewmeld/locales/{zh-CN,en}.ts` `alerts.*` namespace (for
   *      frontend re-rendering by locale)
   *
   * The static checker `scripts/check-log-i18n-keys.ts` (T16) verifies the
   * frontend side. The server-i18n side has no automated check — review the
   * keys you add against `lib/core/server-i18n.ts` directly.
   */
  i18n?: AlertI18nPayload
}

/**
 * Creates an anomaly alert record. Fire-and-forget — never throws or blocks the caller.
 */
export function createAlert(params: CreateAlertParams): void {
  try {
    const i18n = params.i18n
    const titleText = i18n?.titleKey ? t(i18n.titleKey, 'en', i18n.titleParams) : params.title
    const descText = i18n?.descKey ? t(i18n.descKey, 'en', i18n.descParams) : params.description
    const errorText = i18n?.errorKey
      ? t(i18n.errorKey, 'en', i18n.errorParams)
      : params.errorMessage

    const i18nMeta: Record<string, unknown> = {}
    if (i18n?.titleKey) {
      i18nMeta.i18nKey = i18n.titleKey
      i18nMeta.i18nParams = i18n.titleParams
    }
    if (i18n?.descKey) {
      i18nMeta.descI18nKey = i18n.descKey
      i18nMeta.descI18nParams = i18n.descParams
    }
    if (i18n?.errorKey) {
      i18nMeta.errorI18nKey = i18n.errorKey
      i18nMeta.errorI18nParams = i18n.errorParams
    }

    db.insert(anomalyAlerts)
      .values({
        id: nanoid(),
        severity: params.severity,
        category: params.category,
        title: titleText,
        description: descText,
        employeeId: params.employeeId,
        employeeName: params.employeeName,
        taskExecutionId: params.taskExecutionId,
        errorMessage: errorText,
        errorStack: params.errorStack,
        // i18nMeta wins on collision: callers cannot accidentally shadow i18n keys via metadata
        metadata: { ...(params.metadata ?? {}), ...i18nMeta },
      })
      .then(() => {
        logger.debug('Alert created', {
          severity: params.severity,
          category: params.category,
          title: titleText,
        })
      })
      .catch((error) => {
        logger.error('Failed to create alert', { error, title: titleText })
      })
  } catch (error) {
    logger.error('Failed to initiate alert creation', {
      error,
      title: params.title ?? params.i18n?.titleKey ?? 'unknown',
    })
  }
}
