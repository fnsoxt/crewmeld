/**
 * WeCom message encryption/decryption
 *
 * AES-256-CBC encryption/decryption following the WeCom callback message encryption protocol.
 * EncodingAESKey (43-char Base64url) -> restore + '=' -> decode to 32-byte AES key
 * IV = first 16 bytes of key
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { t } from '@/lib/core/server-i18n'

/**
 * Decode 43-char EncodingAESKey to { key: 32B, iv: 16B }
 */
export function decodeEncodingAESKey(encodingAESKey: string): { key: Buffer; iv: Buffer } {
  const base64 = `${encodingAESKey}=`
  const buf = Buffer.from(base64, 'base64')
  if (buf.length !== 32) {
    throw new Error(
      `EncodingAESKey ${t('channelWecomDecodeError', 'zh', { expected: '32', actual: String(buf.length) })}`
    )
  }
  return { key: buf, iv: buf.subarray(0, 16) }
}

/**
 * PKCS#7 padding (block size 32 bytes, WeCom-specific)
 */
function pkcs7Pad(buf: Buffer): Buffer {
  const blockSize = 32
  const padLen = blockSize - (buf.length % blockSize)
  const padding = Buffer.alloc(padLen, padLen)
  return Buffer.concat([buf, padding])
}

/**
 * Remove PKCS#7 padding
 */
function pkcs7Unpad(buf: Buffer): Buffer {
  const padLen = buf[buf.length - 1]
  if (padLen < 1 || padLen > 32) {
    throw new Error(`PKCS#7 ${t('channelWecomPaddingError')}: ${padLen}`)
  }
  return buf.subarray(0, buf.length - padLen)
}

/**
 * WeCom message encryption
 *
 * Format: random(16B) + msgLen(4B BE) + msg + corpId -> PKCS#7 padding -> AES-256-CBC -> Base64
 */
export function encryptWeComMessage(
  encodingAESKey: string,
  message: string,
  corpId: string
): string {
  const { key, iv } = decodeEncodingAESKey(encodingAESKey)

  const randomPrefix = randomBytes(16)
  const msgBuf = Buffer.from(message, 'utf-8')
  const msgLen = Buffer.alloc(4)
  msgLen.writeUInt32BE(msgBuf.length)
  const corpIdBuf = Buffer.from(corpId, 'utf-8')

  const plaintext = Buffer.concat([randomPrefix, msgLen, msgBuf, corpIdBuf])
  const padded = pkcs7Pad(plaintext)

  const cipher = createCipheriv('aes-256-cbc', key, iv)
  cipher.setAutoPadding(false)
  const encrypted = Buffer.concat([cipher.update(padded), cipher.final()])

  return encrypted.toString('base64')
}

/**
 * WeCom message decryption
 *
 * Base64 -> AES-256-CBC decrypt -> remove PKCS#7 -> extract msg_len + msg + corpId
 */
export function decryptWeComMessage(
  encodingAESKey: string,
  ciphertext: string
): { message: string; corpId: string } {
  const { key, iv } = decodeEncodingAESKey(encodingAESKey)

  const encrypted = Buffer.from(ciphertext, 'base64')
  const decipher = createDecipheriv('aes-256-cbc', key, iv)
  decipher.setAutoPadding(false)
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])

  const unpadded = pkcs7Unpad(decrypted)

  // random(16B) + msgLen(4B BE) + msg + corpId
  const msgLen = unpadded.readUInt32BE(16)
  const msgStart = 20
  const msgEnd = msgStart + msgLen
  const message = unpadded.subarray(msgStart, msgEnd).toString('utf-8')
  const corpId = unpadded.subarray(msgEnd).toString('utf-8')

  return { message, corpId }
}

/**
 * WeCom callback signature generation (4 params)
 *
 * SHA1(sort([token, timestamp, nonce, encrypt]))
 */
export function generateWeComSignature(
  token: string,
  timestamp: string,
  nonce: string,
  encrypt: string
): string {
  const arr = [token, timestamp, nonce, encrypt].sort()
  return createHash('sha1').update(arr.join('')).digest('hex')
}
