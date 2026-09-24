import { z } from 'zod';
import { link, nullableLink } from './common.validator.js';

/**
 * Site settings, in the shape a PUT must supply.
 *
 * `strict()` throughout, like the page schemas: settings drive the shell of
 * every page, so a misspelled key that silently did nothing would be a
 * site-wide change the editor believes they made.
 */

const url = z.string().trim().url().max(2048).nullable();

export const settingsWriteSchema = z
  .object({
    firmName: z.string().trim().min(1).max(160),
    legalDescriptor: z.string().trim().min(1).max(200),
    tagline: z.string().trim().min(1).max(300),
    foundedYear: z.number().int().min(1800).max(2200),
    phone: z.string().trim().max(40).nullable(),
    email: z.string().trim().toLowerCase().email().max(254).nullable(),
    socials: z
      .object({
        instagram: url,
        facebook: url,
        x: url,
        linkedin: url,
        youtube: url,
      })
      .strict(),
    copyright: z.string().trim().min(1).max(300),
    faqSection: z
      .object({
        eyebrow: z.string().trim().max(160).nullable(),
        title: z.string().trim().min(1).max(200),
      })
      .strict(),
    stillHaveQuestions: z
      .object({
        title: z.string().trim().min(1).max(200),
        text: z.string().trim().min(1).max(600),
        actions: z.array(link).max(6),
      })
      .strict(),
    contactCallout: z
      .object({
        title: z.string().trim().min(1).max(200),
        text: z.string().trim().min(1).max(800),
        primaryCta: nullableLink,
        secondaryCta: nullableLink,
      })
      .strict(),
  })
  .strict();

export type SettingsWriteInput = z.infer<typeof settingsWriteSchema>;
