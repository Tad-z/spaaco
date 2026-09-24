import { config } from '../../../config/env.js';
import { createLocalStorage } from './local.driver.js';
import { createCloudinaryStorage, parseCloudinaryUrl } from './cloudinary.driver.js';
import type { IPublicStorage } from '../../../interfaces/integrations/storage.interface.js';

/**
 * Picks the public image driver from config.
 *
 * `config/env.ts` refuses to start with `STORAGE_PUBLIC_DRIVER=cloudinary` and
 * no `CLOUDINARY_URL`, so the credentials are present by the time this runs.
 */

let cached: IPublicStorage | undefined;

export function createPublicStorage(): IPublicStorage {
  if (config.STORAGE_PUBLIC_DRIVER === 'cloudinary' && config.CLOUDINARY_URL !== undefined) {
    return createCloudinaryStorage(parseCloudinaryUrl(config.CLOUDINARY_URL));
  }

  return createLocalStorage(config.UPLOAD_DIR, config.API_BASE_URL);
}

/** One instance per process; the drivers are stateless but hold credentials. */
export function publicStorage(): IPublicStorage {
  cached ??= createPublicStorage();
  return cached;
}
