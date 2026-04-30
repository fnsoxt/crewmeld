import { describe, expect, it } from 'vitest'
import { translateAlertField } from './translate-alert-field'

const fakeT = (key: string, vars?: Record<string, string | number>) => {
  const dict: Record<string, string> = {
    'alerts.taskFailed': 'Task "{name}" failed',
    'alerts.detailVar': 'Reason: {reason}',
    'alerts.errorVar': 'Error code {code}',
  }
  let s = dict[key] ?? key
  if (vars)
    for (const [k, v] of Object.entries(vars))
      s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
  return s
}

describe('translateAlertField', () => {
  it('translates title field via i18nKey/i18nParams', () => {
    const result = translateAlertField(
      'Task "X" failed',
      { i18nKey: 'taskFailed', i18nParams: { name: 'X' } },
      'title',
      fakeT
    )
    expect(result).toBe('Task "X" failed')
  })

  it('translates description field via descI18nKey/descI18nParams', () => {
    const result = translateAlertField(
      'fallback',
      { descI18nKey: 'detailVar', descI18nParams: { reason: 'timeout' } },
      'description',
      fakeT
    )
    expect(result).toBe('Reason: timeout')
  })

  it('translates error field via errorI18nKey/errorI18nParams', () => {
    const result = translateAlertField(
      'fallback',
      { errorI18nKey: 'errorVar', errorI18nParams: { code: 503 } },
      'error',
      fakeT
    )
    expect(result).toBe('Error code 503')
  })

  it('falls back to text when metadata is null', () => {
    expect(translateAlertField('plain text', null, 'title', fakeT)).toBe('plain text')
  })

  it('falls back to text when the requested field key is absent', () => {
    expect(translateAlertField('fallback', { i18nKey: 'taskFailed' }, 'description', fakeT)).toBe(
      'fallback'
    )
  })

  it('falls back to empty string when text is null and no metadata key', () => {
    expect(translateAlertField(null, null, 'title', fakeT)).toBe('')
  })
})
