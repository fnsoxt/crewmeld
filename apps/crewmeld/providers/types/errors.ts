/**
 * Error types for CrewMeld provider adapters.
 */

/**
 * Thrown by provider adapters when a completion request fails.
 * Carries timing metadata so callers can record latency even for failed attempts.
 */
export class ProviderError extends Error {
  readonly timing: {
    startTime: string
    endTime: string
    duration: number
  }

  constructor(message: string, timing: { startTime: string; endTime: string; duration: number }) {
    super(message)
    this.name = 'ProviderError'
    this.timing = timing
  }
}
