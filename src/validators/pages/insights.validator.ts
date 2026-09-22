import { z } from 'zod';
import { hero, sectionHeader, seo } from '../common.validator.js';

/**
 * The only page whose hero is nullable: the design opens with the featured
 * carousel rather than a banner.
 */
export const insightsPageSchema = z
  .object({ hero: hero.nullable(), listingSection: sectionHeader, seo })
  .strict();

export type InsightsPageInput = z.infer<typeof insightsPageSchema>;
