import { invalidateTags, remember } from '../core/cache.js';
import { tagsFor } from '../constants/cache-tags.js';
import type { CacheEntity } from '../constants/cache-tags.js';
import { logger } from '../core/logger.js';

/**
 * Cache invalidation, and the webhook that tells the frontend to revalidate.
 *
 * The webhook is fire-and-forget: the firm saving a page must not fail because
 * the frontend's revalidation endpoint is down. Failures are logged.
 */

export { remember };

export interface Revalidator {
  revalidate: (tags: readonly string[]) => Promise<void>;
}

let revalidator: Revalidator | undefined;

/** Wired at startup; left unset in tests that do not care. */
export function setRevalidator(next: Revalidator | undefined): void {
  revalidator = next;
}

export function invalidate(tags: readonly string[]): void {
  const dropped = invalidateTags(tags);
  logger.debug({ tags, dropped }, 'cache invalidated');

  if (!revalidator) return;

  void revalidator.revalidate(tags).catch((error: unknown) => {
    logger.error({ err: error, tags }, 'frontend revalidation failed');
  });
}

/** Invalidate everything a write to this entity affects. */
export function invalidateEntity(entity: CacheEntity, slugOrKey?: string): void {
  invalidate(tagsFor(entity, slugOrKey));
}
