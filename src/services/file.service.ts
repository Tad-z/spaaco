import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import { config } from '../config/env.js';
import { ForbiddenError, NotFoundError } from '../core/errors.js';
import { verifyLocalUrl } from '../integrations/storage/private/local.driver.js';

/**
 * Redeeming a locally signed CV link.
 *
 * Only the `local` private driver needs this; an S3 presigned URL is redeemed
 * by S3. The signature is the authorisation, exactly as it is there: issued by
 * an HR-only endpoint, audit-logged when issued, and dead after five minutes.
 */

export interface CvDownload {
  readonly stream: Readable;
  readonly filename: string;
}

export async function openSignedCv(
  key: string,
  expires: string,
  signature: string,
  filename: string
): Promise<CvDownload> {
  if (!verifyLocalUrl(config.ENCRYPTION_KEY, key, expires, signature)) {
    // One answer for an invalid signature and an expired one: telling them
    // apart would reveal whether the key exists.
    throw new ForbiddenError('That link has expired or is not valid.');
  }

  // The key is already constrained to a UUID and an extension by the
  // validator, so it cannot climb out of the directory.
  const path = join(config.PRIVATE_UPLOAD_DIR, key);

  try {
    await stat(path);
  } catch {
    throw new NotFoundError('File');
  }

  return { stream: createReadStream(path), filename };
}
