import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock DB module
vi.mock('@crewmeld/db', () => {
  const mockSelect = vi.fn()
  const mockFrom = vi.fn()
  const mockInnerJoin = vi.fn()
  const mockWhere = vi.fn()
  const mockOrderBy = vi.fn()
  const mockLimit = vi.fn()

  const chain = {
    select: mockSelect,
    from: mockFrom,
    innerJoin: mockInnerJoin,
    where: mockWhere,
    orderBy: mockOrderBy,
    limit: mockLimit,
  }

  mockSelect.mockReturnValue(chain)
  mockFrom.mockReturnValue(chain)
  mockInnerJoin.mockReturnValue(chain)
  mockWhere.mockReturnValue(chain)
  mockOrderBy.mockReturnValue(chain)
  mockLimit.mockResolvedValue([])

  return {
    db: chain,
  }
})

// Mock schema module
vi.mock('@crewmeld/db/schema', () => ({
  employeeConnections: {
    employeeId: 'employee_id',
    connectionId: 'connection_id',
  },
  systemConnections: {
    id: 'id',
    name: 'name',
    type: 'type',
    configEncrypted: 'config_encrypted',
    status: 'status',
    createdAt: 'created_at',
  },
  modelConfigs: {
    id: 'id',
    providerId: 'provider_id',
    isActive: 'is_active',
    createdAt: 'created_at',
    apiKeyEncrypted: 'api_key_encrypted',
  },
}))

// Mock encryption
vi.mock('./encryption', () => ({
  decryptConfig: vi.fn((ciphertext: string) => ciphertext),
}))

// Mock drizzle-orm
vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => args),
  eq: vi.fn((a: unknown, b: unknown) => [a, b]),
  ne: vi.fn((a: unknown, b: unknown) => ['ne', a, b]),
  asc: vi.fn((col: unknown) => ['asc', col]),
}))

import { db } from '@crewmeld/db'
import { decryptConfig } from './encryption'
import { resolveAllCredentialsByType, resolveCredential, resolveModelConfig } from './resolver'

const mockDb = db as Record<string, ReturnType<typeof vi.fn>>

describe('Credential Resolver', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDb.select.mockReturnValue(mockDb)
    mockDb.from.mockReturnValue(mockDb)
    mockDb.innerJoin.mockReturnValue(mockDb)
    mockDb.where.mockReturnValue(mockDb)
    mockDb.orderBy.mockReturnValue(mockDb)
    mockDb.limit.mockResolvedValue([])
  })

  it('应优先返回员工绑定的连接', async () => {
    const boundRow = {
      connectionId: 'conn_abc',
      connectionName: '邮件连接-1',
      type: 'email',
      configEncrypted: '{"smtpHost":"smtp.test.com","username":"u","password":"p"}',
      status: 'connected',
      createdAt: new Date('2025-01-01'),
    }

    // First call (employee binding query) returns a result
    mockDb.limit.mockResolvedValueOnce([boundRow])

    const result = await resolveCredential('emp_123', 'email')

    expect(result).not.toBeNull()
    expect(result?.connectionId).toBe('conn_abc')
    expect(result?.connectionName).toBe('邮件连接-1')
    expect(decryptConfig).toHaveBeenCalledWith(boundRow.configEncrypted)
  })

  it('应在无员工绑定时回退到系统默认', async () => {
    const systemRow = {
      connectionId: 'conn_sys',
      connectionName: '系统邮件',
      type: 'email',
      configEncrypted: '{"smtpHost":"smtp.default.com"}',
    }

    // First query (employee binding) returns empty
    mockDb.limit.mockResolvedValueOnce([])
    // Second query (system default) returns result
    mockDb.limit.mockResolvedValueOnce([systemRow])

    const result = await resolveCredential('emp_123', 'email')

    expect(result).not.toBeNull()
    expect(result?.connectionId).toBe('conn_sys')
  })

  it('应在无任何连接时返回 null', async () => {
    mockDb.limit.mockResolvedValueOnce([])
    mockDb.limit.mockResolvedValueOnce([])

    const result = await resolveCredential('emp_123', 'wecom')

    expect(result).toBeNull()
  })

  it('resolveAllCredentialsByType 应返回所有同类型连接', async () => {
    const rows = [
      {
        connectionId: 'c1',
        connectionName: '连接1',
        type: 'wecom',
        configEncrypted: '{"corpId":"a"}',
      },
      {
        connectionId: 'c2',
        connectionName: '连接2',
        type: 'wecom',
        configEncrypted: '{"corpId":"b"}',
      },
    ]

    // resolveAllCredentialsByType uses orderBy without limit
    mockDb.orderBy.mockResolvedValueOnce(rows)

    const results = await resolveAllCredentialsByType('wecom')

    expect(results).toHaveLength(2)
    expect(results[0].connectionId).toBe('c1')
    expect(results[1].connectionId).toBe('c2')
  })

  it('resolveModelConfig 应返回第一个 active 的模型配置', async () => {
    const modelRow = {
      id: 'mc_1',
      providerId: 'qwen',
      displayName: '阿里云',
      apiKeyEncrypted: 'encrypted-key',
      apiEndpoint: null,
      defaultParams: { temperature: 0.7 },
      isActive: true,
    }

    mockDb.limit.mockResolvedValueOnce([modelRow])

    const result = await resolveModelConfig('qwen')

    expect(result).not.toBeNull()
    expect(result?.configId).toBe('mc_1')
    expect(result?.providerId).toBe('qwen')
    expect(decryptConfig).toHaveBeenCalledWith('encrypted-key')
  })
})
