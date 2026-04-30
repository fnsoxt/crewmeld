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

vi.mock('@/providers/hunyuan/utils', () => ({
  createReadableStreamFromHunyuanStream: vi.fn(),
  getHunyuanErrorMessage: vi.fn((code: string, msg: string) => msg),
}))

vi.mock('@/tools', () => ({
  executeTool: vi.fn(),
}))

vi.mock('@/providers/models', () => ({
  getProviderModels: vi
    .fn()
    .mockReturnValue([
      'hunyuan-turbo',
      'hunyuan-pro',
      'hunyuan-standard',
      'hunyuan-standard-256k',
      'hunyuan-lite',
      'hunyuan-turbo-vision',
    ]),
  getProviderDefaultModel: vi.fn().mockReturnValue('hunyuan-turbo'),
}))

import OpenAI from 'openai'
import { hunyuanProvider } from '@/providers/hunyuan'

describe('HunyuanProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should have correct provider metadata', () => {
    expect(hunyuanProvider.id).toBe('hunyuan')
    expect(hunyuanProvider.name).toBe('腾讯')
    expect(hunyuanProvider.models).toContain('hunyuan-turbo')
    expect(hunyuanProvider.defaultModel).toBe('hunyuan-turbo')
  })

  it('should throw error when API key is missing', async () => {
    await expect(
      hunyuanProvider.executeRequest({ model: 'hunyuan-turbo' } as never)
    ).rejects.toThrow('腾讯需要提供 API Key')
  })

  it('should initialize OpenAI client with Hunyuan endpoint', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: '你好', tool_calls: null } }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    })

    await hunyuanProvider.executeRequest({
      model: 'hunyuan-turbo',
      apiKey: 'test-api-key',
      messages: [{ role: 'user', content: '你好' }],
    } as never)

    expect(OpenAI).toHaveBeenCalledWith({
      apiKey: 'test-api-key',
      baseURL: 'https://api.hunyuan.cloud.tencent.com/v1',
    })
  })

  it('should return content and token usage from response', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: '我是混元', tool_calls: null } }],
      usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 },
    })

    const result = await hunyuanProvider.executeRequest({
      model: 'hunyuan-turbo',
      apiKey: 'test-api-key',
      messages: [{ role: 'user', content: '你是谁？' }],
    } as never)

    expect(result).toMatchObject({
      content: '我是混元',
      model: 'hunyuan-turbo',
      tokens: { input: 12, output: 8, total: 20 },
    })
  })

  it('should handle system prompt and context', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: 'response', tool_calls: null } }],
      usage: { prompt_tokens: 20, completion_tokens: 5, total_tokens: 25 },
    })

    await hunyuanProvider.executeRequest({
      model: 'hunyuan-turbo',
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
      hunyuanProvider.executeRequest({
        model: 'hunyuan-turbo',
        apiKey: 'test-api-key',
        messages: [{ role: 'user', content: 'test' }],
      } as never)
    ).rejects.toThrow('请求频率超限，请稍后重试')
  })

  it('should handle timeout errors with Chinese message', async () => {
    mockCreate.mockRejectedValueOnce(new Error('ETIMEDOUT'))

    await expect(
      hunyuanProvider.executeRequest({
        model: 'hunyuan-turbo',
        apiKey: 'test-api-key',
        messages: [{ role: 'user', content: 'test' }],
      } as never)
    ).rejects.toThrow('请求超时，请检查网络')
  })

  it('should handle auth failure errors with Chinese message', async () => {
    mockCreate.mockRejectedValueOnce(new Error('AuthFailure: SecretId not found'))

    await expect(
      hunyuanProvider.executeRequest({
        model: 'hunyuan-turbo',
        apiKey: 'test-api-key',
        messages: [{ role: 'user', content: 'test' }],
      } as never)
    ).rejects.toThrow('API 认证失败，请检查 API Key 配置')
  })

  it('should pass temperature and maxTokens parameters', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: 'ok', tool_calls: null } }],
      usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 },
    })

    await hunyuanProvider.executeRequest({
      model: 'hunyuan-standard',
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
