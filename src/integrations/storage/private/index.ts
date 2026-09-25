import { config } from '../../../config/env.js';
import { createLocalPrivateStorage } from './local.driver.js';
import { createS3PrivateStorage } from './s3.driver.js';
import type { IPrivateStorage } from '../../../interfaces/integrations/private-storage.interface.js';

/**
 * Picks the private storage driver from config.
 *
 * The local driver signs its links with `ENCRYPTION_KEY`: it is already a
 * 32-byte secret the deployment must hold, and adding a second one for a
 * dev-only driver would be a variable nobody sets correctly.
 */

let cached: IPrivateStorage | undefined;

export function createPrivateStorage(): IPrivateStorage {
  if (
    config.STORAGE_PRIVATE_DRIVER === 's3' &&
    config.S3_BUCKET_PRIVATE !== undefined &&
    config.S3_REGION !== undefined &&
    config.S3_ACCESS_KEY_ID !== undefined &&
    config.S3_SECRET_ACCESS_KEY !== undefined
  ) {
    return createS3PrivateStorage({
      bucket: config.S3_BUCKET_PRIVATE,
      region: config.S3_REGION,
      accessKeyId: config.S3_ACCESS_KEY_ID,
      secretAccessKey: config.S3_SECRET_ACCESS_KEY,
      endpoint: config.S3_ENDPOINT,
    });
  }

  return createLocalPrivateStorage(
    config.PRIVATE_UPLOAD_DIR,
    config.API_BASE_URL,
    config.ENCRYPTION_KEY
  );
}

/** One instance per process; the drivers are stateless but hold credentials. */
export function privateStorage(): IPrivateStorage {
  cached ??= createPrivateStorage();
  return cached;
}
