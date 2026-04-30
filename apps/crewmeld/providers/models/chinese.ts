import {
  AliyunIcon,
  BaiduIcon,
  ByteDanceIcon,
  MiniMaxIcon,
  MoonshotIcon,
  TencentIcon,
  ZhipuIcon,
} from '@/components/icons'
import type { ProviderDefinition } from '@/providers/models/types'

/** Provider definitions for Chinese domestic LLM providers. */
export const chineseProviders: Record<string, ProviderDefinition> = {
  qwen: {
    id: 'qwen',
    name: '阿里云',
    description: '阿里云通义千问大语言模型（Qwen2.5）',
    defaultModel: 'qwen-plus',
    modelPatterns: [/^qwen/],
    icon: AliyunIcon,
    capabilities: {
      toolUsageControl: true,
    },
    models: [
      {
        id: 'qwen-plus',
        pricing: {
          input: 0.8,
          output: 2.0,
          updatedAt: '2026-02-19',
        },
        capabilities: {
          temperature: { min: 0, max: 2 },
        },
        contextWindow: 131072,
      },
      {
        id: 'qwen-turbo',
        pricing: {
          input: 0.3,
          output: 0.6,
          updatedAt: '2026-02-19',
        },
        capabilities: {
          temperature: { min: 0, max: 2 },
        },
        contextWindow: 131072,
      },
      {
        id: 'qwen-max',
        pricing: {
          input: 2.4,
          output: 9.6,
          updatedAt: '2026-02-19',
        },
        capabilities: {
          temperature: { min: 0, max: 2 },
        },
        contextWindow: 32768,
      },
      {
        id: 'qwen-long',
        pricing: {
          input: 0.5,
          output: 2.0,
          updatedAt: '2026-02-19',
        },
        capabilities: {
          temperature: { min: 0, max: 2 },
        },
        contextWindow: 10000000,
      },
    ],
  },
  ernie: {
    id: 'ernie',
    name: '百度',
    description: '百度文心一言大语言模型（ERNIE-4.0）',
    defaultModel: 'ernie-4.0-8k',
    modelPatterns: [/^ernie/],
    icon: BaiduIcon,
    capabilities: {
      toolUsageControl: true,
    },
    models: [
      {
        id: 'ernie-4.0-8k',
        pricing: { input: 8.57, output: 17.14, updatedAt: '2026-02-20' },
        capabilities: { temperature: { min: 0, max: 1 } },
        contextWindow: 8192,
      },
      {
        id: 'ernie-4.0-turbo-8k',
        pricing: { input: 4.29, output: 8.57, updatedAt: '2026-02-20' },
        capabilities: { temperature: { min: 0, max: 1 } },
        contextWindow: 8192,
      },
      {
        id: 'ernie-3.5-8k',
        pricing: { input: 1.71, output: 1.71, updatedAt: '2026-02-20' },
        capabilities: { temperature: { min: 0, max: 1 } },
        contextWindow: 8192,
      },
      {
        id: 'ernie-3.5-128k',
        pricing: { input: 2.86, output: 2.86, updatedAt: '2026-02-20' },
        capabilities: { temperature: { min: 0, max: 1 } },
        contextWindow: 131072,
      },
      {
        id: 'ernie-speed-8k',
        pricing: { input: 0, output: 0, updatedAt: '2026-02-20' },
        capabilities: { temperature: { min: 0, max: 1 } },
        contextWindow: 8192,
      },
      {
        id: 'ernie-speed-128k',
        pricing: { input: 0, output: 0, updatedAt: '2026-02-20' },
        capabilities: { temperature: { min: 0, max: 1 } },
        contextWindow: 131072,
      },
      {
        id: 'ernie-lite-8k',
        pricing: { input: 0, output: 0, updatedAt: '2026-02-20' },
        capabilities: { temperature: { min: 0, max: 1 } },
        contextWindow: 8192,
      },
      {
        id: 'ernie-tiny-8k',
        pricing: { input: 0, output: 0, updatedAt: '2026-02-20' },
        capabilities: { temperature: { min: 0, max: 1 } },
        contextWindow: 8192,
      },
    ],
  },
  hunyuan: {
    id: 'hunyuan',
    name: '腾讯',
    description: '腾讯混元大语言模型（Hunyuan-Turbo）',
    defaultModel: 'hunyuan-turbo',
    modelPatterns: [/^hunyuan/],
    icon: TencentIcon,
    capabilities: {
      toolUsageControl: true,
    },
    models: [
      {
        id: 'hunyuan-turbo',
        pricing: { input: 2.14, output: 7.14, updatedAt: '2026-02-20' },
        capabilities: { temperature: { min: 0, max: 2 } },
        contextWindow: 32768,
      },
      {
        id: 'hunyuan-pro',
        pricing: { input: 4.29, output: 14.29, updatedAt: '2026-02-20' },
        capabilities: { temperature: { min: 0, max: 2 } },
        contextWindow: 32768,
      },
      {
        id: 'hunyuan-standard',
        pricing: { input: 0.64, output: 0.71, updatedAt: '2026-02-20' },
        capabilities: { temperature: { min: 0, max: 2 } },
        contextWindow: 32768,
      },
      {
        id: 'hunyuan-standard-256k',
        pricing: { input: 0.64, output: 0.71, updatedAt: '2026-02-20' },
        capabilities: { temperature: { min: 0, max: 2 } },
        contextWindow: 262144,
      },
      {
        id: 'hunyuan-lite',
        pricing: { input: 0, output: 0, updatedAt: '2026-02-20' },
        capabilities: { temperature: { min: 0, max: 2 } },
        contextWindow: 32768,
      },
      {
        id: 'hunyuan-turbo-vision',
        pricing: { input: 2.14, output: 7.14, updatedAt: '2026-02-20' },
        capabilities: { temperature: { min: 0, max: 2 } },
        contextWindow: 32768,
      },
    ],
  },
  moonshot: {
    id: 'moonshot',
    name: '月之暗面',
    description: '月之暗面 Kimi 大语言模型（OpenAI 兼容协议）',
    defaultModel: 'moonshot-v1-8k',
    modelPatterns: [/^moonshot/, /^kimi/],
    icon: MoonshotIcon,
    capabilities: { toolUsageControl: true },
    models: [],
  },
  zhipu: {
    id: 'zhipu',
    name: '智谱 AI',
    description: '智谱 AI GLM 系列大语言模型（OpenAI 兼容协议）',
    defaultModel: 'glm-4-plus',
    modelPatterns: [/^glm/],
    icon: ZhipuIcon,
    capabilities: { toolUsageControl: true },
    models: [],
  },
  doubao: {
    id: 'doubao',
    name: '火山方舟',
    description: '火山方舟 - 豆包大语言模型（OpenAI 兼容协议）',
    defaultModel: '',
    modelPatterns: [/^doubao/, /^ep-/],
    icon: ByteDanceIcon,
    capabilities: { toolUsageControl: true },
    models: [],
  },
  minimax: {
    id: 'minimax',
    name: 'MiniMax',
    description: 'MiniMax 稀宇科技大语言模型（OpenAI 兼容协议）',
    defaultModel: 'abab6.5s-chat',
    modelPatterns: [/^abab/, /^MiniMax/],
    icon: MiniMaxIcon,
    capabilities: { toolUsageControl: true },
    models: [],
  },
}
