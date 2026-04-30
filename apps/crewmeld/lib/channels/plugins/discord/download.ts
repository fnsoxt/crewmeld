/**
 * Discord attachment proxy download - supports HTTPS_PROXY
 */

import http from 'http'
import https from 'https'
import { URL } from 'url'
import { t } from '@/lib/core/server-i18n'

/**
 * Download file via HTTP CONNECT proxy, returns Buffer
 */
export function proxyDownload(targetUrl: string, proxyUrl: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const target = new URL(targetUrl)
    const proxy = new URL(proxyUrl)

    const connectReq = http.request({
      host: proxy.hostname,
      port: Number(proxy.port) || 80,
      method: 'CONNECT',
      path: `${target.hostname}:${target.port || 443}`,
    })

    connectReq.on('connect', (_res, socket) => {
      const req = https.request(
        {
          hostname: target.hostname,
          port: target.port || 443,
          path: target.pathname + target.search,
          method: 'GET',
          socket,
          agent: false,
        } as unknown as import('https').RequestOptions,
        (res) => {
          if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
            reject(new Error(`${t('channelDiscordDownloadFailed')}: HTTP ${res.statusCode}`))
            return
          }
          const chunks: Buffer[] = []
          res.on('data', (chunk: Buffer) => chunks.push(chunk))
          res.on('end', () => resolve(Buffer.concat(chunks)))
        }
      )

      req.on('error', reject)
      req.end()
    })

    connectReq.on('error', reject)
    connectReq.end()
  })
}
