/**
 * Provider registry — delegates all registration logic to the registry/core module.
 * @module providers/registry
 */
export {
  getAllProviders,
  getProviderExecutor,
  initializeProviders,
} from '@/providers/registry/core'
