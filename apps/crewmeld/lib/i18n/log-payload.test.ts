import { describe, expect, it } from 'vitest'
import { makeLogMetadata, translateLogPayload } from './log-payload'

describe('makeLogMetadata', () => {
  it('merges payload into base metadata', () => {
    const result = makeLogMetadata(
      { method: 'POST', pathname: '/foo' },
      { i18nKey: 'fooBar', i18nParams: { name: 'X' } }
    )
    expect(result).toEqual({
      method: 'POST',
      pathname: '/foo',
      i18nKey: 'fooBar',
      i18nParams: { name: 'X' },
    })
  })

  it('handles undefined base', () => {
    const result = makeLogMetadata(undefined, { i18nKey: 'fooBar' })
    expect(result).toEqual({ i18nKey: 'fooBar', i18nParams: undefined })
  })

  it('omits i18nParams when not provided', () => {
    const result = makeLogMetadata({ a: 1 }, { i18nKey: 'k' })
    expect(result).toMatchObject({ a: 1, i18nKey: 'k' })
  })
})

describe('translateLogPayload', () => {
  const fakeT = (key: string, vars?: Record<string, string | number>) => {
    const dict: Record<string, string> = {
      'auditLog.actMessageSent': 'Message Sent',
      'employees.logActionConnectionBind': 'Bound connection "{name}"',
    }
    let s = dict[key] ?? key
    if (vars)
      for (const [k, v] of Object.entries(vars))
        s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
    return s
  }

  it('returns translated text when metadata.i18nKey is present and key resolves', () => {
    const result = translateLogPayload(
      'fallback-should-not-appear',
      { i18nKey: 'logActionConnectionBind', i18nParams: { name: 'Slack' } },
      fakeT,
      'employees'
    )
    expect(result).toBe('Bound connection "Slack"')
  })

  it('falls back to fallbackText when key does not resolve', () => {
    const result = translateLogPayload(
      'Some english fallback',
      { i18nKey: 'unknownKey', i18nParams: {} },
      fakeT,
      'employees'
    )
    expect(result).toBe('Some english fallback')
  })

  it('falls back to fallbackText when metadata is null', () => {
    expect(translateLogPayload('plain text', null, fakeT, 'auditLog')).toBe('plain text')
  })

  it('falls back to fallbackText when metadata has no i18nKey', () => {
    expect(translateLogPayload('plain text', { method: 'POST' }, fakeT, 'auditLog')).toBe(
      'plain text'
    )
  })

  it('handles missing i18nParams', () => {
    const result = translateLogPayload(
      'Message Sent',
      { i18nKey: 'actMessageSent' },
      fakeT,
      'auditLog'
    )
    expect(result).toBe('Message Sent')
  })
})
