/**
 * Thin Error subclass that carries a stable string code alongside a
 * human-readable message.
 *
 * Purpose: let API handlers branch on `code` rather than string-matching on
 * localized `message`. Previously we had to compare against both the Chinese
 * and English text of the same error, which is fragile and keeps Chinese in
 * the API layer.
 */
export class CodedError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'CodedError'
    this.code = code
  }
}

/** Type guard — works even across bundle boundaries that break `instanceof`. */
export function getErrorCode(err: unknown): string | null {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as { code?: unknown }).code
    if (typeof code === 'string') return code
  }
  return null
}
