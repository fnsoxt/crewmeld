/**
 * cURL command parser
 * Supports common options: -X, -H, -d, --data, -u, --url, --data-raw, --data-binary
 */

export interface ParsedCurl {
  method: string
  url: string
  headers: Array<{ key: string; value: string; enabled: boolean }>
  params: Array<{ key: string; value: string; enabled: boolean }>
  authType: 'none' | 'api_key' | 'bearer' | 'basic'
  bearerToken: string
  basicUsername: string
  basicPassword: string
  bodyType: 'none' | 'json' | 'form-urlencoded' | 'raw'
  bodyContent: string
}

/**
 * Tokenize a cURL string (handling quotes)
 */
function tokenize(input: string): string[] {
  const tokens: string[] = []
  let current = ''
  let inSingle = false
  let inDouble = false
  let isEscaped = false

  for (const ch of input) {
    if (isEscaped) {
      current += ch
      isEscaped = false
      continue
    }
    if (ch === '\\' && !inSingle) {
      isEscaped = true
      continue
    }
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle
      continue
    }
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble
      continue
    }
    if ((ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') && !inSingle && !inDouble) {
      if (current.length > 0) {
        tokens.push(current)
        current = ''
      }
      continue
    }
    current += ch
  }
  if (current.length > 0) tokens.push(current)
  return tokens
}

/**
 * Extract query params from a URL and return a clean URL
 */
function extractParams(url: string): {
  cleanUrl: string
  params: Array<{ key: string; value: string; enabled: boolean }>
} {
  try {
    const u = new URL(url)
    const params: Array<{ key: string; value: string; enabled: boolean }> = []
    u.searchParams.forEach((value, key) => {
      params.push({ key, value, enabled: true })
    })
    u.search = ''
    return { cleanUrl: u.toString(), params }
  } catch {
    return { cleanUrl: url, params: [] }
  }
}

/**
 * Parse a cURL command string
 */
export function parseCurl(curlStr: string): ParsedCurl {
  // Remove line continuation characters
  const cleaned = curlStr
    .replace(/\\\n/g, ' ')
    .replace(/\\\r\n/g, ' ')
    .trim()
  const tokens = tokenize(cleaned)

  let method = ''
  let url = ''
  const headers: Array<{ key: string; value: string; enabled: boolean }> = []
  let bodyContent = ''
  let basicUsername = ''
  let basicPassword = ''

  let i = 0
  // Skip leading "curl"
  if (tokens[0]?.toLowerCase() === 'curl') i = 1

  while (i < tokens.length) {
    const token = tokens[i]

    if (token === '-X' || token === '--request') {
      method = (tokens[++i] ?? 'GET').toUpperCase()
    } else if (token === '-H' || token === '--header') {
      const header = tokens[++i] ?? ''
      const colonIdx = header.indexOf(':')
      if (colonIdx > 0) {
        headers.push({
          key: header.slice(0, colonIdx).trim(),
          value: header.slice(colonIdx + 1).trim(),
          enabled: true,
        })
      }
    } else if (
      token === '-d' ||
      token === '--data' ||
      token === '--data-raw' ||
      token === '--data-binary'
    ) {
      bodyContent = tokens[++i] ?? ''
    } else if (token === '-u' || token === '--user') {
      const userPass = tokens[++i] ?? ''
      const colonIdx = userPass.indexOf(':')
      if (colonIdx > 0) {
        basicUsername = userPass.slice(0, colonIdx)
        basicPassword = userPass.slice(colonIdx + 1)
      } else {
        basicUsername = userPass
      }
    } else if (token === '--url') {
      url = tokens[++i] ?? ''
    } else if (!token.startsWith('-') && !url) {
      // Bare URL
      url = token
    }

    i++
  }

  // Detect auth from headers
  let authType: ParsedCurl['authType'] = 'none'
  let bearerToken = ''
  const filteredHeaders: typeof headers = []

  for (const h of headers) {
    if (h.key.toLowerCase() === 'authorization') {
      const val = h.value
      if (val.toLowerCase().startsWith('bearer ')) {
        authType = 'bearer'
        bearerToken = val.slice(7).trim()
        continue
      }
      if (val.toLowerCase().startsWith('basic ')) {
        authType = 'basic'
        try {
          const decoded = atob(val.slice(6).trim())
          const colonIdx = decoded.indexOf(':')
          if (colonIdx > 0) {
            basicUsername = decoded.slice(0, colonIdx)
            basicPassword = decoded.slice(colonIdx + 1)
          }
        } catch {
          /* ignore decode errors */
        }
        continue
      }
    }
    filteredHeaders.push(h)
  }

  if (basicUsername && authType === 'none') {
    authType = 'basic'
  }

  // Infer method
  if (!method) {
    method = bodyContent ? 'POST' : 'GET'
  }

  // Extract query params from URL
  const { cleanUrl, params } = extractParams(url)

  // Infer body type
  let bodyType: ParsedCurl['bodyType'] = 'none'
  if (bodyContent) {
    const contentTypeHeader = filteredHeaders.find((h) => h.key.toLowerCase() === 'content-type')
    const ct = contentTypeHeader?.value.toLowerCase() ?? ''
    if (
      ct.includes('application/json') ||
      bodyContent.trimStart().startsWith('{') ||
      bodyContent.trimStart().startsWith('[')
    ) {
      bodyType = 'json'
    } else if (ct.includes('x-www-form-urlencoded')) {
      bodyType = 'form-urlencoded'
    } else {
      bodyType = 'raw'
    }
  }

  return {
    method,
    url: cleanUrl,
    headers: filteredHeaders,
    params,
    authType,
    bearerToken,
    basicUsername,
    basicPassword,
    bodyType,
    bodyContent,
  }
}
