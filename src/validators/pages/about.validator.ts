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
        // "…download a copy of our profile here". The document is a PDF from
        // the media library; its kind is checked on write (ADR-053).
        profileDownload: z
          .object({
            leadText: z.string().trim().min(1).max(300),
            linkLabel: z.string().trim().min(1).max(60),
            document: objectIdRef,
          })
          .strict()
          .nullable(),
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
    // The rows are the recognition directories, composed at read time.
    awardsList: z.object(sectionWithImage).strict(),
    seo,
  })
  .strict();

export type AboutPageInput = z.infer<typeof aboutPageSchema>;
