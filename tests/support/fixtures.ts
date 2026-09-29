import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FIXTURE_DIR } from './spec.js';

/**
 * Comparing a live response with the fixture the frontend builds against.
 *
 * Ids and placeholder image dimensions legitimately vary between runs, so they
 * are normalised away; everything else — copy, ordering, nesting, nullability —
 * must match exactly.
 */
export function normalise(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalise);
  if (typeof value !== 'object' || value === null) return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, nested]) => {
      if (key === 'id') return [key, '<id>'];
      // Placeholder image URLs embed generated labels; the fixture and the
      // seed agree on the label but not on which record produced it.
      if (
        (key === 'url' || key === 'sm' || key === 'md' || key === 'lg') &&
        typeof nested === 'string'
      ) {
        return [key, nested.replace(/\d+x\d+/, '<size>')];
      }
      return [key, normalise(nested)];
    })
  );
}

export const readFixture = (name: string): unknown =>
  JSON.parse(readFileSync(join(FIXTURE_DIR, name), 'utf8'));
