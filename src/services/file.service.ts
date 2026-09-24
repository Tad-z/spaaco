import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import { config } from '../config/env.js';
import { ForbiddenError, NotFoundError } from '../core/errors.js';
import { verifyLocalUrl } from '../integrations/storage/private/local.driver.js';
import { record } from './audit.service.js';

/**
 * Redeeming a locally signed CV link.
 *
 * Only the `local` private driver needs this; an S3 presigned URL is redeemed
 * by S3. The signature is the authorisation, exactly as it is there: issued by
 * an HR-only endpoint, audit-logged when issued, and dead after five minutes.
 *
 * The redemption is audited as well as the issue. A five-minute link can be
 * forwarded and used more than once, so "who was given a link" and "when the
 * bytes were actually served" are different facts, and only the second one
 * says a CV left the building. Under S3 this is not possible — the redemption
 * happens at AWS — which is why issuance is audited there too.
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

  // Best effort here, unlike the issue: the link has already been authorised,
  // and refusing to serve a file because the audit collection hiccuped would
  // help nobody. The issuing entry remains the accountable one.
  await record({
    action: 'application.cv.download',
    entity: 'application',
    meta: { storageKeyHash: fingerprint(key) },
  });

  return { stream: createReadStream(path), filename };
}

/**
 * A short digest of the key, so two entries can be matched to the same file
 * without the log holding the handle that would fetch it.
 */
const fingerprint = (key: string): string =>
  createHash('sha256').update(key).digest('hex').slice(0, 16);
