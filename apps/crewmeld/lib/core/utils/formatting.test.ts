/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  formatAbsoluteDate,
  formatCompactDateTimeI18n,
  formatDateTime,
  formatDateTimeI18n,
  formatDateTimeShortI18n,
  formatTime,
  formatTimeOnlyI18n,
  formatTimeWithSeconds,
} from '@/lib/core/utils/formatting'

const ISO_FIXTURE = '2026-04-25T06:30:45.000Z'
const DATE_FIXTURE = new Date(ISO_FIXTURE)

const has12hMarker = (s: string) => /\b(AM|PM|am|pm)\b/.test(s)

describe('time formatters use 24h consistently across locales', () => {
  describe('i18n formatters', () => {
    it('formatDateTimeI18n omits AM/PM in zh-CN', () => {
      expect(has12hMarker(formatDateTimeI18n(ISO_FIXTURE, 'zh-CN'))).toBe(false)
    })

    it('formatDateTimeI18n omits AM/PM in en', () => {
      expect(has12hMarker(formatDateTimeI18n(ISO_FIXTURE, 'en'))).toBe(false)
    })

    it('formatDateTimeShortI18n omits AM/PM in en', () => {
      expect(has12hMarker(formatDateTimeShortI18n(ISO_FIXTURE, 'en'))).toBe(false)
    })

    it('formatCompactDateTimeI18n omits AM/PM in en', () => {
      expect(has12hMarker(formatCompactDateTimeI18n(ISO_FIXTURE, 'en'))).toBe(false)
    })

    it('formatTimeOnlyI18n omits AM/PM in en', () => {
      expect(has12hMarker(formatTimeOnlyI18n(ISO_FIXTURE, 'en'))).toBe(false)
    })
  })

  describe('legacy non-i18n formatters', () => {
    it('formatDateTime omits AM/PM', () => {
      expect(has12hMarker(formatDateTime(DATE_FIXTURE))).toBe(false)
    })

    it('formatTime omits AM/PM', () => {
      expect(has12hMarker(formatTime(DATE_FIXTURE))).toBe(false)
    })

    it('formatTimeWithSeconds omits AM/PM', () => {
      expect(has12hMarker(formatTimeWithSeconds(DATE_FIXTURE, false))).toBe(false)
    })

    it('formatAbsoluteDate omits AM/PM', () => {
      expect(has12hMarker(formatAbsoluteDate(ISO_FIXTURE))).toBe(false)
    })
  })
})
