import { describe, expect, it } from 'vitest'
import { sanitizeConnectionConfig, WEBHOOK_CHANNEL_TYPES } from './sanitize'

describe('sanitizeConnectionConfig', () => {
  it('strips cross-type contamination from email config', () => {
    const sanitized = sanitizeConnectionConfig('email', {
      smtpHost: 'smtp.qq.com',
      smtpPort: 465,
      username: 'u@x.com',
      password: 'pw',
      // These must be dropped — they are not legitimate email fields
      webhookUrl: 'https://example.com/hook',
      corpId: 'wecom-id',
      foo: 'bar',
    })
    expect(sanitized).toEqual({
      smtpHost: 'smtp.qq.com',
      smtpPort: 465,
      username: 'u@x.com',
      password: 'pw',
    })
    expect(sanitized).not.toHaveProperty('webhookUrl')
    expect(sanitized).not.toHaveProperty('corpId')
    expect(sanitized).not.toHaveProperty('foo')
  })

  it('preserves webhookUrl on telegram (webhook-based channel)', () => {
    const sanitized = sanitizeConnectionConfig('telegram', {
      telegramBotToken: 'abc',
      webhookUrl: 'https://example.com/tg/webhook',
      boundEmployeeId: 'emp-1',
      smtpHost: 'smtp.should-be-dropped.com',
    })
    expect(sanitized).toEqual({
      telegramBotToken: 'abc',
      webhookUrl: 'https://example.com/tg/webhook',
      boundEmployeeId: 'emp-1',
    })
  })

  it('preserves advanced custom_api fields (Postman-style editor)', () => {
    const sanitized = sanitizeConnectionConfig('custom_api', {
      apiEndpoint: 'https://api.x.com',
      httpMethod: 'POST',
      authType: 'bearer',
      bearerToken: 'tkn',
      params: [{ key: 'a', value: '1', enabled: true }],
      bogus: 'drop me',
    })
    expect(sanitized).toEqual({
      apiEndpoint: 'https://api.x.com',
      httpMethod: 'POST',
      authType: 'bearer',
      bearerToken: 'tkn',
      params: [{ key: 'a', value: '1', enabled: true }],
    })
  })

  it('returns empty object when config has no recognized keys', () => {
    expect(sanitizeConnectionConfig('email', { foo: 1, bar: 2 })).toEqual({})
  })

  it('exposes the webhook channel list with expected members', () => {
    expect(WEBHOOK_CHANNEL_TYPES).toEqual(
      expect.arrayContaining(['wecom', 'dingtalk', 'feishu', 'telegram', 'wxoa'])
    )
    expect(WEBHOOK_CHANNEL_TYPES).not.toContain('email')
    expect(WEBHOOK_CHANNEL_TYPES).not.toContain('discord')
  })
})
