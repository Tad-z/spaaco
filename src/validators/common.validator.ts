import { z } from 'zod';
import { LINK_KINDS, STAT_SOURCES } from '../constants/enums.js';
import { PAGINATION, SEARCH } from '../config/constants.js';

/**
 * Shared request schemas.
 *
 * These validate the **editable shape** an admin client sends: media and person
 * references arrive as 24-character id strings, not ObjectIds, and computed
 * stats still carry their `source`. That is what makes an admin GET body a
 * valid PUT body (ADR-014).
 */

export const objectId = z
  .string()
  .regex(/^[0-9a-f]{24}$/i, 'must be a 24-character hexadecimal id');

export const slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'must be lowercase kebab-case')
  .max(140);

/** A nullable reference to another document. */
export const objectIdRef = objectId.nullable();

export const link = z.object({
  label: z.string().trim().min(1).max(120),
  href: z.string().trim().min(1).max(2048),
  kind: z.enum(LINK_KINDS.values),
});

export const nullableLink = link.nullable();

export const seo = z.object({
  title: z.string().trim().max(200).nullable(),
  description: z.string().trim().max(400).nullable(),
  ogImage: objectIdRef,
});

export const seoBasic = z.object({
  title: z.string().trim().max(200).nullable(),
  description: z.string().trim().max(400).nullable(),
});

export const hero = z.object({
  title: z.string().trim().min(1).max(200),
  subtitle: z.string().trim().max(600).nullable(),
  image: objectIdRef,
  primaryCta: nullableLink,
  secondaryCta: nullableLink,
});

export const sectionHeader = z.object({
  eyebrow: z.string().trim().max(160).nullable(),
  title: z.string().trim().min(1).max(200),
  cta: nullableLink,
});

export const iconItem = z.object({
  // An icon key the frontend maps to its own set, never an asset URL (ADR-012).
  icon: z.string().trim().min(1).max(60),
  title: z.string().trim().min(1).max(160),
  text: z.string().trim().max(600).nullable(),
});

export const stat = z.object({
  value: z.string().trim().min(1).max(60),
  caption: z.string().trim().min(1).max(200),
  label: z.string().trim().min(1).max(60),
  source: z.enum(STAT_SOURCES.values),
});

export const titledBody = z.object({
  title: z.string().trim().min(1).max(160),
  body: z.string().max(4000),
});

export const paragraphs = z.array(z.string().max(4000)).max(20);

/** `?page=&pageSize=` with the documented bounds and defaults. */
export const pagination = z.object({
  page: z.coerce.number().int().min(1).default(PAGINATION.defaultPage),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(PAGINATION.maxPageSize)
    .default(PAGINATION.defaultPageSize),
});

export const slugParams = z.object({ slug });

export const idParams = z.object({ id: objectId });

export const searchQuery = z.object({
  q: z.string().trim().min(SEARCH.minQueryLength).max(SEARCH.maxQueryLength),
});

/**
 * `?preview=true` is only honoured alongside a valid admin token; the auth
 * middleware decides that, this only parses the flag.
 */
export const previewQuery = z.object({
  preview: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});

export type Pagination = z.infer<typeof pagination>;
export type SlugParams = z.infer<typeof slugParams>;
export type IdParams = z.infer<typeof idParams>;
