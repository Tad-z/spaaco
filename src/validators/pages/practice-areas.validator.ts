import { z } from 'zod';
import { hero, mediaIdList, nullableLink, sectionHeader, seo } from '../common.validator.js';

export const practiceAreasPageSchema = z
  .object({
    hero,
    gridSection: sectionHeader,
    csrBanner: z
      .object({
        title: z.string().trim().min(1).max(200),
        text: z.string().trim().min(1).max(1000),
        // A carousel: only the image changes between slides (ADR-046).
        images: mediaIdList,
        cta: nullableLink,
      })
      .strict(),
    seo,
  })
  .strict();

export type PracticeAreasPageInput = z.infer<typeof practiceAreasPageSchema>;
