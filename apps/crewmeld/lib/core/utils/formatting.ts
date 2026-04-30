import { t } from '@/lib/core/server-i18n'

/**
 * Get a user-friendly timezone abbreviation
 * @param timezone - IANA timezone string
 * @param date - Date to check for DST
 * @returns A simplified timezone string (e.g., "PST" instead of "America/Los_Angeles")
 */
export function getTimezoneAbbreviation(timezone: string, date: Date = new Date()): string {
  if (timezone === 'UTC') return 'UTC'

  const timezoneMap: Record<string, { standard: string; daylight: string }> = {
    'America/Los_Angeles': { standard: 'PST', daylight: 'PDT' },
    'America/Denver': { standard: 'MST', daylight: 'MDT' },
    'America/Chicago': { standard: 'CST', daylight: 'CDT' },
    'America/New_York': { standard: 'EST', daylight: 'EDT' },
    'Europe/London': { standard: 'GMT', daylight: 'BST' },
    'Europe/Paris': { standard: 'CET', daylight: 'CEST' },
    'Asia/Tokyo': { standard: 'JST', daylight: 'JST' }, // Japan doesn't use DST
    'Australia/Sydney': { standard: 'AEST', daylight: 'AEDT' },
    'Asia/Singapore': { standard: 'SGT', daylight: 'SGT' }, // Singapore doesn't use DST
  }

  if (timezone in timezoneMap) {
    const januaryDate = new Date(date.getFullYear(), 0, 1)
    const julyDate = new Date(date.getFullYear(), 6, 1)

    const januaryFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'short',
    })

    const julyFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'short',
    })

    const isDSTObserved = januaryFormatter.format(januaryDate) !== julyFormatter.format(julyDate)

    if (isDSTObserved) {
      const currentFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        timeZoneName: 'short',
      })

      const isDST = currentFormatter.format(date) !== januaryFormatter.format(januaryDate)
      return isDST ? timezoneMap[timezone].daylight : timezoneMap[timezone].standard
    }

    return timezoneMap[timezone].standard
  }

  return timezone
}

/**
 * Format a date into a human-readable format
 * @param date - The date to format
 * @param timezone - Optional IANA timezone string (e.g., 'America/Los_Angeles', 'UTC')
 * @returns A formatted date string in the format "MMM D, YYYY HH:mm"
 */
export function formatDateTime(date: Date, timezone?: string): string {
  const formattedDate = date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: false,
    timeZone: timezone || undefined,
  })

  if (timezone) {
    const tzAbbr = getTimezoneAbbreviation(timezone, date)
    return `${formattedDate} ${tzAbbr}`
  }

  return formattedDate
}

/**
 * Format a date into a short format
 * @param date - The date to format
 * @returns A formatted date string in the format "MMM D, YYYY"
 */
export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

/**
 * Formats a date string to absolute format for tooltip display
 * @param dateString - ISO date string to format
 * @returns A formatted date string (e.g., "Jan 22, 2026, 13:30")
 */
export function formatAbsoluteDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

/**
 * Format a time into a short format
 * @param date - The date to format
 * @returns A formatted time string in the format "HH:mm"
 */
export function formatTime(date: Date): string {
  return date.toLocaleString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: false,
  })
}

/**
 * Format a time with seconds and timezone
 * @param date - The date to format
 * @param includeTimezone - Whether to include the timezone abbreviation
 * @returns A formatted time string in the format "HH:mm:ss TZ"
 */
export function formatTimeWithSeconds(date: Date, includeTimezone = true): string {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZoneName: includeTimezone ? 'short' : undefined,
  })
}

/**
 * Format an ISO timestamp into a compact format for UI display
 * @param iso - ISO timestamp string
 * @returns A formatted string in "MM-DD HH:mm" format
 */
export function formatCompactTimestamp(iso: string): string {
  try {
    const d = new Date(iso)
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    const hh = String(d.getHours()).padStart(2, '0')
    const min = String(d.getMinutes()).padStart(2, '0')
    return `${mm}-${dd} ${hh}:${min}`
  } catch {
    return iso
  }
}

/**
 * Format a duration to a human-readable format
 * @param duration - Duration in milliseconds (number) or as string (e.g., "500ms")
 * @param options - Optional formatting options
 * @param options.precision - Number of decimal places for seconds (default: 0), trailing zeros are stripped
 * @returns A formatted duration string, or null if input is null/undefined
 */
export function formatDuration(
  duration: number | string | undefined | null,
  options?: { precision?: number }
): string | null {
  if (duration === undefined || duration === null) {
    return null
  }

  // Parse string durations (e.g., "500ms", "0.44ms", "1234")
  let ms: number
  if (typeof duration === 'string') {
    ms = Number.parseFloat(duration.replace(/[^0-9.-]/g, ''))
    if (!Number.isFinite(ms)) {
      return duration
    }
  } else {
    ms = duration
    // Handle NaN/Infinity (e.g., cancelled blocks with no end time)
    if (!Number.isFinite(ms)) {
      return '—'
    }
  }

  const precision = options?.precision ?? 0

  if (ms < 1) {
    // Zero or near-zero: show "0ms" instead of "0.00ms"
    if (ms === 0 || ms < 0.005) {
      return '0ms'
    }
    // Sub-millisecond: show with 2 decimal places
    return `${ms.toFixed(2)}ms`
  }

  if (ms < 1000) {
    // Milliseconds: round to integer
    return `${Math.round(ms)}ms`
  }

  const seconds = ms / 1000
  if (seconds < 60) {
    if (precision > 0) {
      // Strip trailing zeros (e.g., "5.00s" -> "5s", "5.10s" -> "5.1s")
      return `${seconds.toFixed(precision).replace(/\.?0+$/, '')}s`
    }
    return `${Math.floor(seconds)}s`
  }

  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = Math.floor(seconds % 60)
  if (minutes < 60) {
    return `${minutes}m ${remainingSeconds}s`
  }

  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return `${hours}h ${remainingMinutes}m`
}

