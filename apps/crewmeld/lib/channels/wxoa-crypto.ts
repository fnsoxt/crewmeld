/**
 * WeChat Official Account message encryption/decryption + signature verification
 *
 * Official Account signature verification: SHA1(sort([token, timestamp, nonce]))
 * Safe mode encryption/decryption: same AES-256-CBC protocol as WeCom (unified WeChat system)
 *
 * Reuses wecom-crypto AES encryption/decryption functions (same protocol),
 * Signature algorithm differs: Official Account uses 3 params, WeCom uses 4 params.
 */

import { createHash } from 'node:crypto'
import { decodeEncodingAESKey, decryptWeComMessage } from './wecom-crypto'

/**
 * Official Account URL verification signature (3 params)
 *
 * SHA1(sort([token, timestamp, nonce]))
 */
export function generateWxoaSignature(token: string, timestamp: string, nonce: string): string {
  const arr = [token, timestamp, nonce].sort()
  return createHash('sha1').update(arr.join('')).digest('hex')
}

/**
 * Official Account safe mode signature (4 params, same as WeCom)
 *
 * SHA1(sort([token, timestamp, nonce, encrypt]))
 */
export function generateWxoaEncryptSignature(
  token: string,
  timestamp: string,
  nonce: string,
  encrypt: string
): string {
  const arr = [token, timestamp, nonce, encrypt].sort()
  return createHash('sha1').update(arr.join('')).digest('hex')
}

/**
 * Decrypt Official Account safe mode message
 *
 * Same encryption protocol as WeCom: Base64 -> AES-256-CBC -> PKCS#7 -> random(16) + msgLen(4) + msg + appId
 * Directly reuses wecom-crypto's decryptWeComMessage
 */
export function decryptWxoaMessage(
  encodingAESKey: string,
  ciphertext: string
): { message: string; appId: string } {
  const { message, corpId: appId } = decryptWeComMessage(encodingAESKey, ciphertext)
  return { message, appId }
}

export { decodeEncodingAESKey }
