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

/**
 * A URL an editor may store, restricted to schemes a browser can safely follow.
 *
 * The same allow-list `helpers/sanitize.helper.ts` applies inside rich text —
 * and it has to be, because these fields bypass the sanitiser entirely and the
 * frontend renders them straight into an `href`. Without it an editor, or
 * anyone who takes over an editor's account, could store `javascript:` on
 * every page of the firm's public site.
 *
 * A leading `//` is refused: it looks relative but is a protocol-relative
 * absolute URL, so it would follow whatever scheme the page was served over to
 * a host the editor chose.
 */
const SAFE_SCHEMES = ['http:', 'https:', 'mailto:', 'tel:'];

export const safeUrl = z
  .string()
  .trim()
  .min(1)
  .max(2048)
  .refine(
    (value) => {
      if (value.startsWith('//')) return false;

      try {
        return SAFE_SCHEMES.includes(new URL(value).protocol);
      } catch {
        // Not parseable as absolute and not a recognised relative form.
        return false;
      }
    },
    { message: 'must be an http(s), mailto or tel URL, or a path beginning with /' }
  );

/**
 * A link's `href` is constrained by its `kind`, because the three kinds are
 * three different things.
 *
 * An `action` href is not a URL at all: it is a token like `action:mandate`
 * that the frontend maps to a behaviour — opening the enquiry form — and it
 * never reaches an `href` attribute. An `internal` one is a path on the site.
 * Only an `external` one is a URL a browser will follow, and that is the one
 * that needs the scheme allow-list.
 *
 * Checked as a pair rather than on the field alone, so an editor cannot smuggle
 * `javascript:` in by labelling it an action.
 */
const ACTION_HREF = /^action:[a-z][a-z0-9-]{0,40}$/;
const INTERNAL_HREF = /^\/(?!\/)[\w\-/.?=&#%]*$/;

export const link = z
  .object({
    label: z.string().trim().min(1).max(120),
    href: z.string().trim().min(1).max(2048),
    kind: z.enum(LINK_KINDS.values),
  })
  .superRefine((value, ctx) => {
    const valid =
      value.kind === 'action'
        ? ACTION_HREF.test(value.href)
        : value.kind === 'internal'
          ? INTERNAL_HREF.test(value.href)
          : safeUrl.safeParse(value.href).success;

    if (valid) return;

    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['href'],
      message:
        value.kind === 'action'
          ? 'an action link must be `action:<name>`'
          : value.kind === 'internal'
            ? 'an internal link must be a path beginning with /'
            : 'an external link must be an http(s), mailto or tel URL',
    });
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
