export interface ModelDefaultParams {
  temperature: number
  maxTokens: number
  topP?: number
  presencePenalty?: number
  frequencyPenalty?: number
}

export interface ModelConfigData {
  id: string
  providerId: string
  displayName: string
  modelName: string | null
  apiEndpoint: string | null
  hasApiKey: boolean
  defaultParams: ModelDefaultParams
  isActive: boolean
  lastTestedAt: string | null
  lastTestResult: string | null
  lastTestLatencyMs: number | null
  createdAt: string
  updatedAt: string
  providerMeta: ProviderMeta
}

export interface ProviderMeta {
  name: string
  description: string
  models: string[]
  defaultModel: string
}

export interface CreateModelConfigPayload {
  providerId: string
  displayName: string
  modelName?: string
  apiKey?: string
  apiEndpoint?: string
  defaultParams?: Partial<ModelDefaultParams>
}

export interface UpdateModelConfigPayload {
  displayName?: string
  modelName?: string
  apiKey?: string
  apiEndpoint?: string
  defaultParams?: Partial<ModelDefaultParams>
  isActive?: boolean
}

export interface ModelTestResult {
  success: boolean
  message: string
  latencyMs: number
  responsePreview?: string
  model: string
  tokens?: {
    input: number
    output: number
    total: number
  }
}

export interface OllamaModel {
  name: string
  size: number
  modifiedAt: string
  digest: string
}

export interface OllamaDiscoveryResult {
  available: boolean
  endpoint: string
  models: OllamaModel[]
  error?: string
}

export interface ProviderDisplayInfo {
  id: string
  name: string
  description: string
  models: string[]
  defaultModel: string
  configured: boolean
  isActive: boolean
  lastTestedAt: string | null
}