/**
 * Formats a date string to relative time (e.g., "2h ago", "3d ago")
 * @param dateString - ISO date string to format
 * @returns A human-readable relative time string
 */
export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (diffInSeconds < 60) {
    return 'just now'
  }
  if (diffInSeconds < 3600) {
    const minutes = Math.floor(diffInSeconds / 60)
    return `${minutes}m ago`
  }
  if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600)
    return `${hours}h ago`
  }
  if (diffInSeconds < 604800) {
    const days = Math.floor(diffInSeconds / 86400)
    return `${days}d ago`
  }
  if (diffInSeconds < 2592000) {
    const weeks = Math.floor(diffInSeconds / 604800)
    return `${weeks}w ago`
  }
  if (diffInSeconds < 31536000) {
    const months = Math.floor(diffInSeconds / 2592000)
    return `${months}mo ago`
  }
  const years = Math.floor(diffInSeconds / 31536000)
  return `${years}y ago`
}

/**
 * Format relative time (Chinese)
 * @param iso - ISO timestamp string
 * @returns Chinese relative time string, e.g. "刚刚", "5 分钟前", "3 天前"
 */
export function formatRelativeTimeZh(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return t('timeJustNow')
  if (minutes < 60) return t('timeMinutesAgo', 'zh', { n: String(minutes) })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t('timeHoursAgo', 'zh', { n: String(hours) })
  const days = Math.floor(hours / 24)
  if (days < 30) return t('timeDaysAgo', 'zh', { n: String(days) })
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

/**
 * Calculate and format duration from start/end times
 * @param startedAt - start time ISO string
 * @param completedAt - end time ISO string (uses current time when null)
 * @returns formatted duration string
 */
export function formatDurationFromRange(
  startedAt: string | null,
  completedAt: string | null
): string {
  if (!startedAt) return '—'
  const start = new Date(startedAt).getTime()
  const end = completedAt ? new Date(completedAt).getTime() : Date.now()
  return formatDuration(end - start) ?? '—'
}

/**
 * Format date as ISO date string (YYYY-MM-DD), commonly used for API query parameters
 * @param d - Date object
 */
export function formatISODate(d: Date): string {
  return d.toISOString().split('T')[0]
}

/**
 * Format full date-time (zh-CN locale, with seconds)
 * Example output: 2026/03/25 14:30:45
 * @param iso - ISO timestamp string
 */
export function formatDateTimeZh(iso: string): string {
  return new Date(iso).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

/**
 * Format short date-time (zh-CN locale, without seconds)
 * Example output: 2026/03/25 14:30
 * @param iso - ISO timestamp string
 */
export function formatDateTimeZhShort(iso: string): string {
  return new Date(iso).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Compact date-time (M/D HH:mm:ss), suitable for detail drawers
 * Example output: 3/25 14:30:45
 * @param iso - ISO timestamp string, returns '-' when null
 */
export function formatCompactDateTimeZh(iso: string | null): string {
  if (!iso) return '-'
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

/**
 * Time only (HH:mm:ss), suitable for log entries
 * @param iso - ISO timestamp string
 */
export function formatTimeOnlyZh(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

// ── Locale-aware formatting functions (i18n) ──

export type SupportedLocale = 'zh-CN' | 'en'

/**
 * Format relative time (multi-locale)
 * @param iso - ISO timestamp string
 * @param locale - current locale
 */
export function formatRelativeTimeI18n(iso: string, locale: SupportedLocale = 'zh-CN'): string {
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60000)
  if (locale === 'en') {
    if (minutes < 1) return 'just now'
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    if (days < 30) return `${days}d ago`
    const d = new Date(iso)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} 天前`
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

/**
 * Format full date-time (multi-locale, with seconds)
 * @param iso - ISO timestamp string
 * @param locale - current locale
 */
export function formatDateTimeI18n(iso: string, locale: SupportedLocale = 'zh-CN'): string {
  const l = locale === 'en' ? 'en-US' : 'zh-CN'
  return new Date(iso).toLocaleString(l, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

/**
 * Format short date-time (multi-locale, without seconds)
 * @param iso - ISO timestamp string
 * @param locale - current locale
 */
export function formatDateTimeShortI18n(iso: string, locale: SupportedLocale = 'zh-CN'): string {
  const l = locale === 'en' ? 'en-US' : 'zh-CN'
  return new Date(iso).toLocaleString(l, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

/**
 * Compact date-time (multi-locale), suitable for detail drawers
 * zh-CN: 3/25 14:30:45  |  en: Mar 25 2:30:45 PM
 * @param iso - ISO timestamp string, returns '-' when null
 * @param locale - current locale
 */
export function formatCompactDateTimeI18n(
  iso: string | null,
  locale: SupportedLocale = 'zh-CN'
): string {
  if (!iso) return '-'
  if (locale === 'en') {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
  }
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

/**
 * Time only (multi-locale), suitable for log entries
 * @param iso - ISO timestamp string
 * @param locale - current locale
 */
export function formatTimeOnlyI18n(iso: string, locale: SupportedLocale = 'zh-CN'): string {
  if (locale === 'en') {
    return new Date(iso).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
  }
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}
