import { useContext } from 'react'
import {
  customSessionClient,
  emailOTPClient,
  genericOAuthClient,
  organizationClient,
} from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'
import type { auth } from '@/lib/auth'
import { isBillingEnabled } from '@/lib/core/config/feature-flags'
import { getBaseUrl } from '@/lib/core/utils/urls'
import { SessionContext, type SessionHookResult } from '@/app/_shell/providers/session-provider'

/** Conditional plugin list — organization plugin only loaded when billing is active. */
const conditionalPlugins = isBillingEnabled ? [organizationClient()] : []

/** Shared better-auth browser client for all auth operations. */
export const client = createAuthClient({
  baseURL: getBaseUrl(),
  plugins: [
    emailOTPClient(),
    genericOAuthClient(),
    customSessionClient<typeof auth>(),
    ...conditionalPlugins,
  ],
})

/**
 * Access the session from the nearest SessionProvider.
 * Throws if no SessionProvider is mounted above the call site.
 */
export function useSession(): SessionHookResult {
  const ctx = useContext(SessionContext)
  if (!ctx) {
    throw new Error(
      'SessionProvider is not mounted. Wrap your app with <SessionProvider> in app/layout.tsx.'
    )
  }
  return ctx
}

/** Active organization hook — returns a no-op stub when billing is disabled. */
export const useActiveOrganization = isBillingEnabled
  ? client.useActiveOrganization
  : () => ({ data: undefined, isPending: false, error: null })

export const { signIn, signUp, signOut } = client
