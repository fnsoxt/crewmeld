/**
 * @vitest-environment node
 */
import { loggerMock } from '@crewmeld/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@crewmeld/logger', () => loggerMock)

const mockCreate = vi.fn()

vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: mockCreate,
      },
    },
  })),
}))

vi.mock('@/providers/utils', () => ({
  calculateCost: vi.fn().mockReturnValue({ input: 0.001, output: 0.002, total: 0.003 }),
  prepareToolExecution: vi.fn(),
  prepareToolsWithUsageControl: vi.fn(),
  trackForcedToolUsage: vi.fn(),
  createOpenAICompatibleStream: vi.fn(),
}))

vi.mock('@/providers/ernie/utils', () => ({
  createReadableStreamFromErnieStream: vi.fn(),
}))

vi.mock('@/tools', () => ({
  executeTool: vi.fn(),
}))

vi.mock('@/providers/models', () => ({
  getProviderModels: vi
    .fn()
    .mockReturnValue([
      'ernie-4.0-8k',
      'ernie-4.0-turbo-8k',
      'ernie-3.5-8k',
      'ernie-3.5-128k',
      'ernie-speed-8k',
      'ernie-speed-128k',
      'ernie-lite-8k',
      'ernie-tiny-8k',
    ]),
  getProviderDefaultModel: vi.fn().mockReturnValue('ernie-4.0-8k'),
}))

import OpenAI from 'openai'
import { ernieProvider } from '@/providers/ernie'

describe('ErnieProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should have correct provider metadata', () => {
    expect(ernieProvider.id).toBe('ernie')
    expect(ernieProvider.name).toBe('百度')
    expect(ernieProvider.models).toContain('ernie-4.0-8k')
    expect(ernieProvider.defaultModel).toBe('ernie-4.0-8k')
  })

  it('should throw error when API key is missing', async () => {
    await expect(ernieProvider.executeRequest({ model: 'ernie-4.0-8k' } as never)).rejects.toThrow(
      '百度需要提供 API Key'
    )
  })

  it('should initialize OpenAI client with Qianfan endpoint', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: '你好', tool_calls: null } }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    })

    await ernieProvider.executeRequest({
      model: 'ernie-4.0-8k',
      apiKey: 'test-api-key',
      messages: [{ role: 'user', content: '你好' }],
    } as never)

    expect(OpenAI).toHaveBeenCalledWith({
      apiKey: 'test-api-key',
      baseURL: 'https://qianfan.baidubce.com/v2',
    })
  })

  it('should return content and token usage from response', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: '我是文心一言', tool_calls: null } }],
      usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 },
    })

    const result = await ernieProvider.executeRequest({
      model: 'ernie-4.0-8k',
      apiKey: 'test-api-key',
      messages: [{ role: 'user', content: '你是谁？' }],
    } as never)

    expect(result).toMatchObject({
      content: '我是文心一言',
      model: 'ernie-4.0-8k',
      tokens: { input: 12, output: 8, total: 20 },
    })
  })

  it('should handle system prompt and context', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: 'response', tool_calls: null } }],
      usage: { prompt_tokens: 20, completion_tokens: 5, total_tokens: 25 },
    })

    await ernieProvider.executeRequest({
      model: 'ernie-4.0-8k',
      apiKey: 'test-api-key',
      systemPrompt: '你是一个助手',
      context: '背景信息',
      messages: [{ role: 'user', content: '问题' }],
    } as never)

    const createCall = mockCreate.mock.calls[0][0]
    expect(createCall.messages).toHaveLength(3)
    expect(createCall.messages[0]).toEqual({ role: 'system', content: '你是一个助手' })
    expect(createCall.messages[1]).toEqual({ role: 'user', content: '背景信息' })
    expect(createCall.messages[2]).toEqual({ role: 'user', content: '问题' })
  })

  it('should handle rate limit errors with Chinese message', async () => {
    mockCreate.mockRejectedValueOnce(new Error('rate limit exceeded (429)'))

    await expect(
      ernieProvider.executeRequest({
        model: 'ernie-4.0-8k',
        apiKey: 'test-api-key',
        messages: [{ role: 'user', content: 'test' }],
      } as never)
    ).rejects.toThrow('请求频率超限，请稍后重试')
  })

  it('should handle timeout errors with Chinese message', async () => {
    mockCreate.mockRejectedValueOnce(new Error('ETIMEDOUT'))

    await expect(
      ernieProvider.executeRequest({
        model: 'ernie-4.0-8k',
        apiKey: 'test-api-key',
        messages: [{ role: 'user', content: 'test' }],
      } as never)
    ).rejects.toThrow('请求超时，请检查网络')
  })

  it('should handle insufficient balance errors', async () => {
    mockCreate.mockRejectedValueOnce(new Error('336101 insufficient balance'))

    await expect(
      ernieProvider.executeRequest({
        model: 'ernie-4.0-8k',
        apiKey: 'test-api-key',
        messages: [{ role: 'user', content: 'test' }],
      } as never)
    ).rejects.toThrow('余额不足，请充值后重试')
  })

  it('should pass temperature and maxTokens parameters', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: 'ok', tool_calls: null } }],
      usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 },
    })

    await ernieProvider.executeRequest({
      model: 'ernie-4.0-turbo-8k',
      apiKey: 'test-api-key',
      temperature: 0.7,
      maxTokens: 2048,
      messages: [{ role: 'user', content: 'test' }],
    } as never)

    const createCall = mockCreate.mock.calls[0][0]
    expect(createCall.temperature).toBe(0.7)
    expect(createCall.max_tokens).toBe(2048)
  })
})
