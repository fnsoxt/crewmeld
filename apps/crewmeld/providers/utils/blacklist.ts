/**
 * Provider and model blacklist helpers — reads from env vars to determine
 * which providers/models are blocked from use in this deployment.
 */
import { env } from '@/lib/core/config/env'
import { PROVIDER_DEFINITIONS } from '@/providers/models'
import type { ProviderId } from '@/providers/types'

function getBlacklistedProviders(): string[] {
  if (!env.BLACKLISTED_PROVIDERS) return []
  return env.BLACKLISTED_PROVIDERS.split(',').map((p) => p.trim().toLowerCase())
}

export function isProviderBlacklisted(providerId: string): boolean {
  return getBlacklistedProviders().includes(providerId.toLowerCase())
}

/**
 * Parses the BLACKLISTED_MODELS env var into exact names and prefix patterns.
 * Supports:
 *   - Exact names: "gpt-4,claude-3-opus"
 *   - Prefix wildcards: "claude-*,gpt-4-*"
 */
function getBlacklistedModels(): { models: string[]; prefixes: string[] } {
  if (!env.BLACKLISTED_MODELS) return { models: [], prefixes: [] }
  const entries = env.BLACKLISTED_MODELS.split(',').map((m) => m.trim().toLowerCase())
  return {
    models: entries.filter((e) => !e.endsWith('*')),
    prefixes: entries.filter((e) => e.endsWith('*')).map((e) => e.slice(0, -1)),
  }
}

export function isModelBlacklisted(model: string): boolean {
  const lowerModel = model.toLowerCase()
  const { models, prefixes } = getBlacklistedModels()
  return models.includes(lowerModel) || prefixes.some((prefix) => lowerModel.startsWith(prefix))
}

export function filterBlacklistedModels(models: string[]): string[] {
  return models.filter((model) => !isModelBlacklisted(model))
}

export function getProviderIcon(model: string): React.ComponentType<{ className?: string }> | null {
  const { getProviderFromModel } = require('./registry')
  const providerId = getProviderFromModel(model) as ProviderId
  return PROVIDER_DEFINITIONS[providerId]?.icon || null
}
