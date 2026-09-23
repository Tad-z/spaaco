import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Authenticated encryption for secrets that must be read back, currently only
 * TOTP secrets.
 *
 * The key is passed in rather than read from config, so this stays a pure
 * helper. AES-256-GCM, so tampering is detected rather than quietly decrypting
 * to nonsense.
 */

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

export function encryptSecret(plaintext: string, keyHex: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, Buffer.from(keyHex, 'hex'), iv);

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join('.');
}

export function decryptSecret(payload: string, keyHex: string): string {
  const [ivPart, tagPart, dataPart] = payload.split('.');
  if (ivPart === undefined || tagPart === undefined || dataPart === undefined) {
    throw new Error('Malformed encrypted payload');
  }

  const decipher = createDecipheriv(
    ALGORITHM,
    Buffer.from(keyHex, 'hex'),
    Buffer.from(ivPart, 'base64')
  );
  decipher.setAuthTag(Buffer.from(tagPart, 'base64'));

  return Buffer.concat([
    decipher.update(Buffer.from(dataPart, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}
