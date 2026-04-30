/**
 * Model capability queries — temperature ranges, reasoning, verbosity, thinking,
 * deep-research support, and output token limits.
 */
import {
  getMaxOutputTokensForModel as getMaxOutputTokensForModelFromDefinitions,
  getMaxTemperature as getMaxTempFromDefinitions,
  getModelsWithDeepResearch,
  getModelsWithoutMemory,
  getModelsWithReasoningEffort,
  getModelsWithTemperatureSupport,
  getModelsWithTempRange01,
  getModelsWithTempRange02,
  getModelsWithThinking,
  getModelsWithVerbosity,
  getProvidersWithToolUsageControl,
  getReasoningEffortValuesForModel as getReasoningEffortValuesForModelFromDefinitions,
  getThinkingLevelsForModel as getThinkingLevelsForModelFromDefinitions,
  getVerbosityValuesForModel as getVerbosityValuesForModelFromDefinitions,
  supportsTemperature as supportsTemperatureFromDefinitions,
  supportsToolUsageControl as supportsToolUsageControlFromDefinitions,
} from '@/providers/models'

export const MODELS_TEMP_RANGE_0_2 = getModelsWithTempRange02()
export const MODELS_TEMP_RANGE_0_1 = getModelsWithTempRange01()
export const MODELS_WITH_TEMPERATURE_SUPPORT = getModelsWithTemperatureSupport()
export const MODELS_WITH_REASONING_EFFORT = getModelsWithReasoningEffort()
export const MODELS_WITH_VERBOSITY = getModelsWithVerbosity()
export const MODELS_WITH_THINKING = getModelsWithThinking()
export const MODELS_WITH_DEEP_RESEARCH = getModelsWithDeepResearch()
export const MODELS_WITHOUT_MEMORY = getModelsWithoutMemory()
export const PROVIDERS_WITH_TOOL_USAGE_CONTROL = getProvidersWithToolUsageControl()

export function supportsTemperature(model: string): boolean {
  return supportsTemperatureFromDefinitions(model)
}

export function supportsReasoningEffort(model: string): boolean {
  return MODELS_WITH_REASONING_EFFORT.includes(model.toLowerCase())
}

export function supportsVerbosity(model: string): boolean {
  return MODELS_WITH_VERBOSITY.includes(model.toLowerCase())
}

export function supportsThinking(model: string): boolean {
  return MODELS_WITH_THINKING.includes(model.toLowerCase())
}

export function isDeepResearchModel(model: string): boolean {
  return MODELS_WITH_DEEP_RESEARCH.includes(model.toLowerCase())
}

/** Returns the maximum allowed temperature (1 or 2), or undefined if unsupported. */
export function getMaxTemperature(model: string): number | undefined {
  return getMaxTempFromDefinitions(model)
}

export function supportsToolUsageControl(provider: string): boolean {
  return supportsToolUsageControlFromDefinitions(provider)
}

/** Returns the valid reasoning-effort options for a model, or null if unsupported. */
export function getReasoningEffortValuesForModel(model: string): string[] | null {
  return getReasoningEffortValuesForModelFromDefinitions(model)
}

/** Returns the valid verbosity options for a model, or null if unsupported. */
export function getVerbosityValuesForModel(model: string): string[] | null {
  return getVerbosityValuesForModelFromDefinitions(model)
}

/** Returns the valid thinking-level options for a model, or null if unsupported. */
export function getThinkingLevelsForModel(model: string): string[] | null {
  return getThinkingLevelsForModelFromDefinitions(model)
}

/** Returns the maximum output token count for a model. */
export function getMaxOutputTokensForModel(model: string): number {
  return getMaxOutputTokensForModelFromDefinitions(model)
}
