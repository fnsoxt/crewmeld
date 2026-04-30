import { createOpenAICompatibleProvider } from '@/providers/_openai-compat-factory'

export const minimaxProvider = createOpenAICompatibleProvider({
  id: 'minimax',
  name: 'MiniMax',
  description: 'MiniMax 稀宇科技大语言模型（OpenAI 兼容协议）',
  defaultBaseURL: 'https://api.minimax.chat/v1',
  defaultModel: 'abab6.5s-chat',
  models: ['abab6.5s-chat', 'abab6.5-chat', 'MiniMax-Text-01'],
  logPrefix: 'MiniMax',
})
