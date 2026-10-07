import { z } from 'zod';
import { hero, objectIdRef, sectionHeader, seo } from '../common.validator.js';
import { INSIGHT_CATEGORIES } from '../../constants/enums.js';

/**
 * The card shown as the cover of an insight that has none, per category
 * (ADR-063). Each is an image from the media library; the kind is checked on
 * write (ADR-053).
 */
const categoryCovers = z
  .object(
    Object.fromEntries(
      INSIGHT_CATEGORIES.values.map((category) => [category, objectIdRef.optional()])
    )
  )
  .strict();

/**
 * The only page whose hero is nullable: the design opens with the featured
 * carousel rather than a banner.
 */
export const insightsPageSchema = z
  .object({
    hero: hero.nullable(),
    listingSection: sectionHeader,
    categoryCovers: categoryCovers.nullable().optional(),
    seo,
  })
  .strict();

export type InsightsPageInput = z.infer<typeof insightsPageSchema>;
