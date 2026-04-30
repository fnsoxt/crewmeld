/**
 * Proxy fetch for foreign LLM providers
 *
 * Used exclusively by OpenAI / Anthropic / Google and other foreign model SDKs.
 * Routes through proxy when available, direct connection otherwise. Does not affect any other modules.
 */

import { ProxyAgent, fetch as undiciFetch } from 'undici'

let cachedAgent: ProxyAgent | undefined

function getProxyAgent(): ProxyAgent | undefined {
  const proxyUrl =
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy
  if (!proxyUrl) return undefined
  if (!cachedAgent) {
    cachedAgent = new ProxyAgent(proxyUrl)
  }
  return cachedAgent
}

/**
 * Proxy-aware fetch -- routes through HTTPS_PROXY when set, direct otherwise.
 * Signature is compatible with OpenAI / Anthropic SDK `fetch` parameter.
 */
export const providerProxyFetch: typeof globalThis.fetch = (input, init) => {
  const agent = getProxyAgent()
  if (agent) {
    return undiciFetch(
      input as Parameters<typeof undiciFetch>[0],
      {
        ...(init as Record<string, unknown>),
        dispatcher: agent,
      } as Parameters<typeof undiciFetch>[1]
    ) as unknown as Promise<Response>
  }
  return fetch(input, init)
}
