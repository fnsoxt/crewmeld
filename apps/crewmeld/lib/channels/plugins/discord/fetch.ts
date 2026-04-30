/**
 * Discord API fetch utility - supports HTTPS_PROXY proxy
 */

import http from 'http'
import https from 'https'
import { URL } from 'url'
import { createLogger } from '@crewmeld/logger'

const logger = createLogger('DiscordFetch')

const DISCORD_API_BASE = 'https://discord.com/api/v10'

interface DiscordFetchOptions {
  method?: string
  body?: string | Buffer
  headers?: Record<string, string>
}

interface DiscordFetchResult {
  ok: boolean
  status: number
  body: string
  json: <T = Record<string, unknown>>() => T
}

/**
 * Send Discord API request, automatically via HTTPS_PROXY proxy
 */
export async function discordFetch(
  path: string,
  botToken: string,
  options: DiscordFetchOptions = {}
): Promise<DiscordFetchResult> {
  const url = `${DISCORD_API_BASE}${path}`
  const headers: Record<string, string> = {
    Authorization: `Bot ${botToken}`,
    'Content-Type': 'application/json',
    ...options.headers,
  }

  const proxy = process.env.HTTPS_PROXY
  if (proxy) {
    return proxyFetch(url, { ...options, headers }, proxy)
  }

  // No proxy, direct fetch
  const res = await fetch(url, {
    method: options.method ?? 'GET',
    headers,
    body: options.body as BodyInit | undefined,
  })
  const body = await res.text()
  return {
    ok: res.ok,
    status: res.status,
    body,
    json: <T>() => JSON.parse(body) as T,
  }
}

/**
 * Send HTTPS request via HTTP CONNECT proxy
 */
function proxyFetch(
  targetUrl: string,
  options: DiscordFetchOptions & { headers?: Record<string, string> },
  proxyUrl: string
): Promise<DiscordFetchResult> {
  return new Promise((resolve, reject) => {
    const target = new URL(targetUrl)
    const proxy = new URL(proxyUrl)

    // Establish CONNECT tunnel
    const connectReq = http.request({
      host: proxy.hostname,
      port: Number(proxy.port) || 80,
      method: 'CONNECT',
      path: `${target.hostname}:${target.port || 443}`,
    })

    connectReq.on('connect', (_res, socket) => {
      // Send HTTPS request through tunnel
      const req = https.request(
        {
          hostname: target.hostname,
          port: target.port || 443,
          path: target.pathname + target.search,
          method: options.method ?? 'GET',
          headers: options.headers,
          socket,
          agent: false,
        } as unknown as import('https').RequestOptions,
        (res) => {
          const chunks: Buffer[] = []
          res.on('data', (chunk: Buffer) => chunks.push(chunk))
          res.on('end', () => {
            const body = Buffer.concat(chunks).toString('utf-8')
            resolve({
              ok: (res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 300,
              status: res.statusCode ?? 0,
              body,
              json: <T>() => JSON.parse(body) as T,
            })
          })
        }
      )

      req.on('error', reject)

      if (options.body) {
        req.write(options.body)
      }
      req.end()
    })

    connectReq.on('error', (err) => {
      logger.error('Proxy connection failed', { proxy: proxyUrl, error: err.message })
      reject(err)
    })

    connectReq.end()
  })
}
