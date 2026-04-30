/**
 * DingTalk event subscription encryption/decryption
 *
 * Encryption scheme: AES-CBC
 * - key = base64decode(aesKey + "=") (pad base64 padding)
 * - iv = first 16 bytes of key
 * - Plaintext format: random(16B) + msgLen(4B BigEndian) + msg + suiteKey
 *
 * Signature verification:
 * - signature = sha256(sort([token, timestamp, nonce, encrypt]))
 *
 * Docs: https://open.dingtalk.com/document/orgapp/configure-event-subcription
 */

import crypto from 'crypto'
import { createLogger } from '@crewmeld/logger'

const logger = createLogger('DingtalkCrypto')

/**
 * Decrypt DingTalk event subscription encrypted message
 */
export function decryptDingtalkPayload(aesKey: string, encryptedText: string): string {
  // aesKey is base64 without padding, need to append "="
  const keyBuffer = Buffer.from(`${aesKey}=`, 'base64')
  const iv = keyBuffer.subarray(0, 16)

  const decipher = crypto.createDecipheriv('aes-256-cbc', keyBuffer, iv)
  decipher.setAutoPadding(false)

  const encrypted = Buffer.from(encryptedText, 'base64')
  let decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])

  // PKCS#7 unpadding
  const padLen = decrypted[decrypted.length - 1]
  if (padLen > 0 && padLen <= 32) {
    decrypted = decrypted.subarray(0, decrypted.length - padLen)
  }

  // Plaintext format: random(16B) + msgLen(4B BigEndian) + msg + suiteKey
  const msgLen = decrypted.readUInt32BE(16)
  const msg = decrypted.subarray(20, 20 + msgLen).toString('utf-8')

  return msg
}

/**
 * Encrypt DingTalk response (for replying to event subscription verification)
 */
export function encryptDingtalkPayload(
  aesKey: string,
  plainText: string,
  suiteKey: string
): string {
  const keyBuffer = Buffer.from(`${aesKey}=`, 'base64')
  const iv = keyBuffer.subarray(0, 16)

  const random = crypto.randomBytes(16)
  const msgBuffer = Buffer.from(plainText, 'utf-8')
  const suiteKeyBuffer = Buffer.from(suiteKey, 'utf-8')

  const msgLenBuffer = Buffer.alloc(4)
  msgLenBuffer.writeUInt32BE(msgBuffer.length, 0)

  const plainBuffer = Buffer.concat([random, msgLenBuffer, msgBuffer, suiteKeyBuffer])

  // PKCS#7 padding
  const blockSize = 32
  const padLen = blockSize - (plainBuffer.length % blockSize)
  const padBuffer = Buffer.alloc(padLen, padLen)
  const paddedBuffer = Buffer.concat([plainBuffer, padBuffer])

  const cipher = crypto.createCipheriv('aes-256-cbc', keyBuffer, iv)
  cipher.setAutoPadding(false)

  const encrypted = Buffer.concat([cipher.update(paddedBuffer), cipher.final()])
  return encrypted.toString('base64')
}

/**
 * Compute DingTalk event signature (SHA1)
 *
 * DingTalk event subscription signature algorithm: sort([token, timestamp, nonce, encrypt]) -> SHA1
 */
export function computeDingtalkSignature(
  token: string,
  timestamp: string,
  nonce: string,
  encrypt: string
): string {
  const parts = [token, timestamp, nonce, encrypt].sort()
  return crypto.createHash('sha1').update(parts.join('')).digest('hex')
}

/**
 * Verify DingTalk event subscription signature
 */
export function verifyDingtalkEventSignature(
  token: string,
  timestamp: string,
  nonce: string,
  encrypt: string,
  expectedSignature: string
): boolean {
  const computed = computeDingtalkSignature(token, timestamp, nonce, encrypt)
  return computed === expectedSignature
}

/**
 * Build DingTalk event subscription encrypted response
 *
 * DingTalk URL verification (check_url) requires returning an encrypted response:
 * { msg_signature, timeStamp, nonce, encrypt }
 */
export function buildEncryptedResponse(
  aesKey: string,
  token: string,
  suiteKey: string,
  responseText: string
): Record<string, string> {
  const timestamp = String(Date.now())
  const nonce = crypto.randomBytes(8).toString('hex')
  const encrypt = encryptDingtalkPayload(aesKey, responseText, suiteKey)
  const signature = computeDingtalkSignature(token, timestamp, nonce, encrypt)

  return {
    msg_signature: signature,
    timeStamp: timestamp,
    nonce,
    encrypt,
  }
}
