import { createOpenAICompatibleProvider } from '@/providers/_openai-compat-factory'

/**
 * ByteDance -- Volcano Engine Ark (Doubao model series)
 * Note: Volcano Engine Ark uses Endpoint ID instead of model name for invocation.
 * Users must enter their endpoint ID (e.g. ep-2024xxxxxx-xxxxx) in the "Model Name" field of the model config form.
 */
export const doubaoProvider = createOpenAICompatibleProvider({
  id: 'doubao',
  name: '火山方舟',
  description: '火山方舟 - 豆包大语言模型（OpenAI 兼容协议）',
  defaultBaseURL: 'https://ark.cn-beijing.volces.com/api/v3',
  defaultModel: '',
  models: [],
  logPrefix: 'Doubao',
})
