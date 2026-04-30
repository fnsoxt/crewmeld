/**
 * Structured i18n payload for log/audit/alert messages persisted to DB.
 *
 * The text column carries an English fallback (rendered at write time);
 * metadata carries the i18n key + params so the UI can re-render in any locale.
 */
export interface LogI18nPayload {
  i18nKey: string
  i18nParams?: Record<string, string | number>
}

/**
 * Merge an i18n payload into a base metadata object for DB write.
 */
export function makeLogMetadata(
  base: Record<string, unknown> | undefined,
  payload: LogI18nPayload
): Record<string, unknown> {
  return {
    ...(base ?? {}),
    i18nKey: payload.i18nKey,
    i18nParams: payload.i18nParams,
  }
}

/**
 * Translate a stored log/audit/alert message at read time.
 *
 * Priority:
 *   1. metadata.i18nKey -> t(`${namespace}.${i18nKey}`, i18nParams)
 *   2. fallbackText (raw stored text)
 *
 * Returns fallbackText when the key cannot be resolved (t returns the key
 * itself when missing, which we detect and treat as not-found).
 *
 * @param t  A pre-bound 2-arg translator. The frontend hook's `t` from
 *           `useTranslation()` works directly. Server-side `t` from
 *           `@/lib/core/server-i18n` requires an adapter:
 *           `(key, vars) => serverT(key as Parameters<typeof serverT>[0], 'en', vars)`
 */
export function translateLogPayload(
  fallbackText: string,
  metadata: Record<string, unknown> | null | undefined,
  t: (key: string, vars?: Record<string, string | number>) => string,
  namespace: string
): string {
  const i18nKey = metadata?.i18nKey
  if (typeof i18nKey !== 'string' || i18nKey.length === 0) return fallbackText

  const params = (metadata?.i18nParams as Record<string, string | number> | undefined) ?? {}
  const fullKey = `${namespace}.${i18nKey}`
  const translated = t(fullKey, params)

  // Convention: the project's t() returns the key itself when not found
  if (translated === fullKey) return fallbackText
  return translated
}
