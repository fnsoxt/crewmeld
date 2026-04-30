import { createOpenAICompatibleProvider } from '@/providers/_openai-compat-factory'

export const zhipuProvider = createOpenAICompatibleProvider({
  id: 'zhipu',
  name: '智谱 AI',
  description: '智谱 AI GLM 系列大语言模型（OpenAI 兼容协议）',
  defaultBaseURL: 'https://open.bigmodel.cn/api/paas/v4',
  defaultModel: 'glm-4-plus',
  models: ['glm-4-plus', 'glm-4-air', 'glm-4-flash', 'glm-4-long'],
  logPrefix: 'Zhipu',
})
