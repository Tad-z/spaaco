import { z } from 'zod';
import { nullableLink, seo } from '../common.validator.js';

/**
 * The labels every recognition directory page shares (ADR-056). The directory
 * pages themselves are composed from the collections by `/recognitions/:slug`.
 */
export const recognitionPageSchema = z
  .object({
    directoryPage: z
      .object({
        awardsEyebrow: z.string().trim().min(1).max(160),
        primaryCta: nullableLink,
        secondaryCta: nullableLink,
      })
      .strict(),
    seo,
  })
  .strict();

export type RecognitionPageInput = z.infer<typeof recognitionPageSchema>;
