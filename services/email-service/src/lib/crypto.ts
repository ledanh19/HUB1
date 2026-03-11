/**
 * AES-256-GCM Token Encryption
 * ═══════════════════════════════════════════════════════════
 * - NEVER store tokens as plain text
 * - NEVER log decrypted tokens
 * - NEVER return tokens to frontend
 */
import crypto from 'node:crypto';
import { env } from '../config';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;  // 96-bit IV for GCM
const TAG_LENGTH = 16; // 128-bit auth tag

function getKey(): Buffer {
  return Buffer.from(env.TOKEN_ENCRYPTION_KEY, 'hex');
}

/**
 * Encrypt a plaintext string. Returns "iv:ciphertext:tag" in hex.
 */
export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv, {
    authTagLength: TAG_LENGTH,
  });
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString('hex'),
    encrypted.toString('hex'),
    tag.toString('hex'),
  ].join(':');
}

/**
 * Decrypt a "iv:ciphertext:tag" hex string.
 */
export function decrypt(cipherString: string): string {
  const [ivHex, encHex, tagHex] = cipherString.split(':');
  if (!ivHex || !encHex || !tagHex) {
    throw new Error('Invalid cipher format');
  }
  const iv = Buffer.from(ivHex, 'hex');
  const encrypted = Buffer.from(encHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv, {
    authTagLength: TAG_LENGTH,
  });
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}
