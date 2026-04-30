/**
 * Token-count and response-shape types used across all provider adapters.
 */

/** Raw token usage counts returned alongside a completion. */
export interface TokenInfo {
  input?: number
  output?: number
  total?: number
}

/**
 * Convenience wrapper used by some adapters before {@link TokenInfo} was
 * extracted as a standalone type.
 */
export interface TransformedResponse {
  content: string
  tokens?: TokenInfo
}
