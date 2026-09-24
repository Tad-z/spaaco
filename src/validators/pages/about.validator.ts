import { z } from 'zod';
import {
  hero,
  iconItem,
  objectIdRef,
  paragraphs,
  seo,
  stat,
  titledBody,
} from '../common.validator.js';

const sectionWithImage = {
  eyebrow: z.string().trim().max(160).nullable(),
  title: z.string().trim().min(1).max(200),
  image: objectIdRef,
};

export const aboutPageSchema = z
  .object({
    hero,
    story: z
      .object({
        eyebrow: z.string().trim().max(160).nullable(),
        title: z.string().trim().min(1).max(200),
        paragraphs,
        quote: z.string().trim().max(600).nullable(),
        quotePerson: objectIdRef,
      })
      .strict(),
    stats: z
      .object({
        title: z.string().trim().min(1).max(200),
        items: z.array(stat).max(8),
      })
      .strict(),
    missionSection: z.object({ ...sectionWithImage, items: z.array(titledBody).max(8) }).strict(),
    principles: z.object({ ...sectionWithImage, items: z.array(iconItem).max(12) }).strict(),
    awardsList: z
      .object({
        ...sectionWithImage,
        items: z
          .array(
            z
              .object({
                name: z.string().trim().min(1).max(160),
                url: z.string().trim().max(2048).nullable(),
              })
              .strict()
          )
          .max(12),
      })
      .strict(),
    seo,
  })
  .strict();

export type AboutPageInput = z.infer<typeof aboutPageSchema>;
