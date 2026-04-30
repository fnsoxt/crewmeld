/**
 * Public surface of the CrewMeld provider utility library.
 *
 * All exports are defined in focused sub-modules under `./utils/` and
 * re-exported here so existing import paths keep working without change.
 *
 * Sub-module layout:
 *   metadata     — ProviderMetadata interface
 *   registry     — providers map + model/provider lookup helpers
 *   blacklist    — provider & model blacklist helpers
 *   schema       — JSON schema instructions + extractAndParseJSON
 *   pricing      — calculateCost, getModelPricing, formatCost
 *   hosting      — getHostedModels, shouldBillModelUsage, getApiKey
 *   execution    — prepareToolsWithUsageControl, trackForcedToolUsage, prepareToolExecution
 *   capabilities — model-capability constants + query functions
 *   streaming    — createOpenAICompatibleStream, checkForForcedToolUsageOpenAI
 */

export {
  filterBlacklistedModels,
  getProviderIcon,
  isProviderBlacklisted,
} from './utils/blacklist'
export {
  getMaxOutputTokensForModel,
  getMaxTemperature,
  getReasoningEffortValuesForModel,
  getThinkingLevelsForModel,
  getVerbosityValuesForModel,
  isDeepResearchModel,
  MODELS_TEMP_RANGE_0_1,
  MODELS_TEMP_RANGE_0_2,
  MODELS_WITH_DEEP_RESEARCH,
  MODELS_WITH_REASONING_EFFORT,
  MODELS_WITH_TEMPERATURE_SUPPORT,
  MODELS_WITH_THINKING,
  MODELS_WITH_VERBOSITY,
  MODELS_WITHOUT_MEMORY,
  PROVIDERS_WITH_TOOL_USAGE_CONTROL,
  supportsReasoningEffort,
  supportsTemperature,
  supportsThinking,
  supportsToolUsageControl,
  supportsVerbosity,
} from './utils/capabilities'
export {
  prepareToolExecution,
  prepareToolsWithUsageControl,
  trackForcedToolUsage,
} from './utils/execution'
export { getApiKey, getHostedModels, shouldBillModelUsage } from './utils/hosting'
export type { ProviderMetadata } from './utils/metadata'
export { calculateCost, formatCost, getModelPricing } from './utils/pricing'
export {
  getAllModelProviders,
  getAllModels,
  getAllProviderIds,
  getBaseModelProviders,
  getProvider,
  getProviderConfigFromModel,
  getProviderFromModel,
  getProviderModels,
  providers,
  updateOllamaProviderModels,
  updateVLLMProviderModels,
} from './utils/registry'
export {
  extractAndParseJSON,
  generateSchemaInstructions,
  generateStructuredOutputInstructions,
} from './utils/schema'
export {
  checkForForcedToolUsageOpenAI,
  createOpenAICompatibleStream,
} from './utils/streaming'
