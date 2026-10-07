import type { InsightCategory } from '../types/api.js';

/**
 * The stand-in cover for an insight without one of its own (ADR-063): the
 * card of its first category that has one. The first category is also the
 * first chip on the card, so the cover and the chip agree.
 */
export function pickCategoryCover<T>(
  categories: readonly InsightCategory[],
  covers: Partial<Record<InsightCategory, T | null>>
): T | null {
  for (const category of categories) {
    const cover = covers[category];
    if (cover !== null && cover !== undefined) return cover;
  }

  return null;
}
