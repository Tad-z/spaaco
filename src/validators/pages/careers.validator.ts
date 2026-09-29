import { z } from 'zod';
import { hero, nullableLink, richText, seo } from '../common.validator.js';

/**
 * Open jobs are embedded from the jobs collection, not stored here. The empty
 * state is stored always and served only when no job is open.
 */
export const careersPageSchema = z
  .object({
    hero,
    jobsSection: z
      .object({
        eyebrow: z.string().trim().max(160).nullable(),
        title: z.string().trim().min(1).max(200),
        cta: nullableLink,
        emptyState: z
          .object({
            title: z.string().trim().min(1).max(200),
            body: richText(4000),
            ctaLabel: z.string().trim().min(1).max(60),
          })
          .strict()
          .nullable(),
      })
      .strict(),
    seo,
  })
  .strict();

export type CareersPageInput = z.infer<typeof careersPageSchema>;
