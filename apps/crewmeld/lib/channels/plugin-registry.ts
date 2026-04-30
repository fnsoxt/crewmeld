/**
 * Channel plugin registry - manages all registered ChannelPlugin instances
 */

import type { ConversationChannel } from '@crewmeld/db/schema'
import { createLogger } from '@crewmeld/logger'
import type { ChannelPlugin } from './plugin-types'

const logger = createLogger('PluginRegistry')

const registry = new Map<ConversationChannel, ChannelPlugin>()
const aliasMap = new Map<string, ConversationChannel>()

/** Register a channel plugin */
export function registerPlugin(plugin: ChannelPlugin): void {
  if (registry.has(plugin.id)) {
    logger.warn(`Channel plugin ${plugin.id} already registered, will be overwritten`)
  }
  registry.set(plugin.id, plugin)
  if (plugin.aliases) {
    for (const alias of plugin.aliases) {
      aliasMap.set(alias.toLowerCase(), plugin.id)
    }
  }
  logger.info(`Channel plugin registered: ${plugin.id} (${plugin.label})`)
}

/** Get a channel plugin (supports aliases) */
export function getPlugin(idOrAlias: string): ChannelPlugin | undefined {
  const direct = registry.get(idOrAlias as ConversationChannel)
  if (direct) return direct
  const resolvedId = aliasMap.get(idOrAlias.toLowerCase())
  if (resolvedId) return registry.get(resolvedId)
  return undefined
}

/** Get all registered plugins */
export function getAllPlugins(): ChannelPlugin[] {
  return Array.from(registry.values())
}

/** Check if a channel is registered */
export function hasPlugin(id: ConversationChannel): boolean {
  return registry.has(id)
}
