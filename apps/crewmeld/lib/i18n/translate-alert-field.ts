import { translateLogPayload } from './log-payload'

/**
 * Identifier for one of an alert's translatable fields.
 *   'title'       → metadata.i18nKey      / i18nParams
 *   'description' → metadata.descI18nKey  / descI18nParams
 *   'error'       → metadata.errorI18nKey / errorI18nParams
 */
export type AlertField = 'title' | 'description' | 'error'

const FIELD_TO_METADATA_KEYS: Record<AlertField, { keyName: string; paramsName: string }> = {
  title: { keyName: 'i18nKey', paramsName: 'i18nParams' },
  description: { keyName: 'descI18nKey', paramsName: 'descI18nParams' },
  error: { keyName: 'errorI18nKey', paramsName: 'errorI18nParams' },
}

/**
 * Translate one of an alert's text fields via structured i18n payload in metadata.
 *
 * Each alert can carry up to three independent i18n payloads (one per field).
 * This helper picks the right pair for the requested field, builds a virtual
 * sub-metadata bag in the shape `translateLogPayload` expects, and delegates
 * translation under the `'alerts'` namespace. Falls back to the stored text
 * when no key is present for that field.
 */
export function translateAlertField(
  text: string | null | undefined,
  metadata: Record<string, unknown> | null | undefined,
  field: AlertField,
  t: (key: string, vars?: Record<string, string | number>) => string
): string {
  const { keyName, paramsName } = FIELD_TO_METADATA_KEYS[field]
  const key = metadata?.[keyName]
  const params = metadata?.[paramsName]
  const subMeta = typeof key === 'string' ? { i18nKey: key, i18nParams: params } : null
  return translateLogPayload(text ?? '', subMeta, t, 'alerts')
}
