import { describe, expect, it } from 'vitest'
import { buildContextWindow, estimateTokens } from './context'
import type { EngineMessage } from './types'

describe('estimateTokens', () => {
  it('中文文本约 1.5 token/字', () => {
    const tokens = estimateTokens('你好世界')
    expect(tokens).toBe(6)
  })

  it('英文文本约 0.25 token/char', () => {
    const tokens = estimateTokens('hello world')
    expect(tokens).toBe(3) // 11 * 0.25 = 2.75 → ceil = 3
  })

  it('混合文本', () => {
    const tokens = estimateTokens('你好 hello')
    // 你(1.5) + 好(1.5) + space(0.25) + h(0.25) + e(0.25) + l(0.25) + l(0.25) + o(0.25) = 4.5 (CJK weighted higher)
    expect(tokens).toBe(5) // ceil(4.5)
  })

  it('空文本返回 0', () => {
    expect(estimateTokens('')).toBe(0)
  })
})

describe('buildContextWindow', () => {
  const makeMsg = (role: EngineMessage['role'], content: string): EngineMessage => ({
    role,
    content,
  })

  it('返回所有消息当 token 足够', () => {
    const messages = [makeMsg('user', 'hi'), makeMsg('assistant', 'hello')]
    const result = buildContextWindow(messages, 'system prompt', {
      maxTokens: 8000,
      reservedForResponse: 2000,
      reservedForTools: 500,
    })
    expect(result).toHaveLength(2)
  })

  it('截断旧消息当超出预算', () => {
    const longMsg = '这是一段很长的中文消息。'.repeat(500)
    const messages = [
      makeMsg('user', longMsg),
      makeMsg('assistant', longMsg),
      makeMsg('user', '最新消息'),
    ]
    const result = buildContextWindow(messages, 'system prompt', {
      maxTokens: 200,
      reservedForResponse: 50,
      reservedForTools: 20,
    })
    // Should keep only newer messages
    expect(result.length).toBeLessThan(3)
    expect(result[result.length - 1].content).toBe('最新消息')
  })

  it('空消息返回空数组', () => {
    const result = buildContextWindow([], 'system prompt')
    expect(result).toHaveLength(0)
  })

  it('保留 tool_call↔tool_result 配对', () => {
    const messages: EngineMessage[] = [
      makeMsg('user', '请帮我查询订单'),
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          { id: 'tc-1', type: 'function', function: { name: 'wf_order', arguments: '{}' } },
        ],
      },
      {
        role: 'tool',
        content: '订单 #123 已完成',
        tool_call_id: 'tc-1',
        name: 'wf_order',
      },
      makeMsg('assistant', '您的订单 #123 已完成。'),
    ]
    const result = buildContextWindow(messages, 'system prompt', {
      maxTokens: 8000,
      reservedForResponse: 2000,
      reservedForTools: 500,
    })
    expect(result).toHaveLength(4)
    // tool result still has its tool_call_id
    const toolMsg = result.find((m) => m.role === 'tool')
    expect(toolMsg?.tool_call_id).toBe('tc-1')
  })

  it('移除孤立的 tool result（无对应 assistant tool_call）', () => {
    const messages: EngineMessage[] = [
      {
        role: 'tool',
        content: '孤立结果',
        tool_call_id: 'orphan-1',
        name: 'unknown_tool',
      },
      makeMsg('user', '你好'),
    ]
    const result = buildContextWindow(messages, 'system prompt', {
      maxTokens: 8000,
      reservedForResponse: 2000,
      reservedForTools: 500,
    })
    const toolMsg = result.find((m) => m.role === 'tool')
    expect(toolMsg).toBeUndefined()
  })
})
