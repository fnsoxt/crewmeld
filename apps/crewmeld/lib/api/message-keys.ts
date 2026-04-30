import type { Messages } from '@/locales'
import { zhCN } from '@/locales/zh-CN'

type NestedKeyOf<T, Prefix extends string = ''> = T extends Record<string, unknown>
  ? {
      [K in keyof T & string]: T[K] extends Record<string, unknown>
        ? NestedKeyOf<T[K], Prefix extends '' ? K : `${Prefix}.${K}`>
        : Prefix extends ''
          ? K
          : `${Prefix}.${K}`
    }[keyof T & string]
  : never

type ApiMessages = Messages['api']

export type MessageKey = `api.${NestedKeyOf<ApiMessages>}`

export type MessageParams = Record<string, string | number>

export const EMPTY_MESSAGE = '' as const
export type EmptyMessage = typeof EMPTY_MESSAGE

const _assertKeysExist: Record<string, unknown> = zhCN.api
void _assertKeysExist
