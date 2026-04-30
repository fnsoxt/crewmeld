/**
 * Proxy fetch stub — P0 does not ship the outbound HTTP proxy layer. Falls
 * back to a native fetch so callers (connector tester) behave reasonably
 * against local services without a proxy configured.
 *
 * TODO: P1 port real implementation from upstream engine (lib/channels/proxy-fetch.ts).
 */

export async function proxyFetch(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, init)
}
