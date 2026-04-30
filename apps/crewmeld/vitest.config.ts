import path from 'path'
/// <reference types="vitest" />
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'
import { configDefaults, defineConfig } from 'vitest/config'

// Load Next.js env vars so tests see the same environment as the app
const nextEnv = require('@next/env')
const { loadEnvConfig } = nextEnv.default ?? nextEnv
loadEnvConfig(process.cwd())

// ─── path aliases ─────────────────────────────────────────────────────────────

/** Resolve a path relative to this config file's directory. */
const r = (...parts: string[]) => path.resolve(__dirname, ...parts)

const pathAliases = [
  { find: '@crewmeld/db', replacement: r('../../packages/db') },
  { find: '@crewmeld/logger', replacement: r('../../packages/logger/src') },

  // Store stubs used in tests
  { find: '@/stores/console/store', replacement: r('stores/console/store.ts') },
  { find: '@/stores/execution/store', replacement: r('stores/execution/store.ts') },

  // Block / serializer type stubs
  { find: '@/blocks/types', replacement: r('blocks/types.ts') },
  { find: '@/serializer/types', replacement: r('serializer/types.ts') },

  // Top-level path aliases
  { find: '@/lib', replacement: r('lib') },
  { find: '@/stores', replacement: r('stores') },
  { find: '@/components', replacement: r('components') },
  { find: '@/app', replacement: r('app') },
  { find: '@/api', replacement: r('app/api') },
  { find: '@/executor', replacement: r('executor') },
  { find: '@/providers', replacement: r('providers') },
  { find: '@/tools', replacement: r('tools') },
  { find: '@/blocks', replacement: r('blocks') },
  { find: '@/serializer', replacement: r('serializer') },
  { find: '@', replacement: r('.') },
]

// ─── Vitest configuration ─────────────────────────────────────────────────────

export default defineConfig({
  plugins: [react(), tsconfigPaths()],

  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.test.{ts,tsx}'],
    exclude: [...configDefaults.exclude, '**/node_modules/**', '**/dist/**'],
    setupFiles: ['./vitest.setup.ts'],

    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false,
        useAtomics: true,
        isolate: true,
      },
    },

    fileParallelism: true,
    maxConcurrency: 20,
    testTimeout: 10000,

    deps: {
      optimizer: {
        web: { enabled: true },
      },
    },
  },

  resolve: {
    alias: pathAliases,
  },
})
