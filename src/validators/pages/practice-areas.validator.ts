import { z } from 'zod';
import { hero, nullableLink, objectIdRef, sectionHeader, seo } from '../common.validator.js';

export const practiceAreasPageSchema = z
  .object({
    hero,
    gridSection: sectionHeader,
    csrBanner: z
      .object({
        title: z.string().trim().min(1).max(200),
        text: z.string().trim().min(1).max(1000),
        image: objectIdRef,
        // Null until the CSR page exists: a placeholder href would render as a
        // real link to a 404.
        cta: nullableLink,
      })
      .strict(),
    seo,
  })
  .strict();

export type PracticeAreasPageInput = z.infer<typeof practiceAreasPageSchema>;
