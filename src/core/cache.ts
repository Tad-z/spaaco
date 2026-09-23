import { LRUCache } from 'lru-cache';
import { CACHE } from '../config/constants.js';

/**
 * In-process cache for composed pages and the site shell.
 *
 * Deliberately per-process and small: it exists to absorb repeated reads
 * between admin writes, not to be a source of truth. Anything shared across
 * instances is the CDN's job, driven by the Cache-Control headers.
 *
 * Entries are tagged so a write can clear exactly what it affected rather than
 * flushing everything.
 */

interface Entry {
  readonly value: unknown;
  readonly tags: readonly string[];
}

const store = new LRUCache<string, Entry>({
  max: CACHE.maxEntries,
  ttl: CACHE.ttlMs,
});

/**
 * Returns `unknown`: the cache cannot know what was stored under a key, and a
 * generic here would be an unchecked cast wearing a type parameter. `remember`
 * is the typed way in, because there the value's type comes from the computing
 * function.
 */
export function get(key: string): unknown {
  return store.get(key)?.value;
}

export function set(key: string, value: unknown, tags: readonly string[]): void {
  store.set(key, { value, tags });
}

/** Read through the cache, computing and storing on a miss. */
export async function remember<T>(
  key: string,
  tags: readonly string[],
  compute: () => Promise<T>
): Promise<T> {
  const hit = store.get(key);
  // The value came from a previous call to this same `compute`, so its type is
  // T by construction.
  if (hit !== undefined) return hit.value as T;

  const value = await compute();
  set(key, value, tags);
  return value;
}

/** Drop every entry carrying any of these tags. */
export function invalidateTags(tags: readonly string[]): number {
  if (tags.length === 0) return 0;

  const wanted = new Set(tags);
  let dropped = 0;

  for (const [key, entry] of store.entries()) {
    if (entry.tags.some((tag) => wanted.has(tag))) {
      store.delete(key);
      dropped += 1;
    }
  }

  return dropped;
}

export const clear = (): void => {
  store.clear();
};

export const size = (): number => store.size;
