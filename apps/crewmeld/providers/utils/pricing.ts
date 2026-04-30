/**
 * Cost calculation and pricing helpers for CrewMeld provider adapters.
 */
import {
  getEmbeddingModelPricing,
  getModelPricing as getModelPricingFromDefinitions,
} from '@/providers/models'

/**
 * Calculates the USD cost for a completion based on token usage and model pricing.
 *
 * @param model - Model identifier used to look up the rate card
 * @param promptTokens - Number of input (prompt) tokens consumed
 * @param completionTokens - Number of output (completion) tokens produced
 * @param useCachedInput - Whether cached-input pricing applies
 * @param inputMultiplier - Optional override multiplier for input cost
 * @param outputMultiplier - Optional override multiplier for output cost
 */
export function calculateCost(
  model: string,
  promptTokens = 0,
  completionTokens = 0,
  useCachedInput = false,
  inputMultiplier?: number,
  outputMultiplier?: number
) {
  let pricing = getEmbeddingModelPricing(model)
  if (!pricing) pricing = getModelPricingFromDefinitions(model)

  if (!pricing) {
    const defaultPricing = {
      input: 1.0,
      cachedInput: 0.5,
      output: 5.0,
      updatedAt: '2025-03-21',
    }
    return { input: 0, output: 0, total: 0, pricing: defaultPricing }
  }

  const inputRate =
    useCachedInput && pricing.cachedInput
      ? pricing.cachedInput / 1_000_000
      : pricing.input / 1_000_000
  const inputCost = promptTokens * inputRate
  const outputCost = completionTokens * (pricing.output / 1_000_000)
  const finalInputCost = inputCost * (inputMultiplier ?? 1)
  const finalOutputCost = outputCost * (outputMultiplier ?? 1)
  const finalTotalCost = finalInputCost + finalOutputCost

  return {
    input: Number.parseFloat(finalInputCost.toFixed(8)),
    output: Number.parseFloat(finalOutputCost.toFixed(8)),
    total: Number.parseFloat(finalTotalCost.toFixed(8)),
    pricing,
  }
}

export function getModelPricing(modelId: string): any {
  return getEmbeddingModelPricing(modelId) ?? getModelPricingFromDefinitions(modelId)
}

/**
 * Formats a USD cost value as a human-readable currency string.
 * Adjusts decimal precision automatically based on magnitude.
 */
export function formatCost(cost: number): string {
  if (cost === undefined || cost === null) return '—'
  if (cost >= 1) return `$${cost.toFixed(2)}`
  if (cost >= 0.01) return `$${cost.toFixed(3)}`
  if (cost >= 0.001) return `$${cost.toFixed(4)}`
  if (cost > 0) {
    const places = Math.max(4, Math.abs(Math.floor(Math.log10(cost))) + 3)
    return `$${cost.toFixed(places)}`
  }
  return '$0'
}
