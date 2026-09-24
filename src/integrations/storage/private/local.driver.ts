import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { logger } from '../../../core/logger.js';
import type {
  IPrivateStorage,
  PutPrivateFile,
  SignedUrl,
} from '../../../interfaces/integrations/private-storage.interface.js';

/**
 * CVs on disk, for development and tests.
 *
 * Nothing under this directory is served statically — the app mounts no route
 * over it. A "signed URL" here points at an API endpoint that verifies an HMAC
 * over the key and the expiry, so the local driver has the same shape of
 * access control as S3's presigned URLs: a link that anyone holding it can use
 * once, and that stops working on its own.
 */

export function createLocalPrivateStorage(
  directory: string,
  baseUrl: string,
  signingSecret: string
): IPrivateStorage {
  const pathFor = (key: string): string => join(directory, key);

  return {
    name: 'local',

    async put(input: PutPrivateFile): Promise<string> {
      // Random, and never derived from the uploaded name: a guessable key
      // would let somebody walk the directory by trying candidates.
      const key = `${randomUUID()}.${input.extension}`;

      await mkdir(dirname(pathFor(key)), { recursive: true });
      await writeFile(pathFor(key), input.buffer);

      return key;
    },

    signedUrl(storageKey: string, ttlSeconds: number, filename: string): Promise<SignedUrl> {
      const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
      const expires = String(Math.floor(expiresAt.getTime() / 1000));

      const url = new URL(`${baseUrl.replace(/\/$/, '')}/api/v1/files/cv/${storageKey}`);
      url.searchParams.set('expires', expires);
      url.searchParams.set('filename', filename);
      url.searchParams.set('signature', signLocalUrl(signingSecret, storageKey, expires));

      return Promise.resolve({ url: url.toString(), expiresAt });
    },

    async remove(storageKey: string): Promise<void> {
      try {
        await rm(pathFor(storageKey), { force: true });
      } catch (error: unknown) {
        logger.warn({ err: error }, 'could not remove a stored CV');
      }
    },

    async list(): Promise<string[]> {
      try {
        const entries = await readdir(directory, { withFileTypes: true });
        return entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
      } catch {
        // No directory yet means nothing has been uploaded.
        return [];
      }
    },
  };
}

/** The signature a local CV link carries. */
export function signLocalUrl(secret: string, storageKey: string, expires: string): string {
  return createHmac('sha256', secret).update(`${storageKey}:${expires}`).digest('hex');
}

/**
 * Verify a local CV link.
 *
 * Constant-time, and the expiry is checked too: a signature that never expired
 * would be a permanent public URL for a CV, which is exactly what this design
 * is avoiding.
 */
export function verifyLocalUrl(
  secret: string,
  storageKey: string,
  expires: string,
  signature: string
): boolean {
  const expected = Buffer.from(signLocalUrl(secret, storageKey, expires));
  const given = Buffer.from(signature);

  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false;

  const expiresAt = Number(expires) * 1000;
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}
