import { z } from 'zod';
import {
  hero,
  iconItem,
  nullableLink,
  objectIdRef,
  paragraphs,
  pendingLink,
  safeUrl,
  sectionHeader,
  seo,
} from '../common.validator.js';

/** `strict()` throughout: an unknown section is a mistake, not data to keep. */
export const homePageSchema = z
  .object({
    hero,
    aboutFirm: z
      .object({
        title: z.string().trim().min(1).max(200),
        paragraphs,
        cta: nullableLink,
      })
      .strict(),
    videoShowcase: z
      .object({
        videoUrl: safeUrl.nullable(),
        poster: objectIdRef,
        caption: z.string().trim().max(300).nullable(),
      })
      .strict(),
    // The badges are the awards flagged for Home, so they are not edited here.
    recognitionSection: z
      .object({
        eyebrow: z.string().trim().max(160).nullable(),
        title: z.string().trim().min(1).max(200),
        image: objectIdRef,
        cta: pendingLink,
      })
      .strict(),
    practiceSection: sectionHeader,
    leadershipSection: sectionHeader,
    whyChooseUs: z
      .object({
        eyebrow: z.string().trim().max(160).nullable(),
        title: z.string().trim().min(1).max(200),
        text: z.string().trim().min(1).max(1000),
        points: z.array(iconItem).max(8),
        image: objectIdRef,
      })
      .strict(),
    insightsSection: sectionHeader,
    seo,
  })
  .strict();

export type HomePageInput = z.infer<typeof homePageSchema>;
