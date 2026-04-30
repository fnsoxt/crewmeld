import { describe, expect, it } from 'vitest'
import { buildSystemPrompt } from './persona'

describe('buildSystemPrompt', () => {
  const baseEmployee = {
    id: 'emp-1',
    name: '客服小助',
    description: '负责处理客户咨询',
    persona: null as string | null,
  }

  it('使用默认人格当 persona 为 null', () => {
    const prompt = buildSystemPrompt(baseEmployee, [])
    expect(prompt).toContain('intelligent digital employee assistant')
    expect(prompt).toContain('客服小助')
  })

  it('使用自定义人格', () => {
    const employee = { ...baseEmployee, persona: '你是一个专业的客服专员，擅长处理退款问题。' }
    const prompt = buildSystemPrompt(employee, [])
    expect(prompt).toContain('专业的客服专员')
    expect(prompt).not.toContain('intelligent digital employee assistant')
  })

  it('注入工作流描述', () => {
    const workflows = [
      { id: 'wf-1', name: '退款处理', description: '处理用户退款申请' },
      { id: 'wf-2', name: '订单查询', description: null },
    ]
    const prompt = buildSystemPrompt(baseEmployee, workflows)
    expect(prompt).toContain('退款处理')
    expect(prompt).toContain('处理用户退款申请')
    expect(prompt).toContain('wf_wf-1')
    expect(prompt).toContain('订单查询')
    expect(prompt).toContain('wf_wf-2')
  })

  it('包含行为准则', () => {
    const prompt = buildSystemPrompt(baseEmployee, [])
    expect(prompt).toContain('简体中文')
    expect(prompt).toContain('Behavioral Guidelines')
  })

  it('空 persona 字符串降级为默认', () => {
    const employee = { ...baseEmployee, persona: '   ' }
    const prompt = buildSystemPrompt(employee, [])
    expect(prompt).toContain('intelligent digital employee assistant')
  })
})
