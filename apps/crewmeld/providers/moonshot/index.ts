import { createOpenAICompatibleProvider } from '@/providers/_openai-compat-factory'

export const moonshotProvider = createOpenAICompatibleProvider({
  id: 'moonshot',
  name: '月之暗面',
  description: '月之暗面 Kimi 大语言模型（OpenAI 兼容协议）',
  defaultBaseURL: 'https://api.moonshot.cn/v1',
  defaultModel: 'moonshot-v1-8k',
  models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
  logPrefix: 'Moonshot',
})
