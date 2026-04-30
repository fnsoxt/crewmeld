import { beforeEach, describe, expect, it, vi } from 'vitest'

// Store mock references at module scope
const mockSelect = vi.fn()
const mockFrom = vi.fn()
const mockInnerJoin = vi.fn()
const mockWhere = vi.fn()

mockSelect.mockReturnValue({ from: mockFrom })
mockFrom.mockReturnValue({ innerJoin: mockInnerJoin })
mockInnerJoin.mockReturnValue({ where: mockWhere })

vi.mock('@crewmeld/db', () => ({
  db: { select: mockSelect },
  employeeWorkflowBindings: {
    employeeId: 'employee_id',
    workflowId: 'workflow_id',
  },
  workflow: {
    id: 'id',
    name: 'name',
    description: 'description',
  },
}))

vi.mock('@crewmeld/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

import { buildWorkflowToolConfigs } from './intent-router'

describe('buildWorkflowToolConfigs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Re-wire mock chain after clearAllMocks
    mockSelect.mockReturnValue({ from: mockFrom })
    mockFrom.mockReturnValue({ innerJoin: mockInnerJoin })
    mockInnerJoin.mockReturnValue({ where: mockWhere })
  })

  it('返回空工具列表当无绑定', async () => {
    mockWhere.mockResolvedValueOnce([])

    const result = await buildWorkflowToolConfigs('emp-1')
    expect(result.tools).toHaveLength(0)
    expect(result.workflowMap.size).toBe(0)
  })

  it('将绑定工作流转换为工具配置', async () => {
    mockWhere.mockResolvedValueOnce([
      { workflowId: 'wf-1', workflowName: '退款处理', workflowDescription: '处理退款请求' },
      { workflowId: 'wf-2', workflowName: '订单查询', workflowDescription: null },
    ])

    const result = await buildWorkflowToolConfigs('emp-1')
    expect(result.tools).toHaveLength(2)
    expect(result.tools[0].function.name).toBe('wf_wf-1')
    expect(result.tools[0].function.description).toBe('处理退款请求')
    expect(result.tools[1].function.name).toBe('wf_wf-2')
    expect(result.tools[1].function.description).toContain('订单查询')
    expect(result.workflowMap.get('wf_wf-1')).toBe('wf-1')
    expect(result.workflowMap.get('wf_wf-2')).toBe('wf-2')
  })

  it('工具参数使用松散 object schema', async () => {
    mockWhere.mockResolvedValueOnce([
      { workflowId: 'wf-1', workflowName: '测试', workflowDescription: '测试工具' },
    ])

    const result = await buildWorkflowToolConfigs('emp-1')
    const params = result.tools[0].function.parameters
    expect(params.type).toBe('object')
    expect(params.properties.input).toBeDefined()
  })
})
