import { describe, expect, it } from 'vitest'
import { translateAuditDescription } from './translate-audit-description'

describe('translateAuditDescription', () => {
  const fakeT = (key: string, vars?: Record<string, string | number>) => {
    const dict: Record<string, string> = {
      'auditLog.actMessageSent': 'Message Sent',
      'auditLog.actMessageSent_zh': '发送消息',
      'auditLog.resConversation': 'Conversation',
      'auditLog.resConversation_zh': '对话',
      'auditLog.summaryTemplate': '{action} {resource} "{name}"',
      'auditLog.summaryTemplate_zh': '{action}了{resource}「{name}」',
      'auditLog.summaryShort': '{action} {resource}',
    }
    let s = dict[key] ?? key
    if (vars)
      for (const [k, v] of Object.entries(vars))
        s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
    return s
  }

  it('renders summaryTemplate with two-level key resolution', () => {
    const result = translateAuditDescription(
      'Message Sent Conversation "Slack chat"',
      {
        i18nKey: 'summaryTemplate',
        i18nParams: {
          actionKey: 'actMessageSent',
          resourceKey: 'resConversation',
          name: 'Slack chat',
        },
      },
      fakeT
    )
    expect(result).toBe('Message Sent Conversation "Slack chat"')
  })

  it('renders summaryShort when no name', () => {
    const result = translateAuditDescription(
      'Message Sent Conversation',
      {
        i18nKey: 'summaryShort',
        i18nParams: { actionKey: 'actMessageSent', resourceKey: 'resConversation', name: '' },
      },
      fakeT
    )
    expect(result).toBe('Message Sent Conversation')
  })

  it('falls back when metadata is null', () => {
    expect(translateAuditDescription('fallback text', null, fakeT)).toBe('fallback text')
  })

  it('falls back when actionKey is missing', () => {
    expect(translateAuditDescription('fallback', { i18nKey: 'summaryTemplate' }, fakeT)).toBe(
      'fallback'
    )
  })

  it('falls back when resourceKey is missing', () => {
    expect(
      translateAuditDescription(
        'fallback',
        { i18nKey: 'summaryTemplate', i18nParams: { actionKey: 'actMessageSent' } },
        fakeT
      )
    ).toBe('fallback')
  })

  it('falls back when summary template key not found', () => {
    expect(
      translateAuditDescription(
        'fallback',
        {
          i18nKey: 'unknownTemplate',
          i18nParams: { actionKey: 'actMessageSent', resourceKey: 'resConversation', name: 'X' },
        },
        fakeT
      )
    ).toBe('fallback')
  })
})
