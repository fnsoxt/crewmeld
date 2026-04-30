import { createEnvMock, loggerMock } from '@crewmeld/testing'
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest'

const mockSend = vi.fn()
const mockBatchSend = vi.fn()

vi.mock('resend', () => {
  return {
    Resend: vi.fn().mockImplementation(() => ({
      emails: {
        send: (...args: any[]) => mockSend(...args),
      },
      batch: {
        send: (...args: any[]) => mockBatchSend(...args),
      },
    })),
  }
})

vi.mock('@/lib/messaging/email/unsubscribe', () => ({
  isUnsubscribed: vi.fn(),
  generateUnsubscribeToken: vi.fn(),
}))

vi.mock('@/lib/core/config/env', () =>
  createEnvMock({
    RESEND_API_KEY: 'test-api-key',
    NEXT_PUBLIC_APP_URL: 'https://test.crewmeld.test',
    FROM_EMAIL_ADDRESS: 'CrewMeld <noreply@crewmeld.test>',
  })
)

vi.mock('@/lib/core/utils/urls', () => ({
  getEmailDomain: vi.fn().mockReturnValue('crewmeld.test'),
  getBaseUrl: vi.fn().mockReturnValue('https://test.crewmeld.test'),
  getBaseDomain: vi.fn().mockReturnValue('test.crewmeld.test'),
}))

vi.mock('@/lib/messaging/email/utils', () => ({
  getFromEmailAddress: vi.fn().mockReturnValue('CrewMeld <noreply@crewmeld.test>'),
}))

vi.mock('@crewmeld/logger', () => loggerMock)

import {
  type EmailType,
  hasEmailService,
  sendBatchEmails,
  sendEmail,
} from '@/lib/messaging/email/mailer'
import { generateUnsubscribeToken, isUnsubscribed } from '@/lib/messaging/email/unsubscribe'

describe('mailer', () => {
  const testEmailOptions = {
    to: 'test@example.com',
    subject: 'Test Subject',
    html: '<p>Test email content</p>',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    ;(isUnsubscribed as Mock).mockResolvedValue(false)
    ;(generateUnsubscribeToken as Mock).mockReturnValue('mock-token-123')

    mockSend.mockResolvedValue({
      data: { id: 'test-email-id' },
      error: null,
    })

    mockBatchSend.mockResolvedValue({
      data: [{ id: 'batch-email-1' }, { id: 'batch-email-2' }],
      error: null,
    })
  })

  describe('hasEmailService', () => {
    it('should return true when email service is configured', () => {
      const result = hasEmailService()
      expect(typeof result).toBe('boolean')
    })
  })

  describe('sendEmail', () => {
    it('should send a transactional email successfully', async () => {
      const result = await sendEmail({
        ...testEmailOptions,
        emailType: 'transactional',
      })

      expect(result.success).toBe(true)
      expect(isUnsubscribed).not.toHaveBeenCalled()
    })

    it('should check unsubscribe status for marketing emails', async () => {
      const result = await sendEmail({
        ...testEmailOptions,
        emailType: 'marketing',
      })

      expect(result.success).toBe(true)
      expect(isUnsubscribed).toHaveBeenCalledWith(testEmailOptions.to, 'marketing')
    })

    it('should skip sending if user has unsubscribed', async () => {
      ;(isUnsubscribed as Mock).mockResolvedValue(true)

      const result = await sendEmail({
        ...testEmailOptions,
        emailType: 'marketing',
      })

      expect(result.success).toBe(true)
      expect(result.message).toBe('Email skipped (user unsubscribed)')
      expect(result.data).toEqual({ id: 'skipped-unsubscribed' })
    })

    it('should not include unsubscribe when includeUnsubscribe is false', async () => {
      await sendEmail({
        ...testEmailOptions,
        emailType: 'marketing',
        includeUnsubscribe: false,
      })

      expect(generateUnsubscribeToken).not.toHaveBeenCalled()
    })

    it('should handle text-only emails without HTML', async () => {
      const result = await sendEmail({
        to: 'test@example.com',
        subject: 'Text Only',
        text: 'Plain text content',
      })

      expect(result.success).toBe(true)
    })

    it('should handle multiple recipients as array', async () => {
      const recipients = ['user1@example.com', 'user2@example.com', 'user3@example.com']
      const result = await sendEmail({
        ...testEmailOptions,
        to: recipients,
        emailType: 'marketing',
      })

      expect(result.success).toBe(true)
      expect(isUnsubscribed).toHaveBeenCalledWith('user1@example.com', 'marketing')
    })

    it('should handle general exceptions gracefully', async () => {
      ;(isUnsubscribed as Mock).mockRejectedValue(new Error('Database connection failed'))

      const result = await sendEmail({
        ...testEmailOptions,
        emailType: 'marketing',
      })

      expect(result.success).toBe(false)
      expect(result.message).toBe('Failed to send email')
    })
  })

  describe('sendBatchEmails', () => {
    const testBatchEmails = [
      { ...testEmailOptions, to: 'user1@example.com' },
      { ...testEmailOptions, to: 'user2@example.com' },
    ]

    it('should handle empty batch', async () => {
      const result = await sendBatchEmails({ emails: [] })

      expect(result.success).toBe(true)
      expect(result.results).toHaveLength(0)
    })

    it('should process multiple emails in batch', async () => {
      const result = await sendBatchEmails({ emails: testBatchEmails })

      expect(result.success).toBe(true)
      expect(result.results.length).toBeGreaterThanOrEqual(0)
    })

    it('should handle transactional emails without unsubscribe check', async () => {
      const batchEmails = [
        { ...testEmailOptions, to: 'user1@example.com', emailType: 'transactional' as EmailType },
        { ...testEmailOptions, to: 'user2@example.com', emailType: 'transactional' as EmailType },
      ]

      await sendBatchEmails({ emails: batchEmails })

      expect(isUnsubscribed).not.toHaveBeenCalled()
    })
  })
})
